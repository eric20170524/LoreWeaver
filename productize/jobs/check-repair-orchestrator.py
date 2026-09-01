#!/usr/bin/env python3

from __future__ import annotations

import asyncio
import copy
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from backend.agents import WorldBuilderAgent  # noqa: E402
from backend.repair_orchestrator import propose_repair_patch, run_repair_loop  # noqa: E402


def sample_gdd():
    return {
        "title": "Repair Fixture",
        "themeColor": "#ffffff",
        "economy": {"currencyName": "Token", "resources": [], "realms": []},
        "nodes": [
            {
                "id": 1,
                "title": "Node",
                "mechanics": "survivor_horde",
                "goalValue": 10,
                "durationLimit": 30,
                "gameplay": {
                    "cardId": "survivor_horde",
                    "adapter": "phaser",
                    "modifiers": [],
                    "knobs": {"durationSec": 30}
                }
            }
        ]
    }


async def main():
    original_adjust = WorldBuilderAgent.adjust_gdd
    calls = {"n": 0}

    async def fake_adjust(current_gdd, feedback, agent_role="world_builder"):
        calls["n"] += 1
        assert "Validation repair request" in feedback
        assert agent_role == "narrative"  # gameplay maps to current legacy role
        candidate = copy.deepcopy(current_gdd)
        candidate["nodes"][0]["gameplay"]["knobs"]["durationSec"] += 5
        # An unrelated title rewrite must be filtered out by gameplay ownership.
        candidate["title"] = "Should Not Apply"
        return candidate

    WorldBuilderAgent.adjust_gdd = staticmethod(fake_adjust)
    try:
        one = await propose_repair_patch(
            sample_gdd(),
            "gameplay:goal impossible",
            patch_level="L1",
            attempt=0,
        )
        assert one["status"] == "patch_proposed", one
        assert one["decision"]["owner"] == "gameplay"
        assert one["gdd"]["title"] == "Repair Fixture"
        assert one["gdd"]["nodes"][0]["gameplay"]["knobs"]["durationSec"] == 35
        assert all(p["level"] in ("L0", "L1") for p in one["appliedPatches"])

        validation_calls = {"n": 0}

        async def validator_runner(validators, working_gdd):
            validation_calls["n"] += 1
            assert validators
            if validation_calls["n"] == 1:
                return {"blockers": ["gameplay:goal impossible"]}
            return {"blockers": []}

        loop = await run_repair_loop(
            sample_gdd(),
            ["gameplay:goal impossible"],
            patch_level="L1",
            validator_runner=validator_runner,
        )
        assert loop["status"] == "passed", loop
        assert len(loop["history"]) == 2, loop["history"]
        assert loop["gdd"]["nodes"][0]["gameplay"]["knobs"]["durationSec"] == 40

        escalated = await propose_repair_patch(
            sample_gdd(),
            "code:adapter needs rewrite",
            patch_level="L3",
            attempt=0,
        )
        assert escalated["status"] == "escalated"
        assert escalated["decision"]["auto_repair_allowed"] is False

        print("PASSED repair orchestrator checks")
    finally:
        WorldBuilderAgent.adjust_gdd = original_adjust


if __name__ == "__main__":
    asyncio.run(main())
