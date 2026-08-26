#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from backend.repair_policy import (  # noqa: E402
    build_repair_decision,
    build_repair_plan,
    classify_blocker_owner,
    targeted_validators_for,
)


def assert_eq(actual, expected, message):
    if actual != expected:
        raise AssertionError(f"{message}: expected={expected!r} actual={actual!r}")


def main():
    assert_eq(classify_blocker_owner("code:smoke_runtime:N1"), "code", "explicit code owner")
    assert_eq(classify_blocker_owner("gameplay:smoke_contract:N2"), "gameplay", "explicit gameplay owner")
    assert_eq(classify_blocker_owner("report:visual_audit_latest.json=40"), "art", "visual owner")
    assert_eq(classify_blocker_owner("content_safety_scan failed"), "compliance", "compliance owner")
    assert_eq(classify_blocker_owner("schema: recipe graph invalid"), "architecture", "schema owner")
    assert_eq(classify_blocker_owner("unknown strange failure"), "director", "unknown escalates")

    assert_eq(targeted_validators_for("runtime_e2e failed"), ["runtime_e2e", "node_smoke"], "runtime validators")
    assert_eq(targeted_validators_for("visual atlas mismatch"), ["visual_audit", "atlas_integrity"], "art validators")
    assert_eq(targeted_validators_for("qa:node_smoke_failed"), ["node_smoke"], "smoke validator")

    l1 = build_repair_decision("gameplay:goal impossible", patch_level="L1", attempt=0)
    assert_eq(l1.owner, "gameplay", "gameplay decision owner")
    assert_eq(l1.retry_budget, 3, "L1 retry budget")
    assert_eq(l1.auto_repair_allowed, True, "L1 first attempt allowed")

    exhausted = build_repair_decision("code:runtime_e2e failed", patch_level="L2", attempt=2)
    assert_eq(exhausted.auto_repair_allowed, False, "L2 budget exhausted")
    assert exhausted.escalation_reason.startswith("retry_budget_exhausted")

    l3 = build_repair_decision("code:adapter needs rewrite", patch_level="L3", attempt=0)
    assert_eq(l3.auto_repair_allowed, False, "L3 never auto applies")
    assert_eq(l3.escalation_reason, "authority_escalation_required:L3", "L3 escalation")

    unknown = build_repair_decision("unknown strange failure", patch_level="L1", attempt=0)
    assert_eq(unknown.owner, "director", "unknown owner")
    assert_eq(unknown.auto_repair_allowed, False, "unknown does not auto patch")

    plan = build_repair_plan(
        [
            "gameplay:smoke_contract:N2",
            "report:visual_audit_latest.json=40",
            "content_safety_scan failed",
        ],
        patch_level="L1",
        attempt=0,
    )
    assert_eq([item["owner"] for item in plan], ["gameplay", "art", "compliance"], "multi blocker routing")
    assert all(item["schemaVersion"] == "loreweaver.repair-decision.v1" for item in plan)

    print("PASSED repair policy checks")


if __name__ == "__main__":
    main()
