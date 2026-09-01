#!/usr/bin/env python3
"""Adversarial checks for Repair Loop -> TaskContract rework integration."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.task_contract import create_task_contract, evaluate_task_acceptance  # noqa: E402
from backend.task_repository import TaskRepository  # noqa: E402
from backend.task_repair_bridge import (  # noqa: E402
    TaskRepairBridgeError,
    run_task_repair_rework,
)


def assert_true(value, message="assertion failed"):
    if not value:
        raise AssertionError(message)


def evidence(evidence_id: str, kind: str, *criteria: str) -> dict:
    return {
        "id": evidence_id,
        "kind": kind,
        "path": f"reports/{evidence_id}.json",
        "status": "passed",
        "criterionIds": list(criteria),
    }


def task_contract(task_id: str = "repair-task", requested_level: str = "L2") -> dict:
    return create_task_contract(
        task_id=task_id,
        title="Repair blocked gameplay without bypassing revalidation",
        source_spec_hash="repair-source-spec-hash-12345678",
        product_intent={
            "goal": "Fix a blocked gameplay validation with the smallest bounded repair.",
            "userVisibleOutcome": "The repaired encounter is statically and interactively revalidated.",
            "nonGoals": ["Skip Auditor or Player after repair", "Modify L3/L4 runtime authority"],
        },
        acceptance_criteria=[
            {"id": "AC1", "description": "Static wiring passes after the repair.", "evidenceKinds": ["static"]},
            {"id": "AC2", "description": "Runtime and feel pass after the repair.", "evidenceKinds": ["runtime", "visual", "feel"]},
        ],
        context={
            "all": [{"file": "task/prd.md", "reason": "product intent"}],
            "architect": [{"file": "docs/runtime.md", "reason": "task plan"}],
            "programmer": [{"file": "backend/repair_orchestrator.py", "reason": "bounded repair"}],
            "auditor": [{"file": "reports/static.json", "reason": "static revalidation"}],
            "player": [{"file": "reports/runtime.json", "reason": "runtime revalidation"}],
            "reviewer": [{"file": "task/prd.md", "reason": "independent review"}],
        },
        runtime_state_contract={
            "fields": [
                {"path": "boss.phase", "type": "number", "reason": "phase transition"},
                {"path": "boss.telegraph", "type": "boolean", "reason": "warning state"},
            ],
            "inputActions": ["move", "primary"],
        },
        requested_patch_level=requested_level,
    )


def blocked_repository(root: Path, task_id: str = "repair-task", requested_level: str = "L2") -> tuple[TaskRepository, Path]:
    workspaces = root / "workspaces"
    workspace = workspaces / "ws"
    workspace.mkdir(parents=True, exist_ok=True)
    repo = TaskRepository(workspaces)
    repo.create("ws", task_contract(task_id, requested_level))
    repo.append(
        "ws", task_id,
        role="architect", verdict="passed", summary="Bounded plan complete.",
        evidence_refs=[evidence(f"{task_id}-plan", "plan")],
    )
    repo.append(
        "ws", task_id,
        role="programmer", verdict="passed", summary="Initial implementation complete.",
        evidence_refs=[evidence(f"{task_id}-impl-v1", "implementation")],
    )
    repo.append(
        "ws", task_id,
        role="auditor", verdict="failed", summary="Static validation found a gameplay blocker.",
        findings=["gameplay:goal impossible"],
    )
    blocked = repo.read("ws", task_id)
    assert_true(blocked["status"] == "blocked" and blocked["resumeRole"] == "programmer")
    return repo, workspace


def sample_gdd() -> dict:
    return {
        "title": "Repair Task Fixture",
        "nodes": [
            {
                "id": 1,
                "goalValue": 10,
                "durationLimit": 30,
                "gameplay": {
                    "cardId": "survivor_horde",
                    "adapter": "phaser",
                    "modifiers": [],
                    "knobs": {"durationSec": 30},
                },
            }
        ],
    }


async def validator_runner(validators, candidate):
    assert_true(validators == ["node_smoke"], f"unexpected validators: {validators}")
    assert_true(candidate["nodes"][0]["gameplay"]["knobs"]["durationSec"] == 35)
    return {"blockers": []}


async def successful_repair(gdd, blockers, *, patch_level, validator_runner):
    assert_true(blockers == ["gameplay:goal impossible"])
    assert_true(patch_level in {"L1", "L2"})
    candidate = copy.deepcopy(gdd)
    candidate["nodes"][0]["gameplay"]["knobs"]["durationSec"] = 35
    validation = await validator_runner(["node_smoke"], candidate)
    assert_true(validation.get("blockers") == [])
    return {
        "status": "passed",
        "gdd": candidate,
        "remainingBlockers": [],
        "targetedValidators": ["node_smoke"],
        "history": [
            {
                "blocker": blockers[0],
                "attempt": 0,
                "status": "patch_proposed",
                "decision": {"owner": "gameplay", "patch_level": "L1"},
                "appliedPatches": [
                    {
                        "path": "nodes[0].gameplay.knobs.durationSec",
                        "value": 35,
                        "level": "L1",
                        "reason": "validation-driven agent repair",
                    }
                ],
            }
        ],
    }


async def blocked_repair(gdd, blockers, *, patch_level, validator_runner):
    del validator_runner
    return {
        "status": "blocked",
        "gdd": copy.deepcopy(gdd),
        "remainingBlockers": list(blockers),
        "history": [
            {
                "blocker": blockers[0],
                "attempt": 0,
                "status": "no_safe_patch",
                "decision": {"owner": "gameplay", "patch_level": patch_level},
                "appliedPatches": [],
            }
        ],
        "escalation": "no_safe_patch_within_owner_allowlist",
    }


async def escalated_repair(gdd, blockers, *, patch_level, validator_runner):
    del validator_runner
    return {
        "status": "escalated",
        "gdd": copy.deepcopy(gdd),
        "remainingBlockers": list(blockers),
        "history": [
            {
                "blocker": blockers[0],
                "attempt": 2,
                "status": "escalated",
                "decision": {"owner": "gameplay", "patch_level": patch_level},
                "appliedPatches": [],
            }
        ],
        "escalation": "retry_budget_exhausted:2/2",
    }


async def main() -> None:
    with tempfile.TemporaryDirectory(prefix="lw-task-repair-") as tmp:
        root = Path(tmp)

        # Happy path: a blocked Task gets exactly one Programmer rework round, and
        # must then re-enter Auditor -> Player -> Reviewer before acceptance.
        repo, workspace = blocked_repository(root / "happy")
        authoring = {"spec": sample_gdd(), "rollbacks": 0}

        async def apply_candidate(candidate, context):
            authoring["spec"] = copy.deepcopy(candidate)
            return {
                "status": "committed",
                "afterSpecHash": context["afterSpecHash"],
                "revision": "workspace-revision-2",
            }

        async def rollback_candidate(receipt, context):
            del receipt, context
            authoring["rollbacks"] += 1
            authoring["spec"] = sample_gdd()
            return {"status": "rolled_back"}

        repaired = await run_task_repair_rework(
            repository=repo,
            workspace_id="ws",
            task_id="repair-task",
            workspace_dir=workspace,
            gdd=sample_gdd(),
            validator_runner=validator_runner,
            apply_candidate=apply_candidate,
            rollback_candidate=rollback_candidate,
            patch_level="L1",
            repair_runner=successful_repair,
        )
        assert_true(repaired["status"] == "passed", json.dumps(repaired))
        assert_true(repaired["taskStatus"] == "implemented" and repaired["nextRole"] == "auditor")
        assert_true(authoring["spec"]["nodes"][0]["gameplay"]["knobs"]["durationSec"] == 35)
        assert_true(authoring["rollbacks"] == 0)
        repair_evidence = workspace / repaired["report"]
        assert_true(repair_evidence.is_file(), "successful repair evidence must be persisted")
        repair_report = json.loads(repair_evidence.read_text(encoding="utf-8"))
        assert_true(repair_report["beforeSpecHash"] != repair_report["afterSpecHash"])
        assert_true(repair_report["history"][0]["appliedPatches"][0]["level"] == "L1")
        task_after_repair = repo.read("ws", "repair-task")
        assert_true([r["role"] for r in task_after_repair["handoffRounds"]][-2:] == ["auditor", "programmer"])

        # Old failed audit cannot skip a fresh Auditor and Player pass after rework.
        repo.append(
            "ws", "repair-task",
            role="auditor", verdict="passed", summary="Fresh static revalidation passed.",
            evidence_refs=[evidence("repair-static-v2", "static", "AC1")],
        )
        repo.append(
            "ws", "repair-task",
            role="player", verdict="passed", summary="Fresh same-session runtime play passed.",
            evidence_refs=[
                evidence("repair-runtime-v2", "runtime", "AC2"),
                evidence("repair-visual-v2", "visual", "AC2"),
                evidence("repair-feel-v2", "feel", "AC2"),
            ],
        )
        repo.append(
            "ws", "repair-task",
            role="reviewer", verdict="passed", summary="Independent review accepted fresh repair evidence.",
            evidence_refs=[evidence("repair-review-v2", "review")],
        )
        accepted = repo.append(
            "ws", "repair-task",
            role="orchestrator", verdict="passed", summary="Repaired task accepted.",
            evidence_refs=[evidence("repair-accept-v2", "acceptance")],
        )
        assert_true(evaluate_task_acceptance(accepted)["accepted"], "repair must close through the normal evidence route")

        # A blocked repair is recorded as a failed Programmer round but never calls
        # the authoring commit callback.
        blocked_repo, blocked_workspace = blocked_repository(root / "blocked", "blocked-repair")
        blocked_apply_calls = {"count": 0}

        async def should_not_apply(candidate, context):
            del candidate, context
            blocked_apply_calls["count"] += 1
            return {"status": "committed"}

        blocked_result = await run_task_repair_rework(
            repository=blocked_repo,
            workspace_id="ws",
            task_id="blocked-repair",
            workspace_dir=blocked_workspace,
            gdd=sample_gdd(),
            validator_runner=validator_runner,
            apply_candidate=should_not_apply,
            rollback_candidate=rollback_candidate,
            patch_level="L1",
            repair_runner=blocked_repair,
        )
        assert_true(blocked_result["status"] == "blocked")
        assert_true(blocked_apply_calls["count"] == 0, "failed repair cannot touch authoring")
        blocked_task = blocked_repo.read("ws", "blocked-repair")
        assert_true(blocked_task["status"] == "blocked" and blocked_task["resumeRole"] == "programmer")
        assert_true(blocked_task["handoffRounds"][-1]["role"] == "programmer" and blocked_task["handoffRounds"][-1]["verdict"] == "failed")

        # Retry-budget escalation becomes a Task escalation, again with zero authoring writes.
        escalated_repo, escalated_workspace = blocked_repository(root / "escalated", "escalated-repair")
        escalated_result = await run_task_repair_rework(
            repository=escalated_repo,
            workspace_id="ws",
            task_id="escalated-repair",
            workspace_dir=escalated_workspace,
            gdd=sample_gdd(),
            validator_runner=validator_runner,
            apply_candidate=should_not_apply,
            rollback_candidate=rollback_candidate,
            patch_level="L2",
            repair_runner=escalated_repair,
        )
        assert_true(escalated_result["status"] == "escalated")
        assert_true(escalated_repo.read("ws", "escalated-repair")["status"] == "escalated")
        assert_true(blocked_apply_calls["count"] == 0)

        # If Task state changes after candidate commit but before the repair handoff,
        # authoring must roll back; Task and spec cannot diverge.
        race_repo, race_workspace = blocked_repository(root / "race", "race-repair")
        race_authoring = {"spec": sample_gdd(), "rollbacks": 0}

        async def racing_apply(candidate, context):
            race_authoring["spec"] = copy.deepcopy(candidate)
            # Simulate another process winning the Task handoff race.
            race_repo.append(
                "ws", "race-repair",
                role="programmer", verdict="failed", summary="Concurrent process recorded a new blocker.",
                findings=["gameplay:concurrent blocker"],
                expected_last_round_hash=context["expectedLastRoundHash"],
            )
            return {"status": "committed", "afterSpecHash": context["afterSpecHash"]}

        async def racing_rollback(receipt, context):
            del receipt, context
            race_authoring["spec"] = sample_gdd()
            race_authoring["rollbacks"] += 1
            return {"status": "rolled_back"}

        try:
            await run_task_repair_rework(
                repository=race_repo,
                workspace_id="ws",
                task_id="race-repair",
                workspace_dir=race_workspace,
                gdd=sample_gdd(),
                validator_runner=validator_runner,
                apply_candidate=racing_apply,
                rollback_candidate=racing_rollback,
                patch_level="L1",
                repair_runner=successful_repair,
            )
            raise AssertionError("expected concurrency failure")
        except TaskRepairBridgeError as exc:
            assert_true("repair_task_append_failed_after_commit" in str(exc), str(exc))
        assert_true(race_authoring["rollbacks"] == 1, "concurrent Task race must roll back authoring")
        assert_true(race_authoring["spec"] == sample_gdd(), "rollback restores previous authoring spec")
        assert_true(len(list((race_workspace / "tasks" / "evidence").glob("race-repair-repair-*.json"))) == 0, "failed Task append removes orphan repair evidence")

        # L3/L4 are rejected before the Repair Loop or authoring callback can run.
        authority_repo, authority_workspace = blocked_repository(root / "authority", "authority-repair")
        try:
            await run_task_repair_rework(
                repository=authority_repo,
                workspace_id="ws",
                task_id="authority-repair",
                workspace_dir=authority_workspace,
                gdd=sample_gdd(),
                validator_runner=validator_runner,
                apply_candidate=should_not_apply,
                rollback_candidate=rollback_candidate,
                patch_level="L3",
                repair_runner=successful_repair,
            )
            raise AssertionError("expected L3 authority failure")
        except TaskRepairBridgeError as exc:
            assert_true("repair_patch_requires_human_review:L3" in str(exc), str(exc))
        assert_true(authority_repo.read("ws", "authority-repair")["status"] == "blocked")

        print(json.dumps({
            "schemaVersion": "loreweaver.task-repair-bridge-check.v1",
            "status": "passed",
            "checks": [
                "repair_only_runs_for_blocked_programmer_rework",
                "bounded_repair_commit_becomes_one_programmer_round",
                "repair_evidence_binds_before_after_spec_hash_and_patch_history",
                "fresh_auditor_player_reviewer_are_required_after_repair",
                "blocked_repair_records_failed_round_without_authoring_write",
                "retry_budget_escalation_becomes_task_escalation",
                "task_concurrency_race_rolls_back_authoring_commit",
                "orphan_repair_evidence_is_removed_on_task_append_failure",
                "L3_L4_repair_is_rejected_before_execution"
            ]
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
