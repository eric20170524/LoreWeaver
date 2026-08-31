#!/usr/bin/env python3
"""Deterministic checks for the provider-neutral TaskContract state machine."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.task_contract import (  # noqa: E402
    TaskContractError,
    append_handoff,
    context_for_role,
    create_task_contract,
    evaluate_task_acceptance,
    next_required_role,
    validate_task_contract,
)
from backend.task_repository import (  # noqa: E402
    TaskRepository,
    TaskRepositoryError,
)

SCHEMA = ROOT / "minigame_master/contracts/task_contract.schema.json"


def assert_true(value, message: str = "assertion failed") -> None:
    if not value:
        raise AssertionError(message)


def expect_error(fn, contains: str) -> None:
    try:
        fn()
    except (TaskContractError, TaskRepositoryError) as exc:
        assert_true(contains in str(exc), f"expected '{contains}' in '{exc}'")
        return
    raise AssertionError(f"expected contract/repository error containing: {contains}")


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
                {"path": "boss.telegraph", "type": "boolean", "reason": "telegraph assertion"},
            ],
            "inputActions": ["move", "primary"],
        },
        requested_patch_level=requested_patch_level,
    )


def plan_and_implement(task: dict, suffix: str) -> dict:
    task = append_handoff(
        task,
        role="architect",
        verdict="passed",
        summary="Bounded plan completed.",
        evidence_refs=[evidence(f"plan-{suffix}", "plan")],
    )
    return append_handoff(
        task,
        role="programmer",
        verdict="passed",
        summary="Implementation completed within L2 authority.",
        evidence_refs=[evidence(f"implementation-{suffix}", "implementation")],
    )


def verify(task: dict, suffix: str) -> dict:
    task = append_handoff(
        task,
        role="auditor",
        verdict="passed",
        summary="Static contract alignment passed.",
        evidence_refs=[evidence(f"static-{suffix}", "static", "AC1")],
    )
    return append_handoff(
        task,
        role="player",
        verdict="passed",
        summary="One runtime session proved state, pixels and feel.",
        evidence_refs=[
            evidence(f"runtime-{suffix}", "runtime", "AC1"),
            evidence(f"visual-{suffix}", "visual", "AC2"),
            evidence(f"feel-{suffix}", "feel", "AC2"),
        ],
    )


def finish(task: dict, suffix: str) -> dict:
    task = append_handoff(
        task,
        role="reviewer",
        verdict="passed",
        summary="Independent final review accepted current evidence.",
        evidence_refs=[evidence(f"review-{suffix}", "review")],
    )
    return append_handoff(
        task,
        role="orchestrator",
        verdict="passed",
        summary="Product intent and acceptance criteria are satisfied.",
        evidence_refs=[evidence(f"acceptance-{suffix}", "acceptance")],
    )


def run_happy_path() -> dict:
    task = new_contract()
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

    task = plan_and_implement(task, "v1")
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
        summary="Static pass.",
        evidence_refs=[evidence("static-v1", "static", "AC1")],
    )
    expect_error(
        lambda: append_handoff(
            task,
            role="player",
            verdict="passed",
            summary="missing feel evidence",
            evidence_refs=[
                evidence("runtime-v1", "runtime", "AC1"),
                evidence("visual-v1", "visual", "AC2"),
            ],
        ),
        "player_missing_feel_evidence:AC2",
    )
    task = append_handoff(
        task,
        role="player",
        verdict="passed",
        summary="Runtime pass.",
        evidence_refs=[
            evidence("runtime-v1", "runtime", "AC1"),
            evidence("visual-v1", "visual", "AC2"),
            evidence("feel-v1", "feel", "AC2"),
        ],
    )
    task = finish(task, "v1")
    acceptance = evaluate_task_acceptance(task)
    assert_true(task["status"] == "accepted", "ordered route reaches accepted")
    assert_true(acceptance["accepted"], json.dumps(acceptance, ensure_ascii=False))
    assert_true(len(task["handoffRounds"]) == 6, "one append-only round per role")
    return task


def run_rework_path() -> None:
    task = plan_and_implement(new_contract(), "r1")
    task = append_handoff(
        task,
        role="auditor",
        verdict="failed",
        summary="Static mismatch found.",
        findings=["boss modifier is missing from compiled contract"],
    )
    assert_true(task["status"] == "blocked")
    assert_true(next_required_role(task) == "programmer")
    task = append_handoff(
        task,
        role="programmer",
        verdict="passed",
        summary="Implementation reworked.",
        evidence_refs=[evidence("implementation-r2", "implementation")],
    )
    task = verify(task, "r2")
    task = finish(task, "r2")
    assert_true(evaluate_task_acceptance(task)["accepted"], "rework requires full revalidation")


def run_repository_checks() -> None:
    with tempfile.TemporaryDirectory(prefix="lw-task-repository-") as tmp:
        root = Path(tmp)
        workspace = root / "workspace-a"
        workspace.mkdir(parents=True)
        repo = TaskRepository(root)
        created = repo.create("workspace-a", new_contract())
        assert_true(created["status"] == "draft", "repository creates exact contract")
        assert_true(len(repo.list("workspace-a")) == 1, "repository lists created task")
        assert_true(
            (workspace / "tasks/history/boss-readability/round-0000-created.json").is_file(),
            "repository writes creation history",
        )

        before_bytes = (workspace / "tasks/boss-readability.json").read_bytes()
        expect_error(
            lambda: repo.append(
                "workspace-a",
                "boss-readability",
                role="programmer",
                verdict="passed",
                summary="illegal jump",
                evidence_refs=[evidence("repo-illegal", "implementation")],
            ),
            "role_out_of_order",
        )
        assert_true(
            (workspace / "tasks/boss-readability.json").read_bytes() == before_bytes,
            "failed transition performs zero writes",
        )

        updated = repo.append(
            "workspace-a",
            "boss-readability",
            role="architect",
            verdict="passed",
            summary="repository plan",
            evidence_refs=[evidence("repo-plan", "plan")],
        )
        first_hash = repo.last_round_hash(updated)
        assert_true(first_hash is not None, "repository exposes last round hash")
        expect_error(
            lambda: repo.append(
                "workspace-a",
                "boss-readability",
                role="programmer",
                verdict="passed",
                summary="stale writer",
                evidence_refs=[evidence("repo-stale", "implementation")],
                expected_last_round_hash="stale-hash",
            ),
            "task_concurrency_conflict",
        )
        updated = repo.append(
            "workspace-a",
            "boss-readability",
            role="programmer",
            verdict="passed",
            summary="repository implementation",
            evidence_refs=[evidence("repo-impl", "implementation")],
            expected_last_round_hash=first_hash,
        )
        assert_true(updated["status"] == "implemented", "optimistic append succeeds with current hash")
        history = sorted((workspace / "tasks/history/boss-readability").glob("round-*.json"))
        assert_true(len(history) == 3, "creation plus two handoffs are journaled")
        assert_true(repo.read("workspace-a", "boss-readability") == updated, "read returns persisted contract")
        expect_error(lambda: repo.create("workspace-a", new_contract()), "task_already_exists")
        expect_error(lambda: repo.list("../escape"), "workspace_id_invalid")


def run_adversarial_checks(accepted: dict) -> None:
    l3 = new_contract("L3")
    assert_true(l3["status"] == "escalated", "L3 task must escalate")
    assert_true(
        "patch_authority_requires_human_review:L3" in l3["blockers"],
        "L3 escalation reason must be explicit",
    )
    expect_error(
        lambda: append_handoff(
            l3,
            role="architect",
            verdict="passed",
            summary="bypass escalation",
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
    assert_true(any(error.startswith("handoff_round_hash_invalid") for error in validation["errors"]))

    player_context = context_for_role(accepted, "player")
    assert_true(
        [item["file"] for item in player_context]
        == ["task/prd.md", "contracts/runtime-observation.md"],
        "role context contains all + role-specific entries only",
    )


def main() -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    assert_true(schema.get("$id"), "task contract schema must have an id")
    accepted = run_happy_path()
    run_rework_path()
    run_repository_checks()
    run_adversarial_checks(accepted)
    print(json.dumps({
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
            "atomic_workspace_persistence",
            "optimistic_concurrency",
            "failed_transition_zero_writes"
        ]
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
