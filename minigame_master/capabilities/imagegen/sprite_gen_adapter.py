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


def _promoted_asset_ids(ws: Path, runtime_provenance: dict[str, Any] | None = None) -> list[str]:
    ids: set[str] = set()
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

