"""Pure validation for manifest-level Gameplay Card / Modifier composition.

This validator deliberately does not inspect release evidence or runtime execution.
It answers whether an authored node composition references existing catalog entries
and satisfies their declared compatibility contract. Runtime behavior is validated
separately by node-smoke after the proposal is staged.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class GameplayCompositionIssue:
    node_id: Any
    code: str
    message: str
    card_id: str | None = None
    modifier_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def _modifier_id(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, dict):
        raw = value.get("id") or value.get("modifierId")
        text = str(raw or "").strip()
        return text or None
    return None


def validate_gameplay_composition(
    spec: dict[str, Any],
    *,
    cards_root: Path,
) -> dict[str, Any]:
    issues: list[GameplayCompositionIssue] = []
    checked_nodes = 0
    checked_modifiers = 0

    nodes = spec.get("nodes") if isinstance(spec, dict) else None
    if not isinstance(nodes, list) or not nodes:
        issues.append(GameplayCompositionIssue(None, "nodes_missing", "spec.nodes must be a non-empty array"))
    else:
        modifiers_root = cards_root / "modifiers"
        for node in nodes:
            if not isinstance(node, dict):
                issues.append(GameplayCompositionIssue(None, "node_not_object", "each node must be an object"))
                continue
            node_id = node.get("id")
            gameplay = node.get("gameplay")
            if not isinstance(gameplay, dict):
                issues.append(GameplayCompositionIssue(node_id, "gameplay_missing", "node.gameplay must be an object"))
                continue

            checked_nodes += 1
            card_id = str(gameplay.get("cardId") or gameplay.get("id") or "").strip()
            if not card_id:
                issues.append(GameplayCompositionIssue(node_id, "base_card_missing", "gameplay.cardId is required"))
                continue

            card_path = cards_root / f"{card_id}.json"
            card = _read_json(card_path)
            if not card:
                issues.append(GameplayCompositionIssue(
                    node_id,
                    "base_card_not_found",
                    f"Gameplay Card '{card_id}' does not exist or is invalid JSON",
                    card_id=card_id,
                ))
                continue
            if str(card.get("id") or "") != card_id:
                issues.append(GameplayCompositionIssue(
                    node_id,
                    "base_card_id_mismatch",
                    f"Gameplay Card file id does not match '{card_id}'",
                    card_id=card_id,
                ))

            runtime = card.get("runtime") if isinstance(card.get("runtime"), dict) else {}
            engine_targets = runtime.get("engineTargets") if isinstance(runtime, dict) else None
            authored_adapter = str(gameplay.get("adapter") or "").strip()
            if authored_adapter and isinstance(engine_targets, list) and engine_targets:
                normalized_targets = {str(item).strip() for item in engine_targets if str(item).strip()}
                if authored_adapter not in normalized_targets:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "engine_target_incompatible",
                        f"Gameplay Card '{card_id}' does not declare engine target '{authored_adapter}'",
                        card_id=card_id,
                    ))

            raw_modifiers = gameplay.get("modifiers") or []
            if not isinstance(raw_modifiers, list):
                issues.append(GameplayCompositionIssue(
                    node_id,
                    "modifiers_not_array",
                    "gameplay.modifiers must be an array",
                    card_id=card_id,
                ))
                continue

            seen: set[str] = set()
            for raw_modifier in raw_modifiers:
                modifier_id = _modifier_id(raw_modifier)
                if not modifier_id:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "modifier_id_missing",
                        "modifier entry must be a string id or object with id",
                        card_id=card_id,
                    ))
                    continue
                checked_modifiers += 1
                if modifier_id in seen:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "duplicate_modifier",
                        f"Modifier '{modifier_id}' is attached more than once",
                        card_id=card_id,
                        modifier_id=modifier_id,
                    ))
                    continue
                seen.add(modifier_id)

                modifier_path = modifiers_root / f"{modifier_id}.json"
                modifier = _read_json(modifier_path)
                if not modifier:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "modifier_not_found",
                        f"Modifier '{modifier_id}' does not exist or is invalid JSON",
                        card_id=card_id,
                        modifier_id=modifier_id,
                    ))
                    continue
                if str(modifier.get("id") or "") != modifier_id:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "modifier_id_mismatch",
                        f"Modifier file id does not match '{modifier_id}'",
                        card_id=card_id,
                        modifier_id=modifier_id,
                    ))

                compatible = modifier.get("compatibleBaseCards")
                if not isinstance(compatible, list) or not compatible:
                    compatible = modifier.get("modifierFor")
                compatible_ids = {
                    str(item).strip() for item in compatible or [] if str(item).strip()
                }
                if not compatible_ids:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "modifier_compatibility_undeclared",
                        f"Modifier '{modifier_id}' declares no compatible base cards",
                        card_id=card_id,
                        modifier_id=modifier_id,
                    ))
                elif card_id not in compatible_ids:
                    issues.append(GameplayCompositionIssue(
                        node_id,
                        "modifier_incompatible",
                        f"Modifier '{modifier_id}' is not compatible with base card '{card_id}'",
                        card_id=card_id,
                        modifier_id=modifier_id,
                    ))

    return {
        "schemaVersion": "loreweaver.gameplay-composition-validation.v1",
        "status": "passed" if not issues else "failed",
        "checkedNodes": checked_nodes,
        "checkedModifiers": checked_modifiers,
        "issues": [issue.to_dict() for issue in issues],
    }
