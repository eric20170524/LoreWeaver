"""Deterministically bootstrap the root production TaskContract for a Workspace.

A Workspace should not need a manual CLI call before Department → Task sync can
work. This module creates exactly one root task when no TaskContract exists,
derives its product intent and acceptance criteria from the current manifest, and
appends a real Architect plan handoff. It never spawns an LLM and never overwrites
an existing task.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from backend.task_contract import create_task_contract
from backend.task_repository import TaskRepository, TaskRepositoryError

ROOT_TASK_ID = "root-production"


class TaskBootstrapError(ValueError):
    """Raised when a root Task cannot be derived safely."""


def _canonical_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _read_manifest(workspace_dir: Path) -> dict[str, Any]:
    path = workspace_dir / "manifest.json"
    if not path.is_file():
        raise TaskBootstrapError("workspace_manifest_missing")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TaskBootstrapError(f"workspace_manifest_invalid:{exc}") from exc
    if not isinstance(value, dict):
        raise TaskBootstrapError("workspace_manifest_not_object")
    return value


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def _node_summary(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for node in manifest.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        gameplay = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
        modifiers = gameplay.get("modifiers") if isinstance(gameplay.get("modifiers"), list) else []
        result.append(
            {
                "id": node.get("id"),
                "title": node.get("title"),
                "cardId": gameplay.get("cardId") or node.get("mechanics"),
                "modifierIds": [
                    str(item if isinstance(item, str) else (item or {}).get("id") or "").strip()
                    for item in modifiers
                    if str(item if isinstance(item, str) else (item or {}).get("id") or "").strip()
                ],
            }
        )
    return result


def _build_task(manifest: dict[str, Any], source_spec_hash: str) -> dict[str, Any]:
    title = str(manifest.get("title") or "LoreWeaver Vertical Slice").strip()
    nodes = _node_summary(manifest)
    return create_task_contract(
        task_id=ROOT_TASK_ID,
        title=f"{title} · Root Production",
        source_spec_hash=source_spec_hash,
        product_intent={
            "goal": f"Produce a playable, evidence-backed vertical slice for {title}.",
            "userVisibleOutcome": "A creator can play the intended core loop and only a fully evidenced Candidate may advance toward Certified release.",
            "nonGoals": [
                "Create a second runtime authority",
                "Auto-execute L3/L4 architecture changes",
                "Treat Department confirmation as Player/Reviewer/final acceptance",
                "Fabricate VLM, human or physical-device evidence",
            ],
        },
        acceptance_criteria=[
            {
                "id": "static-contract",
                "description": "Design/runtime composition and build contracts pass trusted static validation.",
                "evidenceKinds": ["static"],
            },
            {
                "id": "runtime-playability",
                "description": "The current Candidate runs the intended core loop through the authoritative runtime.",
                "evidenceKinds": ["runtime"],
            },
            {
                "id": "visual-quality",
                "description": "The exact Candidate receives real visual review with no blocking visual failure.",
                "evidenceKinds": ["visual"],
            },
            {
                "id": "human-feel",
                "description": "A real human playtest reports usable clarity and no unresolved blocking play issue.",
                "evidenceKinds": ["feel"],
            },
        ],
        context={
            "all": [
                {"file": "manifest.json", "reason": "Authoritative Workspace DesignSpec source for this task."},
            ],
            "architect": [
                {"file": "manifest.json", "reason": "Derive scope, node topology and acceptance plan."},
            ],
            "programmer": [
                {"file": "manifest.json", "reason": "Implement only the declared Card/Modifier/knob composition."},
            ],
            "auditor": [
                {"file": "reports/", "reason": "Consume trusted static/build reports without self-claiming runtime evidence."},
            ],
            "player": [
                {"file": "reports/standalone_browser_report.json", "reason": "Bind runtime observation to the exact Candidate."},
                {"file": "reports/visual_audit_latest.json", "reason": "Bind real VLM visual evidence when available."},
                {"file": "reports/human_playtest_latest.json", "reason": "Bind real human feel evidence when available."},
            ],
            "reviewer": [
                {"file": "reports/release_decision_latest.json", "reason": "Independently review aggregate release evidence."},
            ],
        },
        runtime_state_contract={
            "fields": [
                {"path": "status", "type": "string", "reason": "Runtime lifecycle must become running and remain observable."},
                {"path": "hp", "type": "number", "reason": "Core-loop survivability state."},
                {"path": "score", "type": "number", "reason": "Core-loop progress/result state."},
                {"path": "timer", "type": "number", "reason": "Time-bound playability state."},
            ],
            "inputActions": ["move", "retreat", "pause", "resume"],
        },
        requested_patch_level="L2",
    )


def ensure_root_production_task(
    *,
    repository: TaskRepository,
    workspace_id: str,
    workspace_dir: Path,
) -> dict[str, Any]:
    existing = repository.list(workspace_id)
    if existing:
        return {
            "schemaVersion": "loreweaver.task-bootstrap.v1",
            "status": "passed",
            "action": "noop",
            "reason": "workspace_task_repository_not_empty",
            "taskIds": [str(item.get("id")) for item in existing if item.get("id")],
        }

    manifest = _read_manifest(workspace_dir)
    source_spec_hash = _canonical_hash(manifest)
    task = _build_task(manifest, source_spec_hash)
    nodes = _node_summary(manifest)
    plan = {
        "schemaVersion": "loreweaver.root-production-plan.v1",
        "taskId": ROOT_TASK_ID,
        "sourceSpecHash": source_spec_hash,
        "generatedFrom": "manifest.json",
        "nodeCount": len(nodes),
        "nodes": nodes,
        "acceptanceCriteria": task["acceptanceCriteria"],
        "patchAuthority": task["patchAuthority"],
        "runtimeAuthority": "LoreWeaverRuntimeKernel",
        "notes": [
            "Deterministic bootstrap plan; no LLM claim is made.",
            "Department production work may satisfy Programmer/Auditor only; Player/Reviewer/Orchestrator remain independent.",
        ],
    }
    plan_rel = Path("loreweaver/tasks/root-production-architect-plan.json")
    _atomic_write_json(workspace_dir / plan_rel, plan)

    try:
        repository.create(workspace_id, task)
        updated = repository.append(
            workspace_id,
            ROOT_TASK_ID,
            role="architect",
            verdict="passed",
            summary="Deterministic root production plan derived from the current Workspace manifest.",
            evidence_refs=[
                {
                    "id": f"root-plan-{source_spec_hash[:16]}",
                    "kind": "plan",
                    "path": plan_rel.as_posix(),
                    "status": "passed",
                    "criterionIds": [],
                    "fixture": False,
                    "synthetic": False,
                    "stale": False,
                }
            ],
            findings=[],
            expected_last_round_hash=None,
        )
    except TaskRepositoryError as exc:
        raise TaskBootstrapError(str(exc)) from exc

    return {
        "schemaVersion": "loreweaver.task-bootstrap.v1",
        "status": "passed",
        "action": "root_task_created",
        "taskId": ROOT_TASK_ID,
        "taskStatus": updated.get("status"),
        "sourceSpecHash": source_spec_hash,
        "plan": plan_rel.as_posix(),
        "lastRoundHash": TaskRepository.last_round_hash(updated),
    }
