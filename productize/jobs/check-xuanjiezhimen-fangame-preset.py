#!/usr/bin/env python3
"""Static contract check for the Xuanjiezhimen / Shi Mu fangame seed."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.department_agents import build_controlled_patches  # noqa: E402
from backend.theme_presets import get_procedural_preset  # noqa: E402

PRESET_PATH = ROOT / "data" / "presets" / "xuanjiezhimen_fangame_preset.json"
# data/workspaces/ is gitignored. The local manifest also has no nodes, so CI
# compares the preset to this committed contract fixture instead.
CONTRACT_PATH = ROOT / "productize" / "fixtures" / "xuanjie-shimu-contract.json"
MELEE_TARGETS = {"weapon_stance_cycle.meleeDamage", "weapon_stance_cycle.meleeRadius"}
RHYTHM_CARDS = {
    2: "dodge_counter_boss",
    4: "side_scrolling_brawler",
    5: "shooter_duel",
    7: "rhythm_timing",
    10: "dodge_counter_boss",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def slice_signature(doc: dict) -> dict:
    signature = {}
    for node in doc.get("nodes", []):
        gameplay = node.get("gameplay") or {}
        signature[node["id"]] = {
            "card": gameplay.get("cardId"),
            "modifiers": [item.get("id") for item in gameplay.get("modifiers") or []],
            "rewards": list((node.get("planning") or {}).get("rewardUnlocks") or []),
        }
    return signature


def melee_effects(doc: dict) -> list:
    ability = next(item for item in doc.get("abilityCatalog", []) if item.get("id") == "black_blade_flame")
    return [
        effect for effect in ability.get("effects") or []
        if effect.get("target") in MELEE_TARGETS
    ]


def main() -> None:
    preset = json.loads(PRESET_PATH.read_text(encoding="utf-8"))
    require(CONTRACT_PATH.is_file(), "contract fixture missing")
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    require(preset.get("title") == "玄界之门·石牧武途（同人原型）", "unexpected title")
    require(len(preset.get("nodes", [])) == 12, "fangame route must keep the 12-node shell")
    require(preset.get("uiConfig", {}).get("focusNodeIds") == list(range(1, 13)), "playable route must focus nodes 1-12")

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
    require(node3_stance.get("knobs", {}).get("meleeRadius") == 140, "node 3 blade sweep must cover the corpse ring")
    require(node3_stance.get("knobs", {}).get("meleeDamage") == 8, "node 3 blade must drop a living corpse in one hit")
    node3_knobs = node3["gameplay"].get("knobs", {})
    require(node3_knobs.get("weapon", {}).get("fireIntervalMs") == 800, "node 3 attacks must fire on the 800ms clock")
    require(node3_knobs.get("weapon", {}).get("bulletDamage") == 3, "node 3 bow shot damage")
    require(node3_knobs.get("player", {}).get("hp") == 120, "node 3 player hp")
    node3_hazard = next(item for item in node3["gameplay"]["modifiers"] if item.get("id") == "hazard_telegraph")
    require(node3_hazard.get("knobs", {}).get("warningMs") == 900, "node 3 hazard warning")
    require(node3_hazard.get("knobs", {}).get("activeMs") == 260, "node 3 hazard strike")
    require(node3_hazard.get("knobs", {}).get("intervalMs") == 2800, "node 3 hazard interval")

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

    require(contract.get("title") == preset.get("title"), "contract fixture title drifted from the preset seed")
    preset_slice = slice_signature(preset)
    contract_slice = slice_signature(contract)
    require(preset_slice == contract_slice, "nodes 1-12 card ids, modifier ids, or rewards diverged")
    require(set(preset_slice) == set(range(1, 13)), "campaign must contain nodes 1-12")
    require(preset_slice[3]["rewards"] == ["black_blade_flame"], "node 3 reward must be black_blade_flame")
    require(preset_slice[6]["rewards"] == ["swallow_moon"], "node 6 reward must be swallow_moon")
    require(preset_slice[10]["rewards"] == ["white_ape_overdrive"], "node 10 reward must be white_ape_overdrive")
    for label, doc in (("preset", preset), ("contract", contract)):
        for node in doc["nodes"]:
            stance = next((item for item in node["gameplay"].get("modifiers") or [] if item.get("id") == "weapon_stance_cycle"), None)
            if stance:
                require(stance.get("knobs", {}).get("controlMode") == "manual", f"{label} node {node['id']} stance must be manual")
        effects = melee_effects(doc)
        require(effects, f"{label} black_blade_flame needs a numeric melee effect")
        for effect in effects:
            require(effect.get("op") in {"add", "multiply", "set"}, f"{label} melee effect op")
            require(isinstance(effect.get("value"), (int, float)) and not isinstance(effect.get("value"), bool), f"{label} melee effect value")
        for ability_id, target in (
            ("swallow_moon", "weapon_stance_cycle.rangedDamageMultiplier"),
            ("white_ape_overdrive", "overdrive_transformation.damageMultiplier"),
        ):
            ability = next(item for item in doc["abilityCatalog"] if item.get("id") == ability_id)
            require(any(effect.get("target") == target for effect in ability.get("effects") or []), f"{label} {ability_id} missing {target}")
        for node_id in (11, 12):
            node = next(item for item in doc["nodes"] if item["id"] == node_id)
            gate = next(item for item in node["gameplay"]["modifiers"] if item.get("id") == "overdrive_transformation")
            require(gate.get("knobs", {}).get("requiresAbility") == "white_ape_overdrive", f"{label} node {node_id} overdrive gate")
    require(melee_effects(preset) == melee_effects(contract), "black_blade_flame melee effects diverged")

    for label, doc in (("preset", preset), ("contract", contract)):
        for node in doc["nodes"]:
            expected = RHYTHM_CARDS.get(node["id"])
            if expected is None:
                continue
            gameplay = node.get("gameplay") or {}
            require(gameplay.get("cardId") == expected, f"{label} node {node['id']} rhythm card drifted")
            require(
                (gameplay.get("knobs") or {}).get("allowExperimentalCard") is True,
                f"{label} node {node['id']} must opt into its non-production card",
            )

    for node_id, expected in RHYTHM_CARDS.items():
        index = next(i for i, node in enumerate(preset["nodes"]) if node["id"] == node_id)
        patches = build_controlled_patches(
            "gameplay",
            preset,
            job="binding",
            node_indexes={index},
        )
        rewrites = [item for item in patches if str(item.get("path", "")).endswith(".cardId")]
        require(not rewrites, f"gameplay binding rewrote node {node_id}: {rewrites}")
        require(preset["nodes"][index]["gameplay"]["cardId"] == expected, f"node {node_id} card changed during patch build")

    stripped = json.loads(json.dumps(preset))
    bare = next(node for node in stripped["nodes"] if node["id"] == 2)
    del bare["gameplay"]["knobs"]["allowExperimentalCard"]
    bare_index = next(i for i, node in enumerate(stripped["nodes"]) if node["id"] == 2)
    bare_patches = build_controlled_patches(
        "gameplay",
        stripped,
        job="binding",
        node_indexes={bare_index},
    )
    require(
        any(item.get("value") == "survivor_horde" and str(item.get("path", "")).endswith(".cardId") for item in bare_patches),
        "without allowExperimentalCard, node 2 must be rerouted to survivor_horde",
    )

    print("PASS xuanjiezhimen fangame preset contract")


if __name__ == "__main__":
    main()
