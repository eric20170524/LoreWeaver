#!/usr/bin/env python3
"""Deterministic checks for the provider-neutral TaskContract state machine."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from backend.task_contract import (
    TaskContractError,
    append_handoff,
    context_for_role,
    create_task_contract,
    evaluate_task_acceptance,
    next_required_role,
    validate_task_contract,
)


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "minigame_master/contracts/task_contract.schema.json"


def assert_true(value, message: str) -> None:
    if not value:
        raise AssertionError(message)


def expect_error(fn, contains: str) -> None:
    try:
        fn()
    except TaskContractError as exc:
        assert_true(contains in str(exc), f"expected '{contains}' in '{exc}'")
        return
    raise AssertionError(f"expected TaskContractError containing: {contains}")


def evidence(evidence_id: str, kind: str, *criteria: str) -> dict:
    return {
        "id": evidence_id,
        "kind": kind,
        "path": f"reports/{evidence_id}.json",
        "status": "passed",
        "criterionIds": list(criteria),
    }


def new_contract(requested_patch_level: str = "L2") -> dict:
    return create_task_contract(
        task_id="boss-readability",
        title="Improve boss readability without changing the runtime core",
        source_spec_hash="spec-hash-12345678",
        product_intent={
            "goal": "Make the climax boss readable and responsive.",
            "userVisibleOutcome": "Players recognize telegraphs and complete the encounter.",
            "nonGoals": ["Replace RuntimeKernel", "Add a second engine"],
        },
        acceptance_criteria=[
            {
                "id": "AC1",
                "description": "Boss phase wiring exists and changes state at runtime.",
                "evidenceKinds": ["static", "runtime"],
            },
            {
                "id": "AC2",
                "description": "Telegraph is visible and the encounter feels responsive.",
                "evidenceKinds": ["visual", "feel"],
            },
        ],
        dependencies=["survivor-base"],
        context={
            "all": [{"file": "task/prd.md", "reason": "bounded product contract"}],
            "architect": [{"file": "docs/runtime.md", "reason": "runtime boundary"}],
            "programmer": [{"file": "src/runtime/adapter.ts", "reason": "implementation surface"}],
            "auditor": [{"file": "contracts/gameplay.md", "reason": "static contract"}],
            "player": [{"file": "contracts/runtime-observation.md", "reason": "runtime evidence"}],
            "reviewer": [{"file": "task/prd.md", "reason": "final acceptance"}],
        },
        runtime_state_contract={
            "fields": [
                {"path": "boss.phase", "type": "number", "reason": "phase transition assertion"},
                {"path": "boss.telegraph", "type": "boolean", "reason": "telegraph state assertion"},
            ],
            "inputActions": ["move", "primary"],
        },
        requested_patch_level=requested_patch_level,
    )


def run_happy_path() -> dict:
    task = new_contract()
    assert_true(task["status"] == "draft", "new L0-L2 task starts draft")
    assert_true(next_required_role(task) == "architect", "architect must plan first")

    expect_error(
        lambda: append_handoff(
            task,
            role="programmer",
            verdict="passed",
            summary="skip architecture",
            evidence_refs=[evidence("impl-skip", "implementation")],
        ),
        "role_out_of_order",
    )
    expect_error(
        lambda: append_handoff(
            task,
            role="architect",
            verdict="passed",
            summary="wrong evidence owner",
            evidence_refs=[evidence("runtime-by-architect", "runtime", "AC1")],
        ),
        "role_evidence_boundary_violation",
    )

    task = append_handoff(
        task,
        role="architect",
        verdict="passed",
        summary="Bounded plan and Runtime State Contract completed.",
        evidence_refs=[evidence("plan-v1", "plan")],
    )
    task = append_handoff(
        task,
        role="programmer",
        verdict="passed",
        summary="Implementation completed within L2 composition authority.",
        evidence_refs=[evidence("implementation-v1", "implementation")],
    )

    expect_error(
        lambda: append_handoff(
            task,
            role="auditor",
            verdict="passed",
            summary="auditor tries to self-certify runtime",
            evidence_refs=[evidence("auditor-runtime", "runtime", "AC1")],
        ),
        "role_evidence_boundary_violation",
    )
    task = append_handoff(
        task,
        role="auditor",
        verdict="passed",
        summary="Static contract and implementation alignment passed.",
        evidence_refs=[evidence("static-ac1", "static", "AC1")],
    )

    expect_error(
        lambda: append_handoff(
            task,
            role="player",
            verdict="passed",
            summary="missing feel evidence",
            evidence_refs=[
                evidence("runtime-ac1", "runtime", "AC1"),
                evidence("visual-ac2", "visual", "AC2"),
            ],
        ),
        "player_missing_feel_evidence:AC2",
    )
    task = append_handoff(
        task,
        role="player",
        verdict="passed",
        summary="One runtime session proved state, pixels and interaction feel.",
        evidence_refs=[
            evidence("runtime-ac1", "runtime", "AC1"),
            evidence("visual-ac2", "visual", "AC2"),
            evidence("feel-ac2", "feel", "AC2"),
        ],
    )
    task = append_handoff(
        task,
        role="reviewer",
        verdict="passed",
        summary="Independent final review accepted the current implementation evidence.",
        evidence_refs=[evidence("independent-review", "review")],
    )
    task = append_handoff(
        task,
        role="orchestrator",
        verdict="passed",
        summary="Product intent and all acceptance criteria are satisfied.",
        evidence_refs=[evidence("product-acceptance", "acceptance")],
    )

    acceptance = evaluate_task_acceptance(task)
    assert_true(task["status"] == "accepted", "full ordered route reaches accepted")
    assert_true(acceptance["accepted"] is True, json.dumps(acceptance, ensure_ascii=False))
    assert_true(len(task["handoffRounds"]) == 6, "one append-only round per role")
    assert_true(validate_task_contract(task)["valid"], "accepted task remains structurally valid")
    return task


def run_rework_path() -> None:
    task = new_contract()
    task = append_handoff(
        task,
        role="architect",
        verdict="passed",
        summary="plan",
        evidence_refs=[evidence("rework-plan", "plan")],
    )
    task = append_handoff(
        task,
        role="programmer",
        verdict="passed",
        summary="implementation round one",
        evidence_refs=[evidence("rework-impl-1", "implementation")],
    )
    task = append_handoff(
        task,
        role="auditor",
        verdict="failed",
        summary="static mismatch found",
        findings=["boss modifier is missing from the compiled contract"],
    )
    assert_true(task["status"] == "blocked", "failed audit blocks task")
    assert_true(next_required_role(task) == "programmer", "audit failure routes to programmer")
    task = append_handoff(
        task,
        role="programmer",
        verdict="passed",
        summary="implementation round two",
        evidence_refs=[evidence("rework-impl-2", "implementation")],
    )
    assert_true(task["status"] == "implemented", "rework restarts verification chain")
    task = append_handoff(
        task,
        role="auditor",
        verdict="passed",
        summary="static pass after rework",
        evidence_refs=[evidence("rework-static", "static", "AC1")],
    )
    task = append_handoff(
        task,
        role="player",
        verdict="passed",
        summary="runtime pass after rework",
        evidence_refs=[
            evidence("rework-runtime", "runtime", "AC1"),
            evidence("rework-visual", "visual", "AC2"),
            evidence("rework-feel", "feel", "AC2"),
        ],
    )
    task = append_handoff(
        task,
        role="reviewer",
        verdict="passed",
        summary="review pass",
        evidence_refs=[evidence("rework-review", "review")],
    )
    task = append_handoff(
        task,
        role="orchestrator",
        verdict="passed",
        summary="accepted after full revalidation",
        evidence_refs=[evidence("rework-accept", "acceptance")],
    )
    assert_true(evaluate_task_acceptance(task)["accepted"], "rework route can be accepted")


def run_adversarial_checks(accepted: dict) -> None:
    l3 = new_contract("L3")
    assert_true(l3["status"] == "escalated", "L3 task must escalate immediately")
    assert_true("patch_authority_requires_human_review:L3" in l3["blockers"])
    expect_error(
        lambda: append_handoff(
            l3,
            role="architect",
            verdict="passed",
            summary="try to bypass escalation",
            evidence_refs=[evidence("l3-plan", "plan")],
        ),
        "task_terminal:escalated",
    )

    expect_error(
        lambda: create_task_contract(
            task_id="missing-runtime-contract",
            title="invalid",
            source_spec_hash="12345678",
            product_intent={"goal": "g", "userVisibleOutcome": "o", "nonGoals": []},
            acceptance_criteria=[
                {"id": "AC", "description": "runtime", "evidenceKinds": ["runtime"]}
            ],
            runtime_state_contract={"fields": [], "inputActions": []},
        ),
        "runtime_state_contract_required",
    )

    tampered = copy.deepcopy(accepted)
    tampered["handoffRounds"][1]["summary"] = "mutated after handoff"
    validation = validate_task_contract(tampered)
    assert_true(not validation["valid"], "hash chain detects mutation")
    assert_true(
        any(error.startswith("handoff_round_hash_invalid") for error in validation["errors"]),
        "tamper reason is explicit",
    )

    player_context = context_for_role(accepted, "player")
    assert_true(
        [item["file"] for item in player_context] == [
            "task/prd.md",
            "contracts/runtime-observation.md",
        ],
        "role context includes all + role-specific entries only",
    )


def main() -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    assert_true(schema.get("$id"), "task contract schema must have an id")
    accepted = run_happy_path()
    run_rework_path()
    run_adversarial_checks(accepted)
    print(
        json.dumps(
            {
                "schemaVersion": "loreweaver.task-contract-check.v1",
                "status": "passed",
                "checks": [
                    "ordered_role_pipeline",
                    "static_runtime_role_separation",
                    "criterion_evidence_coverage",
                    "append_only_hash_chain",
                    "bounded_rework_round",
                    "L3_L4_escalation",
                    "role_specific_context",
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
