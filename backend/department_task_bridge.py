"""Bridge existing Department outputs into ordered TaskContract handoffs.

The bridge deliberately does not map department completion to Player, Reviewer or
Orchestrator acceptance. Department agents can contribute bounded planning,
implementation or static-audit rounds only. Runtime play, feel, independent
review and final acceptance remain separate evidence roles.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping

from backend.task_contract import (
    ROLE_EVIDENCE_KINDS,
    TaskContractError,
    next_required_role,
)
from backend.task_repository import TaskRepository, TaskRepositoryError


ARCHITECT_DEPARTMENTS = frozenset({
    "architecture",
    "architect",
    "runtime_architecture",
    "system_architecture",
})

PROGRAMMER_DEPARTMENTS = frozenset({
    "world",
    "worldbuilding",
    "narrative",
    "gameplay",
    "ability",
    "code",
    "programming",
    "art",
    "audio",
    "ui",
    "content",
})

AUDITOR_DEPARTMENTS = frozenset({
    "qa",
    "quality",
    "compliance",
    "static_audit",
})

EXPLICITLY_NON_HANDOFF_DEPARTMENTS = frozenset({
    "director",
    "orchestrator",
    "player",
    "reviewer",
    "human_tester",
    "device_tester",
})

PASS_STATUSES = frozenset({
    "confirmed",
    "passed",
    "complete",
    "completed",
    "ready_for_review",
})

FAIL_STATUSES = frozenset({
    "blocked",
    "failed",
    "rejected",
})

PATCH_RANK = {"L0": 0, "L1": 1, "L2": 2, "L3": 3, "L4": 4}


class DepartmentTaskBridgeError(ValueError):
    """Raised when a Department result cannot safely become a Task handoff."""


@dataclass(frozen=True)
class DepartmentHandoffProposal:
    department_id: str
    role: str
    verdict: str
    summary: str
    evidence_refs: tuple[dict[str, Any], ...]
    findings: tuple[str, ...]
    expected_last_round_hash: str | None
    source_status: str
    patch_level: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": "loreweaver.department-task-handoff-proposal.v1",
            "departmentId": self.department_id,
            "role": self.role,
            "verdict": self.verdict,
            "summary": self.summary,
            "evidenceRefs": [dict(item) for item in self.evidence_refs],
            "findings": list(self.findings),
            "expectedLastRoundHash": self.expected_last_round_hash,
            "sourceStatus": self.source_status,
            "patchLevel": self.patch_level,
        }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _unique_strings(values: Iterable[Any] | None) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in values or []:
        value = _text(raw)
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return tuple(result)


def department_role(department_id: str) -> str | None:
    normalized = _text(department_id).lower().replace("-", "_")
    if normalized in ARCHITECT_DEPARTMENTS:
        return "architect"
    if normalized in PROGRAMMER_DEPARTMENTS:
        return "programmer"
    if normalized in AUDITOR_DEPARTMENTS:
        return "auditor"
    return None


def _normalize_verdict(status: str) -> str:
    normalized = _text(status).lower()
    if normalized in PASS_STATUSES:
        return "passed"
    if normalized in FAIL_STATUSES:
        return "failed"
    raise DepartmentTaskBridgeError(
        f"department_status_not_handoff_ready:{normalized or 'missing'}"
    )


def _patch_allowed(task: Mapping[str, Any], patch_level: str | None) -> None:
    if not patch_level:
        return
    normalized = _text(patch_level).upper()
    if normalized not in PATCH_RANK:
        raise DepartmentTaskBridgeError(f"department_patch_level_invalid:{normalized}")
    max_level = _text(
        (task.get("patchAuthority") or {}).get("maxAutoLevel") or "L2"
    ).upper()
    requested = _text(
        (task.get("patchAuthority") or {}).get("requestedLevel") or "L1"
    ).upper()
    if PATCH_RANK[normalized] > PATCH_RANK.get(max_level, PATCH_RANK["L2"]):
        raise DepartmentTaskBridgeError(
            f"department_patch_exceeds_task_auto_authority:{normalized}>{max_level}"
        )
    if PATCH_RANK[normalized] > PATCH_RANK.get(requested, PATCH_RANK["L1"]):
        raise DepartmentTaskBridgeError(
            f"department_patch_exceeds_requested_level:{normalized}>{requested}"
        )
    if normalized in {"L3", "L4"}:
        raise DepartmentTaskBridgeError(
            f"department_patch_requires_human_review:{normalized}"
        )


def _normalize_evidence(
    role: str,
    evidence_refs: Iterable[Mapping[str, Any]] | None,
) -> tuple[dict[str, Any], ...]:
    allowed = ROLE_EVIDENCE_KINDS.get(role, frozenset())
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in evidence_refs or []:
        if not isinstance(raw, Mapping):
            raise DepartmentTaskBridgeError("department_evidence_not_object")
        evidence_id = _text(raw.get("id"))
        kind = _text(raw.get("kind")).lower()
        path = _text(raw.get("path"))
        status = _text(raw.get("status")).lower()
        if not evidence_id or evidence_id in seen:
            raise DepartmentTaskBridgeError(
                f"department_evidence_id_invalid_or_duplicate:{evidence_id or 'missing'}"
            )
        seen.add(evidence_id)
        if kind not in allowed:
            raise DepartmentTaskBridgeError(
                f"department_role_evidence_boundary_violation:{role}:{kind or 'missing'}"
            )
        if status != "passed":
            raise DepartmentTaskBridgeError(
                f"department_evidence_not_passed:{evidence_id}:{status or 'missing'}"
            )
        if not path or path.startswith(("/", "\\")) or ".." in path.replace("\\", "/").split("/"):
            raise DepartmentTaskBridgeError(
                f"department_evidence_path_unsafe:{evidence_id}"
            )
        if raw.get("fixture") is True:
            raise DepartmentTaskBridgeError(
                f"department_fixture_evidence_forbidden:{evidence_id}"
            )
        if raw.get("synthetic") is True:
            raise DepartmentTaskBridgeError(
                f"department_synthetic_evidence_forbidden:{evidence_id}"
            )
        if raw.get("stale") is True or raw.get("freshness") == "stale":
            raise DepartmentTaskBridgeError(
                f"department_stale_evidence_forbidden:{evidence_id}"
            )
        normalized.append(
            {
                "id": evidence_id,
                "kind": kind,
                "path": path,
                "status": "passed",
                "criterionIds": list(
                    _unique_strings(raw.get("criterionIds") or [])
                ),
            }
        )
    return tuple(normalized)


def propose_department_handoff(
    task: Mapping[str, Any],
    department_result: Mapping[str, Any],
    *,
    expected_last_round_hash: str | None = None,
) -> DepartmentHandoffProposal:
    if not isinstance(task, Mapping):
        raise DepartmentTaskBridgeError("task_not_object")
    if not isinstance(department_result, Mapping):
        raise DepartmentTaskBridgeError("department_result_not_object")

    department_id = _text(
        department_result.get("departmentId")
        or department_result.get("department_id")
        or department_result.get("id")
    ).lower().replace("-", "_")
    if not department_id:
        raise DepartmentTaskBridgeError("department_id_missing")
    if department_id in EXPLICITLY_NON_HANDOFF_DEPARTMENTS:
        raise DepartmentTaskBridgeError(
            f"department_cannot_self_certify_independent_role:{department_id}"
        )
    role = department_role(department_id)
    if not role:
        raise DepartmentTaskBridgeError(
            f"department_role_mapping_missing:{department_id}"
        )

    required_role = next_required_role(task)
    if required_role != role:
        raise DepartmentTaskBridgeError(
            f"department_role_out_of_order:{role}:expected={required_role or 'terminal'}"
        )

    source_status = _text(
        department_result.get("status")
        or department_result.get("verdict")
    ).lower()
    verdict = _normalize_verdict(source_status)
    summary = _text(
        department_result.get("summary")
        or department_result.get("message")
        or department_result.get("handoff")
    )
    if not summary:
        raise DepartmentTaskBridgeError("department_summary_missing")

    patch_level = _text(
        department_result.get("patchLevel")
        or department_result.get("patch_level")
    ).upper() or None
    _patch_allowed(task, patch_level)

    evidence_refs = _normalize_evidence(
        role,
        department_result.get("evidenceRefs")
        or department_result.get("evidence_refs")
        or [],
    )
    if verdict == "passed" and not evidence_refs:
        raise DepartmentTaskBridgeError(
            f"department_passed_without_role_evidence:{department_id}:{role}"
        )

    findings = _unique_strings(
        department_result.get("findings")
        or department_result.get("blockers")
        or department_result.get("risks")
        or []
    )
    if verdict == "failed" and not findings:
        raise DepartmentTaskBridgeError(
            f"department_failed_without_findings:{department_id}"
        )

    return DepartmentHandoffProposal(
        department_id=department_id,
        role=role,
        verdict=verdict,
        summary=summary,
        evidence_refs=evidence_refs,
        findings=findings,
        expected_last_round_hash=expected_last_round_hash,
        source_status=source_status,
        patch_level=patch_level,
    )


def append_department_handoff(
    repository: TaskRepository,
    workspace_id: str,
    task_id: str,
    department_result: Mapping[str, Any],
    *,
    expected_last_round_hash: str | None = None,
) -> dict[str, Any]:
    task = repository.read(workspace_id, task_id)
    proposal = propose_department_handoff(
        task,
        department_result,
        expected_last_round_hash=expected_last_round_hash,
    )
    try:
        updated = repository.append(
            workspace_id,
            task_id,
            role=proposal.role,
            verdict=proposal.verdict,
            summary=proposal.summary,
            evidence_refs=proposal.evidence_refs,
            findings=proposal.findings,
            expected_last_round_hash=proposal.expected_last_round_hash,
        )
    except (TaskRepositoryError, TaskContractError) as exc:
        raise DepartmentTaskBridgeError(str(exc)) from exc
    return {
        "schemaVersion": "loreweaver.department-task-handoff-result.v1",
        "status": "passed",
        "departmentId": proposal.department_id,
        "mappedRole": proposal.role,
        "taskId": task_id,
        "taskStatus": updated.get("status"),
        "resumeRole": updated.get("resumeRole"),
        "lastRoundHash": TaskRepository.last_round_hash(updated),
        "proposal": proposal.to_dict(),
        "task": updated,
    }
