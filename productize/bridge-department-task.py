#!/usr/bin/env python3
"""Map one existing Department result into the next legal TaskContract handoff.

The command is provider-neutral and does not invoke an Agent. It consumes a
completed Department result, applies the role/evidence/patch boundary, and uses
the same Workspace TaskRepository as the Task API.
"""

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

from backend.department_task_bridge import (  # noqa: E402
    DepartmentTaskBridgeError,
    append_department_handoff,
    propose_department_handoff,
)
from backend.task_repository import TaskRepository, TaskRepositoryError  # noqa: E402


DEFAULT_WORKSPACES_ROOT = ROOT / "data" / "workspaces"


def emit(payload: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    raise SystemExit(code)


def read_input(path_arg: str | None) -> dict[str, Any]:
    try:
        raw = Path(path_arg).read_text(encoding="utf-8") if path_arg else sys.stdin.read()
        value = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise DepartmentTaskBridgeError(f"department_input_invalid:{exc}") from exc
    if not isinstance(value, dict):
        raise DepartmentTaskBridgeError("department_input_not_object")
    return value


def repository() -> TaskRepository:
    return TaskRepository(
        Path(os.environ.get("LOREWEAVER_WORKSPACES_ROOT", str(DEFAULT_WORKSPACES_ROOT)))
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Bridge Department output into TaskContract")
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--input")
    parser.add_argument("--expected-last-round-hash")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        result = read_input(args.input)
        repo = repository()
        if args.dry_run:
            task = repo.read(args.workspace_id, args.task_id)
            proposal = propose_department_handoff(
                task,
                result,
                expected_last_round_hash=args.expected_last_round_hash,
            )
            emit(
                {
                    "schemaVersion": "loreweaver.department-task-bridge-dry-run.v1",
                    "status": "passed",
                    "dryRun": True,
                    "workspaceId": args.workspace_id,
                    "taskId": args.task_id,
                    "proposal": proposal.to_dict(),
                }
            )

        bridged = append_department_handoff(
            repo,
            args.workspace_id,
            args.task_id,
            result,
            expected_last_round_hash=args.expected_last_round_hash,
        )
        emit({**bridged, "workspaceId": args.workspace_id, "dryRun": False})
    except (DepartmentTaskBridgeError, TaskRepositoryError) as exc:
        emit(
            {
                "schemaVersion": "loreweaver.department-task-handoff-result.v1",
                "status": "blocked",
                "workspaceId": args.workspace_id,
                "taskId": args.task_id,
                "reason": str(exc),
            },
            2,
        )
    except Exception as exc:
        emit(
            {
                "schemaVersion": "loreweaver.department-task-handoff-result.v1",
                "status": "failed",
                "workspaceId": args.workspace_id,
                "taskId": args.task_id,
                "reason": "department_task_bridge_unhandled_error",
                "error": str(exc),
            },
            1,
        )


if __name__ == "__main__":
    main()
