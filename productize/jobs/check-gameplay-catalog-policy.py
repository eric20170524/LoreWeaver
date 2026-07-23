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
    assert any(c.get("id") == "survivor_horde" for c in prod), "survivor_horde must be production"
    assert default_production_card_id() == "survivor_horde"

    r1 = resolve_card_id(mechanics="tap_reaction", allow_experimental=False)
    assert r1["cardId"] == "survivor_horde", r1
    assert r1["productionReady"] is True, r1

    r2 = resolve_card_id(mechanics="tap_reaction", allow_experimental=True)
    assert r2["cardId"] == "rhythm_timing", r2
    assert r2["experimental"] is True, r2

    r3 = resolve_card_id(preferred="survivor_horde")
    assert r3["cardId"] == "survivor_horde"

    summary = catalog_summary()
    assert summary["totals"]["productionReady"] >= 1
    assert summary["policy"]["autoSelectOnlyProductionReady"] is True

    print("PASSED gameplay catalog policy checks")
    print(
        {
            "productionReady": summary["totals"]["productionReady"],
            "autoSelectable": [c["id"] for c in summary["autoSelectable"]],
            "tap_reaction_auto": r1,
            "tap_reaction_explicit_experimental": r2,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
