"""TaskContract integration for the validation-driven Repair Loop.

The Repair Loop is not allowed to become a hidden side channel. A repair may run
only while a TaskContract is blocked and explicitly resumed to Programmer. A
successful repair must be transactionally committed by the caller, persisted as
implementation evidence, and appended as a new Programmer handoff. Auditor,
Player and Reviewer must then run again through the normal TaskContract order.

This module does not own Workspace authoring writes or validators. Those remain
caller-owned callbacks so the existing authoring transaction and verification
toolchain stay authoritative.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Awaitable, Callable, Mapping

from backend.repair_orchestrator import run_repair_loop
from backend.task_contract import next_required_role
from backend.task_repository import TaskRepository, TaskRepositoryError


PATCH_RANK = {"L0": 0, "L1": 1, "L2": 2, "L3": 3, "L4": 4}

RepairRunner = Callable[..., Awaitable[dict[str, Any]]]
ApplyCandidate = Callable[[dict[str, Any], dict[str, Any]], Any]
RollbackCandidate = Callable[[Any, dict[str, Any]], Any]


class TaskRepairBridgeError(ValueError):
    """Raised when repair/rework cannot safely advance the TaskContract."""


def _canonical_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def _safe_task_id(task_id: str) -> str:
    value = str(task_id or "").strip()
    if not value or not all(ch.isalnum() or ch in "._-" for ch in value):
        raise TaskRepairBridgeError(f"task_id_invalid:{value or 'missing'}")
    if value in {".", ".."}:
        raise TaskRepairBridgeError(f"task_id_invalid:{value}")
    return value


def _workspace_evidence_path(workspace_dir: Path, task_id: str, digest: str) -> tuple[Path, str]:
    safe_task = _safe_task_id(task_id)
    safe_digest = digest.replace("sha256:", "")[:16]
    relative = Path("tasks") / "evidence" / f"{safe_task}-repair-{safe_digest}.json"
    absolute = (workspace_dir / relative).resolve()
    root = workspace_dir.resolve()
    if absolute.parent.parent != (root / "tasks").resolve() or not str(absolute).startswith(str(root) + os.sep):
        raise TaskRepairBridgeError("repair_evidence_path_outside_workspace")
    return absolute, relative.as_posix()


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _max_applied_patch_level(history: list[dict[str, Any]]) -> str:
    maximum = "L0"
    for item in history:
        for patch in item.get("appliedPatches") or []:
            level = str((patch or {}).get("level") or "L0").upper()
            if level not in PATCH_RANK:
                raise TaskRepairBridgeError(f"repair_patch_level_invalid:{level}")
            if PATCH_RANK[level] > PATCH_RANK[maximum]:
                maximum = level
    return maximum


def _validate_authority(task: Mapping[str, Any], requested_level: str) -> str:
    level = str(requested_level or "").upper()
    if level not in PATCH_RANK:
        raise TaskRepairBridgeError(f"repair_patch_level_invalid:{level or 'missing'}")
    task_authority = task.get("patchAuthority") or {}
    max_auto = str(task_authority.get("maxAutoLevel") or "L2").upper()
    requested = str(task_authority.get("requestedLevel") or "L1").upper()
    if level in {"L3", "L4"} or PATCH_RANK[level] > PATCH_RANK.get(max_auto, 2):
        raise TaskRepairBridgeError(
            f"repair_patch_requires_human_review:{level}:maxAuto={max_auto}"
        )
    if PATCH_RANK[level] > PATCH_RANK.get(requested, 1):
        raise TaskRepairBridgeError(
            f"repair_patch_exceeds_task_requested_level:{level}>{requested}"
        )
    return level


def _fresh_task_for_commit(
    repository: TaskRepository,
    workspace_id: str,
    task_id: str,
    expected_last_round_hash: str | None,
) -> dict[str, Any]:
    current = repository.read(workspace_id, task_id)
    actual = TaskRepository.last_round_hash(current)
    if actual != expected_last_round_hash:
        raise TaskRepairBridgeError(
            "task_concurrency_conflict_before_repair_commit:"
            f"expected={expected_last_round_hash}:actual={actual}"
        )
    if current.get("status") != "blocked" or next_required_role(current) != "programmer":
        raise TaskRepairBridgeError(
            f"task_no_longer_waiting_for_programmer_rework:{current.get('status')}:{next_required_role(current)}"
        )
    return current


def _repair_findings(loop_result: Mapping[str, Any]) -> list[str]:
    findings = [
        str(value)
        for value in (loop_result.get("remainingBlockers") or [])
        if str(value).strip()
    ]
    escalation = str(loop_result.get("escalation") or "").strip()
    if escalation:
        findings.append(escalation)
    if not findings:
        findings.append(f"repair_loop_{loop_result.get('status') or 'failed'}")
    return list(dict.fromkeys(findings))


def _repair_report(
    *,
    task: Mapping[str, Any],
    task_id: str,
    patch_level: str,
    before_hash: str,
    after_hash: str,
    loop_result: Mapping[str, Any],
    commit_receipt: Any = None,
) -> dict[str, Any]:
    return {
        "schemaVersion": "loreweaver.task-repair-evidence.v1",
        "status": loop_result.get("status"),
        "taskId": task_id,
        "sourceSpecHash": task.get("sourceSpecHash"),
        "taskLastRoundHashBeforeRepair": TaskRepository.last_round_hash(dict(task)),
        "patchLevel": patch_level,
        "beforeSpecHash": before_hash,
        "afterSpecHash": after_hash,
        "remainingBlockers": list(loop_result.get("remainingBlockers") or []),
        "history": list(loop_result.get("history") or []),
        "targetedValidators": list(loop_result.get("targetedValidators") or []),
        "escalation": loop_result.get("escalation"),
        "commitReceipt": commit_receipt,
        "fixture": False,
        "synthetic": False,
        "stale": False,
    }


async def run_task_repair_rework(
    *,
    repository: TaskRepository,
    workspace_id: str,
    task_id: str,
    workspace_dir: Path | str,
    gdd: dict[str, Any],
    validator_runner,
    apply_candidate: ApplyCandidate,
    rollback_candidate: RollbackCandidate | None = None,
    patch_level: str | None = None,
    repair_runner: RepairRunner = run_repair_loop,
) -> dict[str, Any]:
    """Run repair and bind its result into a TaskContract Programmer rework round.

    Success flow:
      blocked Task(resume=programmer)
        -> bounded Repair Loop + targeted validators
        -> caller-owned transactional spec commit
        -> immutable repair evidence
        -> Programmer handoff
        -> Task becomes `implemented` and MUST re-enter Auditor -> Player -> Reviewer.

    If Task append loses an optimistic-concurrency race after the authoring commit,
    the caller-owned rollback callback is invoked. Without a rollback callback the
    function refuses to commit, because Task/spec identity could diverge.
    """
    if not isinstance(gdd, dict):
        raise TaskRepairBridgeError("repair_gdd_must_be_object")
    if not callable(apply_candidate):
        raise TaskRepairBridgeError("repair_apply_candidate_callback_required")
    if rollback_candidate is None or not callable(rollback_candidate):
        raise TaskRepairBridgeError("repair_rollback_candidate_callback_required")
    if validator_runner is None or not callable(validator_runner):
        raise TaskRepairBridgeError("repair_validator_runner_required")

    task_id = _safe_task_id(task_id)
    task = repository.read(workspace_id, task_id)
    if task.get("status") != "blocked" or next_required_role(task) != "programmer":
        raise TaskRepairBridgeError(
            f"task_not_waiting_for_programmer_rework:{task.get('status')}:{next_required_role(task)}"
        )
    blockers = [str(item) for item in task.get("blockers") or [] if str(item).strip()]
    if not blockers:
        raise TaskRepairBridgeError("task_repair_requires_blockers")

    requested_level = patch_level or (task.get("patchAuthority") or {}).get("requestedLevel") or "L1"
    level = _validate_authority(task, requested_level)
    expected_last_round_hash = TaskRepository.last_round_hash(task)
    before_hash = _canonical_hash(gdd)

    loop_result = await repair_runner(
        gdd,
        blockers,
        patch_level=level,
        validator_runner=validator_runner,
    )
    if not isinstance(loop_result, dict):
        raise TaskRepairBridgeError("repair_loop_result_not_object")

    status = str(loop_result.get("status") or "failed")
    working = loop_result.get("gdd")
    if not isinstance(working, dict):
        working = gdd
    after_hash = _canonical_hash(working)
    history = list(loop_result.get("history") or [])
    max_applied = _max_applied_patch_level(history)
    if PATCH_RANK[max_applied] > PATCH_RANK[level]:
        raise TaskRepairBridgeError(
            f"repair_loop_exceeded_declared_patch_level:{max_applied}>{level}"
        )

    workspace = Path(workspace_dir).resolve()
    if not workspace.is_dir():
        raise TaskRepairBridgeError(f"repair_workspace_not_found:{workspace}")

    # Failed/escalated repairs are recorded as Task rounds too, but they never
    # touch authoring files or pretend implementation succeeded.
    if status != "passed":
        _fresh_task_for_commit(
            repository, workspace_id, task_id, expected_last_round_hash
        )
        report = _repair_report(
            task=task,
            task_id=task_id,
            patch_level=level,
            before_hash=before_hash,
            after_hash=after_hash,
            loop_result=loop_result,
        )
        report_path, report_relative = _workspace_evidence_path(
            workspace, task_id, after_hash + ":" + status
        )
        _atomic_write_json(report_path, report)
        try:
            verdict = "escalated" if status == "escalated" else "failed"
            updated = repository.append(
                workspace_id,
                task_id,
                role="programmer",
                verdict=verdict,
                summary=f"Bounded Repair Loop {status}; no authoring commit was accepted.",
                evidence_refs=[
                    {
                        "id": f"repair-{status}-{after_hash.split(':', 1)[-1][:12]}",
                        "kind": "implementation",
                        "path": report_relative,
                        "status": "failed" if status != "escalated" else "unavailable",
                        "criterionIds": [],
                    }
                ],
                findings=_repair_findings(loop_result),
                expected_last_round_hash=expected_last_round_hash,
            )
        except Exception:
            report_path.unlink(missing_ok=True)
            raise
        return {
            "schemaVersion": "loreweaver.task-repair-result.v1",
            "status": status,
            "action": "task_repair_recorded",
            "taskId": task_id,
            "taskStatus": updated.get("status"),
            "resumeRole": updated.get("resumeRole"),
            "report": report_relative,
            "beforeSpecHash": before_hash,
            "afterSpecHash": after_hash,
            "history": history,
        }

    if not history:
        raise TaskRepairBridgeError("repair_passed_without_history")
    if before_hash == after_hash:
        raise TaskRepairBridgeError("repair_passed_without_spec_change")

    # Check Task freshness before authoring commit, then require a caller-owned
    # rollback if the final Task append races another writer.
    _fresh_task_for_commit(
        repository, workspace_id, task_id, expected_last_round_hash
    )
    commit_context = {
        "schemaVersion": "loreweaver.task-repair-commit-context.v1",
        "workspaceId": workspace_id,
        "taskId": task_id,
        "expectedLastRoundHash": expected_last_round_hash,
        "patchLevel": level,
        "beforeSpecHash": before_hash,
        "afterSpecHash": after_hash,
        "history": history,
    }
    commit_receipt = await _maybe_await(apply_candidate(working, commit_context))
    if not isinstance(commit_receipt, Mapping) or commit_receipt.get("status") not in {"applied", "committed"}:
        raise TaskRepairBridgeError("repair_candidate_commit_not_confirmed")
    receipt_hash = str(commit_receipt.get("afterSpecHash") or "")
    if receipt_hash and receipt_hash != after_hash:
        await _maybe_await(rollback_candidate(commit_receipt, commit_context))
        raise TaskRepairBridgeError(
            f"repair_candidate_commit_hash_mismatch:{receipt_hash}!={after_hash}"
        )

    report = _repair_report(
        task=task,
        task_id=task_id,
        patch_level=level,
        before_hash=before_hash,
        after_hash=after_hash,
        loop_result=loop_result,
        commit_receipt=dict(commit_receipt),
    )
    report_path, report_relative = _workspace_evidence_path(
        workspace, task_id, after_hash
    )
    _atomic_write_json(report_path, report)

    try:
        # repository.append repeats the optimistic check. A race here rolls back
        # authoring rather than leaving Task and spec on different revisions.
        updated = repository.append(
            workspace_id,
            task_id,
            role="programmer",
            verdict="passed",
            summary=(
                "Validation-driven Repair Loop committed a bounded rework; "
                "Auditor, Player and Reviewer must revalidate the new spec."
            ),
            evidence_refs=[
                {
                    "id": f"repair-implementation-{after_hash.split(':', 1)[-1][:12]}",
                    "kind": "implementation",
                    "path": report_relative,
                    "status": "passed",
                    "criterionIds": [],
                }
            ],
            findings=[],
            expected_last_round_hash=expected_last_round_hash,
        )
    except Exception as exc:
        rollback_result = await _maybe_await(
            rollback_candidate(commit_receipt, commit_context)
        )
        report_path.unlink(missing_ok=True)
        raise TaskRepairBridgeError(
            f"repair_task_append_failed_after_commit:{exc}:rollback={rollback_result}"
        ) from exc

    return {
        "schemaVersion": "loreweaver.task-repair-result.v1",
        "status": "passed",
        "action": "programmer_rework_appended",
        "taskId": task_id,
        "taskStatus": updated.get("status"),
        "nextRole": next_required_role(updated),
        "report": report_relative,
        "beforeSpecHash": before_hash,
        "afterSpecHash": after_hash,
        "patchLevel": level,
        "maxAppliedPatchLevel": max_applied,
        "lastRoundHash": TaskRepository.last_round_hash(updated),
        "history": history,
        "commitReceipt": dict(commit_receipt),
    }
