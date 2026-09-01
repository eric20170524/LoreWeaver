#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.department_task_sync import sync_confirmed_departments  # noqa: E402
from backend.task_bootstrap import ROOT_TASK_ID, ensure_root_production_task  # noqa: E402
from backend.task_repository import TaskRepository  # noqa: E402


def assert_true(value, message: str) -> None:
    if not value:
        raise AssertionError(message)


def manifest(title: str = "Bootstrap Slice") -> dict:
    return {
        "title": title,
        "nodes": [
            {
                "id": 1,
                "title": "Setup",
                "mechanics": "survivor_horde",
                "gameplay": {
                    "cardId": "survivor_horde",
                    "modifiers": [],
                    "knobs": {"durationSec": 30},
                },
            },
            {
                "id": 2,
                "title": "Pressure",
                "mechanics": "survivor_horde",
                "gameplay": {
                    "cardId": "survivor_horde",
                    "modifiers": ["hazard_telegraph"],
                    "knobs": {"durationSec": 45},
                },
            },
        ],
    }


def write_manifest(workspace: Path, value: dict) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "manifest.json").write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    temp = Path(tempfile.mkdtemp(prefix="lw-task-bootstrap-"))
    try:
        repo = TaskRepository(temp)
        ws_id = "bootstrap-direct"
        ws = temp / ws_id
        write_manifest(ws, manifest())

        first = ensure_root_production_task(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=ws,
        )
        assert_true(first["action"] == "root_task_created", first)
        assert_true(first["taskStatus"] == "planned", first)
        task = repo.read(ws_id, ROOT_TASK_ID)
        assert_true(task["status"] == "planned", task)
        assert_true(task["patchAuthority"]["requestedLevel"] == "L2", task)
        assert_true(len(task["handoffRounds"]) == 1, task)
        architect = task["handoffRounds"][0]
        assert_true(architect["role"] == "architect" and architect["verdict"] == "passed", architect)
        assert_true(architect["evidenceRefs"][0]["kind"] == "plan", architect)
        assert_true((ws / "loreweaver/tasks/root-production-architect-plan.json").is_file(), "plan evidence missing")
        assert_true(
            {item["id"] for item in task["acceptanceCriteria"]}
            == {"static-contract", "runtime-playability", "visual-quality", "human-feel"},
            task["acceptanceCriteria"],
        )

        second = ensure_root_production_task(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=ws,
        )
        assert_true(second["action"] == "noop", second)
        assert_true(len(repo.list(ws_id)) == 1, repo.list(ws_id))
        original_hash = task["sourceSpecHash"]
        write_manifest(ws, manifest("Changed after bootstrap"))
        third = ensure_root_production_task(
            repository=repo,
            workspace_id=ws_id,
            workspace_dir=ws,
        )
        assert_true(third["action"] == "noop", third)
        assert_true(repo.read(ws_id, ROOT_TASK_ID)["sourceSpecHash"] == original_hash, "bootstrap must never overwrite an existing task")

        sync_id = "bootstrap-through-department"
        sync_ws = temp / sync_id
        write_manifest(sync_ws, manifest("Department Bootstrap"))
        registry = {
            "departments": [
                {"id": "world", "title": "World", "dependsOn": []},
            ]
        }
        state = {
            "departments": {
                "world": {
                    "status": "confirmed",
                    "version": 1,
                    "confirmedAt": "2026-09-01T00:00:00Z",
                    "qaScore": 85,
                    "prepNotes": "Confirmed world production bundle.",
                    "artifacts": [],
                    "lastPatches": [],
                }
            }
        }
        result = sync_confirmed_departments(
            repository=repo,
            workspace_id=sync_id,
            workspace_dir=sync_ws,
            registry=registry,
            state=state,
            triggering_department_id="world",
            reports_root=sync_ws / "reports",
        )
        assert_true(result["action"] == "handoff_appended", result)
        assert_true(result["taskBootstrap"]["action"] == "root_task_created", result)
        synced = repo.read(sync_id, ROOT_TASK_ID)
        assert_true(synced["status"] == "implemented", synced)
        assert_true([round_item["role"] for round_item in synced["handoffRounds"]] == ["architect", "programmer"], synced)
        assert_true(synced["handoffRounds"][1]["evidenceRefs"][0]["kind"] == "implementation", synced)

        legacy_id = "bootstrap-legacy-no-manifest"
        (temp / legacy_id).mkdir(parents=True, exist_ok=True)
        legacy = sync_confirmed_departments(
            repository=repo,
            workspace_id=legacy_id,
            workspace_dir=temp / legacy_id,
            registry=registry,
            state=state,
            triggering_department_id="world",
            reports_root=temp / legacy_id / "reports",
        )
        assert_true(legacy["action"] == "noop", legacy)
        assert_true(legacy["taskBootstrap"]["status"] == "blocked", legacy)
        assert_true("workspace_manifest_missing" in legacy["taskBootstrap"]["reason"], legacy)

        print(json.dumps({
            "schemaVersion": "loreweaver.task-bootstrap-check.v1",
            "status": "passed",
            "checks": [
                "root_task_is_derived_from_workspace_manifest",
                "architect_plan_handoff_is_created_deterministically",
                "bootstrap_is_idempotent_and_never_overwrites_existing_task",
                "department_sync_bootstraps_task_before_programmer_bundle",
                "legacy_workspace_without_manifest_remains_compatible_noop",
            ],
        }, ensure_ascii=False, indent=2))
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
