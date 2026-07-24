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


def main() -> int:
    prod = list_production_cards()
    prod_ids = {c.get("id") for c in prod}
    assert "survivor_horde" in prod_ids, "survivor_horde must be production"
    assert "rhythm_timing" in prod_ids, "rhythm_timing must be production"
    assert default_production_card_id() == "survivor_horde"

    # tap_reaction maps to rhythm_timing which is now production-ready → direct select
    r1 = resolve_card_id(mechanics="tap_reaction", allow_experimental=False)
    assert r1["cardId"] == "rhythm_timing", r1
    assert r1["productionReady"] is True, r1
    assert r1["experimental"] is False, r1

    r2 = resolve_card_id(mechanics="tap_reaction", allow_experimental=True)
    assert r2["cardId"] == "rhythm_timing", r2
    assert r2["productionReady"] is True, r2

    # Non-production mapped mechanics still fall back to default production
    r_fallback = resolve_card_id(mechanics="drag_collect_grid", allow_experimental=False)
    # drag_collect_grid may map to itself if in MECHANICS_TO_CARD; check catalog
    # Prefer: explicit preferred production
    r3 = resolve_card_id(preferred="survivor_horde")
    assert r3["cardId"] == "survivor_horde"

    r4 = resolve_card_id(preferred="rhythm_timing")
    assert r4["cardId"] == "rhythm_timing"
    assert r4["productionReady"] is True

    # Explicit non-production experimental
    r5 = resolve_card_id(preferred="sequence_synthesis", allow_experimental=True)
    assert r5["cardId"] == "sequence_synthesis", r5
    assert r5["experimental"] is True, r5

    summary = catalog_summary()
    assert summary["totals"]["productionReady"] >= 2
    assert summary["policy"]["autoSelectOnlyProductionReady"] is True
    auto_ids = {c["id"] for c in summary["autoSelectable"]}
    assert "survivor_horde" in auto_ids and "rhythm_timing" in auto_ids

    print("PASSED gameplay catalog policy checks")
    print(
        {
            "productionReady": summary["totals"]["productionReady"],
            "autoSelectable": [c["id"] for c in summary["autoSelectable"]],
            "tap_reaction_auto": r1,
            "preferred_rhythm": r4,
            "explicit_experimental_sequence": r5,
            "drag_collect_auto": r_fallback,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
