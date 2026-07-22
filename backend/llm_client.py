"""
Unified LLM client for LoreWeaver backend.

Providers (auto-select, overridable via LLM_PROVIDER):
  - grok / xai  → OpenAI-compatible https://api.x.ai/v1  (XAI_API_KEY or GROK_API_KEY)
  - gemini      → google-genai (GEMINI_API_KEY)

JSON mode: prefer response_format / mime type when supported; always parse and
strip optional markdown fences.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

OLLAMA_SUPPORT_STATUS = "deferred_not_supported"

_PLACEHOLDER_KEYS = {
    "",
    "MY_GEMINI_API_KEY",
    "YOUR_API_KEY",
    "changeme",
    "xxx",
}


def log_ollama_deferred_notice() -> None:
    if os.getenv("OLLAMA_API_BASE"):
        print(
            "OLLAMA_API_BASE is configured but Ollama local model routing "
            "is currently deferred and not supported."
        )


def _clean_key(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    key = raw.strip().strip('"').strip("'")
    if not key or key in _PLACEHOLDER_KEYS or key.startswith("MY_"):
        return None
    return key


def _xai_key() -> Optional[str]:
    return _clean_key(os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY"))


def _gemini_key() -> Optional[str]:
    return _clean_key(os.getenv("GEMINI_API_KEY"))


def resolve_provider() -> Optional[str]:
    """
    Return 'grok' | 'gemini' | None.
    LLM_PROVIDER forces choice when set (grok|xai|gemini).
    Default preference: XAI/Grok first, then Gemini.
    """
    forced = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if forced in ("grok", "xai"):
        return "grok" if _xai_key() else None
    if forced == "gemini":
        return "gemini" if _gemini_key() else None

    if _xai_key():
        return "grok"
    if _gemini_key():
        return "gemini"
    return None


def is_antigravity_imagegen_enabled() -> bool:
    val = (os.getenv("LOREWEAVER_ENABLE_ANTIGRAVITY_IMAGEGEN") or "").strip().lower()
    provider = (os.getenv("IMAGEGEN_PROVIDER") or "").strip().lower()
    return val in ("1", "true", "yes", "on") or provider == "antigravity"


def imagegen_status() -> Dict[str, Any]:
    antigravity_enabled = is_antigravity_imagegen_enabled()
    provider = (os.getenv("IMAGEGEN_PROVIDER") or "").strip().lower() or ("antigravity" if antigravity_enabled else "procedural_fallback")
    return {
        "provider": provider,
        "antigravity_enabled": antigravity_enabled,
        "supported_providers": ["antigravity", "imagen3", "dalle3", "sdxl", "procedural_fallback"],
        "tool_target": "generate_image",
    }


def llm_status() -> Dict[str, Any]:
    provider = resolve_provider()
    return {
        "provider": provider,
        "available": provider is not None,
        "xai_configured": bool(_xai_key()),
        "gemini_configured": bool(_gemini_key()),
        "model": _model_for(provider) if provider else None,
        "imagegen": imagegen_status(),
    }



def _model_for(provider: str) -> str:
    if provider == "grok":
        return (
            os.getenv("XAI_MODEL")
            or os.getenv("GROK_MODEL")
            or "grok-4-1-fast-non-reasoning"
        )
    return os.getenv("GEMINI_MODEL") or "gemini-2.0-flash"


def _strip_code_fence(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return text
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text, re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    # Partial fence: leading ```json
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _extract_json_object(text: str) -> Any:
    cleaned = _strip_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Best-effort: first {...} block
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _http_json(
    url: str,
    payload: dict,
    headers: dict,
    timeout: float = 120.0,
) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        err_body = ""
        try:
            err_body = exc.read().decode("utf-8", errors="replace")[:800]
        except Exception:
            pass
        raise RuntimeError(f"HTTP {exc.code} from {url}: {err_body or exc.reason}") from exc


def _generate_grok(prompt: str, *, json_mode: bool) -> str:
    api_key = _xai_key()
    if not api_key:
        raise RuntimeError("XAI_API_KEY / GROK_API_KEY not configured")

    base = (os.getenv("XAI_API_BASE") or "https://api.x.ai/v1").rstrip("/")
    model = _model_for("grok")
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a precise game-design assistant for LoreWeaver. "
                    "Follow the user instructions exactly. "
                    + ("Respond with valid JSON only, no markdown." if json_mode else "")
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
    }
    if json_mode:
        # OpenAI-compatible JSON object mode (xAI supports this pattern)
        payload["response_format"] = {"type": "json_object"}

    data = _http_json(
        f"{base}/chat/completions",
        payload,
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Grok empty choices: {json.dumps(data)[:400]}")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        # Some APIs return content parts
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    if not content or not str(content).strip():
        raise RuntimeError(f"Grok empty content: {json.dumps(data)[:400]}")
    return str(content).strip()


def _generate_gemini(prompt: str, *, json_mode: bool) -> str:
    api_key = _gemini_key()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    model = _model_for("gemini")
    config_kwargs: Dict[str, Any] = {}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None,
    )
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini returned empty text")
    return text


def generate_text(prompt: str, *, json_mode: bool = False) -> Tuple[str, str]:
    """
    Returns (text, provider_name).
    Raises RuntimeError if no provider or request fails.
    """
    log_ollama_deferred_notice()
    provider = resolve_provider()
    if not provider:
        raise RuntimeError(
            "No LLM API key configured. Set XAI_API_KEY (Grok) or GEMINI_API_KEY in .env"
        )

    if provider == "grok":
        return _generate_grok(prompt, json_mode=json_mode), "grok"
    return _generate_gemini(prompt, json_mode=json_mode), "gemini"


def generate_json(prompt: str) -> Tuple[Any, str]:
    """
    Ask the model for JSON and parse it.
    Returns (parsed_object, provider_name).
    """
    text, provider = generate_text(prompt, json_mode=True)
    return _extract_json_object(text), provider
