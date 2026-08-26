#!/usr/bin/env python3
"""Transactional Simple-Mode revision runner.

Flow:
  current assembled spec
    -> LLM proposal (no write)
    -> creator revision policy
    -> temporary workspace write
    -> real node-smoke validation
    -> rollback on failure OR commit + evidence stale on pass

The runner never fabricates release evidence. A successful revision deliberately
invalidates prior release evidence because the executable authoring identity changed.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

LORE_ROOT = Path(__file__).resolve().parents[2]
if str(LORE_ROOT) not in sys.path:
    sys.path.insert(0, str(LORE_ROOT))

from backend.agents import WorldBuilderAgent  # noqa: E402
from backend.creator_revision import evaluate_creator_revision, select_creator_agent_role  # noqa: E402

WORKSPACES_ROOT = LORE_ROOT / "data" / "workspaces"
SHARED_REPORTS = LORE_ROOT / "minigame_master" / "capabilities" / "reports"
NODE_SMOKE_SCRIPT = LORE_ROOT / "minigame_master" / "capabilities" / "verification" / "run_node_smoke.mjs"
INVALIDATOR = LORE_ROOT / "productize" / "jobs" / "invalidate-creator-revision-evidence.mjs"
CATALOG_KEYS = [
    "abilityCatalog",
    "passiveSkillCatalog",
    "characterDesignCatalog",
    "enemyDesignCatalog",
    "skillEffectCatalog",
    "audioCueCatalog",
]


def output(payload: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    raise SystemExit(code)


def safe_workspace(workspace_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9._-]+", workspace_id or "") or workspace_id in {".", ".."}:
        output({"status": "blocked", "reason": "invalid_workspace_id"}, 2)
    path = (WORKSPACES_ROOT / workspace_id).resolve()
    root = WORKSPACES_ROOT.resolve()
    if path.parent != root or not path.is_dir():
        output({"status": "blocked", "reason": "workspace_not_found"}, 2)
    return path


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def assembled_manifest(workspace: Path) -> dict[str, Any]:
    manifest_path = workspace / "manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError("manifest.json not found")
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict):
        raise RuntimeError("manifest.json must be an object")
    result = copy.deepcopy(manifest)

    nodes_dir = workspace / "loreweaver" / "nodes"
    if nodes_dir.is_dir():
        nodes = []
        for file in sorted(nodes_dir.glob("*.json")):
            try:
                value = read_json(file)
                if isinstance(value, dict):
                    nodes.append(value)
            except Exception:
                continue
        if nodes:
            nodes.sort(key=lambda item: item.get("id", 0))
            result["nodes"] = nodes

    catalogs_dir = workspace / "loreweaver" / "catalogs"
    if catalogs_dir.is_dir():
        for file in catalogs_dir.glob("*.json"):
            try:
                value = read_json(file)
                result[file.stem] = value
            except Exception:
                continue
    return result


def split_file_map(workspace: Path, spec: dict[str, Any]) -> dict[Path, Any]:
    """Return exact files that save_split_manifest semantics would write.

    We preserve unrelated files and stable node filenames. Node topology is already
    blocked by policy, so rollback only needs to restore files touched here.
    """
    root_manifest = copy.deepcopy(spec)
    files: dict[Path, Any] = {}

    nodes = root_manifest.pop("nodes", None)
    if isinstance(nodes, list):
        nodes_dir = workspace / "loreweaver" / "nodes"
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_id = int(node.get("id", 0))
            prefix = f"node-{node_id:02d}"
            existing = sorted(nodes_dir.glob(f"{prefix}*.json")) if nodes_dir.is_dir() else []
            target = existing[0] if existing else nodes_dir / f"{prefix}.json"
            files[target] = node

    catalogs_dir = workspace / "loreweaver" / "catalogs"
    for key in CATALOG_KEYS:
        if key in root_manifest:
            files[catalogs_dir / f"{key}.json"] = root_manifest.pop(key)

    files[workspace / "manifest.json"] = root_manifest
    return files


def snapshot_paths(files: dict[Path, Any]) -> dict[Path, bytes | None]:
    return {path: path.read_bytes() if path.exists() else None for path in files}


def write_file_map(files: dict[Path, Any]) -> None:
    for path, value in files.items():
        write_json(path, value)


def restore_snapshot(snapshot: dict[Path, bytes | None]) -> None:
    for path, content in snapshot.items():
        if content is None:
            path.unlink(missing_ok=True)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)


def card_ids(spec: dict[str, Any]) -> list[str]:
    result = set()
    for node in spec.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        gameplay = node.get("gameplay") or {}
        if isinstance(gameplay, dict):
            value = gameplay.get("cardId") or gameplay.get("id")
            if value:
                result.add(str(value))
    return sorted(result)


def spec_hash(spec: dict[str, Any]) -> str:
    encoded = json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def smoke_passed(report: dict[str, Any], exit_code: int) -> bool:
    if exit_code != 0 or report.get("status") != "passed":
        return False
    summary = report.get("summary") or {}
    failed = report.get("failed", summary.get("failed", 0))
    passed = report.get("passed", summary.get("passed", 0))
    try:
        return int(failed or 0) == 0 and int(passed or 0) > 0
    except (TypeError, ValueError):
        return False


def run_node_smoke(workspace_id: str) -> tuple[dict[str, Any], int, str, str]:
    if not NODE_SMOKE_SCRIPT.is_file():
        return {"status": "failed", "error": "node_smoke_script_missing"}, 2, "", ""
    with tempfile.TemporaryDirectory(prefix="lw-creator-revision-") as temp:
        out_path = Path(temp) / "node_smoke.json"
        cmd = [
            "node",
            str(NODE_SMOKE_SCRIPT),
            f"--workspace={workspace_id}",
            "--wall-ms=3000",
            "--simulated-sec=10",
            f"--out={out_path}",
        ]
        proc = subprocess.run(cmd, cwd=LORE_ROOT, capture_output=True, text=True, timeout=90)
        report: dict[str, Any] = {}
        if out_path.is_file():
            try:
                loaded = read_json(out_path)
                if isinstance(loaded, dict):
                    report = loaded
            except Exception as exc:
                report = {"status": "failed", "error": f"node_smoke_report_parse_failed:{exc}"}
        if not report:
            report = {"status": "failed", "error": "node_smoke_produced_no_report"}
        return report, int(proc.returncode), proc.stdout[-3000:], proc.stderr[-3000:]


def invalidate_release_evidence(workspace_id: str, cards: list[str], new_spec_hash: str) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "node",
            str(INVALIDATOR),
            f"--workspace-id={workspace_id}",
            f"--card-ids={','.join(cards)}",
            "--reason=creator_revision_applied",
            f"--spec-hash={new_spec_hash}",
        ],
        cwd=LORE_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    try:
        payload = json.loads(proc.stdout.strip()) if proc.stdout.strip() else {}
    except Exception:
        payload = {}
    return {
        "ok": proc.returncode == 0 and payload.get("status") == "passed",
        "exitCode": proc.returncode,
        "payload": payload,
        "stderr": proc.stderr[-2000:],
    }


def save_fresh_smoke(workspace: Path, report: dict[str, Any]) -> str:
    SHARED_REPORTS.mkdir(parents=True, exist_ok=True)
    shared = SHARED_REPORTS / "node_smoke_latest.json"
    workspace_report = workspace / "reports" / "creator_revision_node_smoke_latest.json"
    write_json(shared, report)
    write_json(workspace_report, report)
    return str(workspace_report.relative_to(LORE_ROOT)).replace(os.sep, "/")


def sync_latest_job(workspace_id: str, spec: dict[str, Any]) -> bool:
    try:
        from backend.database import SessionLocal
        from backend.models import Job

        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.workspace_id == workspace_id).order_by(Job.created_at.desc()).first()
            if not job:
                return False
            job.result_json = json.dumps(spec, ensure_ascii=False)
            db.commit()
            return True
        finally:
            db.close()
    except Exception:
        return False


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    value = json.loads(raw)
    return value if isinstance(value, dict) else {}


async def run(workspace_id: str, message: str) -> dict[str, Any]:
    workspace = safe_workspace(workspace_id)
    before = assembled_manifest(workspace)
    before_hash = spec_hash(before)
    agent_role = select_creator_agent_role(message)

    proposed = await WorldBuilderAgent.adjust_gdd(copy.deepcopy(before), message, agent_role)
    if not isinstance(proposed, dict):
        return {"status": "blocked", "reason": "agent_proposal_not_object"}

    policy = evaluate_creator_revision(before, proposed, message)
    policy_payload = policy.to_dict()
    if not policy.allowed:
        return {
            "status": "blocked",
            "reason": "creator_revision_policy_blocked",
            "message": message,
            "beforeSpecHash": before_hash,
            "policy": policy_payload,
            "diff": policy.diff,
        }

    proposed_files = split_file_map(workspace, proposed)
    snapshot = snapshot_paths(proposed_files)
    write_file_map(proposed_files)

    smoke_report: dict[str, Any] = {}
    exit_code = 2
    stdout = ""
    stderr = ""
    try:
        smoke_report, exit_code, stdout, stderr = run_node_smoke(workspace_id)
    except Exception as exc:
        smoke_report = {"status": "failed", "error": str(exc)}
        exit_code = 2

    if not smoke_passed(smoke_report, exit_code):
        restore_snapshot(snapshot)
        return {
            "status": "rolled_back",
            "reason": "targeted_validation_failed",
            "message": message,
            "beforeSpecHash": before_hash,
            "policy": policy_payload,
            "diff": policy.diff,
            "validation": {
                "validator": "node_smoke",
                "status": "failed",
                "exitCode": exit_code,
                "report": smoke_report,
                "stdout": stdout,
                "stderr": stderr,
            },
        }

    committed = assembled_manifest(workspace)
    committed_hash = spec_hash(committed)
    invalidation = invalidate_release_evidence(workspace_id, card_ids(committed), committed_hash)
    if not invalidation.get("ok"):
        # Evidence invalidation is part of the transaction. If it fails we restore
        # authoring files; we never leave a new spec paired with old release evidence.
        restore_snapshot(snapshot)
        return {
            "status": "rolled_back",
            "reason": "release_evidence_invalidation_failed",
            "message": message,
            "beforeSpecHash": before_hash,
            "policy": policy_payload,
            "diff": policy.diff,
            "validation": {"validator": "node_smoke", "status": "passed", "report": smoke_report},
            "invalidation": invalidation,
        }

    smoke_path = save_fresh_smoke(workspace, smoke_report)
    jobSynced = sync_latest_job(workspace_id, committed)
    report = {
        "schemaVersion": "loreweaver.creator-revision.v1",
        "status": "applied",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "workspaceId": workspace_id,
        "message": message,
        "agentRole": agent_role,
        "patchLevel": policy.patch_level,
        "beforeSpecHash": before_hash,
        "afterSpecHash": committed_hash,
        "diff": policy.diff,
        "validation": {
            "validator": "node_smoke",
            "status": "passed",
            "report": smoke_report,
            "evidence": smoke_path,
        },
        "releaseEvidenceInvalidated": True,
        "jobSynced": jobSynced,
    }
    report_path = workspace / "reports" / "creator_revision_latest.json"
    write_json(report_path, report)
    return {
        **report,
        "spec": committed,
        "report": str(report_path.relative_to(LORE_ROOT)).replace(os.sep, "/"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", required=True)
    args = parser.parse_args()
    try:
        request = read_request()
        message = str(request.get("message") or "").strip()
        if not message:
            output({"status": "blocked", "reason": "message_required"}, 2)
        result = asyncio.run(run(args.workspace_id, message))
        code = 0 if result.get("status") == "applied" else 2
        output(result, code)
    except SystemExit:
        raise
    except Exception as exc:
        output({"status": "failed", "reason": "creator_revision_runner_error", "error": str(exc)}, 2)


if __name__ == "__main__":
    main()
