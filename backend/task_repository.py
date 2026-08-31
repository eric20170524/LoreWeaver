"""Filesystem repository for Workspace-scoped TaskContracts.

The repository persists provider-neutral task state under
`data/workspaces/<workspace>/tasks/`. Writes are atomic, prior handoff rounds are
hash-chained by `backend.task_contract`, and optimistic concurrency prevents a
stale agent process from overwriting a newer round.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Iterable

from backend.task_contract import (
    TaskContractError,
    append_handoff,
    evaluate_task_acceptance,
    validate_task_contract,
)


SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")


class TaskRepositoryError(ValueError):
    """Raised when persistence, identity or concurrency checks fail."""


def _safe_id(value: str, field: str) -> str:
    text = str(value or "").strip()
    if not SAFE_ID.fullmatch(text) or text in {".", ".."}:
        raise TaskRepositoryError(f"{field}_invalid:{text or 'missing'}")
    return text


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
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


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TaskRepositoryError(f"task_not_found:{path.stem}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise TaskRepositoryError(f"task_read_failed:{path}:{exc}") from exc
    if not isinstance(value, dict):
        raise TaskRepositoryError(f"task_not_object:{path}")
    return value


class TaskRepository:
    def __init__(self, workspaces_root: Path | str):
        self.workspaces_root = Path(workspaces_root).resolve()

    def _workspace(self, workspace_id: str, *, create: bool = False) -> Path:
        safe_workspace = _safe_id(workspace_id, "workspace_id")
        workspace = (self.workspaces_root / safe_workspace).resolve()
        if workspace.parent != self.workspaces_root:
            raise TaskRepositoryError("workspace_outside_root")
        if create:
            workspace.mkdir(parents=True, exist_ok=True)
        if not workspace.is_dir():
            raise TaskRepositoryError(f"workspace_not_found:{safe_workspace}")
        return workspace

    def _tasks_dir(self, workspace_id: str, *, create: bool = False) -> Path:
        workspace = self._workspace(workspace_id, create=create)
        tasks = workspace / "tasks"
        if create:
            tasks.mkdir(parents=True, exist_ok=True)
        return tasks

    def _task_path(self, workspace_id: str, task_id: str) -> Path:
        safe_task = _safe_id(task_id, "task_id")
        return self._tasks_dir(workspace_id, create=True) / f"{safe_task}.json"

    def _history_dir(self, workspace_id: str, task_id: str) -> Path:
        safe_task = _safe_id(task_id, "task_id")
        directory = self._tasks_dir(workspace_id, create=True) / "history" / safe_task
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    @staticmethod
    def last_round_hash(task: dict[str, Any]) -> str | None:
        rounds = task.get("handoffRounds") or []
        return rounds[-1].get("roundHash") if rounds else None

    def list(self, workspace_id: str) -> list[dict[str, Any]]:
        tasks_dir = self._tasks_dir(workspace_id, create=True)
        result: list[dict[str, Any]] = []
        for path in sorted(tasks_dir.glob("*.json")):
            task = _read_json(path)
            validation = validate_task_contract(task)
            result.append(
                {
                    "id": task.get("id"),
                    "title": task.get("title"),
                    "status": task.get("status"),
                    "sourceSpecHash": task.get("sourceSpecHash"),
                    "requestedPatchLevel": task.get("patchAuthority", {}).get(
                        "requestedLevel"
                    ),
                    "roundCount": len(task.get("handoffRounds") or []),
                    "lastRoundHash": self.last_round_hash(task),
                    "blockers": list(task.get("blockers") or []),
                    "valid": validation["valid"],
                    "validationErrors": validation["errors"],
                }
            )
        return result

    def read(self, workspace_id: str, task_id: str) -> dict[str, Any]:
        task = _read_json(self._task_path(workspace_id, task_id))
        validation = validate_task_contract(task)
        if not validation["valid"]:
            raise TaskRepositoryError(
                "task_contract_invalid:" + ";".join(validation["errors"])
            )
        return task

    def create(self, workspace_id: str, task: dict[str, Any]) -> dict[str, Any]:
        validation = validate_task_contract(task)
        if not validation["valid"]:
            raise TaskRepositoryError(
                "task_contract_invalid:" + ";".join(validation["errors"])
            )
        task_id = _safe_id(str(task.get("id") or ""), "task_id")
        path = self._task_path(workspace_id, task_id)
        if path.exists():
            raise TaskRepositoryError(f"task_already_exists:{task_id}")
        _atomic_write_json(path, task)
        _atomic_write_json(
            self._history_dir(workspace_id, task_id) / "round-0000-created.json",
            {
                "schemaVersion": "loreweaver.task-history.v1",
                "event": "created",
                "taskId": task_id,
                "lastRoundHash": None,
                "task": task,
            },
        )
        return task

    def append(
        self,
        workspace_id: str,
        task_id: str,
        *,
        role: str,
        verdict: str,
        summary: str,
        evidence_refs: Iterable[dict[str, Any]] | None = None,
        findings: Iterable[str] | None = None,
        expected_last_round_hash: str | None = None,
    ) -> dict[str, Any]:
        current = self.read(workspace_id, task_id)
        actual_hash = self.last_round_hash(current)
        if expected_last_round_hash is not None and expected_last_round_hash != actual_hash:
            raise TaskRepositoryError(
                "task_concurrency_conflict:"
                f"expected={expected_last_round_hash}:actual={actual_hash}"
            )
        try:
            updated = append_handoff(
                current,
                role=role,
                verdict=verdict,
                summary=summary,
                evidence_refs=evidence_refs,
                findings=findings,
            )
        except TaskContractError as exc:
            raise TaskRepositoryError(str(exc)) from exc

        path = self._task_path(workspace_id, task_id)
        _atomic_write_json(path, updated)
        round_item = updated["handoffRounds"][-1]
        _atomic_write_json(
            self._history_dir(workspace_id, task_id)
            / f"round-{round_item['round']:04d}-{round_item['roundHash'][:12]}.json",
            {
                "schemaVersion": "loreweaver.task-history.v1",
                "event": "handoff",
                "taskId": task_id,
                "lastRoundHash": round_item["roundHash"],
                "round": round_item,
                "status": updated["status"],
                "resumeRole": updated.get("resumeRole"),
                "blockers": updated.get("blockers") or [],
            },
        )
        return updated

    def evaluate(self, workspace_id: str, task_id: str) -> dict[str, Any]:
        return evaluate_task_acceptance(self.read(workspace_id, task_id))
