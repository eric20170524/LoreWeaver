"""Golden vertical-slice gate for the LoreWeaver survivor_horde reference path.

This is a shipped validator, not a test-only assertion. It evaluates the
resolved authoring GDD used by the Repair Loop and reports owner-prefixed
blockers so validation-driven repair can route failures deterministically.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List


GOLDEN_CARD_ID = "survivor_horde"
GOLDEN_STAGE_COUNT = 3
SUPPORTED_MODIFIERS = {
    "hazard_telegraph",
    "defend_core",
    "escort_npc",
    "boss_phases",
    "poison_fog",
    "laser_warning",
}
REQUIRED_BY_STAGE = {
    0: set(),
    1: {"hazard_telegraph", "defend_core"},
    2: {"boss_phases", "laser_warning"},
}


def _modifier_ids(node: dict) -> List[str]:
    out: List[str] = []
    for item in ((node.get("gameplay") or {}).get("modifiers") or []):
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict) and item.get("id"):
            out.append(str(item["id"]))
    return out


def _duration(node: dict) -> float:
    knobs = ((node.get("gameplay") or {}).get("knobs") or {})
    value = knobs.get("durationSec", node.get("durationLimit", 0))
    return float(value) if isinstance(value, (int, float)) else 0.0


def _difficulty(node: dict) -> float:
    knobs = ((node.get("gameplay") or {}).get("knobs") or {})
    value = knobs.get("difficulty", node.get("difficulty", 0))
    return float(value) if isinstance(value, (int, float)) else 0.0


def evaluate_golden_slice_gate(gdd: dict) -> dict:
    nodes = gdd.get("nodes") if isinstance(gdd, dict) else None
    blockers: List[str] = []
    warnings: List[str] = []

    if not isinstance(nodes, list):
        return {
            "allowed": False,
            "blockers": ["gameplay:golden_slice:nodes_missing"],
            "warnings": [],
            "validator": "golden_slice_gate",
        }

    if len(nodes) != GOLDEN_STAGE_COUNT:
        blockers.append(
            f"gameplay:golden_slice:stage_count={len(nodes)} expected={GOLDEN_STAGE_COUNT}"
        )

    durations: List[float] = []
    difficulties: List[float] = []
    for index, node in enumerate(nodes[:GOLDEN_STAGE_COUNT]):
        if not isinstance(node, dict):
            blockers.append(f"gameplay:golden_slice:stage_{index + 1}_invalid")
            continue
        gameplay = node.get("gameplay") or {}
        card_id = gameplay.get("cardId") or node.get("mechanics")
        if card_id != GOLDEN_CARD_ID:
            blockers.append(
                f"gameplay:golden_slice:stage_{index + 1}_card={card_id or 'missing'} expected={GOLDEN_CARD_ID}"
            )

        mods = set(_modifier_ids(node))
        unsupported = sorted(mods - SUPPORTED_MODIFIERS)
        if unsupported:
            blockers.append(
                f"gameplay:golden_slice:stage_{index + 1}_unsupported_modifiers={','.join(unsupported)}"
            )
        missing = sorted(REQUIRED_BY_STAGE.get(index, set()) - mods)
        if missing:
            blockers.append(
                f"gameplay:golden_slice:stage_{index + 1}_missing_modifiers={','.join(missing)}"
            )

        duration = _duration(node)
        difficulty = _difficulty(node)
        durations.append(duration)
        difficulties.append(difficulty)
        if duration <= 0:
            blockers.append(f"gameplay:golden_slice:stage_{index + 1}_duration_invalid")
        if difficulty <= 0:
            blockers.append(f"gameplay:golden_slice:stage_{index + 1}_difficulty_invalid")
        if not str(node.get("intro") or "").strip():
            blockers.append(f"narrative:golden_slice:stage_{index + 1}_intro_missing")

    if len(durations) == GOLDEN_STAGE_COUNT and any(
        durations[i] > durations[i + 1] for i in range(len(durations) - 1)
    ):
        blockers.append("gameplay:golden_slice:duration_not_non_decreasing")
    if len(difficulties) == GOLDEN_STAGE_COUNT and any(
        difficulties[i] >= difficulties[i + 1] for i in range(len(difficulties) - 1)
    ):
        blockers.append("gameplay:golden_slice:difficulty_not_strictly_increasing")

    if nodes:
        setup_mods = set(_modifier_ids(nodes[0]))
        if setup_mods:
            warnings.append(
                "gameplay:golden_slice:setup_has_optional_modifiers=" + ",".join(sorted(setup_mods))
            )

    return {
        "allowed": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "warnings": list(dict.fromkeys(warnings)),
        "validator": "golden_slice_gate",
        "ownership": {"contract": "gameplay", "prose": "narrative", "verify": "qa"},
        "summary": {
            "nodeCount": len(nodes),
            "durations": durations,
            "difficulties": difficulties,
        },
    }
