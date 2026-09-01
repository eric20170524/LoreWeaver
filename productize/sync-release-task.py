#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.release_task_sync import (  # noqa: E402
    ReleaseTaskSyncError,
    sync_orchestrator_certified_promotion,
    sync_player_release_evidence,
    sync_reviewer_release_decision,
)
from backend.task_repository import TaskRepository, TaskRepositoryError  # noqa: E402

WORKSPACES_ROOT = ROOT / "data/workspaces"
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
SYNC_BY_ROLE = {
    "player": sync_player_release_evidence,
    "reviewer": sync_reviewer_release_decision,
    "orchestrator": sync_orchestrator_certified_promotion,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--task-id", default=None)
    parser.add_argument("--role", choices=sorted(SYNC_BY_ROLE), default="player")
    args = parser.parse_args()

    if not SAFE_ID.fullmatch(args.workspace_id or "") or args.workspace_id in {".", ".."}:
        print(json.dumps({"status": "blocked", "reason": "invalid_workspace_id"}))
        return 2
    if args.task_id and (not SAFE_ID.fullmatch(args.task_id) or args.task_id in {".", ".."}):
        print(json.dumps({"status": "blocked", "reason": "invalid_task_id"}))
        return 2
    workspace = (WORKSPACES_ROOT / args.workspace_id).resolve()
    if workspace.parent != WORKSPACES_ROOT.resolve() or not workspace.is_dir():
        print(json.dumps({"status": "blocked", "reason": "workspace_not_found"}))
        return 2

    repository = TaskRepository(WORKSPACES_ROOT)
    try:
        result = SYNC_BY_ROLE[args.role](
            repository=repository,
            workspace_id=args.workspace_id,
            workspace_dir=workspace,
            explicit_task_id=args.task_id,
        )
    except (ReleaseTaskSyncError, TaskRepositoryError) as exc:
        print(json.dumps({
            "schemaVersion": "loreweaver.release-task-sync.v1",
            "status": "blocked",
            "role": args.role,
            "reason": str(exc),
        }, ensure_ascii=False, indent=2))
        return 2

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
