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

from backend.release_task_sync import (  # noqa: E402
    sync_orchestrator_certified_promotion,
    sync_reviewer_release_decision,
)
from backend.task_contract import create_task_contract  # noqa: E402
from backend.task_repository import TaskRepository  # noqa: E402

TASK_ID = "release-finalization"


def assert_true(value, message) -> None:
    if not value:
        raise AssertionError(message)


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append(repo: TaskRepository, ws_id: str, role: str, kind: str, criterion_ids: list[str]) -> dict:
    task = repo.read(ws_id, TASK_ID)
    return repo.append(
        ws_id,
        TASK_ID,
        role=role,
        verdict="passed",
        summary=f"Contract-test {role} handoff.",
        evidence_refs=[
            {
                "id": f"{role}-contract-test",
                "kind": kind,
                "path": f"reports/{role}-contract-test.json",
                "status": "passed",
                "criterionIds": criterion_ids,
                "fixture": True,
                "synthetic": True,
                "stale": False,
            }
        ],
        findings=[],
        expected_last_round_hash=TaskRepository.last_round_hash(task),
    )


def seed_runtime_verified(repo: TaskRepository, ws_id: str) -> None:
    task = create_task_contract(
        task_id=TASK_ID,
        title="Release finalization contract test",
        source_spec_hash="source-spec-finalization",
        product_intent={
            "goal": "Exercise final Task release roles.",
            "userVisibleOutcome": "Only strict reviewed promotion reaches acceptance.",
            "nonGoals": ["Use test fixtures as production evidence"],
        },
        acceptance_criteria=[
            {"id": "static", "description": "static", "evidenceKinds": ["static"]},
            {"id": "runtime", "description": "runtime", "evidenceKinds": ["runtime"]},
            {"id": "visual", "description": "visual", "evidenceKinds": ["visual"]},
            {"id": "feel", "description": "feel", "evidenceKinds": ["feel"]},
        ],
        context={"all": [], "architect": [], "programmer": [], "auditor": [], "player": [], "reviewer": []},
        runtime_state_contract={
            "fields": [{"path": "status", "type": "string", "reason": "test"}],
            "inputActions": ["pause"],
        },
        requested_patch_level="L2",
    )
    repo.create(ws_id, task)
    append(repo, ws_id, "architect", "plan", [])
    append(repo, ws_id, "programmer", "implementation", [])
    append(repo, ws_id, "auditor", "static", ["static"])
    current = repo.read(ws_id, TASK_ID)
    current = repo.append(
        ws_id,
        TASK_ID,
        role="player",
        verdict="passed",
        summary="Contract-test Player bundle.",
        evidence_refs=[
            {"id": "runtime-test", "kind": "runtime", "path": "reports/runtime.json", "status": "passed", "criterionIds": ["runtime"], "fixture": True, "synthetic": True, "stale": False},
            {"id": "visual-test", "kind": "visual", "path": "reports/visual.json", "status": "passed", "criterionIds": ["visual"], "fixture": True, "synthetic": True, "stale": False},
            {"id": "feel-test", "kind": "feel", "path": "reports/feel.json", "status": "passed", "criterionIds": ["feel"], "fixture": True, "synthetic": True, "stale": False},
        ],
        findings=[],
        expected_last_round_hash=TaskRepository.last_round_hash(current),
    )
    assert_true(current["status"] == "runtime_verified", current)


def decision(waivers: list[str] | None = None) -> dict:
    return {
        "schemaVersion": "loreweaver.workspace-release-decision.v2",
        "mode": "certified",
        "status": "release_certified",
        "exportAllowed": True,
        "releaseCertified": True,
        "certificationTier": "release_certified",
        "blockers": [],
        "waivers": waivers or [],
        "packageBrowserReport": "data/workspaces/test/reports/standalone_browser_report.json",
        "packageVisualReport": "data/workspaces/test/reports/visual_audit_latest.json",
        "identity": {"specHash": "spec-finalization"},
    }


def promotion(metadata_only: bool = True, payload_preserved: bool = True) -> dict:
    return {
        "schemaVersion": "loreweaver.certified-promotion-report.v1",
        "status": "release_certified",
        "releaseEligible": True,
        "certificationTier": "release_certified",
        "metadataOnlyPromotion": metadata_only,
        "payloadPreserved": payload_preserved,
        "fixture": False,
        "synthetic": False,
        "stale": False,
        "payloadHash": "payload-finalization",
        "sourceCandidate": "productize/exports/candidate.zip",
        "artifact": "productize/exports/certified.zip",
        "artifactSha256": "certified-artifact-sha",
        "releaseDecision": "data/workspaces/test/reports/release_decision_latest.json",
    }


def main() -> None:
    temp = Path(tempfile.mkdtemp(prefix="lw-release-task-finalization-"))
    try:
        repo = TaskRepository(temp)
        ws_id = "finalization"
        workspace = temp / ws_id
        workspace.mkdir(parents=True)
        seed_runtime_verified(repo, ws_id)
        reports = workspace / "reports"

        write_json(reports / "release_decision_latest.json", decision(["waive-device"] ))
        blocked_review = sync_reviewer_release_decision(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(blocked_review["action"] == "noop", blocked_review)
        assert_true(repo.read(ws_id, TASK_ID)["status"] == "runtime_verified", "waiver must prevent Reviewer handoff")

        write_json(reports / "release_decision_latest.json", decision())
        reviewed = sync_reviewer_release_decision(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(reviewed["action"] == "handoff_appended", reviewed)
        assert_true(reviewed["taskStatus"] == "reviewed", reviewed)
        assert_true(repo.read(ws_id, TASK_ID)["handoffRounds"][-1]["role"] == "reviewer", reviewed)

        write_json(reports / "certified_promotion_latest.json", promotion(metadata_only=False))
        blocked_acceptance = sync_orchestrator_certified_promotion(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(blocked_acceptance["action"] == "noop", blocked_acceptance)
        assert_true(repo.read(ws_id, TASK_ID)["status"] == "reviewed", "non-metadata promotion must not be accepted")

        write_json(reports / "certified_promotion_latest.json", promotion())
        accepted = sync_orchestrator_certified_promotion(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=workspace,
        )
        assert_true(accepted["action"] == "handoff_appended", accepted)
        assert_true(accepted["taskStatus"] == "accepted", accepted)
        final_task = repo.read(ws_id, TASK_ID)
        assert_true([item["role"] for item in final_task["handoffRounds"]][-2:] == ["reviewer", "orchestrator"], final_task)
        assert_true(final_task["handoffRounds"][-1]["evidenceRefs"][0]["kind"] == "acceptance", final_task)

        print(json.dumps({
            "schemaVersion": "loreweaver.release-task-finalization-check.v1",
            "status": "passed",
            "checks": [
                "waived_release_decision_cannot_become_reviewer_pass",
                "strict_no_waiver_certified_decision_can_append_reviewer",
                "non_metadata_promotion_cannot_become_orchestrator_acceptance",
                "metadata_only_payload_preserved_promotion_can_complete_task_acceptance",
            ],
        }, ensure_ascii=False, indent=2))
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
