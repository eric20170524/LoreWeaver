#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.gameplay_composition import validate_gameplay_composition


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    with tempfile.TemporaryDirectory(prefix="lw-gameplay-composition-") as temp:
        cards_root = Path(temp) / "cards"
        write_json(cards_root / "alpha.json", {
            "schemaVersion": "2.0",
            "id": "alpha",
            "runtime": {"engineTargets": ["phaser"], "adapter": "AlphaAdapter", "template": "alpha"},
        })
        write_json(cards_root / "beta.json", {
            "schemaVersion": "2.0",
            "id": "beta",
            "runtime": {"engineTargets": ["iframe"], "adapter": "BetaAdapter", "template": "beta"},
        })
        write_json(cards_root / "modifiers" / "alpha_boost.json", {
            "schemaVersion": "2.0",
            "id": "alpha_boost",
            "compatibleBaseCards": ["alpha"],
        })
        write_json(cards_root / "modifiers" / "beta_only.json", {
            "schemaVersion": "2.0",
            "id": "beta_only",
            "modifierFor": ["beta"],
        })

        valid = validate_gameplay_composition({
            "nodes": [{
                "id": 1,
                "gameplay": {"adapter": "phaser", "cardId": "alpha", "modifiers": ["alpha_boost"]},
            }]
        }, cards_root=cards_root)
        assert valid["status"] == "passed", valid
        assert valid["checkedNodes"] == 1
        assert valid["checkedModifiers"] == 1

        wrong_engine = validate_gameplay_composition({
            "nodes": [{
                "id": 1,
                "gameplay": {"adapter": "phaser", "cardId": "beta", "modifiers": []},
            }]
        }, cards_root=cards_root)
        assert wrong_engine["status"] == "failed", wrong_engine
        assert any(issue["code"] == "engine_target_incompatible" for issue in wrong_engine["issues"])

        incompatible = validate_gameplay_composition({
            "nodes": [{
                "id": 1,
                "gameplay": {"adapter": "phaser", "cardId": "alpha", "modifiers": ["beta_only"]},
            }]
        }, cards_root=cards_root)
        assert incompatible["status"] == "failed", incompatible
        assert any(issue["code"] == "modifier_incompatible" for issue in incompatible["issues"])

        missing = validate_gameplay_composition({
            "nodes": [{
                "id": 1,
                "gameplay": {"adapter": "phaser", "cardId": "missing", "modifiers": ["unknown"]},
            }]
        }, cards_root=cards_root)
        assert missing["status"] == "failed", missing
        assert any(issue["code"] == "base_card_not_found" for issue in missing["issues"])

        duplicate = validate_gameplay_composition({
            "nodes": [{
                "id": 1,
                "gameplay": {"adapter": "phaser", "cardId": "alpha", "modifiers": ["alpha_boost", {"id": "alpha_boost"}]},
            }]
        }, cards_root=cards_root)
        assert duplicate["status"] == "failed", duplicate
        assert any(issue["code"] == "duplicate_modifier" for issue in duplicate["issues"])

    # Validate the actual shipped golden vertical slice against the real catalog.
    golden_path = ROOT / "productize" / "fixtures" / "recipes" / "survivor_vertical_slice_3.recipe-graph.json"
    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    golden_spec = {
        "nodes": [
            node["payload"]
            for node in golden.get("nodes", [])
            if isinstance(node, dict) and isinstance(node.get("payload"), dict)
        ]
    }
    golden_result = validate_gameplay_composition(
        golden_spec,
        cards_root=ROOT / "minigame_master" / "gameplay" / "cards",
    )
    assert golden_result["status"] == "passed", golden_result
    assert golden_result["checkedNodes"] == 3, golden_result
    assert golden_result["checkedModifiers"] == 4, golden_result

    print(json.dumps({
        "schemaVersion": "loreweaver.gameplay-composition-check.v2",
        "status": "passed",
        "checks": [
            "valid_base_modifier_composition_passes",
            "engine_target_mismatch_blocks",
            "modifier_incompatibility_blocks",
            "missing_catalog_reference_blocks",
            "duplicate_modifier_blocks",
            "real_golden_vertical_slice_catalog_contract_passes",
        ],
        "golden": {
            "checkedNodes": golden_result["checkedNodes"],
            "checkedModifiers": golden_result["checkedModifiers"],
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
