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


def authoring_bytes(workspace: Path):
    return {
        path.relative_to(workspace): path.read_bytes()
        for path in workspace.rglob("*.json")
        if "reports" not in path.parts
    }


async def main():
    with tempfile.TemporaryDirectory(prefix="lw-creator-revision-tx-") as temp:
        temp_root = Path(temp)
        runner.WORKSPACES_ROOT = temp_root / "workspaces"
        runner.SHARED_REPORTS = temp_root / "shared-reports"
        runner.CARDS_ROOT = temp_root / "cards"
        workspace_id = "tx-fixture"
        workspace = runner.WORKSPACES_ROOT / workspace_id
        write_json(workspace / "manifest.json", fixture())
        write_json(runner.CARDS_ROOT / "survivor_horde.json", {
            "schemaVersion": "2.0",
            "id": "survivor_horde",
            "runtime": {
                "engineTargets": ["phaser"],
                "adapter": "SurvivorHordeAdapter",
                "template": "survivor_horde",
            },
        })
        write_json(runner.CARDS_ROOT / "modifiers" / "defend_core.json", {
            "schemaVersion": "2.0",
            "id": "defend_core",
            "compatibleBaseCards": ["survivor_horde"],
        })

        runner.invalidate_release_evidence = lambda workspace_id, cards, new_spec_hash: {
            "ok": True,
            "exitCode": 0,
            "payload": {"status": "passed"},
            "stderr": "",
        }
        runner.sync_latest_job = lambda workspace_id, spec: True

        # L1: validation pass commits.
        async def proposal_l1_pass(current, message, role):
            result = copy.deepcopy(current)
            result["nodes"][0]["difficulty"] = 2
            return result

        runner.WorldBuilderAgent.adjust_gdd = proposal_l1_pass
        runner.run_node_smoke = lambda ws_id: (smoke_report(True), 0, "", "")

        applied = await runner.run(workspace_id, "第一段难一点")
        assert applied["status"] == "applied", applied
        assert applied["patchLevel"] == "L1", applied
        assert [item["validator"] for item in applied["validations"]] == ["node_smoke"], applied
        assert applied["validation"]["status"] == "passed", applied
        assert applied["releaseEvidenceInvalidated"] is True, applied
        after_commit = runner.assembled_manifest(workspace)
        assert after_commit["nodes"][0]["difficulty"] == 2, after_commit
        assert (workspace / "reports" / "creator_revision_latest.json").is_file()
        assert (workspace / "reports" / "creator_revision_node_smoke_latest.json").is_file()

        # L2: valid catalog composition must pass preflight, then node smoke, then commit.
        async def proposal_l2_pass(current, message, role):
            result = copy.deepcopy(current)
            result["nodes"][0]["gameplay"]["modifiers"] = ["defend_core"]
            return result

        runner.WorldBuilderAgent.adjust_gdd = proposal_l2_pass
        runner.run_node_smoke = lambda ws_id: (smoke_report(True), 0, "", "")
        applied_l2 = await runner.run(workspace_id, "给第一段加上守护核心机制")
        assert applied_l2["status"] == "applied", applied_l2
        assert applied_l2["patchLevel"] == "L2", applied_l2
        assert [item["validator"] for item in applied_l2["validations"]] == [
            "gameplay_composition",
            "node_smoke",
        ], applied_l2
        assert runner.assembled_manifest(workspace)["nodes"][0]["gameplay"]["modifiers"] == ["defend_core"]

        # L2: invalid catalog reference must block before any workspace write or node smoke.
        before_invalid_l2 = authoring_bytes(workspace)

        async def proposal_l2_invalid(current, message, role):
            result = copy.deepcopy(current)
            result["nodes"][0]["gameplay"]["modifiers"] = ["defend_core", "missing_modifier"]
            return result

        def node_smoke_must_not_run(_ws_id):
            raise AssertionError("node smoke must not run when gameplay composition preflight fails")

        runner.WorldBuilderAgent.adjust_gdd = proposal_l2_invalid
        runner.run_node_smoke = node_smoke_must_not_run
        invalid_l2 = await runner.run(workspace_id, "再挂一个不存在的 modifier")
        assert invalid_l2["status"] == "blocked", invalid_l2
        assert invalid_l2["reason"] == "targeted_validation_failed", invalid_l2
        assert invalid_l2["validation"]["validator"] == "gameplay_composition", invalid_l2
        assert invalid_l2["validation"]["status"] == "failed", invalid_l2
        assert any(
            issue["code"] == "modifier_not_found"
            for issue in invalid_l2["validation"]["report"]["issues"]
        ), invalid_l2
        assert before_invalid_l2 == authoring_bytes(workspace), "invalid L2 preflight changed authoring files"

        # Runtime validation failure after staging must restore exact authoring bytes.
        before_failure_bytes = authoring_bytes(workspace)

        async def proposal_smoke_fail(current, message, role):
            result = copy.deepcopy(current)
            result["nodes"][0]["difficulty"] = 5
            return result

        runner.WorldBuilderAgent.adjust_gdd = proposal_smoke_fail
        runner.run_node_smoke = lambda ws_id: (smoke_report(False), 1, "", "synthetic validator failure")

        rolled_back = await runner.run(workspace_id, "第一段难度拉满")
        assert rolled_back["status"] == "rolled_back", rolled_back
        assert rolled_back["reason"] == "targeted_validation_failed", rolled_back
        after_rollback = runner.assembled_manifest(workspace)
        assert after_rollback["nodes"][0]["difficulty"] == 2, after_rollback
        assert after_rollback["nodes"][0]["gameplay"]["modifiers"] == ["defend_core"], after_rollback
        assert before_failure_bytes == authoring_bytes(workspace), "authoring files changed despite rollback"

        print(json.dumps({
            "schemaVersion": "loreweaver.creator-revision-transaction-check.v2",
            "status": "passed",
            "checks": [
                "l1_validated_revision_commits",
                "l2_valid_composition_then_smoke_commits",
                "l2_invalid_composition_blocks_before_write",
                "l2_preflight_failure_skips_node_smoke",
                "commit_writes_revision_evidence",
                "failed_runtime_validation_rolls_back",
                "rollback_preserves_authoring_bytes",
            ],
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
