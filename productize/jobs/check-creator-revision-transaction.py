#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import copy
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

RUNNER_PATH = ROOT / "productize" / "jobs" / "run-creator-revision.py"
spec = importlib.util.spec_from_file_location("lw_creator_revision_runner", RUNNER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("failed to load creator revision runner")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fixture():
    return {
        "title": "Garden Guard",
        "themeColor": "#8b5cf6",
        "economy": {"currencyName": "Starlight", "resources": [], "realms": ["Seed", "Bloom"]},
        "nodes": [
            {
                "id": 1,
                "title": "Setup",
                "intro": "Start",
                "taunts": [],
                "goalValue": 10,
                "difficulty": 1,
                "durationLimit": 60,
                "gameplay": {
                    "adapter": "phaser",
                    "cardId": "survivor_horde",
                    "modifiers": [],
                    "knobs": {"enemyRate": 1.0},
                },
            }
        ],
    }


def smoke_report(passed: bool):
    return {
        "schemaVersion": "loreweaver.node-smoke.v1",
        "status": "passed" if passed else "failed",
        "summary": {"passed": 1 if passed else 0, "failed": 0 if passed else 1},
    }


async def main():
    with tempfile.TemporaryDirectory(prefix="lw-creator-revision-tx-") as temp:
        temp_root = Path(temp)
        runner.WORKSPACES_ROOT = temp_root / "workspaces"
        runner.SHARED_REPORTS = temp_root / "shared-reports"
        workspace_id = "tx-fixture"
        workspace = runner.WORKSPACES_ROOT / workspace_id
        write_json(workspace / "manifest.json", fixture())

        runner.invalidate_release_evidence = lambda workspace_id, cards, new_spec_hash: {
            "ok": True,
            "exitCode": 0,
            "payload": {"status": "passed"},
            "stderr": "",
        }
        runner.sync_latest_job = lambda workspace_id, spec: True

        async def proposal_pass(current, message, role):
            result = copy.deepcopy(current)
            result["nodes"][0]["difficulty"] = 2
            return result

        runner.WorldBuilderAgent.adjust_gdd = proposal_pass
        runner.run_node_smoke = lambda ws_id: (smoke_report(True), 0, "", "")

        applied = await runner.run(workspace_id, "第一段难一点")
        assert applied["status"] == "applied", applied
        assert applied["patchLevel"] == "L1", applied
        assert applied["validation"]["status"] == "passed", applied
        assert applied["releaseEvidenceInvalidated"] is True, applied
        after_commit = runner.assembled_manifest(workspace)
        assert after_commit["nodes"][0]["difficulty"] == 2, after_commit
        assert (workspace / "reports" / "creator_revision_latest.json").is_file()
        assert (workspace / "reports" / "creator_revision_node_smoke_latest.json").is_file()

        before_failure_bytes = {
            path.relative_to(workspace): path.read_bytes()
            for path in workspace.rglob("*.json")
            if "reports" not in path.parts
        }

        async def proposal_fail(current, message, role):
            result = copy.deepcopy(current)
            result["nodes"][0]["difficulty"] = 5
            return result

        runner.WorldBuilderAgent.adjust_gdd = proposal_fail
        runner.run_node_smoke = lambda ws_id: (smoke_report(False), 1, "", "synthetic validator failure")

        rolled_back = await runner.run(workspace_id, "第一段难度拉满")
        assert rolled_back["status"] == "rolled_back", rolled_back
        assert rolled_back["reason"] == "targeted_validation_failed", rolled_back
        after_rollback = runner.assembled_manifest(workspace)
        assert after_rollback["nodes"][0]["difficulty"] == 2, after_rollback
        after_failure_bytes = {
            path.relative_to(workspace): path.read_bytes()
            for path in workspace.rglob("*.json")
            if "reports" not in path.parts
        }
        assert before_failure_bytes == after_failure_bytes, "authoring files changed despite rollback"

        print(json.dumps({
            "schemaVersion": "loreweaver.creator-revision-transaction-check.v1",
            "status": "passed",
            "checks": [
                "validated_revision_commits",
                "commit_writes_revision_evidence",
                "failed_targeted_validation_rolls_back",
                "rollback_preserves_authoring_bytes",
            ],
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
