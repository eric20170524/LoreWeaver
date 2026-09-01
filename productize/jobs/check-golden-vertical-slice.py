#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from backend.golden_slice_gate import evaluate_golden_slice_gate  # noqa: E402

GOLDEN = REPO / "productize/fixtures/golden/survivor_vertical_slice_3.json"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    golden = read_json(GOLDEN)
    graph_path = REPO / golden["recipeGraphRef"]
    assert graph_path.is_file(), f"recipe graph missing: {graph_path}"
    graph = read_json(graph_path)
    assert graph["schemaVersion"] == "loreweaver.recipe-graph.v1"
    assert graph["metadata"]["baseCardId"] == "survivor_horde"
    assert len(graph["nodes"]) == 3
    assert len(graph["edges"]) == 2
    assert graph["completionRules"]["nodeIds"] == ["stage:climax"]

    gdd = {"nodes": [item["payload"] for item in graph["nodes"]]}
    gate = evaluate_golden_slice_gate(gdd)
    assert gate["allowed"], gate["blockers"]
    assert gate["summary"]["difficulties"] == [1.0, 2.0, 3.0]
    assert gate["summary"]["durations"] == [90.0, 105.0, 120.0]

    variants = golden.get("themeVariants") or []
    assert {v["id"] for v in variants} == {"wasteland", "cyber_pulse"}
    recipes = []
    content_packs = []
    for variant in variants:
        recipe_path = REPO / variant["levelRecipeRef"]
        content_path = REPO / variant["contentPackRef"]
        assert recipe_path.is_file(), f"level recipe missing: {recipe_path}"
        assert content_path.is_file(), f"content pack missing: {content_path}"
        recipe = read_json(recipe_path)
        content = read_json(content_path)
        assert recipe["cardId"] == "survivor_horde"
        assert recipe["productionReady"] is True
        assert recipe["contentPackRef"] == variant["contentPackRef"]
        assert content.get("themeId"), f"themeId missing: {content_path}"
        recipes.append(recipe)
        content_packs.append(content)

    # Theme variants must skin the same runtime asset/audio source, not fork gameplay.
    assert recipes[0]["assetPackRef"] == recipes[1]["assetPackRef"], "theme variants must reuse asset runtime"
    assert recipes[0]["audioPackRef"] == recipes[1]["audioPackRef"], "theme variants must reuse audio runtime"
    assert recipes[0]["recipeId"] != recipes[1]["recipeId"]
    assert content_packs[0]["themeId"] != content_packs[1]["themeId"]

    print("PASSED golden survivor vertical slice gate")
    print(json.dumps({
        "recipeGraph": golden["recipeGraphRef"],
        "stages": [n["id"] for n in graph["nodes"]],
        "themes": [v["id"] for v in variants],
        "gate": gate,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
