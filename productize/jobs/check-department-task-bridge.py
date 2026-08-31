#!/usr/bin/env python3
"""Adversarial checks for Department output -> TaskContract handoffs."""

from __future__ import annotations

import json
import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.department_task_bridge import (  # noqa: E402
    DepartmentTaskBridgeError,
    append_department_handoff,
    department_role,
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
        "path": f"reports/{evidence_id}.json",
        "status": "passed",
        "criterionIds": list(criteria),
        **extra,
    }


def task_contract() -> dict:
    return create_task_contract(
        task_id="department-bridge",
        title="Bridge production departments without self-certifying runtime",
        source_spec_hash="spec-hash-department-12345678",
        product_intent={
            "goal": "Improve a boss encounter through bounded production work.",
            "userVisibleOutcome": "The player reads the telegraph and completes the encounter.",
            "nonGoals": ["Let a Department declare final acceptance"],
        },
        acceptance_criteria=[
            {"id": "AC1", "description": "Implementation passes static audit.", "evidenceKinds": ["static"]},
            {"id": "AC2", "description": "Real runtime play proves encounter quality.", "evidenceKinds": ["runtime", "visual", "feel"]},
        ],
        context={
            "all": [{"file": "task/prd.md", "reason": "intent"}],
            "architect": [{"file": "docs/runtime.md", "reason": "task-level plan"}],
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
    assert_true(department_role("architecture") == "programmer", "production architecture is implementation")
    assert_true(department_role("task_architect") == "architect", "task planner remains Architect")

    with tempfile.TemporaryDirectory(prefix="lw-department-task-") as tmp:
        root = Path(tmp)
        (root / "ws").mkdir(parents=True)
        repo = TaskRepository(root)
        repo.create("ws", task_contract())

        initial = repo.read("ws", "department-bridge")
        expect_error(
            lambda: propose_department_handoff(
                initial,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "production architecture tries to skip task planning",
                    "patchLevel": "L1",
                    "evidenceRefs": [evidence("architecture-implementation", "implementation")],
                },
            ),
            "department_role_out_of_order:programmer:expected=architect",
        )

        planned = repo.append(
            "ws",
            "department-bridge",
            role="architect",
            verdict="passed",
            summary="Independent task-level Architect bounded the implementation surface.",
            evidence_refs=[evidence("task-plan", "plan")],
        )
        architect_hash = repo.last_round_hash(planned)

        implementation = {
            "departmentId": "architecture",
            "status": "confirmed",
            "summary": "Production departments wired the existing RuntimeKernel boundary.",
            "patchLevel": "L2",
            "evidenceRefs": [evidence("production-implementation", "implementation")],
        }
        proposal = propose_department_handoff(planned, implementation, expected_last_round_hash=architect_hash)
        assert_true(proposal.role == "programmer")
        result = append_department_handoff(
            repo, "ws", "department-bridge", implementation, expected_last_round_hash=architect_hash
        )
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
            "summary": "Static wiring and schema checks passed.",
            "evidenceRefs": [evidence("qa-static", "static", "AC1")],
        }
        result = append_department_handoff(
            repo, "ws", "department-bridge", static_audit, expected_last_round_hash=implementation_hash
        )
        assert_true(result["taskStatus"] == "static_verified")
        acceptance = evaluate_task_acceptance(result["task"])
        assert_true(not acceptance["accepted"])
        assert_true("task_not_accepted:static_verified" in acceptance["blockers"])
        assert_true("criterion_evidence_missing:AC2:runtime" in acceptance["blockers"])
        assert_true("criterion_evidence_missing:AC2:visual" in acceptance["blockers"])
        assert_true("criterion_evidence_missing:AC2:feel" in acceptance["blockers"])

        for forbidden in ("director", "player", "reviewer"):
            expect_error(
                lambda forbidden=forbidden: propose_department_handoff(
                    result["task"],
                    {
                        "departmentId": forbidden,
                        "status": "confirmed",
                        "summary": "attempt independent role self-certification",
                        "evidenceRefs": [evidence(f"{forbidden}-fake", "review")],
                    },
                ),
                f"department_cannot_self_certify_independent_role:{forbidden}",
            )

        planned_again = planned
        expect_error(
            lambda: propose_department_handoff(
                planned_again,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "tries L3 change",
                    "patchLevel": "L3",
                    "evidenceRefs": [evidence("l3-impl", "implementation")],
                },
            ),
            "department_patch_exceeds_task_auto_authority:L3>L2",
        )
        expect_error(
            lambda: propose_department_handoff(
                planned_again,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "fixture implementation",
                    "evidenceRefs": [evidence("fixture-impl", "implementation", fixture=True)],
                },
            ),
            "department_fixture_evidence_forbidden:fixture-impl",
        )
        expect_error(
            lambda: propose_department_handoff(
                planned_again,
                {
                    "departmentId": "architecture",
                    "status": "confirmed",
                    "summary": "unsafe evidence",
                    "evidenceRefs": [{**evidence("unsafe-impl", "implementation"), "path": "../outside.json"}],
                },
            ),
            "department_evidence_path_unsafe:unsafe-impl",
        )

        persisted = repo.read("ws", "department-bridge")
        assert_true(len(persisted["handoffRounds"]) == 3, "rejected bridges perform zero writes")
        print(json.dumps({
            "schemaVersion": "loreweaver.department-task-bridge-check.v2",
            "status": "passed",
            "taskStatus": persisted["status"],
            "checks": [
                "production_architecture_maps_to_programmer_not_task_architect",
                "task_architect_must_plan_before_department_implementation",
                "qa_compliance_are_static_auditor_only",
                "department_cannot_self_certify_player_reviewer_or_orchestrator",
                "fixture_unsafe_and_L3_evidence_fail_closed",
                "rejected_bridge_performs_zero_writes",
                "runtime_visual_feel_and_final_review_remain_independent"
            ]
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
