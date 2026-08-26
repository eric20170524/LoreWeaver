"""Deterministic policy core for LoreWeaver validation-driven Agent repair.

This module deliberately contains no LLM calls and no workspace writes.
It converts a gate blocker into an ownership / retry / validation decision so
all agent surfaces share the same fail-closed behavior.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable, List, Optional


PATCH_RETRY_BUDGET = {
    "L0": 3,
    "L1": 3,
    "L2": 2,
    "L3": 0,
    "L4": 0,
}

OWNER_ALLOWED_PATCH_LEVELS = {
    "world": ["L0", "L1"],
    "narrative": ["L0", "L1"],
    "gameplay": ["L0", "L1", "L2"],
    "ability": ["L0", "L1", "L2"],
    "architecture": ["L0", "L1", "L2"],
    "art": ["L0", "L1", "L2"],
    "audio": ["L0", "L1", "L2"],
    "code": ["L0", "L1", "L2"],
    "qa": ["L0", "L1"],
    "compliance": ["L0", "L1"],
    "director": [],
}

OWNER_VALIDATORS = {
    "architecture": ["schema", "runtime_spec"],
    "gameplay": ["gameplay_card_validate", "node_smoke"],
    "ability": ["runtime_feature_pack", "node_smoke"],
    "code": ["build", "runtime_e2e", "node_smoke", "scene_hygiene"],
    "art": ["visual_audit", "atlas_integrity"],
    "audio": ["audio_verify"],
    "qa": ["node_smoke", "evidence_integrity"],
    "compliance": ["content_safety", "production_export_gate"],
    "world": ["schema"],
    "narrative": ["schema", "node_smoke"],
    "director": ["full_qa"],
}


@dataclass(frozen=True)
class RepairDecision:
    blocker: str
    owner: str
    patch_level: str
    attempt: int
    retry_budget: int
    auto_repair_allowed: bool
    allowed_patch_levels: List[str]
    targeted_validators: List[str]
    escalation_reason: Optional[str]

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["schemaVersion"] = "loreweaver.repair-decision.v1"
        return payload


def _has_any(text: str, needles: Iterable[str]) -> bool:
    return any(needle in text for needle in needles)


def classify_blocker_owner(blocker: str) -> str:
    value = str(blocker or "").strip().lower()
    if not value:
        return "director"

    for owner in (
        "architecture",
        "gameplay",
        "ability",
        "code",
        "art",
        "audio",
        "qa",
        "compliance",
        "world",
        "narrative",
    ):
        if value.startswith(f"{owner}:"):
            return owner

    if _has_any(value, ("schema", "contract", "runtime_spec", "manifest invalid")):
        return "architecture"
    if _has_any(value, ("gameplay_card", "objective", "goal", "duration", "playability", "golden_slice", "vertical_slice")):
        return "gameplay"
    if _has_any(value, ("ability", "skill runtime", "passive")):
        return "ability"
    if _has_any(value, ("visual", "atlas", "sprite", "layout", "overflow", "art_")):
        return "art"
    if _has_any(value, ("audio", "bgm", "sfx", "voice", "cue")):
        return "audio"
    if _has_any(value, ("content_safety", "copyright", "compliance", "export policy")):
        return "compliance"
    if _has_any(value, ("runtime_e2e", "exception", "scene_hygiene", "cleanup", "build")):
        return "code"
    if _has_any(value, ("node_smoke", "evidence", "report:", "stale", "identity mismatch")):
        return "qa"
    return "director"


def targeted_validators_for(blocker: str, owner: Optional[str] = None) -> List[str]:
    value = str(blocker or "").lower()
    resolved_owner = owner or classify_blocker_owner(value)
    validators = list(OWNER_VALIDATORS.get(resolved_owner, ["full_qa"]))

    if "golden_slice" in value or "vertical_slice" in value:
        validators = ["golden_slice_gate"]
    elif "visual" in value or "atlas" in value:
        validators = ["visual_audit", "atlas_integrity"]
    elif "audio" in value or "bgm" in value or "sfx" in value:
        validators = ["audio_verify"]
    elif "content_safety" in value:
        validators = ["content_safety", "production_export_gate"]
    elif "runtime_e2e" in value:
        validators = ["runtime_e2e", "node_smoke"]
    elif "node_smoke" in value:
        validators = ["node_smoke"]
    elif "schema" in value:
        validators = ["schema"]

    return list(dict.fromkeys(validators))


def build_repair_decision(
    blocker: str,
    *,
    patch_level: str = "L1",
    attempt: int = 0,
) -> RepairDecision:
    level = str(patch_level or "L1").upper()
    owner = classify_blocker_owner(blocker)
    budget = int(PATCH_RETRY_BUDGET.get(level, 0))
    allowed_levels = list(OWNER_ALLOWED_PATCH_LEVELS.get(owner, []))

    escalation_reason: Optional[str] = None
    auto_repair_allowed = True

    if level not in PATCH_RETRY_BUDGET:
        auto_repair_allowed = False
        escalation_reason = f"unknown_patch_level:{level}"
    elif level in ("L3", "L4"):
        auto_repair_allowed = False
        escalation_reason = f"authority_escalation_required:{level}"
    elif level not in allowed_levels:
        auto_repair_allowed = False
        escalation_reason = f"owner_{owner}_cannot_auto_patch_{level}"
    elif int(attempt) >= budget:
        auto_repair_allowed = False
        escalation_reason = f"retry_budget_exhausted:{attempt}/{budget}"
    elif owner == "director":
        auto_repair_allowed = False
        escalation_reason = "cross_domain_or_unclassified_blocker"

    return RepairDecision(
        blocker=str(blocker or ""),
        owner=owner,
        patch_level=level,
        attempt=max(0, int(attempt)),
        retry_budget=budget,
        auto_repair_allowed=auto_repair_allowed,
        allowed_patch_levels=allowed_levels,
        targeted_validators=targeted_validators_for(blocker, owner),
        escalation_reason=escalation_reason,
    )


def build_repair_plan(
    blockers: Iterable[str],
    *,
    patch_level: str = "L1",
    attempt: int = 0,
) -> List[dict]:
    return [
        build_repair_decision(
            blocker,
            patch_level=patch_level,
            attempt=attempt,
        ).to_dict()
        for blocker in blockers
    ]