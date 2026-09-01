#!/usr/bin/env python3
"""Run the real visual critic against an exact verified Workspace Candidate.

This adapter never fabricates a pass. It consumes workspace browser evidence,
verifies the exact screenshot bytes, inherits artifact/payload identity, and only
writes `passed` when a supported real provider actually completes with no FAIL.
A successful real VLM write then non-destructively attempts TaskContract Player
synchronization; Task orchestration never downgrades valid VLM evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LORE_ROOT = Path(__file__).resolve().parents[2]
if str(LORE_ROOT) not in sys.path:
    sys.path.insert(0, str(LORE_ROOT))

from backend.release_task_sync import ReleaseTaskSyncError, sync_player_release_evidence  # noqa: E402
from backend.task_repository import TaskRepository, TaskRepositoryError  # noqa: E402
from backend.visual_audit import run_visual_critic, vlm_probe  # noqa: E402

REAL_VLM_PROVIDERS = {"grok", "codex"}
WORKSPACES_ROOT = LORE_ROOT / "data" / "workspaces"


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


def repo_relative(path: Path) -> str:
    return str(path.resolve().relative_to(LORE_ROOT)).replace(os.sep, "/")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def valid_workspace_id(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._-]+", value or "")) and value not in {".", ".."}


def browser_eligible(browser: dict[str, Any]) -> bool:
    errors = browser.get("errors") or {}
    no_errors = all(
        isinstance(errors.get(key), list) and len(errors.get(key)) == 0
        for key in ("console", "page", "requests")
    )
    return bool(
        browser.get("status") == "passed"
        and browser.get("releaseEligible") is True
        and browser.get("zeroApiRequests") is True
        and browser.get("stale") is not True
        and browser.get("freshness") != "stale"
        and browser.get("specHash")
        and browser.get("runtimeVersion")
        and browser.get("payloadHash")
        and browser.get("artifact")
        and browser.get("artifactSha256")
        and browser.get("screenshot")
        and browser.get("screenshotSha256")
        and no_errors
    )


def attempt_player_task_sync(workspace_id: str, workspace: Path) -> dict[str, Any]:
    try:
        return sync_player_release_evidence(
            repository=TaskRepository(WORKSPACES_ROOT),
            workspace_id=workspace_id,
            workspace_dir=workspace,
        )
    except (ReleaseTaskSyncError, TaskRepositoryError, OSError, ValueError) as exc:
        # Release evidence is already durably written at this point. Task sync is
        # orchestration metadata and must never invalidate a legitimate VLM pass.
        return {
            "schemaVersion": "loreweaver.release-task-sync.v1",
            "status": "blocked",
            "action": "noop",
            "role": "player",
            "reason": f"task_sync_error:{exc}",
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--browser-report", default=None)
    parser.add_argument(
        "--allow-unavailable",
        action="store_true",
        help="Write unavailable evidence and exit zero when no real VLM provider exists. Never converts unavailable into passed.",
    )
    args = parser.parse_args()

    if not valid_workspace_id(args.workspace_id):
        print(json.dumps({"status": "failed", "reason": "invalid_workspace_id"}))
        return 2
    workspace = (WORKSPACES_ROOT / args.workspace_id).resolve()
    if workspace.parent != WORKSPACES_ROOT.resolve() or not workspace.is_dir():
        print(json.dumps({"status": "failed", "reason": "workspace_not_found"}))
        return 2

    reports_dir = workspace / "reports"
    browser_path = repo_path(args.browser_report) if args.browser_report else reports_dir / "standalone_browser_report.json"
    if not browser_path or not browser_path.is_file():
        print(json.dumps({"status": "failed", "reason": "browser_report_missing"}))
        return 2
    browser = read_json(browser_path)
    if not browser_eligible(browser):
        print(json.dumps({"status": "failed", "reason": "browser_evidence_not_eligible"}))
        return 2

    screenshot_path = repo_path(browser.get("screenshot"))
    if not screenshot_path or not screenshot_path.is_file():
        print(json.dumps({"status": "failed", "reason": "candidate_screenshot_missing"}))
        return 2
    screenshot_sha256 = sha256_file(screenshot_path)
    if screenshot_sha256 != browser.get("screenshotSha256"):
        print(json.dumps({
            "status": "failed",
            "reason": "candidate_screenshot_sha_mismatch",
            "expected": browser.get("screenshotSha256"),
            "actual": screenshot_sha256,
        }))
        return 2

    card_ids = sorted({
        str(value).strip()
        for value in (browser.get("cardIds") or ([browser.get("cardId")] if browser.get("cardId") else []))
        if str(value or "").strip()
    })
    summary = {
        "purpose": "release visual evidence for exact verified Workspace Candidate",
        "workspaceId": args.workspace_id,
        "cardIds": card_ids,
        "specHash": browser["specHash"],
        "runtimeVersion": browser["runtimeVersion"],
        "payloadHash": browser["payloadHash"],
        "artifact": browser["artifact"],
        "artifactSha256": browser["artifactSha256"],
        "screenshotSha256": screenshot_sha256,
        "stageResults": browser.get("stageResults") or [],
        "viewport": "720x1280",
    }
    critic = run_visual_critic(screenshot_path.read_bytes(), summary)
    result = critic.get("result") if isinstance(critic, dict) else None
    result = result if isinstance(result, dict) else {}
    checks = result.get("checks") if isinstance(result.get("checks"), dict) else {}
    normalized_checks = {str(key): str(value).upper() for key, value in checks.items()}
    no_fail_checks = bool(normalized_checks) and all(
        value in ("PASS", "WARNING") for value in normalized_checks.values()
    )
    provider = str(critic.get("provider") or "")
    real_provider_completed = critic.get("status") == "completed" and provider in REAL_VLM_PROVIDERS
    critic_passed = real_provider_completed and result.get("status") == "passed" and no_fail_checks

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
        "cardId": card_ids[0] if len(card_ids) == 1 else None,
        "cardIds": card_ids,
        "workspaceId": args.workspace_id,
        "releaseEligible": critic_passed,
        "evidenceKind": "real_vlm_exact_candidate",
        "identityMatches": True,
        "specHash": browser["specHash"],
        "runtimeVersion": browser["runtimeVersion"],
        "payloadHash": browser["payloadHash"],
        "artifact": browser["artifact"],
        "artifactSha256": browser["artifactSha256"],
        "browserReport": repo_relative(browser_path),
        "screenshot": repo_relative(screenshot_path),
        "screenshotSha256": screenshot_sha256,
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

    latest = reports_dir / "visual_audit_latest.json"
    write_json(latest, report)
    for card_id in card_ids:
        write_json(reports_dir / f"visual_audit_{card_id}_latest.json", {**report, "cardId": card_id})

    task_sync = attempt_player_task_sync(args.workspace_id, workspace) if critic_passed else {
        "schemaVersion": "loreweaver.release-task-sync.v1",
        "status": "passed",
        "action": "noop",
        "role": "player",
        "reason": "visual_evidence_not_passed",
    }
    print(json.dumps({
        "status": status,
        "releaseEligible": critic_passed,
        "provider": report["provider"],
        "model": report["model"],
        "specHash": report["specHash"],
        "payloadHash": report["payloadHash"],
        "artifactSha256": report["artifactSha256"],
        "screenshotSha256": report["screenshotSha256"],
        "report": repo_relative(latest),
        "cardIds": card_ids,
        "taskSync": task_sync,
    }, ensure_ascii=False, indent=2))

    if critic_passed:
        return 0
    if status == "unavailable" and args.allow_unavailable:
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
