#!/usr/bin/env python3
"""Unit checks for backend.gameplay_catalog production-only auto-select policy."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from backend.gameplay_catalog import (  # noqa: E402
    catalog_summary,
    default_production_card_id,
    list_production_cards,
    resolve_card_id,
)

EXPECTED = {
    "survivor_horde",
}
RESIDUAL_PROTOTYPES = {
    "turn_based_skill_battle",
    "reaction_pick",
    "energy_balance",
    "observe_capture",
    "drag_to_core",
    "pressure_survival",
    "rhythm_timing",
    "drag_collect_grid",
    "sequence_synthesis",
}


def main() -> int:
    prod = list_production_cards()
    prod_ids = {c.get("id") for c in prod}
    missing = EXPECTED - prod_ids
    assert not missing, f"missing production cards: {missing}"
    assert default_production_card_id() == "survivor_horde"

    # Residual / lightweight cards keep historical notes but cannot auto-select.
    for cid in sorted(RESIDUAL_PROTOTYPES):
        assert cid not in prod_ids, cid
        blocked = resolve_card_id(preferred=cid, allow_experimental=False)
        assert blocked["cardId"] == "survivor_horde" and blocked["productionReady"], blocked
        allowed = resolve_card_id(preferred=cid, allow_experimental=True)
        assert allowed["cardId"] == cid and allowed["experimental"] and not allowed["productionReady"], allowed

    # Card Lab runtime acceptance deliberately does not grant release certification.
    for mechanics, cid in {
        "tap_reaction": "rhythm_timing",
        "collect_dodge": "drag_collect_grid",
        "memory_sequence": "sequence_synthesis",
    }.items():
        assert cid not in prod_ids
        for selector in ({"mechanics": mechanics}, {"preferred": cid}):
            blocked = resolve_card_id(**selector, allow_experimental=False)
            assert blocked["cardId"] == "survivor_horde" and blocked["productionReady"], blocked
            allowed = resolve_card_id(**selector, allow_experimental=True)
            assert allowed["cardId"] == cid and allowed["experimental"] and not allowed["productionReady"], allowed

    for cid in sorted(EXPECTED):
        r = resolve_card_id(preferred=cid)
        assert r["cardId"] == cid and r["productionReady"] is True, r

    # still experimental
    r5 = resolve_card_id(preferred="side_scrolling_brawler", allow_experimental=True)
    assert r5["experimental"] is True, r5

    summary = catalog_summary()
    assert summary["totals"]["productionReady"] >= len(EXPECTED)
    auto_ids = {c["id"] for c in summary["autoSelectable"]}
    assert EXPECTED <= auto_ids

    print("PASSED gameplay catalog policy checks")
    print(
        {
            "productionReady": summary["totals"]["productionReady"],
            "autoSelectable": sorted(auto_ids),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
