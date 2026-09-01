#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import copy
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from backend.agents import WorldBuilderAgent  # noqa: E402
from backend.golden_slice_gate import evaluate_golden_slice_gate  # noqa: E402
from backend.repair_orchestrator import run_repair_loop  # noqa: E402
from backend.repair_policy import targeted_validators_for  # noqa: E402

GRAPH = REPO / "productize/fixtures/recipes/survivor_vertical_slice_3.recipe-graph.json"


def load_gdd() -> dict:
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    return {"title": "Golden Survivor Repair Fixture", "nodes": [copy.deepcopy(n["payload"]) for n in graph["nodes"]]}


async def main() -> int:
    broken = load_gdd()
    broken["nodes"][2]["gameplay"]["modifiers"] = [
        m for m in broken["nodes"][2]["gameplay"]["modifiers"] if m.get("id") != "boss_phases"
    ]

    first = evaluate_golden_slice_gate(broken)
    assert first["allowed"] is False
    blocker = next(b for b in first["blockers"] if "missing_modifiers=boss_phases" in b)
    assert targeted_validators_for(blocker) == ["golden_slice_gate"]

    original_adjust = WorldBuilderAgent.adjust_gdd

    async def deterministic_gameplay_repair(current_gdd: dict, feedback: str, agent_role: str = "narrative") -> dict:
        # Deterministic CI stand-in for the existing gameplay-role LLM. The actual
        # Repair Orchestrator, owner allowlist, L2 filtering, patch application,
        # retry accounting, and shipped gate validator remain real production code.
        candidate = copy.deepcopy(current_gdd)
        mods = candidate["nodes"][2]["gameplay"].setdefault("modifiers", [])
        if not any((m.get("id") if isinstance(m, dict) else m) == "boss_phases" for m in mods):
            mods.append({"id": "boss_phases", "knobs": {"phaseThresholds": [0.66, 0.33]}})
        return candidate

    async def real_validator_runner(validators: list[str], gdd: dict) -> dict:
        assert validators == ["golden_slice_gate"], validators
        gate = evaluate_golden_slice_gate(gdd)
        return {"blockers": gate["blockers"], "gate": gate}

    WorldBuilderAgent.adjust_gdd = staticmethod(deterministic_gameplay_repair)
    try:
        result = await run_repair_loop(
            broken,
            [blocker],
            patch_level="L2",
            validator_runner=real_validator_runner,
        )
    finally:
        WorldBuilderAgent.adjust_gdd = original_adjust

    assert result["status"] == "passed", result
    final_gate = evaluate_golden_slice_gate(result["gdd"])
    assert final_gate["allowed"] is True, final_gate
    history = result["history"]
    assert len(history) == 1, history
    assert history[0]["decision"]["owner"] == "gameplay"
    assert history[0]["decision"]["targeted_validators"] == ["golden_slice_gate"]
    assert history[0]["appliedPatches"], history
    assert any(p.get("path") == "nodes[2].gameplay.modifiers" for p in history[0]["appliedPatches"])

    print("PASSED real golden gate fail -> repair -> revalidate -> pass")
    print(json.dumps({
        "initialBlocker": blocker,
        "repairHistory": history,
        "finalGate": final_gate,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
