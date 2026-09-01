#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.creator_revision import evaluate_creator_revision, select_creator_agent_role  # noqa: E402


def assert_true(value, message):
    if not value:
        raise AssertionError(message)


def fixture():
    return {
        "title": "Garden Guard",
        "themeColor": "#8b5cf6",
        "designRecipe": {"id": "vertical_slice_3", "sessionTargetMinutes": 6},
        "economy": {"currencyName": "Starlight", "resources": ["Seed", "Dew"], "realms": ["Bud", "Bloom"]},
        "nodes": [
            {
                "id": 1,
                "title": "Setup",
                "intro": "Start",
                "goalValue": 10,
                "difficulty": 1,
                "durationLimit": 60,
                "gameplay": {"adapter": "phaser", "cardId": "survivor_horde", "modifiers": [], "knobs": {"enemyRate": 1.0}},
            },
            {
                "id": 2,
                "title": "Pressure",
                "intro": "Escalate",
                "goalValue": 20,
                "difficulty": 2,
                "durationLimit": 90,
                "gameplay": {"adapter": "phaser", "cardId": "survivor_horde", "modifiers": ["defend_core"], "knobs": {"enemyRate": 1.2}},
            },
            {
                "id": 3,
                "title": "Boss",
                "intro": "Climax",
                "goalValue": 30,
                "difficulty": 3,
                "durationLimit": 120,
                "gameplay": {"adapter": "phaser", "cardId": "survivor_horde", "modifiers": ["boss_phases"], "knobs": {"enemyRate": 1.4}},
            },
        ],
    }


def main():
    before = fixture()

    numeric = copy.deepcopy(before)
    numeric["nodes"][1]["difficulty"] = 3
    numeric["nodes"][1]["gameplay"]["knobs"]["enemyRate"] = 1.35
    result = evaluate_creator_revision(before, numeric, "第二段再难一点，但不要改玩法结构")
    assert_true(result.allowed, result.blockers)
    assert_true(result.patch_level == "L1", "numeric change should be L1")
    assert_true(result.validators == ["node_smoke"], "simple revisions target node smoke")
    assert_true(any(item["path"].endswith("difficulty") for item in result.diff), "diff should expose difficulty")

    modifier = copy.deepcopy(before)
    modifier["nodes"][1]["gameplay"]["modifiers"].append("hazard_telegraph")
    result = evaluate_creator_revision(before, modifier, "第二段增加危险预警")
    assert_true(result.allowed, result.blockers)
    assert_true(result.patch_level == "L2", "modifier composition is L2")

    topology = copy.deepcopy(before)
    topology["nodes"].append(copy.deepcopy(topology["nodes"][-1]))
    topology["nodes"][-1]["id"] = 4
    result = evaluate_creator_revision(before, topology, "再加一关")
    assert_true(not result.allowed, "simple mode must block topology changes")
    assert_true("node_topology_change_requires_expert_mode" in result.blockers, result.blockers)

    adapter = copy.deepcopy(before)
    adapter["nodes"][0]["gameplay"]["adapter"] = "custom_runtime"
    result = evaluate_creator_revision(before, adapter, "换一个新的运行时适配器")
    assert_true(not result.allowed, "adapter change must be blocked")
    assert_true("runtime_or_adapter_change_requires_expert_mode" in result.blockers, result.blockers)

    runtime = copy.deepcopy(before)
    runtime["runtimeFeaturePack"] = {"runtimeVersion": "evil"}
    result = evaluate_creator_revision(before, runtime, "升级底层 runtime")
    assert_true(not result.allowed, "runtime feature pack must be blocked")

    world = copy.deepcopy(before)
    world["themeColor"] = "#a855f7"
    world["economy"]["currencyName"] = "Moonlight"
    result = evaluate_creator_revision(before, world, "主题配色更梦幻，货币改成月光")
    assert_true(result.allowed, result.blockers)
    assert_true(result.agent_role == "world_builder", "world/theme change should route to world builder")
    assert_true(select_creator_agent_role("Boss 难度降低一点") == "narrative", "gameplay pacing should route to narrative")

    unchanged = evaluate_creator_revision(before, copy.deepcopy(before), "什么都不变")
    assert_true(not unchanged.allowed and "no_effective_change" in unchanged.blockers, unchanged.blockers)

    print(json.dumps({
        "schemaVersion": "loreweaver.creator-revision-policy-check.v1",
        "status": "passed",
        "checks": [
            "l1_numeric_allowed",
            "l2_modifier_allowed",
            "topology_blocked",
            "adapter_blocked",
            "runtime_fields_blocked",
            "world_routing",
            "no_change_blocked",
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
