"""Pure policy helpers for creator-facing natural-language revisions.

Simple Mode is intentionally narrower than Expert department chat:
- only authoring/spec fields may change automatically;
- node topology and design recipe stay stable;
- runtime/adapter/core ownership is never auto-edited;
- every accepted proposal produces a compact structural diff and validation plan.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Iterable


ALLOWED_TOP_LEVEL_FIELDS = {
    "title",
    "themeColor",
    "economy",
    "progressionSystems",
    "abilityCatalog",
    "nodes",
}

FORBIDDEN_PATH_FRAGMENTS = (
    "runtimefeaturepack",
    "workbench",
    "sourcerevision",
    "cataloghashes",
    ".gameplay.adapter",
    ".runtime",
    "adapterversion",
)

GAMEPLAY_L2_FRAGMENTS = (
    ".gameplay.cardid",
    ".gameplay.modifiers",
)

WORLD_HINTS = (
    "theme", "world", "title", "palette", "color", "currency", "resource", "progression",
    "主题", "世界观", "标题", "名字", "配色", "颜色", "货币", "资源", "成长", "经济",
)


@dataclass(frozen=True)
class RevisionPolicyResult:
    allowed: bool
    patch_level: str
    agent_role: str
    blockers: list[str]
    validators: list[str]
    diff: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["schemaVersion"] = "loreweaver.creator-revision-policy.v1"
        return result


def select_creator_agent_role(message: str) -> str:
    text = str(message or "").lower()
    if any(hint in text for hint in WORLD_HINTS):
        return "world_builder"
    # Narrative/planning agent already owns node pacing, difficulty, durations,
    # goal values, gameplay mappings and planning hooks at manifest level.
    return "narrative"


def _safe_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str) and len(value) > 240:
            return value[:237] + "..."
        return value
    if isinstance(value, list):
        return {"type": "array", "length": len(value)}
    if isinstance(value, dict):
        return {"type": "object", "keys": sorted(value.keys())[:20]}
    return str(value)


def structural_diff(before: Any, after: Any, path: str = "$", limit: int = 120) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []

    def walk(left: Any, right: Any, current: str) -> None:
        if len(changes) >= limit:
            return
        if type(left) is not type(right):
            changes.append({"path": current, "kind": "replace", "before": _safe_value(left), "after": _safe_value(right)})
            return
        if isinstance(left, dict):
            keys = sorted(set(left.keys()) | set(right.keys()))
            for key in keys:
                child = f"{current}.{key}"
                if key not in left:
                    changes.append({"path": child, "kind": "add", "before": None, "after": _safe_value(right[key])})
                elif key not in right:
                    changes.append({"path": child, "kind": "remove", "before": _safe_value(left[key]), "after": None})
                else:
                    walk(left[key], right[key], child)
                if len(changes) >= limit:
                    break
            return
        if isinstance(left, list):
            if len(left) != len(right):
                changes.append({
                    "path": current,
                    "kind": "resize",
                    "before": {"type": "array", "length": len(left)},
                    "after": {"type": "array", "length": len(right)},
                })
            for index, (l_item, r_item) in enumerate(zip(left, right)):
                walk(l_item, r_item, f"{current}[{index}]")
                if len(changes) >= limit:
                    break
            return
        if left != right:
            changes.append({"path": current, "kind": "replace", "before": _safe_value(left), "after": _safe_value(right)})

    walk(before, after, path)
    return changes


def _node_ids(spec: dict[str, Any]) -> list[Any]:
    nodes = spec.get("nodes")
    if not isinstance(nodes, list):
        return []
    return [node.get("id") for node in nodes if isinstance(node, dict)]


def _changed_top_level_fields(diff: Iterable[dict[str, Any]]) -> set[str]:
    fields: set[str] = set()
    for change in diff:
        path = str(change.get("path") or "")
        if not path.startswith("$."):
            continue
        rest = path[2:]
        field = rest.split(".", 1)[0].split("[", 1)[0]
        if field:
            fields.add(field)
    return fields


def evaluate_creator_revision(before: dict[str, Any], after: dict[str, Any], message: str) -> RevisionPolicyResult:
    diff = structural_diff(before, after)
    blockers: list[str] = []
    agent_role = select_creator_agent_role(message)

    if not isinstance(before, dict) or not isinstance(after, dict):
        blockers.append("spec_must_be_json_object")
        return RevisionPolicyResult(False, "L1", agent_role, blockers, ["node_smoke"], diff)

    before_recipe = (before.get("designRecipe") or {}).get("id") if isinstance(before.get("designRecipe"), dict) else None
    after_recipe = (after.get("designRecipe") or {}).get("id") if isinstance(after.get("designRecipe"), dict) else None
    if before_recipe != after_recipe:
        blockers.append("design_recipe_change_requires_expert_mode")

    if _node_ids(before) != _node_ids(after):
        blockers.append("node_topology_change_requires_expert_mode")

    changed_top = _changed_top_level_fields(diff)
    forbidden_top = sorted(changed_top - ALLOWED_TOP_LEVEL_FIELDS)
    if forbidden_top:
        blockers.append(f"top_level_fields_outside_simple_mode:{','.join(forbidden_top)}")

    lowered_paths = [str(item.get("path") or "").lower() for item in diff]
    forbidden_paths = sorted({
        path for path in lowered_paths
        if any(fragment in path for fragment in FORBIDDEN_PATH_FRAGMENTS)
    })
    if forbidden_paths:
        blockers.append("runtime_or_adapter_change_requires_expert_mode")

    patch_level = "L2" if any(
        any(fragment in path for fragment in GAMEPLAY_L2_FRAGMENTS)
        for path in lowered_paths
    ) else "L1"

    if not diff:
        blockers.append("no_effective_change")

    return RevisionPolicyResult(
        allowed=len(blockers) == 0,
        patch_level=patch_level,
        agent_role=agent_role,
        blockers=blockers,
        validators=["node_smoke"],
        diff=diff,
    )
