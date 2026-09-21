"""Deterministic sprite-gen manifest adapter for LoreWeaver."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

UPSTREAM = "https://github.com/aldegad/sprite-gen"
PIN = "eb941234bf2d7e5ea9d5f2f180494932a109b9de"
VERSION = "2.5.3"


class BridgeError(RuntimeError):
    pass


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower().replace("-", "_")).strip("_")
    if not value:
        raise BridgeError("invalid_name")
    return value


def rel(ws: Path, path: Path) -> str:
    return path.resolve().relative_to(ws.resolve()).as_posix()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise BridgeError(f"invalid_json:{path}") from exc
    if not isinstance(data, dict):
        raise BridgeError(f"invalid_json_object:{path}")
    return data


def candidate_dir(ws: Path, character: str) -> Path:
    return ws / "assets" / "imagegen" / "sprite-gen" / slug(character) / "loreweaver"


def rect(raw: Any, state: str, index: int, width: int, height: int) -> dict[str, int]:
    try:
        out = {k: int(raw[k]) for k in ("x", "y", "w", "h")}
    except (TypeError, KeyError, ValueError) as exc:
        raise BridgeError(f"bad_rect:{state}:{index}") from exc
    if min(out["x"], out["y"]) < 0 or min(out["w"], out["h"]) <= 0 or out["x"] + out["w"] > width or out["y"] + out["h"] > height:
        raise BridgeError(f"bad_rect:{state}:{index}")
    return out


def convert(source: dict[str, Any], prefix: str, atlas_path: str, provenance_path: str, status: str) -> dict[str, Any]:
    prefix = slug(prefix)
    layout = source.get("frame_layout") or {}
    rows = layout.get("rows")
    if not isinstance(rows, dict) or not rows:
        raise BridgeError("frame_layout_missing")
    try:
        width, height = int(layout["sheetWidth"]), int(layout["sheetHeight"])
    except (KeyError, TypeError, ValueError) as exc:
        raise BridgeError("frame_layout_invalid") from exc
    timings = ((source.get("animation") or {}).get("rows") or {})
    frames: dict[str, Any] = {}
    clips: dict[str, Any] = {}
    first = idle = None
    for raw_state, raw_frames in rows.items():
        state = slug(raw_state)
        if not isinstance(raw_frames, list) or not raw_frames:
            raise BridgeError(f"state_frames_missing:{state}")
        boxes = [rect(item, state, i, width, height) for i, item in enumerate(raw_frames)]
        first = first or boxes[0]
        if state == "idle":
            idle = boxes[0]
        base = f"{prefix}_{state}"
        frames[base] = {"frame": boxes[0]}
        keys = []
        for i, box in enumerate(boxes):
            key = f"{base}_{i}"
            frames[key] = {"frame": box}
            keys.append(key)
        timing = timings.get(raw_state, {}) if isinstance(timings, dict) else {}
        timing = timing if isinstance(timing, dict) else {}
        clips[state] = {"keys": keys, "fps": int(timing.get("fps") or 8), "loop": bool(timing.get("loop", True))}
    anchor = idle or first
    frames[prefix] = {"frame": anchor}
    return {
        "schemaVersion": "loreweaver.imagegen-manifest.v1",
        "generatedAtlasStatus": status,
        "generationStatus": "sprite-gen",
        "generator": {"name": "sprite-gen", "version": VERSION, "sourceRepository": UPSTREAM, "sourceCommit": PIN},
        "atlasImage": atlas_path,
        "provenancePath": provenance_path,
        "atlasSize": {"w": width, "h": height},
        "frameSize": {"w": int(layout.get("cellWidth") or anchor["w"]), "h": int(layout.get("cellHeight") or anchor["h"])},
        "semanticPrefix": prefix,
        "clips": clips,
        "frames": frames,
    }


def adopt(ws: Path, source_run: Path, character: str, prefix: str) -> dict[str, Any]:
    try:
        source_run.resolve().relative_to(ws.resolve())
    except ValueError as exc:
        raise BridgeError("run_outside_workspace") from exc
    source_manifest = source_run / "manifest.json"
    source = read_json(source_manifest)
    if source.get("degraded_static_fallback") is True:
        raise BridgeError("degraded_static_fallback_rejected")
    atlas = (source_run / str(source.get("sprite_sheet_alpha") or source.get("game_input") or "sprite-sheet-alpha.png")).resolve()
    try:
        atlas.relative_to(source_run.resolve())
    except ValueError as exc:
        raise BridgeError("atlas_outside_run") from exc
    if not atlas.is_file():
        raise BridgeError("atlas_missing")
    out = candidate_dir(ws, character)
    out.mkdir(parents=True, exist_ok=True)
    out_atlas, out_manifest, out_prov = out / "atlas.png", out / "manifest.json", out / "provenance.json"
    shutil.copy2(atlas, out_atlas)
    manifest = convert(source, prefix, rel(ws, out_atlas), rel(ws, out_prov), "sprite_gen_candidate")
    provenance = {
        "schemaVersion": "loreweaver.sprite-gen-provenance.v1", "provider": "sprite-gen", "sourceRepository": UPSTREAM,
        "sourceCommit": PIN, "sourceVersion": VERSION, "sourceLicense": "Apache-2.0", "sourceRun": rel(ws, source_run),
        "sourceManifest": rel(ws, source_manifest), "sourceAtlas": rel(ws, atlas), "sourceAtlasSha256": digest(atlas),
        "characterId": slug(character), "semanticPrefix": slug(prefix), "adoptedAt": datetime.now(timezone.utc).isoformat(), "promoted": False,
    }
    out_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    out_prov.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"status": "candidate_ready", "candidateDir": rel(ws, out), "frameCount": len(manifest["frames"]), "clips": sorted(manifest["clips"])}


def promote(ws: Path, character: str, force: bool) -> dict[str, Any]:
    source = candidate_dir(ws, character)
    atlas, manifest_path, provenance_path = source / "atlas.png", source / "manifest.json", source / "provenance.json"
    if not all(p.is_file() for p in (atlas, manifest_path, provenance_path)):
        raise BridgeError("candidate_missing")
    runtime = ws / "assets" / "imagegen"
    runtime.mkdir(parents=True, exist_ok=True)
    target_atlas = runtime / "atlas.png"
    if target_atlas.exists() and digest(target_atlas) != digest(atlas) and not force:
        raise BridgeError("runtime_art_exists_use_force")
    manifest, provenance = read_json(manifest_path), read_json(provenance_path)
    manifest.update({"generatedAtlasStatus": "sprite_gen_promoted", "atlasImage": "assets/imagegen/atlas.png", "provenancePath": "assets/imagegen/provenance.json"})
    provenance.update({"promoted": True, "promotedAt": datetime.now(timezone.utc).isoformat(), "runtimeAtlasSha256": digest(atlas)})
    shutil.copy2(atlas, target_atlas)
    (runtime / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (runtime / "manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    (runtime / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"status": "promoted", "atlas": "assets/imagegen/atlas.png", "manifest": "assets/imagegen/manifest.json", "frameCount": len(manifest.get("frames") or {})}
