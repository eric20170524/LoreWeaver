#!/usr/bin/env python3
"""Create, inspect and advance Workspace TaskContracts.

Examples:
  python3 productize/task-contract.py list --workspace-id=<id>
  python3 productize/task-contract.py create --workspace-id=<id> --input=task.json
  python3 productize/task-contract.py handoff --workspace-id=<id> --task-id=<task> --input=handoff.json
  python3 productize/task-contract.py evaluate --workspace-id=<id> --task-id=<task>

The CLI manages state only. It never spawns an agent or grants patch authority.
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

from backend.task_contract import TaskContractError, create_task_contract  # noqa: E402
from backend.task_repository import TaskRepository, TaskRepositoryError  # noqa: E402


DEFAULT_WORKSPACES_ROOT = ROOT / "data" / "workspaces"


def emit(value: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))
    raise SystemExit(code)


def read_input(path_arg: str | None) -> dict[str, Any]:
    try:
        raw = (
            Path(path_arg).read_text(encoding="utf-8")
            if path_arg
            else sys.stdin.read()
        )
        value = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise TaskRepositoryError(f"input_json_invalid:{exc}") from exc
    if not isinstance(value, dict):
        raise TaskRepositoryError("input_must_be_json_object")
    return value


def repository() -> TaskRepository:
    root = Path(
        os.environ.get("LOREWEAVER_WORKSPACES_ROOT", str(DEFAULT_WORKSPACES_ROOT))
    )
    return TaskRepository(root)


def cmd_list(args: argparse.Namespace) -> dict[str, Any]:
    tasks = repository().list(args.workspace_id)
    return {
        "schemaVersion": "loreweaver.task-list.v1",
        "status": "passed",
        "workspaceId": args.workspace_id,
        "count": len(tasks),
        "tasks": tasks,
    }


def cmd_show(args: argparse.Namespace) -> dict[str, Any]:
    task = repository().read(args.workspace_id, args.task_id)
    return {
        "schemaVersion": "loreweaver.task-show.v1",
        "status": "passed",
        "workspaceId": args.workspace_id,
        "task": task,
    }


def cmd_create(args: argparse.Namespace) -> dict[str, Any]:
    value = read_input(args.input)
    if value.get("schemaVersion") == "loreweaver.task-contract.v1":
        task = value
    else:
        task = create_task_contract(
            task_id=str(value.get("id") or value.get("taskId") or ""),
            title=str(value.get("title") or ""),
            source_spec_hash=str(value.get("sourceSpecHash") or ""),
            product_intent=value.get("productIntent") or {},
            acceptance_criteria=value.get("acceptanceCriteria") or [],
            dependencies=value.get("dependencies") or [],
            context=value.get("context") or {},
            runtime_state_contract=value.get("runtimeStateContract") or {},
            requested_patch_level=str(
                value.get("requestedPatchLevel")
                or value.get("patchAuthority", {}).get("requestedLevel")
                or "L1"
            ),
        )
    created = repository().create(args.workspace_id, task)
    return {
        "schemaVersion": "loreweaver.task-create-result.v1",
        "status": "passed",
        "workspaceId": args.workspace_id,
        "taskId": created["id"],
        "taskStatus": created["status"],
        "lastRoundHash": TaskRepository.last_round_hash(created),
        "task": created,
    }


def cmd_handoff(args: argparse.Namespace) -> dict[str, Any]:
    value = read_input(args.input)
    updated = repository().append(
        args.workspace_id,
        args.task_id,
        role=str(value.get("role") or ""),
        verdict=str(value.get("verdict") or ""),
        summary=str(value.get("summary") or ""),
        evidence_refs=value.get("evidenceRefs") or [],
        findings=value.get("findings") or [],
        expected_last_round_hash=(
            str(value["expectedLastRoundHash"])
            if value.get("expectedLastRoundHash") is not None
            else None
        ),
    )
    last_round = updated["handoffRounds"][-1]
    return {
        "schemaVersion": "loreweaver.task-handoff-result.v1",
        "status": "passed",
        "workspaceId": args.workspace_id,
        "taskId": updated["id"],
        "taskStatus": updated["status"],
        "resumeRole": updated.get("resumeRole"),
        "blockers": updated.get("blockers") or [],
        "round": last_round,
        "lastRoundHash": last_round["roundHash"],
        "task": updated,
    }


def cmd_evaluate(args: argparse.Namespace) -> dict[str, Any]:
    result = repository().evaluate(args.workspace_id, args.task_id)
    return {
        "schemaVersion": "loreweaver.task-evaluate-result.v1",
        "status": "passed",
        "workspaceId": args.workspace_id,
        "taskId": args.task_id,
        "acceptance": result,
    }


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="LoreWeaver Workspace TaskContract CLI")
    sub = root.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list")
    list_parser.add_argument("--workspace-id", required=True)
    list_parser.set_defaults(handler=cmd_list)

    show_parser = sub.add_parser("show")
    show_parser.add_argument("--workspace-id", required=True)
    show_parser.add_argument("--task-id", required=True)
    show_parser.set_defaults(handler=cmd_show)

    create_parser = sub.add_parser("create")
    create_parser.add_argument("--workspace-id", required=True)
    create_parser.add_argument("--input")
    create_parser.set_defaults(handler=cmd_create)

    handoff_parser = sub.add_parser("handoff")
    handoff_parser.add_argument("--workspace-id", required=True)
    handoff_parser.add_argument("--task-id", required=True)
    handoff_parser.add_argument("--input")
    handoff_parser.set_defaults(handler=cmd_handoff)

    evaluate_parser = sub.add_parser("evaluate")
    evaluate_parser.add_argument("--workspace-id", required=True)
    evaluate_parser.add_argument("--task-id", required=True)
    evaluate_parser.set_defaults(handler=cmd_evaluate)
    return root


def main() -> None:
    args = parser().parse_args()
    try:
        result = args.handler(args)
        emit(result)
    except (TaskRepositoryError, TaskContractError) as exc:
        emit(
            {
                "schemaVersion": "loreweaver.task-command-error.v1",
                "status": "blocked",
                "reason": str(exc),
            },
            2,
        )
    except Exception as exc:  # defensive boundary for CLI consumers
        emit(
            {
                "schemaVersion": "loreweaver.task-command-error.v1",
                "status": "failed",
                "reason": "task_command_unhandled_error",
                "error": str(exc),
            },
            1,
        )


if __name__ == "__main__":
    main()
