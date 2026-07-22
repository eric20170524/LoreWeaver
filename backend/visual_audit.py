"""
Optional VLM visual critic for Phaser screenshots.

Providers:
  - grok   : xAI chat/completions with image_url (preferred when XAI_API_KEY is set)
  - codex  : ChatGPT.app / Codex CLI `codex exec -i <png>` (OpenAI coding agent)
  - chatgpt: alias of codex

Antigravity (`agy`) and Grok Build TUI are coding agents — they can view images
interactively in a human session, but are NOT used as automated headless VLM
backends here (no stable non-interactive image-in → JSON-out contract for audit).
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional


VLM_PROMPT = """You are a concise visual QA critic for a Phaser H5 game workbench.
Inspect the attached screenshot for:
- HUD occlusion (UI blocking controls or critical indicators)
- button overlap (interactive controls colliding)
- text overflow / truncation (CJK or Latin labels cut off)
- touch & readability (contrast, size, finger-friendly spacing)

Return compact JSON only (no markdown fences) with this shape:
{
  "status": "passed" | "failed",
  "checks": {
    "vlm_hud_occlusion": "PASS" | "FAIL" | "WARNING",
    "vlm_button_overlap": "PASS" | "FAIL" | "WARNING",
    "vlm_text_overflow": "PASS" | "FAIL" | "WARNING",
    "vlm_touch_readability": "PASS" | "FAIL" | "WARNING"
  },
  "feedback": "Detailed visual critique remarks.",
  "prompt_reflow_diff": "Short layout/theme guidance for later prompts.",
  "proposed_patches": [
    {
      "target": "themeColor or nodes.N.goalValue or nodes.N.gameplay.knobs.X",
      "operation": "replace",
      "after": "<suggested value>",
      "reason": "why",
      "patchLevel": "L1"
    }
  ]
}
"""


def _clean_key(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    key = raw.strip().strip('"').strip("'")
    if not key or key.startswith("MY_") or key in ("changeme", "xxx"):
        return None
    return key


def _xai_key() -> Optional[str]:
    return _clean_key(os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY"))


def vlm_audit_enabled() -> bool:
    """
    Enable when LOREWEAVER_ENABLE_VLM_AUDIT=1 or legacy LOREWEAVER_ENABLE_CODEX_AUDIT=1.
    Default (unset): auto-enable if Grok API key or ChatGPT/Codex CLI is available.
    Set LOREWEAVER_ENABLE_VLM_AUDIT=0 to force deterministic-only audits.
    """
    flag = (os.getenv("LOREWEAVER_ENABLE_VLM_AUDIT") or "").strip()
    if flag == "1":
        return True
    if flag == "0":
        return False
    legacy = (os.getenv("LOREWEAVER_ENABLE_CODEX_AUDIT") or "").strip()
    if legacy == "1":
        return True
    # Auto: any headless VLM backend ready
    return bool(_xai_key() or find_codex_cli())


def find_codex_cli() -> Optional[str]:
    """Locate ChatGPT.app / Codex CLI (Codex rebranded into ChatGPT desktop)."""
    candidates = [
        os.environ.get("CODEX_CLI"),
        os.environ.get("CHATGPT_CODEX_CLI"),
        shutil.which("codex"),
        # ChatGPT desktop (current product name)
        "/Applications/ChatGPT.app/Contents/Resources/codex",
        # Legacy Codex desktop
        "/Applications/Codex.app/Contents/Resources/codex",
        os.path.expanduser("~/Applications/ChatGPT.app/Contents/Resources/codex"),
        os.path.expanduser("~/Applications/Codex.app/Contents/Resources/codex"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def find_grok_cli() -> Optional[str]:
    candidates = [
        os.environ.get("GROK_CLI"),
        shutil.which("grok"),
        shutil.which("agent"),
        os.path.expanduser("~/.grok/bin/grok"),
        os.path.expanduser("~/.local/bin/grok"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def find_antigravity_cli() -> Optional[str]:
    candidates = [
        os.environ.get("ANTIGRAVITY_CLI"),
        shutil.which("agy"),
        os.path.expanduser("~/.local/bin/agy"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def resolve_vlm_provider() -> Optional[str]:
    """
    Return 'grok' | 'codex' | None.
    LOREWEAVER_VLM_PROVIDER forces choice when available.
    Default preference: Grok API (already used for prep) → Codex/ChatGPT CLI.
    """
    forced = (os.getenv("LOREWEAVER_VLM_PROVIDER") or "").strip().lower()
    if forced in ("grok", "xai"):
        return "grok" if _xai_key() else None
    if forced in ("codex", "chatgpt"):
        return "codex" if find_codex_cli() else None
    if forced in ("antigravity", "agy", "grok-build", "grok_build"):
        # Not supported for automated image audit
        return None

    if _xai_key():
        return "grok"
    if find_codex_cli():
        return "codex"
    return None


def vlm_probe() -> Dict[str, Any]:
    """Diagnostic snapshot for /api/llm/status-style endpoints."""
    return {
        "enabled": vlm_audit_enabled(),
        "provider": resolve_vlm_provider() if vlm_audit_enabled() else None,
        "providers": {
            "grok_api": bool(_xai_key()),
            "codex_cli": find_codex_cli(),
            "grok_build_cli": find_grok_cli(),
            "antigravity_cli": find_antigravity_cli(),
        },
        "notes": {
            "grok_api": "Supports vision via chat/completions image_url — preferred automated VLM.",
            "codex_cli": "ChatGPT.app embeds codex; use `codex exec -i shot.png`.",
            "grok_build_cli": "Interactive TUI with image paste; not used for headless audit JSON.",
            "antigravity_cli": "Coding agent (agy --print); no automated image VLM path.",
        },
    }


def _strip_json(text: str) -> Any:
    text = (text or "").strip()
    if not text:
        raise ValueError("empty VLM response")
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text, re.I)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _run_grok_vision(screenshot_bytes: bytes, payload_summary: dict) -> Dict[str, Any]:
    api_key = _xai_key()
    if not api_key:
        return {"status": "unavailable", "enabled": True, "provider": "grok", "error": "no XAI_API_KEY"}

    b64 = base64.b64encode(screenshot_bytes).decode("ascii")
    model = (
        os.getenv("XAI_VLM_MODEL")
        or os.getenv("XAI_MODEL")
        or os.getenv("GROK_MODEL")
        or "grok-4-1-fast-non-reasoning"
    )
    base = (os.getenv("XAI_API_BASE") or "https://api.x.ai/v1").rstrip("/")
    user_text = (
        VLM_PROMPT
        + "\nContext: "
        + json.dumps(payload_summary, ensure_ascii=False)[:4000]
    )
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        if isinstance(content, list):
            content = "".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in content
            )
        parsed = _strip_json(str(content))
        return {
            "status": "completed",
            "enabled": True,
            "provider": "grok",
            "model": model,
            "result": parsed,
        }
    except urllib.error.HTTPError as exc:
        err = ""
        try:
            err = exc.read().decode("utf-8", errors="replace")[:800]
        except Exception:
            err = str(exc)
        return {
            "status": "failed",
            "enabled": True,
            "provider": "grok",
            "error": f"HTTP {exc.code}: {err}",
        }
    except Exception as exc:
        return {"status": "failed", "enabled": True, "provider": "grok", "error": str(exc)}


def _run_codex_cli(screenshot_bytes: bytes, payload_summary: dict) -> Dict[str, Any]:
    cli = find_codex_cli()
    if not cli:
        return {
            "status": "unavailable",
            "enabled": True,
            "provider": "codex",
            "cli": None,
            "error": "ChatGPT/Codex CLI not found",
        }

    prompt = VLM_PROMPT + "\nContext: " + json.dumps(payload_summary, ensure_ascii=False)[:4000]
    image_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as image_file:
            image_file.write(screenshot_bytes)
            image_path = image_file.name

        # ChatGPT.app codex: `codex exec -i file.png "prompt"`
        cmd = [
            cli,
            "exec",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            "-i",
            image_path,
            prompt,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=90,
        )
        output = (proc.stdout or "").strip()
        parsed = None
        try:
            parsed = _strip_json(output)
        except Exception:
            parsed = None
        return {
            "status": "completed" if proc.returncode == 0 and parsed else "failed",
            "enabled": True,
            "provider": "codex",
            "cli": cli,
            "exitCode": proc.returncode,
            "stdout": output[-2000:],
            "stderr": (proc.stderr or "").strip()[-2000:],
            "result": parsed,
            "error": None
            if parsed
            else ((proc.stderr or output or "failed to parse codex JSON")[:500]),
        }
    except Exception as exc:
        return {
            "status": "failed",
            "enabled": True,
            "provider": "codex",
            "cli": cli,
            "error": str(exc),
        }
    finally:
        if image_path:
            try:
                os.remove(image_path)
            except OSError:
                pass


def run_visual_critic(
    screenshot_bytes: bytes,
    payload_summary: dict,
) -> Dict[str, Any]:
    """
    Run optional VLM critic. Returns status dict with keys:
    status, enabled, provider, result?, error?, ...
    """
    if not screenshot_bytes:
        return {
            "status": "skipped",
            "enabled": False,
            "provider": None,
            "error": "empty screenshot",
        }

    if not vlm_audit_enabled():
        provider = resolve_vlm_provider()
        # Still report discoverability
        return {
            "status": "available_disabled" if (provider or find_codex_cli() or _xai_key()) else "unavailable",
            "enabled": False,
            "provider": provider,
            "cli": find_codex_cli(),
            "probe": vlm_probe(),
        }

    provider = resolve_vlm_provider()
    if not provider:
        return {
            "status": "unavailable",
            "enabled": False,
            "provider": None,
            "error": "No VLM provider: set XAI_API_KEY (Grok vision) or install ChatGPT.app codex CLI",
            "probe": vlm_probe(),
        }

    if provider == "grok":
        return _run_grok_vision(screenshot_bytes, payload_summary)
    return _run_codex_cli(screenshot_bytes, payload_summary)
