#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.release_task_sync import sync_player_release_evidence  # noqa: E402
from backend.task_bootstrap import ROOT_TASK_ID, ensure_root_production_task  # noqa: E402
from backend.task_repository import TaskRepository  # noqa: E402


def assert_true(value, message) -> None:
    if not value:
        raise AssertionError(message)


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def seed_static_verified_task(repo: TaskRepository, ws_id: str, workspace: Path) -> dict:
    write_json(
        workspace / "manifest.json",
        {
            "title": "Release Task Sync Fixture",
            "nodes": [
                {
                    "id": 1,
                    "title": "Core Loop",
                    "mechanics": "survivor_horde",
                    "gameplay": {"cardId": "survivor_horde", "modifiers": [], "knobs": {}},
                }
            ],
        },
    )
    ensure_root_production_task(repository=repo, workspace_id=ws_id, workspace_dir=workspace)
    task = repo.read(ws_id, ROOT_TASK_ID)
    task = repo.append(
        ws_id,
        ROOT_TASK_ID,
        role="programmer",
        verdict="passed",
        summary="Contract-test implementation bundle.",
        evidence_refs=[
            {
                "id": "implementation-contract-test",
                "kind": "implementation",
                "path": "reports/implementation-contract-test.json",
                "status": "passed",
                "criterionIds": [],
                "fixture": True,
                "synthetic": True,
                "stale": False,
            }
        ],
        findings=[],
        expected_last_round_hash=TaskRepository.last_round_hash(task),
    )
    task = repo.append(
        ws_id,
        ROOT_TASK_ID,
        role="auditor",
        verdict="passed",
        summary="Contract-test static audit bundle.",
        evidence_refs=[
            {
                "id": "static-contract-test",
                "kind": "static",
                "path": "reports/static-contract-test.json",
                "status": "passed",
                "criterionIds": ["static-contract"],
                "fixture": True,
                "synthetic": True,
                "stale": False,
            }
        ],
        findings=[],
        expected_last_round_hash=TaskRepository.last_round_hash(task),
    )
    assert_true(task["status"] == "static_verified", task)
    return task


def exact_identity() -> dict:
    return {
        "specHash": "spec-1234567890",
        "runtimeVersion": "runtime-v1",
        "payloadHash": "payload-1234567890",
        "artifact": "productize/exports/candidate.zip",
        "artifactSha256": "artifact-1234567890",
        "screenshotSha256": "screenshot-1234567890",
    }


def browser_report(card_ids: list[str]) -> dict:
    return {
        "schemaVersion": "loreweaver.standalone-browser-report.v5",
        "status": "passed",
        "releaseEligible": True,
        "zeroApiRequests": True,
        "errors": {"console": [], "page": [], "requests": []},
        "cardIds": card_ids,
        **exact_identity(),
    }


def visual_report(provider: str = "grok") -> dict:
    return {
        "schemaVersion": "loreweaver.visual-audit.v2",
        "status": "passed",
        "releaseEligible": True,
        "identityMatches": True,
        "evidenceKind": "real_vlm_exact_candidate",
        "provider": provider,
        **exact_identity(),
    }


def human_report(card_id: str) -> dict:
    identity = exact_identity()
    identity.pop("screenshotSha256")
    return {
        "schemaVersion": "loreweaver.human-playtest-evidence.v1",
        "status": "passed",
        "releaseEligible": True,
        "identityMatches": True,
        "freshness": "fresh",
        "fixture": False,
        "synthetic": False,
        "humanObserved": True,
        "cardId": card_id,
        "sessions": [{"sessionId": f"human-{card_id}"}],
        "summary": {
            "passCriteria": {
                "atLeastOneSessionCompleted": True,
                "allSessionsUnderstoodCoreLoop": True,
                "noBlockingIssues": True,
            }
        },
        **identity,
    }


def main() -> None:
    temp = Path(tempfile.mkdtemp(prefix="lw-release-task-sync-"))
    try:
        repo = TaskRepository(temp)
        ws_id = "player-sync"
        workspace = temp / ws_id
        workspace.mkdir(parents=True)
        seed_static_verified_task(repo, ws_id, workspace)

        missing = sync_player_release_evidence(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(missing["action"] == "noop", missing)
        assert_true("runtime:standalone_browser_report_not_eligible" in missing["evidenceGaps"], missing)

        reports = workspace / "reports"
        write_json(reports / "standalone_browser_report.json", browser_report(["survivor_horde"]))
        write_json(reports / "visual_audit_latest.json", visual_report("deterministic-mock"))
        write_json(reports / "human_playtest_survivor_horde_latest.json", human_report("survivor_horde"))
        fake_visual = sync_player_release_evidence(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(fake_visual["action"] == "noop", fake_visual)
        assert_true("visual:real_exact_candidate_vlm_missing_or_ineligible" in fake_visual["evidenceGaps"], fake_visual)
        assert_true(repo.read(ws_id, ROOT_TASK_ID)["status"] == "static_verified", "fake VLM must not advance Player")

        write_json(reports / "visual_audit_latest.json", visual_report("grok"))
        passed = sync_player_release_evidence(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(passed["action"] == "handoff_appended", passed)
        assert_true(passed["taskStatus"] == "runtime_verified", passed)
        kinds = {ref["kind"] for ref in passed["evidenceRefs"]}
        assert_true(kinds == {"runtime", "visual", "feel"}, passed)
        player_round = repo.read(ws_id, ROOT_TASK_ID)["handoffRounds"][-1]
        assert_true(player_round["role"] == "player", player_round)
        assert_true(all(ref["fixture"] is False and ref["synthetic"] is False for ref in player_round["evidenceRefs"]), player_round)

        multi_id = "player-sync-multicard"
        multi = temp / multi_id
        multi.mkdir(parents=True)
        seed_static_verified_task(repo, multi_id, multi)
        multi_reports = multi / "reports"
        write_json(multi_reports / "standalone_browser_report.json", browser_report(["survivor_horde", "rhythm_timing"]))
        write_json(multi_reports / "visual_audit_latest.json", visual_report("codex"))
        write_json(multi_reports / "human_playtest_survivor_horde_latest.json", human_report("survivor_horde"))
        incomplete_multi = sync_player_release_evidence(
            repository=repo,
            workspace_id=multi_id,
            workspace_dir=multi,
        )
        assert_true(incomplete_multi["action"] == "noop", incomplete_multi)
        assert_true("feel:human_playtest_missing_or_ineligible:rhythm_timing" in incomplete_multi["evidenceGaps"], incomplete_multi)
        assert_true(repo.read(multi_id, ROOT_TASK_ID)["status"] == "static_verified", "multi-card Player requires every card human evidence")

        # These positive-path JSON objects are isolated contract-test fixtures in a
        # temporary directory. They are never written to a real Workspace or used
        # as release evidence; the bridge itself still requires real evidence flags.
        print(json.dumps({
            "schemaVersion": "loreweaver.release-task-sync-check.v1",
            "status": "passed",
            "checks": [
                "missing_browser_keeps_player_pending",
                "non_real_vlm_provider_cannot_advance_player",
                "runtime_visual_feel_must_share_exact_candidate_identity",
                "real_provider_and_human_contract_shape_can_append_player_handoff",
                "multi_card_workspace_requires_human_evidence_for_every_card",
            ],
        }, ensure_ascii=False, indent=2))
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
