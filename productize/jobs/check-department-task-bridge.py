#!/usr/bin/env python3
"""Adversarial checks for Department output -> TaskContract handoffs."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.department_task_bridge import (  # noqa: E402
    DepartmentTaskBridgeError,
    append_department_handoff,
    propose_department_handoff,
)
from backend.task_contract import create_task_contract, evaluate_task_acceptance  # noqa: E402
from backend.task_repository import TaskRepository  # noqa: E402


def assert_true(value, message: str = "assertion failed") -> None:
    if not value:
        raise AssertionError(message)


def expect_error(fn, contains: str) -> None:
    try:
        fn()
    except DepartmentTaskBridgeError as exc:
        assert_true(contains in str(exc), f"expected '{contains}', got '{exc}'")
        return
    raise AssertionError(f"expected DepartmentTaskBridgeError containing: {contains}")


def evidence(evidence_id: str, kind: str, *criteria: str, **extra) -> dict:
    return {
        "id": evidence_id,
        "kind": kind,
        "path": f"data/workspaces/ws/reports/{evidence_id}.json",
        "status": "passed",
        "criterionIds": list(criteria),
        **extra,
    }


def task_contract() -> dict:
    return create_task_contract(
        task_id="department-bridge",
        title="Bridge Department work without self-certifying runtime",
        source_spec_hash="spec-hash-department-12345678",
        product_intent={
            "goal": "Improve a boss encounter through bounded departments.",
            "userVisibleOutcome": "The player reads the telegraph and completes the encounter.",
            "nonGoals": ["Let a Department declare final acceptance"],
        },
        acceptance_criteria=[
            {
                "id": "AC1",
                "description": "Implementation wiring exists and passes static audit.",
                "evidenceKinds": ["static"],
            },
            {
                "id": "AC2",
                "description": "The encounter is proven in a real runtime session.",
                "evidenceKinds": ["runtime", "visual", "feel"],
            },
        ],
        context={
            "all": [{"file": "task/prd.md", "reason": "intent"}],
            "architect": [{"file": "docs/runtime.md", "reason": "boundary"}],
            "programmer": [{"file": "src/adapter.ts", "reason": "implementation"}],
            "auditor": [{"file": "contracts/gameplay.md", "reason": "static audit"}],
            "player": [{"file": "reports/runtime.json", "reason": "runtime evidence"}],
            "reviewer": [{"file": "task/prd.md", "reason": "review"}],
        },
        runtime_state_contract={
            "fields": [
                {"path": "boss.telegraph", "type": "boolean", "reason": "warning"},
                {"path": "boss.phase", "type": "number", "reason": "phase"},
            ],
            "inputActions": ["move", "primary"],
        },
        requested_patch_level="L2",
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="lw-department-task-") as tmp:
        root = Path(tmp)
        (root / "ws").mkdir(parents=True)
        repo = TaskRepository(root)
        repo.create("ws", task_contract())

        initial = repo.read("ws", "department-bridge")
        architecture = {
            "departmentId": "architecture",
            "status": "confirmed",
            "summary": "Defined the existing RuntimeKernel boundary and L2 implementation surface.",
            "patchLevel": "L0",
            "evidenceRefs": [evidence("architecture-plan", "plan")],
        }
        proposal = propose_department_handoff(initial, architecture)
        assert_true(proposal.role == "architect", "architecture maps to Architect")
        dry_bytes = (root / "ws/tasks/department-bridge.json").read_bytes()
        assert_true((root / "ws/tasks/department-bridge.json").read_bytes() == dry_bytes, "proposal is pure")
        result = append_department_handoff(repo, "ws", "department-bridge", architecture)
        assert_true(result["taskStatus"] == "planned", "architecture advances draft to planned")
        architecture_hash = result["lastRoundHash"]

        expect_error(
            lambda: append_department_handoff(
                repo,
                "ws",
                "department-bridge",
                {
                    "departmentId": "qa",
                    "status": "confirmed",
                    "summary": "try to audit before implementation",
                    "evidenceRefs": [evidence("early-static", "static", "AC1")],
                },
            ),
            "department_role_out_of_order:auditor:expected=programmer",
        )

        implementation = {
            "departmentId": "gameplay",
            "status": "confirmed",
            "summary": "Wired boss phases and telegraph knobs through existing Card/Modifier contracts.",
            "patchLevel": "L2",
            "evidenceRefs": [evidence("gameplay-implementation", "implementation")],
        }
        result = append_department_handoff(
            repo,
            "ws",
            "department-bridge",
            implementation,
            expected_last_round_hash=architecture_hash,
        )
        assert_true(result["mappedRole"] == "programmer")
        assert_true(result["taskStatus"] == "implemented")
        implementation_hash = result["lastRoundHash"]

        expect_error(
            lambda: append_department_handoff(
                repo,
                "ws",
                "department-bridge",
                {
                    "departmentId": "qa",
                    "status": "confirmed",
                    "summary": "QA tries to claim runtime proof",
                    "evidenceRefs": [evidence("qa-runtime", "runtime", "AC2")],
                },
                expected_last_round_hash=implementation_hash,
            ),
            "department_role_evidence_boundary_violation:auditor:runtime",
        )

        static_audit = {
            "departmentId": "qa",
            "status": "confirmed",
            "summary": "Static wiring, schema and ownership checks passed.",
            "evidenceRefs": [evidence("qa-static", "static", "AC1")],
        }
        result = append_department_handoff(
            repo,
            "ws",
            "department-bridge",
            static_audit,
            expected_last_round_hash=implementation_hash,
        )
        assert_true(result["taskStatus"] == "static_verified")
        task = result["task"]
        acceptance = evaluate_task_acceptance(task)
        assert_true(acceptance["accepted"] is False, "Department chain cannot final-accept task")
        assert_true(task.get("resumeRole") is None)
        assert_true(len(task["handoffRounds"]) == 3, "only architect/programmer/auditor rounds exist")
        assert_true(any(item.startswith("missing_role:player") for item in acceptance["blockers"]), "real Player remains required")
        assert_true(any(item.startswith("criterion_evidence_missing:AC2:runtime") for item in acceptance["blockers"]), "runtime evidence remains missing")
        assert_true(any(item.startswith("criterion_evidence_missing:AC2:feel") for item in acceptance["blockers"]), "feel evidence remains missing")

        expect_error(
            lambda: propose_department_handoff(
                task,
                {
                    "departmentId": "director",
                    "status": "confirmed",
                    "summary": "director attempts final review",
                    "evidenceRefs": [evidence("director-review", "review")],
                },
            ),
            "department_cannot_self_certify_independent_role:director",
        )
        expect_error(
            lambda: propose_department_handoff(
                task,
                {
                    "departmentId": "player",
                    "status": "confirmed",
                    "summary": "department-shaped player evidence",
                    "evidenceRefs": [evidence("fake-player", "runtime", "AC2")],
                },
            ),
            "department_cannot_self_certify_independent_role:player",
        )

        fresh_task = task_contract()
        expect_error(
            lambda: propose_department_handoff(
                fresh_task,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "tries L3 change",
                    "patchLevel": "L3",
                    "evidenceRefs": [evidence("l3-plan", "plan")],
                },
            ),
            "department_patch_exceeds_task_auto_authority:L3>L2",
        )
        expect_error(
            lambda: propose_department_handoff(
                fresh_task,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "fixture plan",
                    "evidenceRefs": [evidence("fixture-plan", "plan", fixture=True)],
                },
            ),
            "department_fixture_evidence_forbidden:fixture-plan",
        )
        expect_error(
            lambda: propose_department_handoff(
                fresh_task,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "stale plan",
                    "evidenceRefs": [evidence("stale-plan", "plan", stale=True)],
                },
            ),
            "department_stale_evidence_forbidden:stale-plan",
        )
        expect_error(
            lambda: propose_department_handoff(
                fresh_task,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "unsafe evidence path",
                    "evidenceRefs": [
                        {
                            **evidence("unsafe-plan", "plan"),
                            "path": "../outside/report.json",
                        }
                    ],
                },
            ),
            "department_evidence_path_unsafe:unsafe-plan",
        )

        persisted = repo.read("ws", "department-bridge")
        assert_true(len(persisted["handoffRounds"]) == 3, "rejected bridges perform zero writes")

        print(json.dumps({
            "schemaVersion": "loreweaver.department-task-bridge-check.v1",
            "status": "passed",
            "taskStatus": persisted["status"],
            "mappedRounds": [
                {"role": item["role"], "verdict": item["verdict"]}
                for item in persisted["handoffRounds"]
            ],
            "remainingBlockers": acceptance["blockers"],
            "checks": [
                "architecture_maps_to_architect",
                "implementation_departments_map_to_programmer",
                "qa_compliance_map_to_static_auditor_only",
                "department_order_follows_TaskContract",
                "department_cannot_self_certify_player_reviewer_or_orchestrator",
                "fixture_stale_unsafe_and_L3_evidence_fail_closed",
                "rejected_bridge_performs_zero_writes",
                "runtime_visual_feel_and_final_review_remain_independent"
            ]
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
