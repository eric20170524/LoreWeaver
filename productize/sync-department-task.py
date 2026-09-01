#!/usr/bin/env python3
"""Synchronize confirmed Department bundles into the next legal TaskContract round."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.department_task_bridge import DepartmentTaskBridgeError  # noqa: E402
from backend.department_task_sync import (  # noqa: E402
    DepartmentTaskSyncError,
    sync_confirmed_departments,
)
from backend.task_repository import TaskRepository, TaskRepositoryError  # noqa: E402

DEFAULT_WORKSPACES_ROOT = ROOT / "data" / "workspaces"
DEFAULT_REPORTS_ROOT = ROOT / "minigame_master" / "capabilities" / "reports"
REGISTRY_PATH = ROOT / "minigame_master" / "skills" / "department_agents.registry.json"


def emit(payload: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    raise SystemExit(code)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DepartmentTaskSyncError(f"json_read_failed:{path}:{exc}") from exc
    if not isinstance(value, dict):
        raise DepartmentTaskSyncError(f"json_not_object:{path}")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync confirmed Departments into TaskContract")
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--department-id", required=True)
    parser.add_argument("--task-id")
    args = parser.parse_args()

    workspaces_root = Path(os.environ.get("LOREWEAVER_WORKSPACES_ROOT", str(DEFAULT_WORKSPACES_ROOT))).resolve()
    reports_root = Path(os.environ.get("LOREWEAVER_REPORTS_ROOT", str(DEFAULT_REPORTS_ROOT))).resolve()
    repository = TaskRepository(workspaces_root)
    workspace_dir = (workspaces_root / args.workspace_id).resolve()
    state_path = workspace_dir / "loreweaver" / "departments" / "state.json"

    try:
        if workspace_dir.parent != workspaces_root or not workspace_dir.is_dir():
            raise DepartmentTaskSyncError(f"workspace_not_found:{args.workspace_id}")
        registry = read_json(REGISTRY_PATH)
        state = read_json(state_path)
        result = sync_confirmed_departments(
            repository=repository,
            workspace_id=args.workspace_id,
            workspace_dir=workspace_dir,
            registry=registry,
            state=state,
            triggering_department_id=args.department_id,
            reports_root=reports_root,
            explicit_task_id=args.task_id,
        )
        emit(result)
    except (DepartmentTaskSyncError, DepartmentTaskBridgeError, TaskRepositoryError) as exc:
        emit(
            {
                "schemaVersion": "loreweaver.department-task-sync.v1",
                "status": "blocked",
                "workspaceId": args.workspace_id,
                "departmentId": args.department_id,
                "taskId": args.task_id,
                "reason": str(exc),
            },
            2,
        )
    except Exception as exc:
        emit(
            {
                "schemaVersion": "loreweaver.department-task-sync.v1",
                "status": "failed",
                "workspaceId": args.workspace_id,
                "departmentId": args.department_id,
                "taskId": args.task_id,
                "reason": "department_task_sync_unhandled_error",
                "error": str(exc),
            },
            1,
        )


if __name__ == "__main__":
    main()
