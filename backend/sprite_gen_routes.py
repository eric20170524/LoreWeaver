"""FastAPI routes for the LoreWeaver sprite-gen bridge."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["sprite-gen"])

LORE_ROOT = Path(__file__).resolve().parents[1]
BRIDGE = LORE_ROOT / "minigame_master" / "capabilities" / "imagegen" / "sprite_gen_bridge.py"
DEFAULT_TIMEOUT_SECONDS = int(os.getenv("SPRITE_GEN_TIMEOUT_SECONDS", "1800"))


def _run_bridge(args: list[str], *, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    if not BRIDGE.is_file():
        raise HTTPException(status_code=503, detail=f"sprite-gen bridge missing: {BRIDGE}")

    try:
        proc = subprocess.run(
            [sys.executable, str(BRIDGE), *args],
            cwd=str(LORE_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="sprite-gen operation timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"sprite-gen bridge unavailable: {exc}") from exc

    raw = (proc.stdout if proc.returncode == 0 else proc.stderr).strip()
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        payload = {
            "status": "failed",
            "reason": "sprite_gen_bridge_invalid_output",
            "exitCode": proc.returncode,
            "output": raw[-4000:],
        }

    if proc.returncode != 0:
        reason = str(payload.get("reason") or "sprite-gen bridge failed")
        status_code = 503 if reason.startswith("sprite_gen_not_installed") else 422
        raise HTTPException(status_code=status_code, detail=payload)
    return payload


def _required(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key) or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail=f"{key} is required")
    return value


@router.get("/imagegen/sprite-gen/status")
def sprite_gen_status():
    return {"success": True, "data": _run_bridge(["status"], timeout=30)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/generate")
def sprite_gen_generate(ws_id: str, payload: dict[str, Any]):
    provider = str(payload.get("provider") or os.getenv("SPRITE_GEN_PROVIDER") or "codex").strip().lower()
    if provider not in {"codex", "grok"}:
        raise HTTPException(status_code=400, detail="provider must be codex or grok")

    args = [
        "generate",
        "--workspace", ws_id,
        "--base-image", _required(payload, "baseImage"),
        "--character-id", _required(payload, "characterId"),
        "--semantic-prefix", str(payload.get("semanticPrefix") or "player"),
        "--states", str(payload.get("states") or "idle,walk,attack,hurt,death"),
        "--provider", provider,
        "--cell-size", str(int(payload.get("cellSize") or 256)),
        "--concurrency", str(int(payload.get("concurrency") or 4)),
    ]
    if payload.get("model"):
        args += ["--model", str(payload["model"])]
    if payload.get("logicalHeight") is not None:
        args += ["--logical-height", str(int(payload["logicalHeight"]))]
    if bool(payload.get("force")):
        args.append("--force")
    if bool(payload.get("facePlusX")):
        args.append("--face-plus-x")

    return {"success": True, "data": _run_bridge(args)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/adopt")
def sprite_gen_adopt(ws_id: str, payload: dict[str, Any]):
    args = [
        "adopt",
        "--workspace", ws_id,
        "--run-dir", _required(payload, "runDir"),
        "--character-id", _required(payload, "characterId"),
        "--semantic-prefix", str(payload.get("semanticPrefix") or "player"),
    ]
    return {"success": True, "data": _run_bridge(args, timeout=120)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/promote")
def sprite_gen_promote(ws_id: str, payload: dict[str, Any]):
    args = [
        "promote",
        "--workspace", ws_id,
        "--character-id", _required(payload, "characterId"),
    ]
    if bool(payload.get("force")):
        args.append("--force")
    return {"success": True, "data": _run_bridge(args, timeout=120)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/pack")
def sprite_gen_pack(ws_id: str, payload: dict[str, Any]):
    characters = payload.get("characters") or payload.get("characterIds")
    if isinstance(characters, list):
        character_arg = ",".join(str(item).strip() for item in characters if str(item).strip())
    else:
        character_arg = str(characters or "").strip()
    if not character_arg:
        raise HTTPException(status_code=400, detail="characters is required")
    args = [
        "pack",
        "--workspace", ws_id,
        "--characters", character_arg,
        "--columns", str(int(payload.get("columns") or 2)),
        "--max-edge", str(int(payload.get("maxEdge") or 4096)),
    ]
    aliases = payload.get("aliases") or []
    if isinstance(aliases, dict):
        aliases = [f"{src}={','.join(dst)}" for src, dst in aliases.items() if isinstance(dst, (list, tuple))]
    for item in aliases:
        args += ["--alias", str(item)]
    if bool(payload.get("force")):
        args.append("--force")
    return {"success": True, "data": _run_bridge(args, timeout=120)}
