#!/usr/bin/env python3
"""Audit authored stage screenshots without replacing the release VLM anchor."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.visual_audit import run_visual_critic  # noqa: E402


def rooted(relative: str) -> Path:
    path = (ROOT / relative).resolve()
    path.relative_to(ROOT)
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--stages", required=True, help="Comma-separated authored stage numbers")
    parser.add_argument("--browser-report", default=None)
    args = parser.parse_args()
    if not args.workspace_id or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for char in args.workspace_id):
        parser.error("invalid workspace id")
    reports = rooted(f"data/workspaces/{args.workspace_id}/reports")
    browser_path = rooted(args.browser_report) if args.browser_report else reports / "standalone_browser_report.json"
    browser = json.loads(browser_path.read_text())
    if browser.get("status") != "passed" or browser.get("releaseEligible") is not True:
        raise ValueError("browser anchor is not passed")
    artifact = rooted(browser["artifact"])
    if sha256(artifact) != browser["artifactSha256"]:
        raise ValueError("artifact sha mismatch")

    stages = [int(value) for value in args.stages.split(",")]
    if not stages or len(stages) != len(set(stages)):
        parser.error("stages must be a nonempty unique list")
    results = []
    for number in stages:
        stage = next((item for item in browser.get("stageResults", []) if item.get("stage") == number), None)
        if not stage or stage.get("passed") is not True:
            raise ValueError(f"stage {number} has no passed browser evidence")
        screenshot = rooted(stage["screenshot"])
        screenshot_sha = sha256(screenshot)
        if screenshot_sha != stage["screenshotSha256"]:
            raise ValueError(f"stage {number} screenshot sha mismatch")
        summary = {
            "purpose": "department art QA for one authored level; not certified release evidence",
            "workspaceId": args.workspace_id,
            "stage": number,
            "nodeId": stage["nodeId"],
            "cardId": stage["cardId"],
            "viewport": stage.get("viewport") or browser["viewport"],
            "specHash": browser["specHash"],
            "runtimeVersion": browser["runtimeVersion"],
            "payloadHash": browser["payloadHash"],
            "artifactSha256": browser["artifactSha256"],
            "screenshotSha256": screenshot_sha,
        }
        critic = run_visual_critic(screenshot.read_bytes(), summary)
        result = critic.get("result") if isinstance(critic, dict) else None
        result = result if isinstance(result, dict) else {}
        checks = result.get("checks") if isinstance(result.get("checks"), dict) else {}
        checks = {str(key): str(value).upper() for key, value in checks.items()}
        passed = bool(
            critic.get("status") == "completed"
            and critic.get("provider") in {"codex", "grok"}
            and result.get("status") == "passed"
            and checks
            and all(value in {"PASS", "WARNING"} for value in checks.values())
        )
        report = {
            "schemaVersion": "loreweaver.stage-visual-audit.v1",
            "status": "passed" if passed else "failed",
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "releaseEligible": False,
            "evidenceKind": "real_vlm_exact_candidate_stage",
            "provider": critic.get("provider"),
            "criticStatus": critic.get("status"),
            "criticError": critic.get("error"),
            "checks": checks,
            "feedback": result.get("feedback"),
            "promptReflowDiff": result.get("prompt_reflow_diff"),
            "browserReport": str(browser_path.relative_to(ROOT)),
            "screenshot": str(screenshot.relative_to(ROOT)),
            **summary,
        }
        report_path = reports / f"visual_audit_node_{number:02d}_latest.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        results.append({"stage": number, "status": report["status"], "checks": checks, "report": str(report_path.relative_to(ROOT))})
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    return 0 if all(item["status"] == "passed" for item in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
