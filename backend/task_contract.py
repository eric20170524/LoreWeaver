"""Provider-neutral task contracts adapted from VibeGame's role ownership model.

The contract is intentionally a pure state machine. It does not spawn agents,
open worktrees, execute shell commands, or grant runtime authority. Existing
LoreWeaver departments/providers may execute a role, while this module owns the
order, evidence boundaries, append-only handoffs, and L0-L4 escalation policy.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any, Iterable


SCHEMA_VERSION = "loreweaver.task-contract.v1"
ROLES = (
    "architect",
    "programmer",
    "auditor",
    "player",
    "reviewer",
    "orchestrator",
)
STATUSES = (
    "draft",
    "planned",
    "implemented",
    "static_verified",
    "runtime_verified",
    "reviewed",
    "accepted",
    "blocked",
    "escalated",
)
PATCH_RANK = {"L0": 0, "L1": 1, "L2": 2, "L3": 3, "L4": 4}
ACCEPTANCE_EVIDENCE_KINDS = {"static", "runtime", "visual", "feel"}
ROLE_EVIDENCE_KINDS = {
    "architect": {"plan"},
    "programmer": {"implementation"},
    "auditor": {"static"},
    "player": {"runtime", "visual", "feel"},
    "reviewer": {"review"},
    "orchestrator": {"acceptance"},
}
STATUS_NEXT_ROLE = {
    "draft": "architect",
    "planned": "programmer",
    "implemented": "auditor",
    "static_verified": "player",
    "runtime_verified": "reviewer",
    "reviewed": "orchestrator",
}
ROLE_PASS_STATUS = {
    "architect": "planned",
    "programmer": "implemented",
    "auditor": "static_verified",
    "player": "runtime_verified",
    "reviewer": "reviewed",
    "orchestrator": "accepted",
}
TASK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


class TaskContractError(ValueError):
    """Raised when a task transition or evidence claim violates the contract."""


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _round_hash(round_without_hash: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(round_without_hash).encode("utf-8")).hexdigest()


def _as_nonempty_string(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise TaskContractError(f"{field}_required")
    return text


def _dedupe_strings(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = str(value or "").strip()
        if text and text not in seen:
            result.append(text)
            seen.add(text)
    return result


def _normalize_context(context: dict[str, Any] | None) -> dict[str, list[dict[str, str]]]:
    context = context if isinstance(context, dict) else {}
    result: dict[str, list[dict[str, str]]] = {}
    for role in ("all", "architect", "programmer", "auditor", "player", "reviewer"):
        entries = context.get(role) or []
        if not isinstance(entries, list):
            raise TaskContractError(f"context_{role}_must_be_array")
        normalized: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                raise TaskContractError(f"context_{role}_entry_must_be_object")
            file_name = _as_nonempty_string(entry.get("file"), f"context_{role}_file")
            reason = _as_nonempty_string(entry.get("reason"), f"context_{role}_reason")
            key = (file_name, reason)
            if key not in seen:
                normalized.append({"file": file_name, "reason": reason})
                seen.add(key)
        result[role] = normalized
    return result


def _normalize_criteria(criteria: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(criteria, list) or not criteria:
        raise TaskContractError("acceptance_criteria_required")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in criteria:
        if not isinstance(item, dict):
            raise TaskContractError("acceptance_criterion_must_be_object")
        criterion_id = _as_nonempty_string(item.get("id"), "acceptance_criterion_id")
        if criterion_id in seen:
            raise TaskContractError(f"acceptance_criterion_duplicate:{criterion_id}")
        kinds = _dedupe_strings(item.get("evidenceKinds") or [])
        invalid = [kind for kind in kinds if kind not in ACCEPTANCE_EVIDENCE_KINDS]
        if not kinds or invalid:
            raise TaskContractError(
                f"acceptance_criterion_evidence_invalid:{criterion_id}:{','.join(invalid) or 'missing'}"
            )
        normalized.append(
            {
                "id": criterion_id,
                "description": _as_nonempty_string(
                    item.get("description"), f"acceptance_criterion_description:{criterion_id}"
                ),
                "evidenceKinds": kinds,
            }
        )
        seen.add(criterion_id)
    return normalized


def _normalize_runtime_state_contract(value: dict[str, Any] | None) -> dict[str, Any]:
    value = value if isinstance(value, dict) else {}
    fields = value.get("fields") or []
    actions = _dedupe_strings(value.get("inputActions") or [])
    if not isinstance(fields, list):
        raise TaskContractError("runtime_state_fields_must_be_array")
    normalized_fields: list[dict[str, str]] = []
    seen: set[str] = set()
    for field in fields:
        if not isinstance(field, dict):
            raise TaskContractError("runtime_state_field_must_be_object")
        path = _as_nonempty_string(field.get("path"), "runtime_state_field_path")
        field_type = str(field.get("type") or "").strip()
        if field_type not in {"number", "string", "boolean", "object", "array"}:
            raise TaskContractError(f"runtime_state_field_type_invalid:{path}:{field_type}")
        if path in seen:
            raise TaskContractError(f"runtime_state_field_duplicate:{path}")
        normalized_fields.append(
            {
                "path": path,
                "type": field_type,
                "reason": _as_nonempty_string(
                    field.get("reason"), f"runtime_state_field_reason:{path}"
                ),
            }
        )
        seen.add(path)
    return {"fields": normalized_fields, "inputActions": actions}


def _normalize_evidence_refs(evidence_refs: Iterable[dict[str, Any]] | None) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    valid_kinds = set().union(*ROLE_EVIDENCE_KINDS.values())
    for evidence in evidence_refs or []:
        if not isinstance(evidence, dict):
            raise TaskContractError("evidence_ref_must_be_object")
        evidence_id = _as_nonempty_string(evidence.get("id"), "evidence_id")
        if evidence_id in seen:
            raise TaskContractError(f"evidence_id_duplicate_in_round:{evidence_id}")
        kind = str(evidence.get("kind") or "").strip()
        if kind not in valid_kinds:
            raise TaskContractError(f"evidence_kind_invalid:{kind or 'missing'}")
        status = str(evidence.get("status") or "").strip()
        if status not in {"passed", "failed", "unavailable", "stale"}:
            raise TaskContractError(f"evidence_status_invalid:{evidence_id}:{status or 'missing'}")
        result.append(
            {
                "id": evidence_id,
                "kind": kind,
                "path": _as_nonempty_string(evidence.get("path"), f"evidence_path:{evidence_id}"),
                "status": status,
                "criterionIds": _dedupe_strings(evidence.get("criterionIds") or []),
                "fixture": bool(evidence.get("fixture", False)),
                "synthetic": bool(evidence.get("synthetic", False)),
                "stale": bool(evidence.get("stale", False) or status == "stale"),
            }
        )
        seen.add(evidence_id)
    return result


def create_task_contract(
    *,
    task_id: str,
    title: str,
    source_spec_hash: str,
    product_intent: dict[str, Any],
    acceptance_criteria: list[dict[str, Any]],
    dependencies: Iterable[str] | None = None,
    context: dict[str, Any] | None = None,
    runtime_state_contract: dict[str, Any] | None = None,
    requested_patch_level: str = "L1",
) -> dict[str, Any]:
    """Create a task contract; L3/L4 requests immediately become escalation."""
    normalized_id = _as_nonempty_string(task_id, "task_id")
    if not TASK_ID_RE.fullmatch(normalized_id):
        raise TaskContractError(f"task_id_invalid:{normalized_id}")
    requested_patch_level = str(requested_patch_level or "").strip()
    if requested_patch_level not in PATCH_RANK:
        raise TaskContractError(f"patch_level_invalid:{requested_patch_level or 'missing'}")
    if not isinstance(product_intent, dict):
        raise TaskContractError("product_intent_must_be_object")

    intent = {
        "goal": _as_nonempty_string(product_intent.get("goal"), "product_intent_goal"),
        "userVisibleOutcome": _as_nonempty_string(
            product_intent.get("userVisibleOutcome"), "product_intent_user_visible_outcome"
        ),
        "nonGoals": _dedupe_strings(product_intent.get("nonGoals") or []),
    }
    criteria = _normalize_criteria(acceptance_criteria)
    runtime_contract = _normalize_runtime_state_contract(runtime_state_contract)
    runtime_required = any(
        set(item["evidenceKinds"]) & {"runtime", "feel"} for item in criteria
    )
    if runtime_required and not (
        runtime_contract["fields"] or runtime_contract["inputActions"]
    ):
        raise TaskContractError("runtime_state_contract_required_for_runtime_or_feel_criteria")

    dependency_list = _dedupe_strings(dependencies or [])
    if normalized_id in dependency_list:
        raise TaskContractError("task_cannot_depend_on_itself")

    requires_human = PATCH_RANK[requested_patch_level] > PATCH_RANK["L2"]
    blocker = f"patch_authority_requires_human_review:{requested_patch_level}"
    contract = {
        "schemaVersion": SCHEMA_VERSION,
        "id": normalized_id,
        "title": _as_nonempty_string(title, "task_title"),
        "sourceSpecHash": _as_nonempty_string(source_spec_hash, "source_spec_hash"),
        "productIntent": intent,
        "acceptanceCriteria": criteria,
        "dependencies": dependency_list,
        "context": _normalize_context(context),
        "runtimeStateContract": runtime_contract,
        "patchAuthority": {
            "maxAutoLevel": "L2",
            "requestedLevel": requested_patch_level,
        },
        "status": "escalated" if requires_human else "draft",
        "resumeRole": None,
        "handoffRounds": [],
        "blockers": [blocker] if requires_human else [],
    }
    validation = validate_task_contract(contract)
    if not validation["valid"]:
        raise TaskContractError(";".join(validation["errors"]))
    return contract


def validate_handoff_chain(contract: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    previous_hash: str | None = None
    rounds = contract.get("handoffRounds") if isinstance(contract, dict) else None
    if not isinstance(rounds, list):
        return ["handoff_rounds_must_be_array"]
    for index, round_item in enumerate(rounds, start=1):
        if not isinstance(round_item, dict):
            errors.append(f"handoff_round_not_object:{index}")
            continue
        if round_item.get("round") != index:
            errors.append(f"handoff_round_sequence_invalid:{index}")
        if round_item.get("previousRoundHash") != previous_hash:
            errors.append(f"handoff_previous_hash_invalid:{index}")
        payload = {key: copy.deepcopy(value) for key, value in round_item.items() if key != "roundHash"}
        expected = _round_hash(payload)
        if round_item.get("roundHash") != expected:
            errors.append(f"handoff_round_hash_invalid:{index}")
        previous_hash = round_item.get("roundHash")
    return errors


def validate_task_contract(contract: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(contract, dict):
        return {"valid": False, "errors": ["task_contract_not_object"]}
    if contract.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("schema_version_invalid")
    task_id = str(contract.get("id") or "")
    if not TASK_ID_RE.fullmatch(task_id):
        errors.append("task_id_invalid")
    if not str(contract.get("title") or "").strip():
        errors.append("task_title_missing")
    if len(str(contract.get("sourceSpecHash") or "")) < 8:
        errors.append("source_spec_hash_invalid")
    if contract.get("status") not in STATUSES:
        errors.append("task_status_invalid")
    patch_authority = contract.get("patchAuthority") or {}
    if patch_authority.get("maxAutoLevel") != "L2":
        errors.append("max_auto_patch_level_must_be_L2")
    requested = patch_authority.get("requestedLevel")
    if requested not in PATCH_RANK:
        errors.append("requested_patch_level_invalid")
    elif PATCH_RANK[requested] > PATCH_RANK["L2"] and contract.get("status") != "escalated":
        errors.append("L3_L4_task_must_be_escalated")
    criteria = contract.get("acceptanceCriteria") or []
    criterion_ids = [item.get("id") for item in criteria if isinstance(item, dict)]
    if not criteria or len(criterion_ids) != len(set(criterion_ids)):
        errors.append("acceptance_criteria_missing_or_duplicate")
    expected_context_keys = {"all", "architect", "programmer", "auditor", "player", "reviewer"}
    context = contract.get("context")
    if not isinstance(context, dict) or set(context.keys()) != expected_context_keys:
        errors.append("role_context_keys_invalid")
    resume_role = contract.get("resumeRole")
    if resume_role is not None and resume_role not in ROLES[:-1]:
        errors.append("resume_role_invalid")
    errors.extend(validate_handoff_chain(contract))
    return {"valid": not errors, "errors": list(dict.fromkeys(errors))}


def next_required_role(contract: dict[str, Any]) -> str | None:
    status = contract.get("status")
    if status == "blocked":
        role = contract.get("resumeRole")
        return role if role in ROLES else None
    return STATUS_NEXT_ROLE.get(status)


def context_for_role(contract: dict[str, Any], role: str) -> list[dict[str, str]]:
    if role not in {"architect", "programmer", "auditor", "player", "reviewer"}:
        raise TaskContractError(f"role_has_no_context_manifest:{role}")
    context = contract.get("context") or {}
    combined = list(context.get("all") or []) + list(context.get(role) or [])
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for entry in combined:
        key = (str(entry.get("file") or ""), str(entry.get("reason") or ""))
        if key not in seen:
            result.append(copy.deepcopy(entry))
            seen.add(key)
    return result


def _passed_evidence(evidence_refs: Iterable[dict[str, Any]], kind: str, criterion_id: str | None = None) -> bool:
    for evidence in evidence_refs:
        if evidence.get("kind") != kind:
            continue
        if evidence.get("status") != "passed" or evidence.get("stale") is True:
            continue
        if criterion_id is not None and criterion_id not in (evidence.get("criterionIds") or []):
            continue
        return True
    return False


def _all_prior_evidence(contract: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for round_item in contract.get("handoffRounds") or []:
        result.extend(copy.deepcopy(round_item.get("evidenceRefs") or []))
    return result


def _validate_pass_evidence(contract: dict[str, Any], role: str, evidence_refs: list[dict[str, Any]]) -> None:
    if role == "architect" and not _passed_evidence(evidence_refs, "plan"):
        raise TaskContractError("architect_pass_requires_plan_evidence")
    if role == "programmer" and not _passed_evidence(evidence_refs, "implementation"):
        raise TaskContractError("programmer_pass_requires_implementation_evidence")

    criteria = contract.get("acceptanceCriteria") or []
    if role == "auditor":
        for criterion in criteria:
            if "static" in (criterion.get("evidenceKinds") or []) and not _passed_evidence(
                evidence_refs, "static", criterion.get("id")
            ):
                raise TaskContractError(
                    f"auditor_missing_static_evidence:{criterion.get('id')}"
                )
    if role == "player":
        for criterion in criteria:
            for kind in criterion.get("evidenceKinds") or []:
                if kind in {"runtime", "visual", "feel"} and not _passed_evidence(
                    evidence_refs, kind, criterion.get("id")
                ):
                    raise TaskContractError(
                        f"player_missing_{kind}_evidence:{criterion.get('id')}"
                    )
    if role == "reviewer":
        if not _passed_evidence(evidence_refs, "review"):
            raise TaskContractError("reviewer_pass_requires_review_evidence")
        prior = _all_prior_evidence(contract)
        for criterion in criteria:
            for kind in criterion.get("evidenceKinds") or []:
                if not _passed_evidence(prior, kind, criterion.get("id")):
                    raise TaskContractError(
                        f"reviewer_cannot_approve_uncovered_criterion:{criterion.get('id')}:{kind}"
                    )
    if role == "orchestrator" and not _passed_evidence(evidence_refs, "acceptance"):
        raise TaskContractError("orchestrator_acceptance_requires_evidence")


def append_handoff(
    contract: dict[str, Any],
    *,
    role: str,
    verdict: str,
    summary: str,
    evidence_refs: Iterable[dict[str, Any]] | None = None,
    findings: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Append one role-owned handoff and transition the task state.

    Existing rounds are hash-chained. This function never edits a prior round.
    Failed static/runtime/final review returns the task to programmer rework;
    failed planning/implementation stays with the owning role.
    """
    validation = validate_task_contract(contract)
    if not validation["valid"]:
        raise TaskContractError("invalid_existing_contract:" + ";".join(validation["errors"]))
    if contract.get("status") in {"accepted", "escalated"}:
        raise TaskContractError(f"task_terminal:{contract.get('status')}")
    if role not in ROLES:
        raise TaskContractError(f"role_invalid:{role}")
    if verdict not in {"passed", "failed", "escalated"}:
        raise TaskContractError(f"verdict_invalid:{verdict}")

    expected_role = next_required_role(contract)
    if role != expected_role:
        raise TaskContractError(
            f"role_out_of_order:expected={expected_role or 'none'}:actual={role}"
        )

    evidence = _normalize_evidence_refs(evidence_refs)
    allowed_kinds = ROLE_EVIDENCE_KINDS[role]
    forbidden = sorted({item["kind"] for item in evidence if item["kind"] not in allowed_kinds})
    if forbidden:
        raise TaskContractError(
            f"role_evidence_boundary_violation:{role}:{','.join(forbidden)}"
        )
    normalized_findings = _dedupe_strings(findings or [])
    if verdict == "passed":
        _validate_pass_evidence(contract, role, evidence)
    elif verdict == "failed" and not normalized_findings:
        raise TaskContractError("failed_handoff_requires_findings")

    next_contract = copy.deepcopy(contract)
    previous_hash = (
        next_contract["handoffRounds"][-1]["roundHash"]
        if next_contract["handoffRounds"]
        else None
    )
    round_payload = {
        "round": len(next_contract["handoffRounds"]) + 1,
        "role": role,
        "verdict": verdict,
        "summary": _as_nonempty_string(summary, "handoff_summary"),
        "evidenceRefs": evidence,
        "findings": normalized_findings,
        "previousRoundHash": previous_hash,
    }
    round_payload["roundHash"] = _round_hash(round_payload)
    next_contract["handoffRounds"].append(round_payload)

    if verdict == "escalated":
        next_contract["status"] = "escalated"
        next_contract["resumeRole"] = None
        next_contract["blockers"] = normalized_findings or [round_payload["summary"]]
    elif verdict == "failed":
        next_contract["status"] = "blocked"
        next_contract["resumeRole"] = role if role in {"architect", "programmer"} else "programmer"
        next_contract["blockers"] = normalized_findings
    else:
        next_contract["status"] = ROLE_PASS_STATUS[role]
        next_contract["resumeRole"] = None
        next_contract["blockers"] = []

    final_validation = validate_task_contract(next_contract)
    if not final_validation["valid"]:
        raise TaskContractError("invalid_transition_result:" + ";".join(final_validation["errors"]))
    return next_contract


