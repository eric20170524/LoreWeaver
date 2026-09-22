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
    subject = str(payload.get("subject") or "character").strip().lower()
    if subject not in {"character", "effect"}:
        raise HTTPException(status_code=400, detail="subject must be character or effect")
    asset_id = str(payload.get("assetId") or payload.get("characterId") or "").strip()
    if not asset_id:
        raise HTTPException(status_code=400, detail="assetId is required")

    args = [
        "generate",
        "--workspace", ws_id,
        "--base-image", _required(payload, "baseImage"),
        "--asset-id", asset_id,
        "--subject", subject,
        "--provider", provider,
        "--cell-size", str(int(payload.get("cellSize") or 256)),
        "--concurrency", str(int(payload.get("concurrency") or 4)),
    ]
    if payload.get("semanticPrefix"):
        args += ["--semantic-prefix", str(payload["semanticPrefix"])]
    if payload.get("states"):
        states = payload["states"]
        if isinstance(states, list):
            states = ",".join(str(item) for item in states)
        args += ["--states", str(states)]
    if payload.get("layerContract") is not None:
        if not isinstance(payload["layerContract"], dict):
            raise HTTPException(status_code=400, detail="layerContract must be an object")
        args += ["--layer-contract-json", json.dumps(payload["layerContract"], ensure_ascii=False)]
    if payload.get("model"):
        args += ["--model", str(payload["model"])]
    if payload.get("logicalHeight") is not None:
        args += ["--logical-height", str(int(payload["logicalHeight"]))]
    if bool(payload.get("force")):
        args.append("--force")

    return {"success": True, "data": _run_bridge(args)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/compose-layer")
def sprite_gen_compose_layer(ws_id: str, payload: dict[str, Any]):
    args = [
        "compose-layer",
        "--workspace", ws_id,
        "--source-asset-id", _required(payload, "sourceAssetId"),
        "--layer-name", _required(payload, "layerName"),
    ]
    if payload.get("assetId"):
        args += ["--asset-id", str(payload["assetId"])]
    if payload.get("semanticPrefix"):
        args += ["--semantic-prefix", str(payload["semanticPrefix"])]
    return {"success": True, "data": _run_bridge(args, timeout=300)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/video-set")
def sprite_gen_video_set(ws_id: str, payload: dict[str, Any]):
    asset_id = str(payload.get("assetId") or payload.get("characterId") or "").strip()
    if not asset_id:
        raise HTTPException(status_code=400, detail="assetId is required")
    args = [
        "video-set",
        "--workspace", ws_id,
        "--base-image", _required(payload, "baseImage"),
        "--asset-id", asset_id,
        "--states", ",".join(str(x) for x in payload.get("states")) if isinstance(payload.get("states"), list) else str(payload.get("states") or "idle,walk,run,jump,attack"),
        "--direction", str(payload.get("direction") or "side"),
        "--facing", str(payload.get("facing") or "right"),
        "--facing-fix", str(payload.get("facingFix") or "none"),
        "--anchor", str(payload.get("anchor") or "feet"),
        "--concurrency", str(int(payload.get("concurrency") or 3)),
    ]
    if payload.get("semanticPrefix"):
        args += ["--semantic-prefix", str(payload["semanticPrefix"])]
    if payload.get("character"):
        args += ["--character", str(payload["character"])]
    if bool(payload.get("force")):
        args.append("--force")
    return {"success": True, "data": _run_bridge(args)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/adopt")
def sprite_gen_adopt(ws_id: str, payload: dict[str, Any]):
    asset_id = str(payload.get("assetId") or payload.get("characterId") or "").strip()
    if not asset_id:
        raise HTTPException(status_code=400, detail="assetId is required")
    args = [
        "adopt",
        "--workspace", ws_id,
        "--run-dir", _required(payload, "runDir"),
        "--asset-id", asset_id,
        "--semantic-prefix", _required(payload, "semanticPrefix"),
    ]
    return {"success": True, "data": _run_bridge(args, timeout=120)}


@router.post("/workspaces/{ws_id}/imagegen/sprite-gen/promote")
def sprite_gen_promote(ws_id: str, payload: dict[str, Any]):
    asset_id = str(payload.get("assetId") or payload.get("characterId") or "").strip()
    if not asset_id:
        raise HTTPException(status_code=400, detail="assetId is required")
    args = [
        "promote",
        "--workspace", ws_id,
        "--asset-id", asset_id,
    ]
    if bool(payload.get("force")):
        args.append("--force")
    return {"success": True, "data": _run_bridge(args, timeout=120)}
