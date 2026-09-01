"""Validation-driven repair orchestration for existing LoreWeaver agents.

The orchestrator reuses WorldBuilderAgent.adjust_gdd plus department ownership
rules. It never grants new L3/L4 authority and never executes shell commands.
Validators are injected by the caller so the policy remains testable and the
runtime/build toolchain stays owned by existing verification jobs.
"""

from __future__ import annotations

import asyncio
import copy
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Tuple

from .agents import WorldBuilderAgent
from .repair_policy import build_repair_decision


ValidatorRunner = Callable[[List[str], dict], Awaitable[dict]]


def _json_path(parent: str, key: Any) -> str:
    if isinstance(key, int):
        return f"{parent}[{key}]" if parent else f"[{key}]"
    return f"{parent}.{key}" if parent else str(key)


def _diff_json(before: Any, after: Any, parent: str = "") -> List[dict]:
    """Return leaf-level set patches. Deletion is intentionally not auto-generated."""
    patches: List[dict] = []
    if type(before) is not type(after):
        if parent:
            patches.append({"path": parent, "value": copy.deepcopy(after)})
        return patches

    if isinstance(before, dict):
        for key, value in after.items():
            path = _json_path(parent, key)
            if key not in before:
                patches.append({"path": path, "value": copy.deepcopy(value)})
            else:
                patches.extend(_diff_json(before[key], value, path))
        return patches

    if isinstance(before, list):
        if len(before) != len(after):
            if parent:
                patches.append({"path": parent, "value": copy.deepcopy(after)})
            return patches
        for index, value in enumerate(after):
            patches.extend(_diff_json(before[index], value, _json_path(parent, index)))
        return patches

    if before != after and parent:
        patches.append({"path": parent, "value": copy.deepcopy(after)})
    return patches


def _infer_patch_level(path: str, before_value: Any, after_value: Any) -> str:
    lowered = path.lower()
    if any(token in lowered for token in ("adapter", "runtimeadapter", "runtime.adapter")):
        return "L3"
    if any(token in lowered for token in ("cardid", "modifiers", "gameplay.adapter")):
        return "L2"
    if isinstance(after_value, (int, float, bool)):
        return "L1"
    if any(token in lowered for token in ("knobs", "difficulty", "duration", "goalvalue", "reward", "multiplier")):
        return "L1"
    return "L0"


def _get_path_value(obj: Any, path: str) -> Any:
    # Minimal reader matching department_agents dotted/bracket path shape.
    current = obj
    token = ""
    index = 0
    tokens: List[Any] = []
    while index < len(path):
        ch = path[index]
        if ch == ".":
            if token:
                tokens.append(token)
                token = ""
            index += 1
            continue
        if ch == "[":
            if token:
                tokens.append(token)
                token = ""
            close = path.find("]", index)
            if close < 0:
                return None
            try:
                tokens.append(int(path[index + 1 : close]))
            except ValueError:
                return None
            index = close + 1
            continue
        token += ch
        index += 1
    if token:
        tokens.append(token)

    try:
        for item in tokens:
            current = current[item]
        return current
    except (KeyError, IndexError, TypeError):
        return None


def _owner_role(owner: str) -> str:
    # Import lazily to avoid adding another ownership map.
    from .department_agents import LEGACY_ROLE

    return LEGACY_ROLE.get(owner, "world_builder")


def _filter_agent_patches(before: dict, candidate: dict, owner: str, max_level: str) -> List[dict]:
    from .department_agents import _path_allowed

    rank = {"L0": 0, "L1": 1, "L2": 2, "L3": 3, "L4": 4}
    max_rank = rank.get(max_level, -1)
    accepted: List[dict] = []
    for patch in _diff_json(before, candidate):
        path = patch["path"]
        previous = _get_path_value(before, path)
        level = _infer_patch_level(path, previous, patch["value"])
        if rank.get(level, 99) > max_rank:
            continue
        if not _path_allowed(owner, path):
            continue
        accepted.append({
            "path": path,
            "value": patch["value"],
            "level": level,
            "reason": "validation-driven agent repair"
        })
    return accepted


