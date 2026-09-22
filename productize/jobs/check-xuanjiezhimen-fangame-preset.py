#!/usr/bin/env python3
"""Static contract check for the Xuanjiezhimen / Shi Mu fangame seed."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.theme_presets import get_procedural_preset  # noqa: E402

PRESET_PATH = ROOT / "data" / "presets" / "xuanjiezhimen_fangame_preset.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    preset = json.loads(PRESET_PATH.read_text(encoding="utf-8"))

    require(preset.get("title") == "玄界之门·石牧武途（同人原型）", "unexpected title")
    require(len(preset.get("nodes", [])) == 12, "fangame route must keep the 12-node shell")
    require(preset.get("uiConfig", {}).get("focusNodeIds") == [1, 2, 3], "golden slice must focus nodes 1-3")

    progression_ids = {item.get("id") for item in preset.get("progressionSystems", [])}
    require(
        {"realm_breakthrough", "martial_mastery", "weapon_forging", "bloodline_awakening", "moon_insight"}
        <= progression_ids,
        "missing Shi Mu progression systems",
    )

    ability_ids = {item.get("id") for item in preset.get("abilityCatalog", [])}
    require(
        {"fengchi_blade", "purple_steel_bow", "black_blade_flame", "swallow_moon", "white_ape_overdrive"}
        <= ability_ids,
        "missing Shi Mu ability catalog entries",
    )

    node1 = next(node for node in preset["nodes"] if node["id"] == 1)
    require(node1.get("gameplay", {}).get("cardId") == "survivor_horde", "node 1 must use survivor_horde")
    node1_modifiers = {item.get("id") for item in node1["gameplay"].get("modifiers", [])}
    require("weapon_stance_cycle" in node1_modifiers, "node 1 must exercise weapon stance cycle")
    require("overdrive_transformation" in node1_modifiers, "node 1 must mount generic overdrive")
    require("horde_intensity" in node1_modifiers, "node 1 must exercise horde pressure")
    node1_stance = next(item for item in node1["gameplay"]["modifiers"] if item.get("id") == "weapon_stance_cycle")
    require(node1_stance.get("knobs", {}).get("controlMode") == "manual", "node 1 stance must be player-controlled")

    node2 = next(node for node in preset["nodes"] if node["id"] == 2)
    require(node2.get("gameplay", {}).get("cardId") == "dodge_counter_boss", "node 2 must be the boss rhythm break")

    node3 = next(node for node in preset["nodes"] if node["id"] == 3)
    require(node3.get("gameplay", {}).get("cardId") == "survivor_horde", "node 3 must return to survivor_horde")
    node3_modifiers = {item.get("id") for item in node3["gameplay"].get("modifiers", [])}
    require({"weapon_stance_cycle", "hazard_telegraph", "boss_phases"} <= node3_modifiers, "node 3 must combine horde and bullet-space pressure")
    node3_stance = next(item for item in node3["gameplay"]["modifiers"] if item.get("id") == "weapon_stance_cycle")
    require(node3_stance.get("knobs", {}).get("controlMode") == "manual", "node 3 stance must be player-controlled")

    passives = {item.get("id"): item for item in preset.get("passiveSkillCatalog", [])}
    require(passives["blade_speed_1"].get("runtimeStatus") == "implemented", "疾风刀势 must be purchasable")
    require(passives["bow_burst_1"].get("runtimeStatus") == "implemented", "连珠箭 must be purchasable")
    require(passives["bloodline_toughness"].get("runtimeStatus") == "implemented", "异血强身 must be purchasable")
    require(passives["moon_insight_1"].get("runtimeStatus") == "implemented", "吞月参悟 must be purchasable")
    require(passives["white_ape_overdrive_passive"].get("runtimeStatus") == "implemented", "白猿变身 must arm generic overdrive")
    overdrive = next(item for item in node1["gameplay"]["modifiers"] if item.get("id") == "overdrive_transformation")
    require(overdrive.get("knobs", {}).get("requiresPassive") == "white_ape_overdrive_passive", "overdrive must stay generic and arm from a passive id")
    require(
        any(effect.get("target") == "weapon_stance_cycle.meleeDamage" for effect in passives["blade_speed_1"].get("effects", [])),
        "疾风刀势 must target melee damage",
    )

    for alias in ("玄界之门", "玄界", "石牧", "xuanjie", "xuanjiezhimen"):
        loaded = get_procedural_preset(alias)
        require(loaded.get("title") == preset.get("title"), f"preset alias failed: {alias}")

    print("PASS xuanjiezhimen fangame preset contract")


if __name__ == "__main__":
    main()