def evaluate_task_acceptance(contract: dict[str, Any]) -> dict[str, Any]:
    validation = validate_task_contract(contract)
    blockers = list(validation["errors"])
    if contract.get("status") != "accepted":
        blockers.append(f"task_not_accepted:{contract.get('status')}")

    all_evidence = _all_prior_evidence(contract)
    coverage: dict[str, dict[str, bool]] = {}
    for criterion in contract.get("acceptanceCriteria") or []:
        criterion_id = criterion.get("id")
        coverage[criterion_id] = {}
        for kind in criterion.get("evidenceKinds") or []:
            passed = _passed_evidence(all_evidence, kind, criterion_id)
            coverage[criterion_id][kind] = passed
            if not passed:
                blockers.append(f"criterion_evidence_missing:{criterion_id}:{kind}")

    if not _passed_evidence(all_evidence, "review"):
        blockers.append("independent_review_evidence_missing")
    if not _passed_evidence(all_evidence, "acceptance"):
        blockers.append("orchestrator_acceptance_evidence_missing")

    return {
        "schemaVersion": "loreweaver.task-acceptance.v1",
        "taskId": contract.get("id"),
        "status": "passed" if not blockers else "failed",
        "accepted": not blockers,
        "coverage": coverage,
        "blockers": list(dict.fromkeys(blockers)),
        "handoffRoundCount": len(contract.get("handoffRounds") or []),
        "lastRoundHash": (
            contract.get("handoffRounds")[-1].get("roundHash")
            if contract.get("handoffRounds")
            else None
        ),
    }
