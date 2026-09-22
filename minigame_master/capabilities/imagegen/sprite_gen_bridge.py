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

from sprite_gen_adapter import BridgeError, PIN, UPSTREAM, VERSION, adopt, promote, rel, slug

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
    "cast": (4, 12, False, "clear anticipation and release for a game VFX"),
    "loop": (6, 12, True, "seamless repeating effect motion with stable center"),
    "impact": (5, 15, False, "impact expansion followed by readable dissipation"),
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
    run = run_dir(ws, asset_id)
    prepare = [
        "prepare",
        "--out-dir", str(run),
        "--character-id", asset_id,
        "--base-image", str(base),
        "--subject", subject,
        "--cell-size", str(args.cell_size),
        "--chroma-key", "auto",
        "--request-json", json.dumps({"states": specs}),
    ]
    if args.logical_height:
        prepare += ["--fit-pixel-unfake", "--fit-logical-height", str(args.logical_height)]
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
    sg("compose-atlas", "--run-dir", str(run))
    sg("inspect", "--run-dir", str(run))

    result = adopt(ws, run, asset_id, prefix)
    result.update({
        "status": "generated_candidate_ready",
        "runDir": rel(ws, run),
        "provider": args.provider,
        "assetKind": subject,
        "semanticPrefix": prefix,
    })
    return result


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
    gen.add_argument("--force", action="store_true")

    adopt_parser = sub.add_parser("adopt")
    adopt_parser.add_argument("--workspace", required=True)
    adopt_parser.add_argument("--run-dir", required=True)
    adopt_parser.add_argument("--asset-id", "--character-id", dest="asset_id", required=True)
    adopt_parser.add_argument("--semantic-prefix", required=True)

    promote_parser = sub.add_parser("promote")
    promote_parser.add_argument("--workspace", required=True)
    promote_parser.add_argument("--asset-id", "--character-id", dest="asset_id", required=True)
    promote_parser.add_argument("--force", action="store_true")
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
                "publishMode": "multi-candidate-bundle",
            }
        elif args.cmd == "generate":
            result = generate(ws_path(args.workspace), args)
        elif args.cmd == "adopt":
            ws = ws_path(args.workspace)
            result = adopt(ws, within(ws, args.run_dir), args.asset_id, args.semantic_prefix)
        else:
            result = promote(ws_path(args.workspace), args.asset_id, args.force)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except BridgeError as exc:
        print(json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
