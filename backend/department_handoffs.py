"""Scope-aware department handoff counts and evidence-backed resolution."""

from __future__ import annotations

import hashlib
import os
import re
from typing import Any


SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def refresh_counts(state: dict, handoffs: list[dict]) -> dict:
    counts: dict[tuple[str, str], int] = {}
    for handoff in handoffs:
        if handoff.get("status") != "open":
            continue
        key = (str(handoff.get("unitId") or "trunk"), str(handoff.get("to") or ""))
        counts[key] = counts.get(key, 0) + 1

    scopes = state.get("scopes") or {}
    trunk = ((scopes.get("trunk") or {}).get("departments") or {})
    for department_id, runtime in trunk.items():
        if isinstance(runtime, dict):
            runtime["openHandoffCount"] = counts.get(("trunk", department_id), 0)
    for node_id, bucket in (scopes.get("nodes") or {}).items():
        for department_id, runtime in ((bucket or {}).get("departments") or {}).items():
            if isinstance(runtime, dict):
                runtime["openHandoffCount"] = counts.get((f"node:{node_id}", department_id), 0)

    # The flat map is a compatibility view of the active scope in v2.
    active = state.get("activeScope") or {}
    active_unit = (
        f"node:{(active.get('nodeIds') or [None])[0]}"
        if active.get("kind") == "nodes" else "trunk"
    )
    for department_id, runtime in (state.get("departments") or {}).items():
        if isinstance(runtime, dict):
            runtime["openHandoffCount"] = counts.get((active_unit, department_id), 0)
    return state


def acceptance_criteria(payload: dict, summary: str) -> list[str]:
    raw = payload.get("acceptanceCriteria") or payload.get("needs") or []
    if not isinstance(raw, list):
        raise ValueError("acceptanceCriteria must be an array")
    criteria = [str(item).strip() for item in raw if str(item).strip()]
    return criteria or [summary]


def verify_evidence_refs(raw: Any, repo_root: str) -> list[dict]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("resolved handoff requires evidenceRefs")
    root = os.path.realpath(repo_root)
    verified: list[dict] = []
    for ref in raw:
        if not isinstance(ref, dict):
            raise ValueError("evidenceRefs entries must be objects")
        supplied = str(ref.get("path") or "").strip()
        if not supplied:
            raise ValueError("evidenceRefs.path is required")
        candidate = os.path.realpath(
            supplied if os.path.isabs(supplied) else os.path.join(root, supplied)
        )
        if not candidate.startswith(root + os.sep) or not os.path.isfile(candidate):
            raise ValueError("evidenceRefs.path must be a file inside the repository")
        hasher = hashlib.sha256()
        with open(candidate, "rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                hasher.update(block)
        actual = hasher.hexdigest()
        claimed = str(ref.get("sha256") or "").lower().strip()
        if claimed and (not SHA256_RE.fullmatch(claimed) or claimed != actual):
            raise ValueError("evidenceRefs.sha256 does not match the file")
        verified.append({"path": os.path.relpath(candidate, root), "sha256": actual})
    return verified


def resolution_fields(handoff: dict, payload: dict, repo_root: str) -> dict:
    if handoff.get("status") != "open":
        raise ValueError("handoff is already closed")
    status = str(payload.get("status") or "resolved")
    if status not in {"resolved", "wontfix"}:
        raise ValueError("status must be resolved or wontfix")
    note = str(payload.get("note") or "").strip()
    if not note:
        raise ValueError("resolution note is required")
    if status == "wontfix":
        if handoff.get("type") == "reject":
            raise ValueError("reject handoff cannot be waived here")
        return {"status": status, "resolveNote": note, "evidenceRefs": []}
    refs = verify_evidence_refs(payload.get("evidenceRefs"), repo_root)
    return {"status": status, "resolveNote": note, "evidenceRefs": refs}