def build_repair_context(blocker: str, decision: dict) -> str:
    validators = ", ".join(decision.get("targeted_validators") or []) or "targeted validation"
    allowed = ", ".join(decision.get("allowed_patch_levels") or []) or "none"
    return (
        "Validation repair request.\n"
        f"Blocker: {blocker}\n"
        f"Owning department: {decision.get('owner')}\n"
        f"Allowed auto patch levels: {allowed}\n"
        f"Validators that will be rerun: {validators}\n"
        "Make the smallest design/spec change that fixes this blocker. "
        "Do not rewrite unrelated content. Do not request or simulate L3/L4 runtime changes."
    )


async def propose_repair_patch(
    gdd: dict,
    blocker: str,
    *,
    patch_level: str = "L1",
    attempt: int = 0,
) -> dict:
    """Ask the existing role agent for a repair and reduce its output to controlled patches."""
    from .department_agents import apply_controlled_patches

    decision_obj = build_repair_decision(blocker, patch_level=patch_level, attempt=attempt)
    decision = decision_obj.to_dict()
    if not decision_obj.auto_repair_allowed:
        return {
            "status": "escalated",
            "decision": decision,
            "gdd": copy.deepcopy(gdd),
            "patches": [],
            "appliedPatches": []
        }

    owner = decision_obj.owner
    role = _owner_role(owner)
    feedback = build_repair_context(blocker, decision)
    candidate = await WorldBuilderAgent.adjust_gdd(copy.deepcopy(gdd), feedback, role)
    if not isinstance(candidate, dict):
        candidate = copy.deepcopy(gdd)

    patches = _filter_agent_patches(gdd, candidate, owner, patch_level)
    working = copy.deepcopy(gdd)
    working, applied = apply_controlled_patches(working, owner, patches)

    status = "patch_proposed" if applied else "no_safe_patch"
    return {
        "status": status,
        "decision": decision,
        "agentRole": role,
        "gdd": working,
        "patches": patches,
        "appliedPatches": applied,
        "targetedValidators": decision_obj.targeted_validators
    }


async def run_repair_loop(
    gdd: dict,
    blockers: Iterable[str],
    *,
    patch_level: str = "L1",
    validator_runner: Optional[ValidatorRunner] = None,
) -> dict:
    """Run bounded repairs. A caller may inject real targeted validators.

    Without a validator_runner this performs exactly one proposal per blocker and
    returns `validation_pending`; it never pretends a repair passed.
    """
    working = copy.deepcopy(gdd)
    history: List[dict] = []
    remaining = [str(item) for item in blockers if str(item).strip()]
    if not remaining:
        return {"status": "passed", "gdd": working, "remainingBlockers": [], "history": []}

    while remaining:
        blocker = remaining[0]
        attempt = sum(1 for item in history if item.get("blocker") == blocker)
        proposal = await propose_repair_patch(
            working,
            blocker,
            patch_level=patch_level,
            attempt=attempt,
        )
        history.append({
            "blocker": blocker,
            "attempt": attempt,
            "status": proposal["status"],
            "decision": proposal["decision"],
            "appliedPatches": proposal.get("appliedPatches") or []
        })

        if proposal["status"] == "escalated":
            return {
                "status": "escalated",
                "gdd": working,
                "remainingBlockers": remaining,
                "history": history,
                "escalation": proposal["decision"].get("escalation_reason")
            }
        if proposal["status"] != "patch_proposed":
            return {
                "status": "blocked",
                "gdd": working,
                "remainingBlockers": remaining,
                "history": history,
                "escalation": "no_safe_patch_within_owner_allowlist"
            }

        working = proposal["gdd"]
        if validator_runner is None:
            return {
                "status": "validation_pending",
                "gdd": working,
                "remainingBlockers": remaining,
                "history": history,
                "targetedValidators": proposal["targetedValidators"]
            }

        validation = await validator_runner(proposal["targetedValidators"], working)
        next_blockers = [str(item) for item in (validation or {}).get("blockers", []) if str(item).strip()]
        if not next_blockers:
            remaining.pop(0)
            continue

        # Keep the same failure first so the next iteration consumes its retry budget.
        remaining = next_blockers

    return {
        "status": "passed",
        "gdd": working,
        "remainingBlockers": [],
        "history": history
    }
