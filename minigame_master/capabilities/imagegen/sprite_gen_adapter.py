"""Deterministic sprite-gen manifest adapter and bundle publisher for LoreWeaver."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

UPSTREAM = "https://github.com/aldegad/sprite-gen"
PIN = "eb941234bf2d7e5ea9d5f2f180494932a109b9de"
VERSION = "2.5.3"
# WebGL commonly caps a single texture at 4096. Vertical-stacking character
# sheets past that edge silently drops later characters (Node 2 champion).
MAX_ATLAS_EDGE = 4096
PACK_COLUMNS = 2
BUNDLE_WIDTH = 2048
BUNDLE_PADDING = 2


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


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def candidate_dir(ws: Path, asset_id: str) -> Path:
    return ws / "assets" / "imagegen" / "sprite-gen" / slug(asset_id) / "loreweaver"


def rect(raw: Any, state: str, index: int, width: int, height: int) -> dict[str, int]:
    try:
        out = {k: int(raw[k]) for k in ("x", "y", "w", "h")}
    except (TypeError, KeyError, ValueError) as exc:
        raise BridgeError(f"bad_rect:{state}:{index}") from exc
    if min(out["x"], out["y"]) < 0 or min(out["w"], out["h"]) <= 0 or out["x"] + out["w"] > width or out["y"] + out["h"] > height:
        raise BridgeError(f"bad_rect:{state}:{index}")
    return out


def convert(
    source: dict[str, Any],
    prefix: str,
    atlas_path: str,
    provenance_path: str,
    status: str,
    *,
    subject: str = "character",
) -> dict[str, Any]:
    prefix = slug(prefix)
    subject = subject if subject in {"effect", "layer", "video-loop"} else "character"
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
        raw_fps = timing.get("fps") or 8
        try:
            fps = float(raw_fps)
        except (TypeError, ValueError) as exc:
            raise BridgeError(f"state_fps_invalid:{state}") from exc
        if fps <= 0:
            raise BridgeError(f"state_fps_invalid:{state}")
        clips[state] = {
            "keys": keys,
            "fps": int(fps) if fps.is_integer() else round(fps, 4),
            "loop": bool(timing.get("loop", True)),
        }
    anchor = idle or first
    frames[prefix] = {"frame": anchor}
    return {
        "schemaVersion": "loreweaver.imagegen-manifest.v2",
        "generatedAtlasStatus": status,
        "generationStatus": "sprite-gen",
        "generator": {
            "name": "sprite-gen",
            "version": VERSION,
            "sourceRepository": UPSTREAM,
            "sourceCommit": PIN,
        },
        "assetKind": subject,
        "atlasImage": atlas_path,
        "provenancePath": provenance_path,
        "atlasSize": {"w": width, "h": height},
        "frameSize": {
            "w": int(layout.get("cellWidth") or anchor["w"]),
            "h": int(layout.get("cellHeight") or anchor["h"]),
        },
        "semanticPrefix": prefix,
        "clips": clips,
        "clipSets": {prefix: clips},
        "frames": frames,
    }


def _subject_for_run(source_run: Path, source_manifest: dict[str, Any]) -> str:
    subject = source_manifest.get("subject")
    request_path = source_run / "sprite-request.json"
    if not subject and request_path.is_file():
        try:
            subject = read_json(request_path).get("subject")
        except BridgeError:
            subject = None
    return "effect" if subject == "effect" else "character"


def adopt(ws: Path, source_run: Path, asset_id: str, prefix: str) -> dict[str, Any]:
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
    subject = _subject_for_run(source_run, source)
    out = candidate_dir(ws, asset_id)
    out.mkdir(parents=True, exist_ok=True)
    out_atlas, out_manifest, out_prov = out / "atlas.png", out / "manifest.json", out / "provenance.json"
    shutil.copy2(atlas, out_atlas)
    manifest = convert(
        source,
        prefix,
        rel(ws, out_atlas),
        rel(ws, out_prov),
        "sprite_gen_candidate",
        subject=subject,
    )
    provenance = {
        "schemaVersion": "loreweaver.sprite-gen-provenance.v2",
        "provider": "sprite-gen",
        "sourceRepository": UPSTREAM,
        "sourceCommit": PIN,
        "sourceVersion": VERSION,
        "sourceLicense": "Apache-2.0",
        "sourceRun": rel(ws, source_run),
        "sourceManifest": rel(ws, source_manifest),
        "sourceAtlas": rel(ws, atlas),
        "sourceAtlasSha256": digest(atlas),
        "assetId": slug(asset_id),
        "characterId": slug(asset_id),  # backwards-compatible alias
        "assetKind": subject,
        "semanticPrefix": slug(prefix),
        "adoptedAt": datetime.now(timezone.utc).isoformat(),
        "promoted": False,
    }
    write_json(out_manifest, manifest)
    (out / "manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    write_json(out_prov, provenance)
    return {
        "status": "candidate_ready",
        "candidateDir": rel(ws, out),
        "assetId": slug(asset_id),
        "assetKind": subject,
        "semanticPrefix": slug(prefix),
        "frameCount": len(manifest["frames"]),
        "clips": sorted(manifest["clips"]),
    }



def _write_candidate(
    ws: Path,
    *,
    asset_id: str,
    prefix: str,
    asset_kind: str,
    source_manifest: Path,
    source_atlas: Path,
    source_run: Path,
    source: dict[str, Any],
    provenance_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out = candidate_dir(ws, asset_id)
    out.mkdir(parents=True, exist_ok=True)
    out_atlas, out_manifest, out_prov = out / "atlas.png", out / "manifest.json", out / "provenance.json"
    shutil.copy2(source_atlas, out_atlas)
    manifest = convert(
        source,
        prefix,
        rel(ws, out_atlas),
        rel(ws, out_prov),
        "sprite_gen_candidate",
        subject=asset_kind,
    )
    provenance = {
        "schemaVersion": "loreweaver.sprite-gen-provenance.v2",
        "provider": "sprite-gen",
        "sourceRepository": UPSTREAM,
        "sourceCommit": PIN,
        "sourceVersion": VERSION,
        "sourceLicense": "Apache-2.0",
        "sourceRun": rel(ws, source_run),
        "sourceManifest": rel(ws, source_manifest),
        "sourceAtlas": rel(ws, source_atlas),
        "sourceAtlasSha256": digest(source_atlas),
        "assetId": slug(asset_id),
        "characterId": slug(asset_id),
        "assetKind": asset_kind,
        "semanticPrefix": slug(prefix),
        "adoptedAt": datetime.now(timezone.utc).isoformat(),
        "promoted": False,
    }
    if provenance_extra:
        provenance.update(provenance_extra)
    write_json(out_manifest, manifest)
    (out / "manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    write_json(out_prov, provenance)
    return {
        "status": "candidate_ready",
        "candidateDir": rel(ws, out),
        "assetId": slug(asset_id),
        "assetKind": asset_kind,
        "semanticPrefix": slug(prefix),
        "frameCount": len(manifest["frames"]),
        "clips": sorted(manifest["clips"]),
    }


def adopt_layer(
    ws: Path,
    source_run: Path,
    layer_name: str,
    asset_id: str,
    prefix: str,
) -> dict[str, Any]:
    name = slug(layer_name)
    layers_dir = source_run / "layers"
    source_manifest = layers_dir / f"{name}.manifest.json"
    if not source_manifest.is_file():
        raise BridgeError(f"layer_manifest_missing:{name}")
    source = read_json(source_manifest)
    source_atlas = (layers_dir / str(source.get("sprite_sheet_alpha") or source.get("game_input") or f"{name}.png")).resolve()
    try:
        source_atlas.relative_to(layers_dir.resolve())
    except ValueError as exc:
        raise BridgeError(f"layer_atlas_outside_run:{name}") from exc
    if not source_atlas.is_file():
        raise BridgeError(f"layer_atlas_missing:{name}")
    return _write_candidate(
        ws,
        asset_id=asset_id,
        prefix=prefix,
        asset_kind="layer",
        source_manifest=source_manifest,
        source_atlas=source_atlas,
        source_run=source_run,
        source=source,
        provenance_extra={"sourceKind": "layer", "layerName": name},
    )


def adopt_video_set(
    ws: Path,
    set_dir: Path,
    asset_id: str,
    prefix: str,
    *,
    direction: str = "side",
    states: list[str] | None = None,
) -> dict[str, Any]:
    report_path = set_dir / "set.report.json"
    report = read_json(report_path)
    failed = report.get("failed") or []
    if failed:
        raise BridgeError(f"video_set_has_failures:{','.join(str(x) for x in failed)}")
    items = report.get("items")
    if not isinstance(items, list) or not items:
        raise BridgeError("video_set_items_missing")

    wanted = {slug(state) for state in states} if states else None
    rows: dict[str, list[dict[str, int]]] = {}
    timings: dict[str, dict[str, Any]] = {}
    strips: list[tuple[str, Path, dict[str, Any], Image.Image]] = []
    for item in items:
        if not isinstance(item, dict) or not item.get("ok"):
            continue
        if str(item.get("direction")) != direction:
            continue
        state = slug(str(item.get("state") or ""))
        if wanted is not None and state not in wanted:
            continue
        item_name = str(item.get("item") or f"{direction}-{state}")
        item_dir = (set_dir / item_name).resolve()
        try:
            item_dir.relative_to(set_dir.resolve())
        except ValueError as exc:
            raise BridgeError(f"video_item_outside_set:{item_name}") from exc
        loop_dir = item_dir / "loop"
        meta_path = loop_dir / f"{item_name}.strip.json"
        strip_path = loop_dir / f"{item_name}.strip.png"
        meta = read_json(meta_path)
        try:
            frames = int(meta["frames"])
            width = int(meta["w"])
            height = int(meta["h"])
            delay_ms = float(meta["delay_ms"])
        except (KeyError, TypeError, ValueError) as exc:
            raise BridgeError(f"video_strip_meta_invalid:{item_name}") from exc
        if frames <= 0 or width <= 0 or height <= 0 or delay_ms <= 0:
            raise BridgeError(f"video_strip_meta_invalid:{item_name}")
        try:
            image = Image.open(strip_path).convert("RGBA")
        except OSError as exc:
            raise BridgeError(f"video_strip_invalid:{item_name}") from exc
        if image.width != frames * width or image.height != height:
            raise BridgeError(f"video_strip_geometry_mismatch:{item_name}")
        strips.append((state, strip_path, meta, image))

    if not strips:
        raise BridgeError(f"video_set_no_states:{direction}")

    atlas_width = max(image.width for _, _, _, image in strips)
    atlas_height = sum(image.height for _, _, _, image in strips) + BUNDLE_PADDING * (len(strips) - 1)
    atlas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
    y = 0
    state_sources = []
    for state, strip_path, meta, image in sorted(strips, key=lambda row: row[0]):
        atlas.alpha_composite(image, (0, y))
        frame_w, frame_h = int(meta["w"]), int(meta["h"])
        rows[state] = [
            {"x": i * frame_w, "y": y, "w": frame_w, "h": frame_h}
            for i in range(int(meta["frames"]))
        ]
        timings[state] = {
            "fps": round(1000.0 / float(meta["delay_ms"]), 4),
            "loop": bool(meta.get("loop", True)),
            "kind": str(meta.get("kind") or "periodic"),
        }
        state_sources.append({
            "state": state,
            "strip": rel(ws, strip_path),
            "stripSha256": digest(strip_path),
            "frames": int(meta["frames"]),
            "delayMs": float(meta["delay_ms"]),
            "loop": bool(meta.get("loop", True)),
            "kind": str(meta.get("kind") or "periodic"),
        })
        y += image.height + BUNDLE_PADDING

    out = candidate_dir(ws, asset_id)
    out.mkdir(parents=True, exist_ok=True)
    out_atlas = out / "atlas.png"
    atlas.save(out_atlas)
    synthetic = {
        "sprite_sheet_alpha": "atlas.png",
        "degraded_static_fallback": False,
        "animation": {"rows": timings},
        "frame_layout": {
            "sheetWidth": atlas.width,
            "sheetHeight": atlas.height,
            "cellWidth": max(int(meta["w"]) for _, _, meta, _ in strips),
            "cellHeight": max(int(meta["h"]) for _, _, meta, _ in strips),
            "rows": rows,
        },
    }
    out_manifest, out_prov = out / "manifest.json", out / "provenance.json"
    manifest = convert(
        synthetic,
        prefix,
        rel(ws, out_atlas),
        rel(ws, out_prov),
        "sprite_gen_candidate",
        subject="video-loop",
    )
    # Preserve video-loop kind alongside the normalized runtime fields.
    for state, timing in timings.items():
        manifest["clips"][state]["kind"] = timing["kind"]
        manifest["clipSets"][slug(prefix)][state]["kind"] = timing["kind"]
    provenance = {
        "schemaVersion": "loreweaver.sprite-gen-provenance.v2",
        "provider": "sprite-gen",
        "sourceRepository": UPSTREAM,
        "sourceCommit": PIN,
        "sourceVersion": VERSION,
        "sourceLicense": "Apache-2.0",
        "sourceRun": rel(ws, set_dir),
        "sourceManifest": rel(ws, report_path),
        "sourceAtlas": rel(ws, out_atlas),
        "sourceAtlasSha256": digest(out_atlas),
        "sourceKind": "video-set",
        "assetId": slug(asset_id),
        "characterId": slug(asset_id),
        "assetKind": "video-loop",
        "semanticPrefix": slug(prefix),
        "direction": direction,
        "states": state_sources,
        "adoptedAt": datetime.now(timezone.utc).isoformat(),
        "promoted": False,
    }
    write_json(out_manifest, manifest)
    (out / "manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    write_json(out_prov, provenance)
    return {
        "status": "candidate_ready",
        "candidateDir": rel(ws, out),
        "assetId": slug(asset_id),
        "assetKind": "video-loop",
        "semanticPrefix": slug(prefix),
        "frameCount": len(manifest["frames"]),
        "clips": sorted(manifest["clips"]),
        "direction": direction,
    }


def _candidate(ws: Path, asset_id: str) -> dict[str, Any]:
    root = candidate_dir(ws, asset_id)
    atlas, manifest_path, provenance_path = root / "atlas.png", root / "manifest.json", root / "provenance.json"
    if not all(p.is_file() for p in (atlas, manifest_path, provenance_path)):
        raise BridgeError(f"candidate_missing:{slug(asset_id)}")
    manifest = read_json(manifest_path)
    provenance = read_json(provenance_path)
    prefix = slug(str(manifest.get("semanticPrefix") or provenance.get("semanticPrefix") or asset_id))
    return {
        "assetId": slug(str(provenance.get("assetId") or provenance.get("characterId") or asset_id)),
        "assetKind": str(manifest.get("assetKind") or provenance.get("assetKind") or "character"),
        "prefix": prefix,
        "root": root,
        "atlas": atlas,
        "manifestPath": manifest_path,
        "provenancePath": provenance_path,
        "manifest": manifest,
        "provenance": provenance,
    }


def _runtime_provenance(ws: Path) -> dict[str, Any] | None:
    path = ws / "assets" / "imagegen" / "provenance.json"
    if not path.is_file():
        return None
    return read_json(path)


def _assert_runtime_safe(ws: Path, force: bool) -> dict[str, Any] | None:
    runtime = ws / "assets" / "imagegen"
    atlas = runtime / "atlas.png"
    if not atlas.exists():
        return None
    provenance = _runtime_provenance(ws)
    if provenance is None:
        if force:
            return None
        raise BridgeError("runtime_art_exists_use_force")
    owned = provenance.get("provider") == "sprite-gen" or str(provenance.get("schemaVersion") or "").startswith("loreweaver.sprite-gen")
    if not owned:
        if force:
            return provenance
        raise BridgeError("runtime_art_not_sprite_gen_use_force")
    expected = provenance.get("runtimeAtlasSha256")
    if expected and expected != digest(atlas) and not force:
        raise BridgeError("runtime_art_modified_use_force")
    return provenance


def _is_sprite_gen_provenance(provenance: dict[str, Any] | None) -> bool:
    provenance = provenance or {}
    return (
        provenance.get("provider") == "sprite-gen"
        or str(provenance.get("schemaVersion") or "").startswith("loreweaver.sprite-gen")
    )


def _promoted_asset_ids(ws: Path, runtime_provenance: dict[str, Any] | None = None) -> list[str]:
    ids: set[str] = set()

    # Candidate-side promoted flags are trustworthy only while the active runtime
    # is absent or is itself owned by this publisher. A forced takeover of a
    # foreign runtime must not resurrect stale sprite-gen candidates that happened
    # to remain marked promoted from an older bundle.
    trust_candidate_flags = runtime_provenance is None or _is_sprite_gen_provenance(runtime_provenance)
    if trust_candidate_flags:
        root = ws / "assets" / "imagegen" / "sprite-gen"
        if root.is_dir():
            for entry in root.iterdir():
                prov = entry / "loreweaver" / "provenance.json"
                if not prov.is_file():
                    continue
                try:
                    data = read_json(prov)
                except BridgeError:
                    continue
                if data.get("promoted") is True:
                    value = data.get("assetId") or data.get("characterId") or entry.name
                    ids.add(slug(str(value)))

    provenance = runtime_provenance or {}
    if _is_sprite_gen_provenance(provenance):
        for item in provenance.get("assets") or []:
            if isinstance(item, dict) and (item.get("assetId") or item.get("characterId")):
                ids.add(slug(str(item.get("assetId") or item.get("characterId"))))
        legacy_id = provenance.get("assetId") or provenance.get("characterId")
        if legacy_id:
            ids.add(slug(str(legacy_id)))
    return sorted(ids)


def _pack_candidates(ws: Path, asset_ids: list[str]) -> tuple[Image.Image, dict[str, Any], dict[str, Any]]:
    assets = [_candidate(ws, asset_id) for asset_id in sorted(set(asset_ids))]
    assets.sort(key=lambda item: (item["prefix"], item["assetId"]))
    if not assets:
        raise BridgeError("no_promoted_candidates")

    opened: list[tuple[dict[str, Any], Image.Image]] = []
    max_source_width = 1
    for asset in assets:
        try:
            image = Image.open(asset["atlas"]).convert("RGBA")
        except OSError as exc:
            raise BridgeError(f"candidate_atlas_invalid:{asset['assetId']}") from exc
        max_source_width = max(max_source_width, image.width)
        opened.append((asset, image))

    target_width = max(BUNDLE_WIDTH, max_source_width)
    placements: dict[str, tuple[int, int]] = {}
    x = y = row_h = used_width = 0
    for asset, image in opened:
        if x > 0 and x + image.width > target_width:
            y += row_h + BUNDLE_PADDING
            x = 0
            row_h = 0
        placements[asset["assetId"]] = (x, y)
        used_width = max(used_width, x + image.width)
        row_h = max(row_h, image.height)
        x += image.width + BUNDLE_PADDING
    used_height = y + row_h

    bundle = Image.new("RGBA", (used_width, used_height), (0, 0, 0, 0))
    frames: dict[str, Any] = {}
    clip_sets: dict[str, Any] = {}
    frame_sizes: dict[str, Any] = {}
    asset_records: list[dict[str, Any]] = []

    for asset, image in opened:
        ox, oy = placements[asset["assetId"]]
        bundle.alpha_composite(image, (ox, oy))
        manifest = asset["manifest"]
        prefix = asset["prefix"]
        if prefix in clip_sets:
            raise BridgeError(f"duplicate_semantic_prefix:{prefix}")
        source_clip_sets = manifest.get("clipSets") or {}
        clips = source_clip_sets.get(prefix) if isinstance(source_clip_sets, dict) else None
        if not isinstance(clips, dict):
            clips = manifest.get("clips") or {}
        clip_sets[prefix] = clips
        frame_sizes[prefix] = manifest.get("frameSize") or {}

        for key, value in (manifest.get("frames") or {}).items():
            if key in frames:
                raise BridgeError(f"duplicate_frame_key:{key}")
            box = dict((value or {}).get("frame") or {})
            if not {"x", "y", "w", "h"}.issubset(box):
                raise BridgeError(f"bad_candidate_frame:{asset['assetId']}:{key}")
            frames[key] = {
                **(value or {}),
                "frame": {
                    "x": int(box["x"]) + ox,
                    "y": int(box["y"]) + oy,
                    "w": int(box["w"]),
                    "h": int(box["h"]),
                },
            }
        asset_records.append({
            "assetId": asset["assetId"],
            "assetKind": asset["assetKind"],
            "semanticPrefix": prefix,
            "candidateAtlas": rel(ws, asset["atlas"]),
            "candidateManifest": rel(ws, asset["manifestPath"]),
            "candidateAtlasSha256": digest(asset["atlas"]),
            "placement": {"x": ox, "y": oy, "w": image.width, "h": image.height},
        })

    primary_prefix = "player" if "player" in clip_sets else assets[0]["prefix"]
    primary_frame_size = frame_sizes.get(primary_prefix) or {}
    runtime_manifest = {
        "schemaVersion": "loreweaver.imagegen-manifest.v2",
        "generatedAtlasStatus": "sprite_gen_bundle_promoted",
        "generationStatus": "sprite-gen",
        "generator": {
            "name": "sprite-gen",
            "version": VERSION,
            "sourceRepository": UPSTREAM,
            "sourceCommit": PIN,
        },
        "atlasImage": "assets/imagegen/atlas.png",
        "provenancePath": "assets/imagegen/provenance.json",
        "atlasSize": {"w": used_width, "h": used_height},
        "frameSize": primary_frame_size,
        "frameSizes": frame_sizes,
        "semanticPrefix": primary_prefix if len(clip_sets) == 1 else "bundle",
        "semanticPrefixes": sorted(clip_sets),
        "clips": clip_sets.get(primary_prefix) or {},
        "clipSets": clip_sets,
        "frames": frames,
    }
    bundle_provenance = {
        "schemaVersion": "loreweaver.sprite-gen-bundle-provenance.v1",
        "provider": "sprite-gen",
        "sourceRepository": UPSTREAM,
        "sourceCommit": PIN,
        "sourceVersion": VERSION,
        "sourceLicense": "Apache-2.0",
        "assets": asset_records,
        "bundledAt": datetime.now(timezone.utc).isoformat(),
    }
    return bundle, runtime_manifest, bundle_provenance


def promote(ws: Path, asset_id: str, force: bool) -> dict[str, Any]:
    current = _candidate(ws, asset_id)
    runtime_provenance = _assert_runtime_safe(ws, force)
    selected = set(_promoted_asset_ids(ws, runtime_provenance))
    selected.add(current["assetId"])

    # One semantic prefix has exactly one active producer. Promoting a video-loop
    # player over a component-row player replaces that prefix instead of making
    # RuntimeArtBinder choose between two competing clip sets.
    replaced: list[dict[str, Any]] = []
    for existing_id in list(selected):
        if existing_id == current["assetId"]:
            continue
        try:
            existing = _candidate(ws, existing_id)
        except BridgeError:
            continue
        if existing["prefix"] == current["prefix"]:
            selected.discard(existing_id)
            replaced.append(existing)

    bundle, manifest, provenance = _pack_candidates(ws, sorted(selected))
    runtime = ws / "assets" / "imagegen"
    runtime.mkdir(parents=True, exist_ok=True)
    target_atlas = runtime / "atlas.png"
    tmp_atlas = runtime / ".atlas.sprite-gen.tmp.png"
    bundle.save(tmp_atlas, format="PNG")
    provenance["runtimeAtlasSha256"] = digest(tmp_atlas)

    tmp_manifest = runtime / ".manifest.sprite-gen.tmp.json"
    tmp_manifest_js = runtime / ".manifest.sprite-gen.tmp.js"
    tmp_provenance = runtime / ".provenance.sprite-gen.tmp.json"
    write_json(tmp_manifest, manifest)
    tmp_manifest_js.write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    write_json(tmp_provenance, provenance)

    tmp_atlas.replace(target_atlas)
    tmp_manifest.replace(runtime / "manifest.json")
    tmp_manifest_js.replace(runtime / "manifest.js")
    tmp_provenance.replace(runtime / "provenance.json")

    now = datetime.now(timezone.utc).isoformat()
    candidate_provenance = current["provenance"]
    candidate_provenance.update({
        "promoted": True,
        "promotedAt": now,
        "runtimeAtlasSha256": provenance["runtimeAtlasSha256"],
    })
    write_json(current["provenancePath"], candidate_provenance)
    for old in replaced:
        old_provenance = old["provenance"]
        old_provenance.update({
            "promoted": False,
            "replacedAt": now,
            "replacedBy": current["assetId"],
        })
        write_json(old["provenancePath"], old_provenance)

    return {
        "status": "promoted",
        "assetId": current["assetId"],
        "assetCount": len(provenance["assets"]),
        "semanticPrefixes": manifest["semanticPrefixes"],
        "replacedAssets": [item["assetId"] for item in replaced],
        "atlas": "assets/imagegen/atlas.png",
        "manifest": "assets/imagegen/manifest.json",
        "frameCount": len(manifest.get("frames") or {}),
    }


def flip_run_frames(source_run: Path) -> int:
    """Mirror extracted frames so default facing is screen +x."""
    from PIL import Image

    frames_dir = source_run / "frames"
    if not frames_dir.is_dir():
        raise BridgeError("frames_dir_missing")
    count = 0
    for path in sorted(frames_dir.rglob("frame-*.png")):
        image = Image.open(path).convert("RGBA")
        image.transpose(Image.FLIP_LEFT_RIGHT).save(path)
        count += 1
    if count == 0:
        raise BridgeError("frames_missing")
    return count


def alias_frame_keys(frames: dict[str, Any], src_prefix: str, dst_prefix: str) -> list[str]:
    src_prefix, dst_prefix = slug(src_prefix), slug(dst_prefix)
    added = []
    for key, entry in list(frames.items()):
        if key == src_prefix or key.startswith(src_prefix + "_"):
            new_key = dst_prefix + key[len(src_prefix):]
            frames[new_key] = entry
            added.append(new_key)
    return added


def pack_grid(count: int, cell_w: int, cell_h: int, columns: int = PACK_COLUMNS, max_edge: int = MAX_ATLAS_EDGE) -> tuple[int, int, int, int]:
    if count <= 0:
        raise BridgeError("pack_characters_required")
    columns = max(1, int(columns or PACK_COLUMNS))
    rows = (count + columns - 1) // columns
    width, height = cell_w * columns, cell_h * rows
    if width > max_edge or height > max_edge:
        raise BridgeError(f"atlas_exceeds_webgl_max_edge:{width}x{height}>{max_edge}")
    return columns, rows, width, height


def _scaled_frame(box: dict[str, Any], scale: float, origin_x: int, origin_y: int) -> dict[str, int]:
    return {
        "x": int(round(float(box["x"]) * scale)) + origin_x,
        "y": int(round(float(box["y"]) * scale)) + origin_y,
        "w": max(1, int(round(float(box["w"]) * scale))),
        "h": max(1, int(round(float(box["h"]) * scale))),
    }


def _fit_cell(cell_w: int, cell_h: int, columns: int, rows: int, max_edge: int) -> tuple[float, int, int]:
    """Uniform scale that keeps a cols×rows grid inside max_edge. 1.0 when it already fits."""
    raw_w, raw_h = cell_w * columns, cell_h * rows
    if raw_w <= max_edge and raw_h <= max_edge:
        return 1.0, cell_w, cell_h
    scale = min(max_edge / raw_w, max_edge / raw_h)
    fitted_w = max(1, int(cell_w * scale))
    fitted_h = max(1, int(cell_h * scale))
    while fitted_w * columns > max_edge and fitted_w > 1:
        fitted_w -= 1
    while fitted_h * rows > max_edge and fitted_h > 1:
        fitted_h -= 1
    return scale, fitted_w, fitted_h


def pack_candidates(
    ws: Path,
    characters: list[str],
    aliases: dict[str, list[str]] | None = None,
    columns: int = PACK_COLUMNS,
    max_edge: int = MAX_ATLAS_EDGE,
    force: bool = False,
    fit_max_edge: bool = False,
) -> dict[str, Any]:
    """Merge loreweaver candidate sheets into the runtime atlas.

    `promote` copies one character and overwrites runtime art. Multi-character
    workspaces must pack. Layout is a left-to-right, top-to-bottom grid that
    stays inside WebGL's common 4096 texture edge.
    """
    from PIL import Image

    names = [slug(item) for item in characters if str(item).strip()]
    sources = []
    for name in names:
        folder = candidate_dir(ws, name)
        atlas, manifest_path, provenance_path = folder / "atlas.png", folder / "manifest.json", folder / "provenance.json"
        if not all(path.is_file() for path in (atlas, manifest_path, provenance_path)):
            raise BridgeError(f"candidate_missing:{name}")
        sources.append((name, atlas, read_json(manifest_path)))
    images = [Image.open(atlas).convert("RGBA") for _, atlas, _ in sources]
    native_w = max(image.size[0] for image in images)
    native_h = max(image.size[1] for image in images)
    columns = max(1, int(columns or PACK_COLUMNS))
    rows = (len(images) + columns - 1) // columns
    raw_w, raw_h = native_w * columns, native_h * rows
    if raw_w > max_edge or raw_h > max_edge:
        if not fit_max_edge:
            raise BridgeError(f"atlas_exceeds_webgl_max_edge:{raw_w}x{raw_h}>{max_edge}")
        scale, cell_w, cell_h = _fit_cell(native_w, native_h, columns, rows, max_edge)
        scale = min(cell_w / native_w, cell_h / native_h)
    else:
        scale, cell_w, cell_h = 1.0, native_w, native_h
    width, height = cell_w * columns, cell_h * rows
    combined = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    frames: dict[str, Any] = {}
    clips: dict[str, Any] = {}
    clip_sets: dict[str, Any] = {}
    player_prefix = None
    for index, (image, (name, _, manifest)) in enumerate(zip(images, sources)):
        origin_x, origin_y = (index % columns) * cell_w, (index // columns) * cell_h
        placed = image
        if scale < 1:
            placed = image.resize(
                (max(1, int(round(image.width * scale))), max(1, int(round(image.height * scale)))),
                Image.Resampling.LANCZOS,
            )
        combined.paste(placed, (origin_x, origin_y))
        for key, entry in (manifest.get("frames") or {}).items():
            box = dict((entry or {}).get("frame") or {})
            frames[key] = {"frame": _scaled_frame(box, scale, origin_x, origin_y)}
        prefix = manifest.get("semanticPrefix")
        source_sets = manifest.get("clipSets") if isinstance(manifest.get("clipSets"), dict) else {}
        if prefix and isinstance(source_sets.get(prefix), dict):
            clip_sets[prefix] = source_sets[prefix]
        elif prefix and isinstance(manifest.get("clips"), dict):
            clip_sets[prefix] = manifest["clips"]
        if prefix == "player" or name == "player":
            clips = dict(manifest.get("clips") or {})
            player_prefix = "player"
    for src_prefix, destinations in (aliases or {}).items():
        for dst_prefix in destinations:
            alias_frame_keys(frames, src_prefix, dst_prefix)
    runtime = ws / "assets" / "imagegen"
    runtime.mkdir(parents=True, exist_ok=True)
    target = runtime / "atlas.png"
    if target.exists() and not force:
        raise BridgeError("runtime_art_exists_use_force")
    combined.save(target)
    manifest = {
        "schemaVersion": "loreweaver.imagegen-manifest.v1",
        "generatedAtlasStatus": "sprite_gen_promoted",
        "generationStatus": "sprite-gen",
        "generator": sources[0][2].get("generator") or {"name": "sprite-gen", "version": VERSION, "sourceRepository": UPSTREAM, "sourceCommit": PIN},
        "atlasImage": "assets/imagegen/atlas.png",
        "provenancePath": "assets/imagegen/provenance.json",
        "atlasSize": {"w": width, "h": height},
        "frameSize": sources[0][2].get("frameSize") or {"w": cell_w, "h": cell_h},
        "semanticPrefix": player_prefix or sources[0][2].get("semanticPrefix"),
        "clips": clips,
        "clipSets": clip_sets,
        "characters": names,
        "frames": frames,
    }
    provenance = {
        "schemaVersion": "loreweaver.sprite-gen-provenance.v1",
        "provider": "sprite-gen",
        "sourceRepository": UPSTREAM,
        "sourceCommit": PIN,
        "sourceVersion": VERSION,
        "characters": names,
        "aliases": aliases or {},
        "atlasLayout": {"cols": columns, "rows": rows, "cell": {"w": cell_w, "h": cell_h}, "maxEdge": max_edge},
        "postprocess": ["grid_pack_max_edge_4096", *(["fit_max_edge"] if scale < 1 else [])],
        "promoted": True,
        "promotedAt": datetime.now(timezone.utc).isoformat(),
        "runtimeAtlasSha256": digest(target),
    }
    previous_manifest = runtime / "manifest.json"
    if previous_manifest.is_file():
        try:
            previous = read_json(previous_manifest)
        except (OSError, json.JSONDecodeError, BridgeError):
            previous = {}
        if isinstance(previous, dict):
            kept = {
                key: value for key, value in (previous.get("frames") or {}).items()
                if isinstance(value, dict) and value.get("atlas") == "environment" and key not in frames
            }
            if kept:
                manifest["frames"].update(kept)
            if isinstance(previous.get("environmentAtlas"), dict):
                manifest["environmentAtlas"] = previous["environmentAtlas"]
    (runtime / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (runtime / "manifest.js").write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    (runtime / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # append-effects keeps pasting from this snapshot. A later pack must replace
    # it, or the next paste restores the previous character's pixels and frames.
    _sync_character_pack_snapshot(runtime)
    return {
        "status": "packed",
        "atlas": "assets/imagegen/atlas.png",
        "atlasSize": manifest["atlasSize"],
        "frameCount": len(frames),
        "characters": names,
    }


def _character_pack_snapshot(runtime: Path) -> Path:
    return runtime / "character-pack"


def _sync_character_pack_snapshot(runtime: Path) -> None:
    """Replace the append-effects base with the character atlas just packed."""
    snapshot = _character_pack_snapshot(runtime)
    snapshot.mkdir(parents=True, exist_ok=True)
    for filename in ("atlas.png", "manifest.json", "provenance.json"):
        shutil.copy2(runtime / filename, snapshot / filename)


def _unused_pack_cell(provenance: dict[str, Any], atlas_size: tuple[int, int]) -> dict[str, int] | None:
    """The next empty cell in a packed character grid, if one exists inside the atlas."""
    layout = provenance.get("atlasLayout") or {}
    cell = layout.get("cell") if isinstance(layout.get("cell"), dict) else {}
    try:
        cols = int(layout.get("cols") or 0)
        rows = int(layout.get("rows") or 0)
        cell_w = int(cell.get("w") or 0)
        cell_h = int(cell.get("h") or 0)
    except (TypeError, ValueError):
        return None
    names = provenance.get("characters") if isinstance(provenance.get("characters"), list) else []
    if cols < 1 or rows < 1 or cell_w < 1 or cell_h < 1 or len(names) >= cols * rows:
        return None
    index = len(names)
    origin_x, origin_y = (index % cols) * cell_w, (index // cols) * cell_h
    if origin_x + cell_w > atlas_size[0] or origin_y + cell_h > atlas_size[1]:
        return None
    return {"x": origin_x, "y": origin_y, "w": cell_w, "h": cell_h}


def _rect_is_clear(image: Image.Image, x: int, y: int, w: int, h: int) -> bool:
    if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > image.width or y + h > image.height:
        return False
    alpha = image.crop((x, y, x + w, y + h)).getextrema()[3]
    return alpha[1] == 0


def append_effects(
    ws: Path,
    effect_ids: list[str],
    max_edge: int = MAX_ATLAS_EDGE,
    force: bool = False,
) -> dict[str, Any]:
    """Paste effect candidate sheets into a packed runtime atlas.

    Character frames stay where `pack` put them. The paste target is the unused
    grid cell when one exists. Candidates are left unpromoted: `promote` only
    republishes candidates flagged promoted, and would otherwise replace this pack.
    Re-running starts from the character-pack snapshot, so a second paste does not
    stack effects on top of the previous ones. `pack` rewrites that snapshot;
    otherwise the next paste would restore the previous character.
    """
    names = [slug(item) for item in effect_ids if str(item).strip()]
    if not names:
        raise BridgeError("effects_required")
    _assert_runtime_safe(ws, force)
    runtime = ws / "assets" / "imagegen"
    snapshot = _character_pack_snapshot(runtime)
    if not (snapshot / "atlas.png").is_file():
        current_prov = _runtime_provenance(ws) or {}
        if current_prov.get("effects"):
            raise BridgeError("character_pack_snapshot_missing")
        snapshot.mkdir(parents=True, exist_ok=True)
        for filename in ("atlas.png", "manifest.json", "provenance.json"):
            shutil.copy2(runtime / filename, snapshot / filename)

    base_atlas = Image.open(snapshot / "atlas.png").convert("RGBA")
    manifest = read_json(snapshot / "manifest.json")
    provenance = read_json(snapshot / "provenance.json")
    if not _is_sprite_gen_provenance(provenance):
        raise BridgeError("runtime_art_not_sprite_gen_use_force")

    opened: list[tuple[dict[str, Any], Image.Image]] = []
    for name in names:
        item = _candidate(ws, name)
        if item["assetKind"] != "effect":
            raise BridgeError(f"not_an_effect:{name}")
        image = Image.open(item["atlas"]).convert("RGBA")
        opened.append((item, image))

    gap = 0
    total_h = sum(image.height for _, image in opened)
    max_w = max(image.width for _, image in opened)
    cell = _unused_pack_cell(provenance, base_atlas.size)
    effect_scale = 1.0
    if cell:
        # Leave a few pixels so per-strip rounding cannot walk out of the cell.
        budget_w = max(1, cell["w"] - 2)
        budget_h = max(1, cell["h"] - 4)
        effect_scale = min(1.0, budget_w / max_w, budget_h / total_h)
        while effect_scale < 1 and (
            int(round(max_w * effect_scale)) > cell["w"] or int(round(total_h * effect_scale)) > cell["h"]
        ):
            effect_scale *= 0.99
        if effect_scale <= 0:
            raise BridgeError(f"effects_do_not_fit:{max_w}x{total_h}:cell={cell['w']}x{cell['h']}")
        origin_x, origin_y = cell["x"], cell["y"]
        canvas = base_atlas.copy()
    else:
        new_w = max(base_atlas.width, max_w)
        new_h = base_atlas.height + total_h
        if new_w > max_edge or new_h > max_edge:
            raise BridgeError(f"effects_do_not_fit:{max_w}x{total_h}:cell=none")
        origin_x, origin_y = 0, base_atlas.height
        canvas = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
        canvas.paste(base_atlas, (0, 0))

    frames = dict(manifest.get("frames") or {})
    clip_sets = dict(manifest.get("clipSets") or {})
    placements: list[dict[str, Any]] = []
    cursor_y = origin_y
    for item, image in opened:
        if effect_scale < 1:
            image = image.resize(
                (max(1, int(round(image.width * effect_scale))), max(1, int(round(image.height * effect_scale)))),
                Image.Resampling.LANCZOS,
            )
        if not _rect_is_clear(canvas, origin_x, cursor_y, image.width, image.height):
            raise BridgeError(f"effect_destination_not_empty:{item['assetId']}")
        # The cell is empty, so copy source pixels. Using the RGBA image as a
        # mask multiplies alpha twice (128 -> 64) and halves the color channels.
        canvas.paste(image, (origin_x, cursor_y))
        prefix = item["prefix"]
        if prefix in clip_sets:
            raise BridgeError(f"duplicate_semantic_prefix:{prefix}")
        source_sets = item["manifest"].get("clipSets") or {}
        clips = source_sets.get(prefix) if isinstance(source_sets, dict) else None
        if not isinstance(clips, dict):
            clips = item["manifest"].get("clips") or {}
        clip_sets[prefix] = clips
        for key, value in (item["manifest"].get("frames") or {}).items():
            if key in frames:
                raise BridgeError(f"duplicate_frame_key:{key}")
            box = dict((value or {}).get("frame") or {})
            if not {"x", "y", "w", "h"}.issubset(box):
                raise BridgeError(f"bad_candidate_frame:{item['assetId']}:{key}")
            frames[key] = {"frame": _scaled_frame(box, effect_scale, origin_x, cursor_y)}
        placements.append({
            "assetId": item["assetId"],
            "semanticPrefix": prefix,
            "placement": {"x": origin_x, "y": cursor_y, "w": image.width, "h": image.height},
        })
        cursor_y += image.height + gap

    manifest["frames"] = frames
    manifest["clipSets"] = clip_sets
    manifest["atlasSize"] = {"w": canvas.width, "h": canvas.height}
    manifest["effects"] = [item["assetId"] for item in placements]
    provenance = dict(provenance)
    provenance["effects"] = manifest["effects"]
    provenance["effectPlacements"] = placements
    provenance["postprocess"] = list(dict.fromkeys([*(provenance.get("postprocess") or []), "append_effects_keep_character_pack"]))

    tmp_atlas = runtime / ".atlas.append-effects.tmp.png"
    canvas.save(tmp_atlas, format="PNG")
    provenance["runtimeAtlasSha256"] = digest(tmp_atlas)
    tmp_manifest = runtime / ".manifest.append-effects.tmp.json"
    tmp_manifest_js = runtime / ".manifest.append-effects.tmp.js"
    tmp_provenance = runtime / ".provenance.append-effects.tmp.json"
    write_json(tmp_manifest, manifest)
    tmp_manifest_js.write_text("export default " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    write_json(tmp_provenance, provenance)
    tmp_atlas.replace(runtime / "atlas.png")
    tmp_manifest.replace(runtime / "manifest.json")
    tmp_manifest_js.replace(runtime / "manifest.js")
    tmp_provenance.replace(runtime / "provenance.json")
    return {
        "status": "effects_appended",
        "atlas": "assets/imagegen/atlas.png",
        "atlasSize": manifest["atlasSize"],
        "effects": manifest["effects"],
        "frameCount": len(frames),
        "clipSets": sorted(clip_sets),
    }
