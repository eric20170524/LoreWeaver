"""Synchronize confirmed production Departments into TaskContract role bundles.

This module intentionally bridges only production implementation and static-audit
work. Task Architect remains a task-level planner that must run before the
production bundle. Player, Reviewer and Orchestrator remain independent.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from backend.department_task_bridge import (
    DepartmentTaskBridgeError,
    PATCH_RANK,
    append_department_handoff,
    department_role,
)
from backend.task_contract import next_required_role
from backend.task_repository import TaskRepository


STATIC_REPORT_NAMES = (
    "build_gate_latest.json",
    "gameplay_card_validate_latest.json",
)
PASS_REPORT_STATUSES = {"passed", "pass", "ok", "success"}


class DepartmentTaskSyncError(ValueError):
    """Raised when a Department bundle cannot be selected safely."""


def _json_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def _department_ids_for_role(registry: dict[str, Any], role: str) -> list[str]:
    result: list[str] = []
    for item in registry.get("departments") or []:
        if not isinstance(item, dict):
            continue
        department_id = str(item.get("id") or "").strip()
        if department_id and department_role(department_id) == role:
            result.append(department_id)
    return result


def _confirmed_snapshot(state: dict[str, Any], department_ids: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    departments = state.get("departments") or {}
    snapshots: list[dict[str, Any]] = []
    missing: list[str] = []
    for department_id in department_ids:
        current = departments.get(department_id) or {}
        if current.get("status") != "confirmed":
            missing.append(department_id)
            continue
        snapshots.append(
            {
                "id": department_id,
                "status": "confirmed",
                "version": int(current.get("version") or 0),
                "confirmedAt": current.get("confirmedAt"),
                "qaScore": current.get("qaScore"),
                "prepNotes": str(current.get("prepNotes") or ""),
                "artifacts": list(current.get("artifacts") or []),
                "lastPatches": list(current.get("lastPatches") or []),
            }
        )
    return snapshots, missing


def _max_patch_level(snapshots: list[dict[str, Any]]) -> str:
    level = "L0"
    for snapshot in snapshots:
        for patch in snapshot.get("lastPatches") or []:
            candidate = str((patch or {}).get("level") or "L0").upper()
            if candidate in PATCH_RANK and PATCH_RANK[candidate] > PATCH_RANK[level]:
                level = candidate
    return level


def _select_task(
    repository: TaskRepository,
    workspace_id: str,
    role: str,
    explicit_task_id: str | None,
) -> tuple[str, dict[str, Any]] | None:
    if explicit_task_id:
        task = repository.read(workspace_id, explicit_task_id)
        if next_required_role(task) != role:
            return None
        return explicit_task_id, task

    matches: list[tuple[str, dict[str, Any]]] = []
    for summary in repository.list(workspace_id):
        task_id = str(summary.get("id") or "")
        if not task_id:
            continue
        task = repository.read(workspace_id, task_id)
        if next_required_role(task) == role:
            matches.append((task_id, task))
    if len(matches) > 1:
        raise DepartmentTaskSyncError(
            "multiple_tasks_require_department_role:"
            f"{role}:{','.join(task_id for task_id, _ in matches)}"
        )
    return matches[0] if matches else None


def _static_report_bundle(reports_root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    reports: list[dict[str, Any]] = []
    missing_or_failed: list[str] = []
    for name in STATIC_REPORT_NAMES:
        path = reports_root / name
        if not path.is_file():
            missing_or_failed.append(f"missing:{name}")
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            missing_or_failed.append(f"invalid:{name}")
            continue
        status = str(payload.get("status") or payload.get("result") or "").lower()
        if status not in PASS_REPORT_STATUSES:
            missing_or_failed.append(f"not_passed:{name}:{status or 'missing'}")
            continue
        reports.append(
            {
                "name": name,
                "status": status,
                "sha256": _file_sha256(path),
                "schemaVersion": payload.get("schemaVersion"),
            }
        )
    return reports, missing_or_failed


def sync_confirmed_departments(
    *,
    repository: TaskRepository,
    workspace_id: str,
    workspace_dir: Path,
    registry: dict[str, Any],
    state: dict[str, Any],
    triggering_department_id: str,
    reports_root: Path,
    explicit_task_id: str | None = None,
) -> dict[str, Any]:
    role = department_role(triggering_department_id)
    if role not in {"programmer", "auditor"}:
        return {
            "schemaVersion": "loreweaver.department-task-sync.v1",
            "status": "passed",
            "action": "noop",
            "reason": "department_has_no_automatic_task_role",
            "departmentId": triggering_department_id,
        }

    selected = _select_task(repository, workspace_id, role, explicit_task_id)
    if selected is None:
        return {
            "schemaVersion": "loreweaver.department-task-sync.v1",
            "status": "passed",
            "action": "noop",
            "reason": f"no_task_waiting_for_role:{role}",
            "departmentId": triggering_department_id,
            "taskId": explicit_task_id,
        }
    task_id, task = selected

    required_departments = _department_ids_for_role(registry, role)
    snapshots, missing = _confirmed_snapshot(state, required_departments)
    if missing:
        return {
            "schemaVersion": "loreweaver.department-task-sync.v1",
            "status": "passed",
            "action": "noop",
            "reason": f"role_bundle_waiting_for_confirmations:{role}",
            "departmentId": triggering_department_id,
            "taskId": task_id,
            "requiredDepartments": required_departments,
            "missingDepartments": missing,
        }

    criteria_ids: list[str] = []
    static_reports: list[dict[str, Any]] = []
    if role == "auditor":
        static_reports, gaps = _static_report_bundle(reports_root)
        if gaps:
            return {
                "schemaVersion": "loreweaver.department-task-sync.v1",
                "status": "passed",
                "action": "noop",
                "reason": "static_evidence_bundle_incomplete",
                "departmentId": triggering_department_id,
                "taskId": task_id,
                "evidenceGaps": gaps,
            }
        criteria_ids = [
            str(item.get("id"))
            for item in task.get("acceptanceCriteria") or []
            if "static" in (item.get("evidenceKinds") or [])
        ]

    role_kind = "implementation" if role == "programmer" else "static"
    bundle = {
        "schemaVersion": "loreweaver.department-role-bundle-evidence.v1",
        "workspaceId": workspace_id,
        "taskId": task_id,
        "role": role,
        "triggeringDepartmentId": triggering_department_id,
        "sourceSpecHash": task.get("sourceSpecHash"),
        "departments": snapshots,
        "staticReports": static_reports,
        "fixture": False,
        "synthetic": False,
        "stale": False,
    }
    bundle_hash = _json_hash(bundle)
    relative_path = Path("loreweaver") / "departments" / "task-evidence" / f"{task_id}-{role}-{bundle_hash[:16]}.json"
    evidence_path = workspace_dir / relative_path
    _atomic_write_json(evidence_path, {**bundle, "bundleHash": bundle_hash})

    patch_level = _max_patch_level(snapshots) if role == "programmer" else "L0"
    result = append_department_handoff(
        repository,
        workspace_id,
        task_id,
        {
            "departmentId": triggering_department_id,
            "status": "confirmed",
            "summary": (
                f"Confirmed production Department bundle: {', '.join(required_departments)}."
                if role == "programmer"
                else f"Confirmed QA/compliance bundle with trusted static reports: {', '.join(item['name'] for item in static_reports)}."
            ),
            "patchLevel": patch_level,
            "evidenceRefs": [
                {
                    "id": f"department-{role}-{bundle_hash[:16]}",
                    "kind": role_kind,
                    "path": relative_path.as_posix(),
                    "status": "passed",
                    "criterionIds": criteria_ids,
                    "fixture": False,
                    "synthetic": False,
                    "stale": False,
                }
            ],
        },
        expected_last_round_hash=TaskRepository.last_round_hash(task),
    )
    return {
        "schemaVersion": "loreweaver.department-task-sync.v1",
        "status": "passed",
        "action": "handoff_appended",
        "departmentId": triggering_department_id,
        "taskId": task_id,
        "mappedRole": role,
        "requiredDepartments": required_departments,
        "evidencePath": relative_path.as_posix(),
        "taskStatus": result.get("taskStatus"),
        "lastRoundHash": result.get("lastRoundHash"),
    }
