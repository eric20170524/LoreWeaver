#!/usr/bin/env python3
"""Execute one real AssetRecipe VLM analysis.

This helper is intentionally provider-backed. It never fabricates a visual pass:
`backend.visual_audit.run_visual_critic` must complete through Grok/xAI or Codex.
The output describes the critic result; a visual FAIL remains a FAIL in the JSON.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.visual_audit import run_visual_critic, vlm_probe  # noqa: E402

REAL_PROVIDERS = {"grok", "codex"}


def read_context() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("asset_vlm_context_must_be_object")
    return value


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    if not input_path.is_file():
        print(json.dumps({"status": "failed", "reason": "asset_vlm_input_missing"}))
        return 2
    if input_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        print(json.dumps({"status": "failed", "reason": "asset_vlm_input_not_supported_image"}))
        return 2

    try:
        context = read_context()
    except Exception as exc:
        print(json.dumps({"status": "failed", "reason": "asset_vlm_context_invalid", "error": str(exc)}))
        return 2

    critic = run_visual_critic(input_path.read_bytes(), context)
    provider = str(critic.get("provider") or "") if isinstance(critic, dict) else ""
    status = str(critic.get("status") or "failed") if isinstance(critic, dict) else "failed"
    if status != "completed" or provider not in REAL_PROVIDERS:
        print(json.dumps({
            "status": "unavailable" if status in {"unavailable", "available_disabled", "skipped"} else "failed",
            "reason": "real_asset_vlm_provider_did_not_complete",
            "provider": provider or None,
            "criticStatus": status,
            "probe": vlm_probe(),
            "error": critic.get("error") if isinstance(critic, dict) else None,
        }, ensure_ascii=False))
        return 3

    result = critic.get("result") if isinstance(critic.get("result"), dict) else {}
    checks = result.get("checks") if isinstance(result.get("checks"), dict) else {}
    normalized_checks = {str(key): str(value).upper() for key, value in checks.items()}
    audit_status = "passed" if result.get("status") == "passed" and normalized_checks and all(
        value in {"PASS", "WARNING"} for value in normalized_checks.values()
    ) else "failed"

    output = {
        "schemaVersion": "loreweaver.asset-vlm-operation.v1",
        "status": "completed",
        "auditStatus": audit_status,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "real": True,
        "fixture": False,
        "synthetic": False,
        "provider": provider,
        "model": critic.get("model"),
        "input": {
            "sha256": sha256_file(input_path),
            "bytes": input_path.stat().st_size,
            "extension": input_path.suffix.lower(),
        },
        "checks": normalized_checks,
        "feedback": result.get("feedback"),
        "promptReflowDiff": result.get("prompt_reflow_diff"),
        "proposedPatches": result.get("proposed_patches") if isinstance(result.get("proposed_patches"), list) else [],
        "context": context,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "passed",
        "provider": provider,
        "model": output["model"],
        "auditStatus": audit_status,
        "inputSha256": output["input"]["sha256"],
        "output": str(output_path),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
