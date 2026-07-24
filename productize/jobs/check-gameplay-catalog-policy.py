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
    "rhythm_timing",
    "drag_collect_grid",
    "turn_based_skill_battle",
    "sequence_synthesis",
    "reaction_pick",
    "energy_balance",
    "observe_capture",
    "drag_to_core",
    "pressure_survival",
}


def main() -> int:
    prod = list_production_cards()
    prod_ids = {c.get("id") for c in prod}
    missing = EXPECTED - prod_ids
    assert not missing, f"missing production cards: {missing}"
    assert default_production_card_id() == "survivor_horde"

    r1 = resolve_card_id(mechanics="tap_reaction", allow_experimental=False)
    assert r1["cardId"] == "rhythm_timing", r1

    r_seq = resolve_card_id(mechanics="memory_sequence", allow_experimental=False)
    assert r_seq["cardId"] == "sequence_synthesis", r_seq

    for cid in sorted(EXPECTED):
        r = resolve_card_id(preferred=cid)
        assert r["cardId"] == cid and r["productionReady"] is True, r

    # still experimental
    r5 = resolve_card_id(preferred="side_scrolling_brawler", allow_experimental=True)
    assert r5["experimental"] is True, r5

    summary = catalog_summary()
    assert summary["totals"]["productionReady"] >= 10
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
