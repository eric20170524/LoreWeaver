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
    assert "drag_collect_grid" in prod_ids, "drag_collect_grid must be production"
    assert "turn_based_skill_battle" in prod_ids, "turn_based_skill_battle must be production"
    assert "sequence_synthesis" in prod_ids, "sequence_synthesis must be production"
    assert default_production_card_id() == "survivor_horde"

    r1 = resolve_card_id(mechanics="tap_reaction", allow_experimental=False)
    assert r1["cardId"] == "rhythm_timing", r1
    assert r1["productionReady"] is True, r1

    r_drag = resolve_card_id(mechanics="drag_collect_grid", allow_experimental=False)
    assert r_drag["cardId"] == "drag_collect_grid", r_drag

    r_seq = resolve_card_id(mechanics="memory_sequence", allow_experimental=False)
    assert r_seq["cardId"] == "sequence_synthesis", r_seq
    assert r_seq["productionReady"] is True, r_seq

    r3 = resolve_card_id(preferred="survivor_horde")
    assert r3["cardId"] == "survivor_horde"

    r4 = resolve_card_id(preferred="sequence_synthesis")
    assert r4["cardId"] == "sequence_synthesis"
    assert r4["productionReady"] is True

    # Explicit non-production experimental
    r5 = resolve_card_id(preferred="energy_balance", allow_experimental=True)
    assert r5["cardId"] == "energy_balance", r5
    assert r5["experimental"] is True, r5

    summary = catalog_summary()
    assert summary["totals"]["productionReady"] >= 5
    assert summary["policy"]["autoSelectOnlyProductionReady"] is True
    auto_ids = {c["id"] for c in summary["autoSelectable"]}
    assert {
        "survivor_horde",
        "rhythm_timing",
        "drag_collect_grid",
        "turn_based_skill_battle",
        "sequence_synthesis",
    } <= auto_ids

    print("PASSED gameplay catalog policy checks")
    print(
        {
            "productionReady": summary["totals"]["productionReady"],
            "autoSelectable": [c["id"] for c in summary["autoSelectable"]],
            "tap_reaction_auto": r1,
            "memory_sequence_auto": r_seq,
            "preferred_seq": r4,
            "explicit_experimental_energy": r5,
            "drag_collect_auto": r_drag,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
