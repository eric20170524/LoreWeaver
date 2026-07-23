"""
Gameplay Card catalog loader for orchestrators / department agents.

Policy:
  - Auto-select only cards with status=production_ready and exportPolicy.productionReady=true.
  - Experimental cards require explicit allow_experimental=True.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

# backend/ -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[1]
_CARDS_DIR = _REPO_ROOT / "minigame_master" / "gameplay" / "cards"

# Legacy mechanics strings → card ids (may resolve to experimental cards)
MECHANICS_TO_CARD = {
    "tap_reaction": "rhythm_timing",
    "collect_dodge": "drag_collect_grid",
    "memory_sequence": "sequence_synthesis",
    "survivor_horde": "survivor_horde",
    "rhythm_timing": "rhythm_timing",
    "drag_collect_grid": "drag_collect_grid",
    "turn_based_skill_battle": "turn_based_skill_battle",
    "sequence_synthesis": "sequence_synthesis",
    "side_scrolling_brawler": "side_scrolling_brawler",
    "energy_balance": "energy_balance",
    "pressure_survival": "pressure_survival",
}


@lru_cache(maxsize=1)
def load_all_cards() -> List[Dict[str, Any]]:
    if not _CARDS_DIR.is_dir():
        return []
    out: List[Dict[str, Any]] = []
    for p in sorted(_CARDS_DIR.glob("*.json")):
        try:
            card = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(card, dict) or not card.get("id"):
            continue
        out.append(card)
    return out


def is_production_ready(card: Dict[str, Any]) -> bool:
    export = card.get("exportPolicy") if isinstance(card.get("exportPolicy"), dict) else {}
    return card.get("status") == "production_ready" and export.get("productionReady") is True


def list_production_cards() -> List[Dict[str, Any]]:
    return [c for c in load_all_cards() if is_production_ready(c)]


def list_experimental_cards() -> List[Dict[str, Any]]:
    return [c for c in load_all_cards() if not is_production_ready(c)]


def get_card(card_id: str) -> Optional[Dict[str, Any]]:
    for c in load_all_cards():
        if c.get("id") == card_id:
            return c
    return None


def default_production_card_id() -> str:
    """Prefer certified survivor_horde; else first production card; else survivor_horde string."""
    prod = list_production_cards()
    for c in prod:
        if c.get("id") == "survivor_horde":
            return "survivor_horde"
    if prod:
        return str(prod[0]["id"])
    return "survivor_horde"


def resolve_card_id(
    mechanics: Optional[str] = None,
    preferred: Optional[str] = None,
    *,
    allow_experimental: bool = False,
) -> Dict[str, Any]:
    """
    Resolve a card id for auto-assignment.

    Returns dict: { cardId, experimental, reason, productionReady }
    """
    # Explicit preferred production card
    if preferred:
        card = get_card(str(preferred))
        if card and is_production_ready(card):
            return {
                "cardId": card["id"],
                "experimental": False,
                "productionReady": True,
                "reason": f"preferred production card {card['id']}",
            }
        if card and allow_experimental:
            return {
                "cardId": card["id"],
                "experimental": True,
                "productionReady": False,
                "reason": f"explicit experimental card {card['id']}",
            }

    mapped = None
    if mechanics:
        mapped = MECHANICS_TO_CARD.get(str(mechanics))
        if mapped is None and get_card(str(mechanics)):
            mapped = str(mechanics)

    if mapped:
        card = get_card(mapped)
        if card and is_production_ready(card):
            return {
                "cardId": card["id"],
                "experimental": False,
                "productionReady": True,
                "reason": f"mechanics={mechanics} → production {card['id']}",
            }
        if card and allow_experimental:
            return {
                "cardId": card["id"],
                "experimental": True,
                "productionReady": False,
                "reason": f"mechanics={mechanics} → experimental {card['id']} (explicit)",
            }
        # Fall through to production default when mapped card is experimental and not allowed
        fallback = default_production_card_id()
        return {
            "cardId": fallback,
            "experimental": False,
            "productionReady": is_production_ready(get_card(fallback) or {}),
            "reason": (
                f"mechanics={mechanics} mapped to non-production {mapped}; "
                f"auto-select production default {fallback}"
            ),
        }

    fallback = default_production_card_id()
    return {
        "cardId": fallback,
        "experimental": False,
        "productionReady": is_production_ready(get_card(fallback) or {}),
        "reason": f"default production card {fallback}",
    }


def catalog_summary() -> Dict[str, Any]:
    prod = list_production_cards()
    exp = list_experimental_cards()
    return {
        "policy": {
            "autoSelectOnlyProductionReady": True,
            "experimentalRequiresExplicitFlag": True,
        },
        "totals": {
            "all": len(prod) + len(exp),
            "productionReady": len(prod),
            "experimental": len(exp),
        },
        "autoSelectable": [
            {"id": c.get("id"), "title": c.get("title"), "status": c.get("status")} for c in prod
        ],
        "experimentalIds": [c.get("id") for c in exp],
        "cardsDir": str(_CARDS_DIR),
    }


def clear_cache() -> None:
    load_all_cards.cache_clear()
