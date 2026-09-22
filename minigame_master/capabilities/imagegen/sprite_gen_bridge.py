#!/usr/bin/env python3
"""Run/adopt sprite-gen as a LoreWeaver Art Department backend."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

from sprite_gen_adapter import (
    BridgeError, PIN, UPSTREAM, VERSION,
    adopt, adopt_layer, adopt_video_set, append_effects, flip_run_frames, pack_candidates, promote, rel, slug,
)

ROOT = Path(os.getenv("LOREWEAVER_ROOT") or Path(__file__).resolve().parents[3]).resolve()
WORKSPACES = (ROOT / "data" / "workspaces").resolve()
CHARACTER_STATES = {
    "idle": (4, 4, True, "subtle idle breathing and blink"),
    "walk": (6, 8, True, "readable walking cycle with planted foot contacts"),
    "attack": (4, 8, False, "windup, strike and recovery without detached effects"),
    "hurt": (2, 6, False, "brief hit reaction"),
    "death": (4, 6, False, "defeat motion ending in a stable pose"),
}
EFFECT_STATES = {
    "cast": (4, 12, False, "clear anticipation and release for a game VFX, stable center and facing"),
    "loop": (6, 12, True, "seamless pulse with a stable center, silhouette, and facing; do not rotate or travel"),
    "impact": (5, 15, False, "impact expansion then fade, staying centered with a stable facing"),
}


def ws_path(value: str) -> Path:
    raw = Path(value).expanduser()
    path = raw.resolve() if raw.is_absolute() else (WORKSPACES / raw).resolve()
    try:
        path.relative_to(WORKSPACES)
    except ValueError as exc:
        raise BridgeError("workspace_outside_data_root") from exc
    if not path.is_dir():
        raise BridgeError(f"workspace_not_found:{path}")
    return path


def within(ws: Path, value: str) -> Path:
    raw = Path(value).expanduser()
    path = raw.resolve() if raw.is_absolute() else (ws / raw).resolve()
    try:
        path.relative_to(ws.resolve())
    except ValueError as exc:
        raise BridgeError(f"path_outside_workspace:{value}") from exc
    if not path.exists():
        raise BridgeError(f"path_missing:{value}")
    return path


def run_dir(ws: Path, asset_id: str) -> Path:
    return ws / "assets" / "imagegen" / "sprite-gen" / slug(asset_id) / "run"


def sg(*args: str) -> None:
    if importlib.util.find_spec("sprite_gen") is None:
        raise BridgeError("sprite_gen_not_installed: install backend/requirements.txt in LoreWeaver .venv")
    proc = subprocess.run([sys.executable, "-m", "sprite_gen.cli", *args], cwd=ROOT, text=True, capture_output=True)
    if proc.returncode:
        tail = "\n".join((proc.stdout + "\n" + proc.stderr).strip().splitlines()[-20:])
        raise BridgeError(f"sprite_gen_failed:{args[0]}:exit={proc.returncode}\n{tail}")


def default_prefix(subject: str, asset_id: str) -> str:
    if subject == "effect":
        return f"vfx_{slug(asset_id)}"
    return "player"


def parse_layer_contract(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except ValueError as exc:
        raise BridgeError("layer_contract_invalid_json") from exc
    if not isinstance(value, dict):
        raise BridgeError("layer_contract_must_be_object")
    unknown = sorted(set(value) - {"rig", "layers", "tracks"})
    if unknown:
        raise BridgeError(f"layer_contract_unknown_keys:{','.join(unknown)}")
    if "tracks" in value and not isinstance(value["tracks"], dict):
        raise BridgeError("layer_contract_tracks_must_be_object")
    return value


def generate(ws: Path, args: argparse.Namespace) -> dict:
    base = within(ws, args.base_image)
    if not base.is_file():
        raise BridgeError("base_image_not_file")
    subject = "effect" if args.subject == "effect" else "character"
    defaults = EFFECT_STATES if subject == "effect" else CHARACTER_STATES
    requested_states = args.states or ",".join(defaults)
    states = [slug(s) for s in requested_states.split(",") if s.strip()]
    if not states:
        raise BridgeError("states_required")
    specs = {}
    for state in states:
        frames, fps, loop, action = defaults.get(state, (4, 8, True, f"clear {state} motion"))
        specs[state] = {"frames": frames, "fps": fps, "loop": loop, "action": action}

    asset_id = slug(args.asset_id)
    prefix = slug(args.semantic_prefix or default_prefix(subject, asset_id))
    layer_contract = parse_layer_contract(args.layer_contract_json)
    tracks = layer_contract.get("tracks") or {}
    for state, track in tracks.items():
        normalized = slug(str(state))
        if normalized not in specs:
            raise BridgeError(f"layer_track_state_not_requested:{normalized}")
        specs[normalized]["track"] = str(track)

    request_payload = {"states": specs}
    if layer_contract.get("rig") is not None:
        request_payload["rig"] = layer_contract["rig"]
    if layer_contract.get("layers") is not None:
        request_payload["layers"] = layer_contract["layers"]

    run = run_dir(ws, asset_id)
    prepare = [
        "prepare",
        "--out-dir", str(run),
        "--character-id", asset_id,
        "--base-image", str(base),
        "--subject", subject,
        "--cell-size", str(args.cell_size),
        "--chroma-key", "auto",
        "--request-json", json.dumps(request_payload),
    ]
    if args.logical_height:
        prepare += ["--fit-pixel-unfake", "--fit-logical-height", str(args.logical_height)]
    # Character rows pin feet to the cell floor. Effects have no feet; that anchor
    # parks a slash or bolt on the bottom edge and makes a later rotation orbit.
    if subject == "effect":
        prepare += ["--fit-align-x", "centroid", "--fit-align-y", "center"]
    if args.force:
        prepare.append("--force")
    sg(*prepare)

    generation = ["gen-set", "--run-dir", str(run), "--provider", args.provider, "--concurrency", str(args.concurrency)]
    if args.model:
        generation += ["--model", args.model]
    if args.force:
        generation.append("--force")
    sg(*generation)
    sg("extract", "--run-dir", str(run))
    if args.face_plus_x:
        flip_run_frames(run)
    sg("compose-atlas", "--run-dir", str(run))
    sg("inspect", "--run-dir", str(run))
    result = adopt(ws, run, asset_id, prefix)
    result.update({
        "status": "generated_candidate_ready",
        "runDir": rel(ws, run),
        "provider": args.provider,
        "assetKind": subject,
        "semanticPrefix": prefix,
        "facePlusX": bool(args.face_plus_x),
    })
    return result


def compose_layer_candidate(ws: Path, args: argparse.Namespace) -> dict:
    source_id = slug(args.source_asset_id)
    run = run_dir(ws, source_id)
    if not run.is_dir():
        raise BridgeError(f"source_run_missing:{source_id}")
    layer_name = slug(args.layer_name)
    sg("compose-layers", "--run-dir", str(run), "--names", layer_name)
    output_id = slug(args.asset_id or f"{source_id}_{layer_name}")
    prefix = slug(args.semantic_prefix or layer_name)
    result = adopt_layer(ws, run, layer_name, output_id, prefix)
    result.update({
        "status": "layer_candidate_ready",
        "sourceAssetId": source_id,
        "layerName": layer_name,
    })
    return result


def generate_video_set(ws: Path, args: argparse.Namespace) -> dict:
    base = within(ws, args.base_image)
    if not base.is_file():
        raise BridgeError("base_image_not_file")
    asset_id = slug(args.asset_id)
    prefix = slug(args.semantic_prefix or "player")
    states = args.states or "idle,walk,run,jump,attack"
    selected_states = [slug(state) for state in states.split(",") if state.strip()]
    if not selected_states:
        raise BridgeError("states_required")
    out_dir = ws / "assets" / "imagegen" / "sprite-gen" / asset_id / "video-set"
    command = [
        "video-set",
        "--base", f"{args.direction}={base}",
        "--states", ",".join(selected_states),
        "--out-dir", str(out_dir),
        "--facing", args.facing,
        "--facing-fix", args.facing_fix,
        "--anchor", args.anchor,
        "--concurrency", str(args.concurrency),
    ]
    if args.character:
        command += ["--character", args.character]
    if args.force:
        command.append("--force")
    sg(*command)
    result = adopt_video_set(
        ws,
        out_dir,
        asset_id,
        prefix,
        direction=args.direction,
        states=selected_states,
    )
    result.update({
        "status": "video_candidate_ready",
        "runDir": rel(ws, out_dir),
        "provider": "grok-video",
    })
    return result


def parse_aliases(raw: list[str] | None) -> dict[str, list[str]]:
    aliases: dict[str, list[str]] = {}
    for item in raw or []:
        if "=" not in item:
            raise BridgeError(f"alias_missing_equals:{item}")
        source, destinations = item.split("=", 1)
        names = [slug(part) for part in destinations.split(",") if part.strip()]
        if not slug(source) or not names:
            raise BridgeError(f"alias_invalid:{item}")
        aliases.setdefault(slug(source), []).extend(names)
    return aliases


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")

    gen = sub.add_parser("generate")
    gen.add_argument("--workspace", required=True)
    gen.add_argument("--base-image", required=True)
    gen.add_argument("--asset-id", "--character-id", dest="asset_id", required=True)
    gen.add_argument("--subject", choices=("character", "effect"), default="character")
    gen.add_argument("--semantic-prefix")
    gen.add_argument("--states")
    gen.add_argument("--provider", choices=("codex", "grok"), default=os.getenv("SPRITE_GEN_PROVIDER", "codex"))
    gen.add_argument("--model", default=os.getenv("SPRITE_GEN_MODEL"))
    gen.add_argument("--cell-size", type=int, default=256)
    gen.add_argument("--logical-height", type=int)
    gen.add_argument("--concurrency", type=int, default=4)
    gen.add_argument("--face-plus-x", action="store_true", help="mirror extracted frames so default facing is screen +x")
    gen.add_argument("--layer-contract-json", help="JSON object with rig/layers/tracks; command-neutral data only")
    gen.add_argument("--force", action="store_true")

    layer_parser = sub.add_parser("compose-layer")
    layer_parser.add_argument("--workspace", required=True)
    layer_parser.add_argument("--source-asset-id", required=True)
    layer_parser.add_argument("--layer-name", required=True)
    layer_parser.add_argument("--asset-id")
    layer_parser.add_argument("--semantic-prefix")

    video_parser = sub.add_parser("video-set")
    video_parser.add_argument("--workspace", required=True)
    video_parser.add_argument("--base-image", required=True)
    video_parser.add_argument("--asset-id", "--character-id", dest="asset_id", required=True)
    video_parser.add_argument("--semantic-prefix")
    video_parser.add_argument("--states", default="idle,walk,run,jump,attack")
    video_parser.add_argument("--direction", choices=("side", "front", "back"), default="side")
    video_parser.add_argument("--facing", choices=("right", "left"), default="right")
    video_parser.add_argument("--facing-fix", choices=("none", "mirror"), default="none")
    video_parser.add_argument("--anchor", choices=("none", "feet"), default="feet")
    video_parser.add_argument("--character")
    video_parser.add_argument("--concurrency", type=int, default=3)
    video_parser.add_argument("--force", action="store_true")

    adopt_parser = sub.add_parser("adopt")
    adopt_parser.add_argument("--workspace", required=True)
    adopt_parser.add_argument("--run-dir", required=True)
    adopt_parser.add_argument("--asset-id", "--character-id", dest="asset_id", required=True)
    adopt_parser.add_argument("--semantic-prefix", required=True)

    promote_parser = sub.add_parser("promote")
    promote_parser.add_argument("--workspace", required=True)
    promote_parser.add_argument("--asset-id", "--character-id", dest="asset_id", required=True)
    promote_parser.add_argument("--force", action="store_true")
    pack_parser = sub.add_parser("pack")
    pack_parser.add_argument("--workspace", required=True)
    pack_parser.add_argument("--characters", required=True, help="comma-separated candidate character ids, pack order")
    pack_parser.add_argument("--alias", action="append", default=[], help="srcPrefix=dstPrefix,dstPrefix2 (repeatable)")
    pack_parser.add_argument("--columns", type=int, default=2)
    pack_parser.add_argument("--max-edge", type=int, default=4096)
    pack_parser.add_argument("--force", action="store_true")

    effects_parser = sub.add_parser("append-effects")
    effects_parser.add_argument("--workspace", required=True)
    effects_parser.add_argument("--effects", required=True, help="comma-separated effect asset ids")
    effects_parser.add_argument("--max-edge", type=int, default=4096)
    effects_parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.cmd == "status":
            result = {
                "available": importlib.util.find_spec("sprite_gen") is not None,
                "expectedVersion": VERSION,
                "pinnedCommit": PIN,
                "repository": UPSTREAM,
                "subjects": ["character", "effect"],
                "postProcessing": ["compose-layer"],
                "motionBackends": ["component-row", "video-set"],
                "publishMode": "multi-candidate-bundle",
            }
        elif args.cmd == "generate":
            result = generate(ws_path(args.workspace), args)
        elif args.cmd == "compose-layer":
            result = compose_layer_candidate(ws_path(args.workspace), args)
        elif args.cmd == "video-set":
            result = generate_video_set(ws_path(args.workspace), args)
        elif args.cmd == "adopt":
            ws = ws_path(args.workspace)
            result = adopt(ws, within(ws, args.run_dir), args.asset_id, args.semantic_prefix)
        elif args.cmd == "pack":
            characters = [item.strip() for item in args.characters.split(",") if item.strip()]
            result = pack_candidates(ws_path(args.workspace), characters, parse_aliases(args.alias), args.columns, args.max_edge, args.force)
        elif args.cmd == "append-effects":
            effects = [item.strip() for item in args.effects.split(",") if item.strip()]
            result = append_effects(ws_path(args.workspace), effects, args.max_edge, args.force)
        else:
            result = promote(ws_path(args.workspace), args.asset_id, args.force)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except BridgeError as exc:
        print(json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
