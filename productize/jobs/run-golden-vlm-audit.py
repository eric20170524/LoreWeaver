#!/usr/bin/env python3
"""Run the existing real VLM critic against the exact Golden Candidate screenshot.

This adapter never fabricates a visual pass. It consumes the browser evidence,
reuses its exact executable identity, and writes a visual report only as `passed`
when a supported VLM provider actually completes and returns no FAIL checks.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LORE_ROOT = Path(__file__).resolve().parents[2]
if str(LORE_ROOT) not in sys.path:
    sys.path.insert(0, str(LORE_ROOT))

from backend.visual_audit import run_visual_critic, vlm_probe  # noqa: E402

DEFAULT_WORKSPACE_ID = "__golden_survivor_vertical_slice_ci"
CARD_ID = "survivor_horde"


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def repo_path(value: str | None) -> Path | None:
    if not value:
        return None
    candidate = (LORE_ROOT / value).resolve()
    try:
        candidate.relative_to(LORE_ROOT)
    except ValueError:
        return None
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", default=DEFAULT_WORKSPACE_ID)
    parser.add_argument("--browser-report", default=None)
    parser.add_argument(
        "--allow-unavailable",
        action="store_true",
        help="Write unavailable evidence and exit zero when no real VLM provider exists. Never converts unavailable into passed.",
    )
    args = parser.parse_args()

    workspace = LORE_ROOT / "data" / "workspaces" / args.workspace_id
    reports_dir = workspace / "reports"
    browser_path = (
        repo_path(args.browser_report)
        if args.browser_report
        else reports_dir / "standalone_browser_report.json"
    )
    if not browser_path or not browser_path.is_file():
        print(json.dumps({"status": "failed", "reason": "browser_report_missing"}))
        return 2

    browser = read_json(browser_path)
    errors = browser.get("errors") or {}
    no_browser_errors = all(
        isinstance(errors.get(key), list) and len(errors.get(key)) == 0
        for key in ("console", "page", "requests")
    )
    if not (
        browser.get("status") == "passed"
        and browser.get("releaseEligible") is True
        and browser.get("zeroApiRequests") is True
        and no_browser_errors
        and browser.get("specHash")
        and browser.get("runtimeVersion")
        and browser.get("payloadHash")
        and browser.get("artifact")
        and browser.get("artifactSha256")
    ):
        print(json.dumps({"status": "failed", "reason": "browser_evidence_not_eligible"}))
        return 2

    screenshot_path = repo_path(browser.get("screenshot"))
    if not screenshot_path or not screenshot_path.is_file():
        print(json.dumps({"status": "failed", "reason": "golden_screenshot_missing"}))
        return 2

    summary = {
        "purpose": "release visual evidence for exact Golden Candidate executable payload",
        "workspaceId": args.workspace_id,
        "cardId": CARD_ID,
        "specHash": browser["specHash"],
        "runtimeVersion": browser["runtimeVersion"],
        "payloadHash": browser["payloadHash"],
        "artifact": browser["artifact"],
        "artifactSha256": browser["artifactSha256"],
        "stageResults": browser.get("stageResults") or [],
        "viewport": "720x1280",
    }
    critic = run_visual_critic(screenshot_path.read_bytes(), summary)
    result = critic.get("result") if isinstance(critic, dict) else None
    result = result if isinstance(result, dict) else {}
    checks = result.get("checks") if isinstance(result.get("checks"), dict) else {}
    normalized_checks = {
        str(key): str(value).upper()
        for key, value in checks.items()
    }
    no_fail_checks = bool(normalized_checks) and all(
        value in ("PASS", "WARNING") for value in normalized_checks.values()
    )
    real_provider_completed = critic.get("status") == "completed" and bool(critic.get("provider"))
    critic_passed = (
        real_provider_completed
        and result.get("status") == "passed"
        and no_fail_checks
    )

    critic_status = str(critic.get("status") or "failed")
    if critic_passed:
        status = "passed"
    elif critic_status in ("unavailable", "available_disabled", "skipped"):
        status = "unavailable"
    else:
        status = "failed"

    report = {
        "schemaVersion": "loreweaver.visual-audit.v2",
        "status": status,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "cardId": CARD_ID,
        "workspaceId": args.workspace_id,
        "releaseEligible": critic_passed,
        "evidenceKind": "real_vlm_exact_candidate",
        "identityMatches": True,
        "specHash": browser["specHash"],
        "runtimeVersion": browser["runtimeVersion"],
        "payloadHash": browser["payloadHash"],
        "artifact": browser["artifact"],
        "artifactSha256": browser["artifactSha256"],
        "browserReport": str(browser_path.relative_to(LORE_ROOT)).replace(os.sep, "/"),
        "screenshot": str(screenshot_path.relative_to(LORE_ROOT)).replace(os.sep, "/"),
        "provider": critic.get("provider"),
        "model": critic.get("model"),
        "checks": normalized_checks,
        "feedback": result.get("feedback"),
        "promptReflowDiff": result.get("prompt_reflow_diff"),
        "proposedPatches": result.get("proposed_patches") if isinstance(result.get("proposed_patches"), list) else [],
        "criticStatus": critic_status,
        "criticError": critic.get("error"),
        "probe": critic.get("probe") or vlm_probe(),
    }

    specific = reports_dir / f"visual_audit_{CARD_ID}_latest.json"
    latest = reports_dir / "visual_audit_latest.json"
    write_json(specific, report)
    write_json(latest, report)
    print(json.dumps({
        "status": status,
        "releaseEligible": critic_passed,
        "provider": report["provider"],
        "specHash": report["specHash"],
        "payloadHash": report["payloadHash"],
        "artifactSha256": report["artifactSha256"],
        "report": str(specific.relative_to(LORE_ROOT)).replace(os.sep, "/"),
    }, ensure_ascii=False, indent=2))

    if critic_passed:
        return 0
    if status == "unavailable" and args.allow_unavailable:
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
