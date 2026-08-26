#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from backend.agents import _apply_recipe_shape  # noqa: E402
from backend.design_recipe import recipe_prompt_contract, resolve_design_recipe  # noqa: E402


def main():
    legacy = resolve_design_recipe("cultivation_journey_12")
    assert legacy["nodeCountMin"] == 12
    assert legacy["nodeCountMax"] == 12
    assert "exactly 12 nodes" in recipe_prompt_contract(legacy)

    vertical = resolve_design_recipe("vertical_slice_3")
    assert vertical["nodeCountMin"] == 3
    assert vertical["genreConstraint"] is None
    prompt = recipe_prompt_contract(vertical)
    assert "exactly 3 nodes" in prompt
    assert "No genre constraint" in prompt

    adaptive = resolve_design_recipe("unknown_recipe")
    assert adaptive["id"] == "adaptive_linear"
    assert adaptive["nodeCountMin"] == 3
    assert adaptive["nodeCountMax"] == 8

    sample = {
        "title": "Fixture",
        "nodes": [{"id": i + 1, "title": f"N{i + 1}"} for i in range(12)]
    }
    shaped = _apply_recipe_shape(sample, vertical)
    assert len(shaped["nodes"]) == 3
    assert shaped["designRecipe"]["id"] == "vertical_slice_3"
    assert len(sample["nodes"]) == 12, "shape helper must not mutate caller data"

    legacy_shaped = _apply_recipe_shape(sample, legacy)
    assert len(legacy_shaped["nodes"]) == 12
    assert legacy_shaped["designRecipe"]["id"] == "cultivation_journey_12"

    print("PASSED design recipe checks")


if __name__ == "__main__":
    main()
