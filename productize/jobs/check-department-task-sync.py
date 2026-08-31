#!/usr/bin/env python3
"""Deterministic checks for confirmed Department -> Task role bundle sync."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.department_task_sync import sync_confirmed_departments  # noqa: E402
from backend.task_contract import create_task_contract  # noqa: E402
from backend.task_repository import TaskRepository  # noqa: E402


def assert_true(value, message="assertion failed"):
    if not value:
        raise AssertionError(message)


def evidence(evidence_id: str, kind: str) -> dict:
    return {
        "id": evidence_id,
        "kind": kind,
        "path": f"reports/{evidence_id}.json",
        "status": "passed",
        "criterionIds": [],
    }


def make_task(task_id="sync-task"):
    return create_task_contract(
        task_id=task_id,
        title="Sync confirmed production work",
        source_spec_hash="sync-spec-hash-12345678",
        product_intent={
            "goal": "Use confirmed production work without collapsing independent verification.",
            "userVisibleOutcome": "A bounded playable change is implemented and audited.",
            "nonGoals": ["Department self-certifies runtime play"],
        },
        acceptance_criteria=[
            {"id": "AC1", "description": "Static implementation contract passes.", "evidenceKinds": ["static"]},
            {"id": "AC2", "description": "Runtime quality is independently proven.", "evidenceKinds": ["runtime", "visual", "feel"]},
        ],
        context={
            "all": [{"file": "task/prd.md", "reason": "intent"}],
            "architect": [{"file": "docs/runtime.md", "reason": "plan"}],
            "programmer": [{"file": "src/runtime.ts", "reason": "implementation"}],
            "auditor": [{"file": "reports/static.json", "reason": "audit"}],
            "player": [{"file": "reports/runtime.json", "reason": "play"}],
            "reviewer": [{"file": "task/prd.md", "reason": "review"}],
        },
        runtime_state_contract={
            "fields": [{"path": "boss.phase", "type": "number", "reason": "phase"}],
            "inputActions": ["move", "primary"],
        },
        requested_patch_level="L2",
    )


def confirmed(department_id, level="L1"):
    return {
        "id": department_id,
        "status": "confirmed",
        "version": 1,
        "confirmedAt": "2026-08-31T12:00:00Z",
        "qaScore": 85,
        "prepNotes": f"{department_id} confirmed",
        "artifacts": [],
        "lastPatches": [{"path": f"x.{department_id}", "level": level, "value": True}],
    }


def main():
    with tempfile.TemporaryDirectory(prefix="lw-dept-sync-") as tmp:
        root = Path(tmp)
        workspaces = root / "workspaces"
        reports = root / "reports"
        workspace = workspaces / "ws"
        workspace.mkdir(parents=True)
        reports.mkdir(parents=True)
        repo = TaskRepository(workspaces)
        repo.create("ws", make_task())

        # Production departments must not skip the independent task-level Architect.
        registry = {
            "departments": [
                {"id": "world"}, {"id": "gameplay"}, {"id": "architecture"}, {"id": "code"},
                {"id": "qa"}, {"id": "compliance"}, {"id": "director"},
            ]
        }
        state = {"departments": {did: confirmed(did, "L2" if did == "code" else "L1") for did in ["world", "gameplay", "architecture", "code", "qa", "compliance"]}}
        before = repo.read("ws", "sync-task")
        noop = sync_confirmed_departments(
            repository=repo,
            workspace_id="ws",
            workspace_dir=workspace,
            registry=registry,
            state=state,
            triggering_department_id="code",
            reports_root=reports,
        )
        assert_true(noop["action"] == "noop" and "architect" in noop["reason"], json.dumps(noop))
        assert_true(len(repo.read("ws", "sync-task")["handoffRounds"]) == len(before["handoffRounds"]), "draft task must not be mutated")

        planned = repo.append(
            "ws", "sync-task", role="architect", verdict="passed",
            summary="Task-level Architect plan complete.", evidence_refs=[evidence("task-plan", "plan")]
        )
        assert_true(planned["status"] == "planned")

        # One missing implementation department keeps the bundle pending with zero writes.
        state["departments"]["architecture"]["status"] = "ready_for_review"
        pending = sync_confirmed_departments(
            repository=repo, workspace_id="ws", workspace_dir=workspace, registry=registry,
            state=state, triggering_department_id="code", reports_root=reports,
        )
        assert_true(pending["action"] == "noop" and pending["missingDepartments"] == ["architecture"], json.dumps(pending))
        state["departments"]["architecture"] = confirmed("architecture")

        implementation = sync_confirmed_departments(
            repository=repo, workspace_id="ws", workspace_dir=workspace, registry=registry,
            state=state, triggering_department_id="code", reports_root=reports,
        )
        assert_true(implementation["action"] == "handoff_appended", json.dumps(implementation))
        assert_true(implementation["mappedRole"] == "programmer")
        assert_true(implementation["taskStatus"] == "implemented")
        assert_true((workspace / implementation["evidencePath"]).is_file(), "implementation bundle must be persisted")

        # Auditor does not pass merely because QA/compliance were confirmed.
        no_static = sync_confirmed_departments(
            repository=repo, workspace_id="ws", workspace_dir=workspace, registry=registry,
            state=state, triggering_department_id="compliance", reports_root=reports,
        )
        assert_true(no_static["action"] == "noop" and no_static["reason"] == "static_evidence_bundle_incomplete", json.dumps(no_static))
        assert_true(repo.read("ws", "sync-task")["status"] == "implemented")

        for name in ("build_gate_latest.json", "gameplay_card_validate_latest.json"):
            (reports / name).write_text(json.dumps({"schemaVersion": "test.v1", "status": "passed"}), encoding="utf-8")

        audit = sync_confirmed_departments(
            repository=repo, workspace_id="ws", workspace_dir=workspace, registry=registry,
            state=state, triggering_department_id="compliance", reports_root=reports,
        )
        assert_true(audit["action"] == "handoff_appended", json.dumps(audit))
        assert_true(audit["mappedRole"] == "auditor" and audit["taskStatus"] == "static_verified")
        task = repo.read("ws", "sync-task")
        assert_true([round_item["role"] for round_item in task["handoffRounds"]] == ["architect", "programmer", "auditor"])

        # A repeated Department confirm cannot duplicate a round after the task moved to Player.
        repeated = sync_confirmed_departments(
            repository=repo, workspace_id="ws", workspace_dir=workspace, registry=registry,
            state=state, triggering_department_id="compliance", reports_root=reports,
        )
        assert_true(repeated["action"] == "noop" and "no_task_waiting_for_role" in repeated["reason"])
        assert_true(len(repo.read("ws", "sync-task")["handoffRounds"]) == 3)

        print(json.dumps({
            "schemaVersion": "loreweaver.department-task-sync-check.v1",
            "status": "passed",
            "checks": [
                "production_departments_cannot_skip_task_architect",
                "programmer_bundle_waits_for_all_confirmations",
                "one_confirmed_bundle_creates_one_implementation_round",
                "qa_confirmation_without_trusted_static_reports_is_noop",
                "trusted_static_reports_create_one_auditor_round",
                "repeated_confirmation_is_idempotent_after_role_advance",
                "player_reviewer_orchestrator_still_remain_outside_department_sync"
            ]
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
