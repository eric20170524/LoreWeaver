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

from sprite_gen_adapter import BridgeError, PIN, UPSTREAM, VERSION, adopt, flip_run_frames, pack_candidates, promote, rel, slug

ROOT = Path(os.getenv("LOREWEAVER_ROOT") or Path(__file__).resolve().parents[3]).resolve()
WORKSPACES = (ROOT / "data" / "workspaces").resolve()
DEFAULT_STATES = {
    "idle": (4, 4, True, "subtle idle breathing and blink"),
    "walk": (6, 8, True, "readable walking cycle with planted foot contacts"),
    "attack": (4, 8, False, "windup, strike and recovery without detached effects"),
    "hurt": (2, 6, False, "brief hit reaction"),
    "death": (4, 6, False, "defeat motion ending in a stable pose"),
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


def run_dir(ws: Path, character: str) -> Path:
    return ws / "assets" / "imagegen" / "sprite-gen" / slug(character) / "run"


def sg(*args: str) -> None:
    if importlib.util.find_spec("sprite_gen") is None:
        raise BridgeError("sprite_gen_not_installed: install backend/requirements.txt in LoreWeaver .venv")
    proc = subprocess.run([sys.executable, "-m", "sprite_gen.cli", *args], cwd=ROOT, text=True, capture_output=True)
    if proc.returncode:
        tail = "\n".join((proc.stdout + "\n" + proc.stderr).strip().splitlines()[-20:])
        raise BridgeError(f"sprite_gen_failed:{args[0]}:exit={proc.returncode}\n{tail}")


def generate(ws: Path, args: argparse.Namespace) -> dict:
    base = within(ws, args.base_image)
    if not base.is_file():
        raise BridgeError("base_image_not_file")
    states = [slug(s) for s in args.states.split(",") if s.strip()]
    if not states:
        raise BridgeError("states_required")
    specs = {}
    for state in states:
        frames, fps, loop, action = DEFAULT_STATES.get(state, (4, 8, True, f"clear {state} motion"))
        specs[state] = {"frames": frames, "fps": fps, "loop": loop, "action": action}
    run = run_dir(ws, args.character_id)
    prepare = ["prepare", "--out-dir", str(run), "--character-id", slug(args.character_id), "--base-image", str(base), "--cell-size", str(args.cell_size), "--chroma-key", "auto", "--request-json", json.dumps({"states": specs})]
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
    if args.face_plus_x:
        flip_run_frames(run)
    sg("compose-atlas", "--run-dir", str(run))
    sg("inspect", "--run-dir", str(run))
    result = adopt(ws, run, args.character_id, args.semantic_prefix)
    result.update({"status": "generated_candidate_ready", "runDir": rel(ws, run), "provider": args.provider, "facePlusX": bool(args.face_plus_x)})
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
    gen.add_argument("--character-id", required=True)
    gen.add_argument("--semantic-prefix", default="player")
    gen.add_argument("--states", default=",".join(DEFAULT_STATES))
    gen.add_argument("--provider", choices=("codex", "grok"), default=os.getenv("SPRITE_GEN_PROVIDER", "codex"))
    gen.add_argument("--model", default=os.getenv("SPRITE_GEN_MODEL"))
    gen.add_argument("--cell-size", type=int, default=256)
    gen.add_argument("--logical-height", type=int)
    gen.add_argument("--concurrency", type=int, default=4)
    gen.add_argument("--face-plus-x", action="store_true", help="mirror extracted frames so default facing is screen +x")
    gen.add_argument("--force", action="store_true")
    adopt_parser = sub.add_parser("adopt")
    adopt_parser.add_argument("--workspace", required=True)
    adopt_parser.add_argument("--run-dir", required=True)
    adopt_parser.add_argument("--character-id", required=True)
    adopt_parser.add_argument("--semantic-prefix", default="player")
    promote_parser = sub.add_parser("promote")
    promote_parser.add_argument("--workspace", required=True)
    promote_parser.add_argument("--character-id", required=True)
    promote_parser.add_argument("--force", action="store_true")
    pack_parser = sub.add_parser("pack")
    pack_parser.add_argument("--workspace", required=True)
    pack_parser.add_argument("--characters", required=True, help="comma-separated candidate character ids, pack order")
    pack_parser.add_argument("--alias", action="append", default=[], help="srcPrefix=dstPrefix,dstPrefix2 (repeatable)")
    pack_parser.add_argument("--columns", type=int, default=2)
    pack_parser.add_argument("--max-edge", type=int, default=4096)
    pack_parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.cmd == "status":
            result = {"available": importlib.util.find_spec("sprite_gen") is not None, "expectedVersion": VERSION, "pinnedCommit": PIN, "repository": UPSTREAM}
        elif args.cmd == "generate":
            result = generate(ws_path(args.workspace), args)
        elif args.cmd == "adopt":
            ws = ws_path(args.workspace)
            result = adopt(ws, within(ws, args.run_dir), args.character_id, args.semantic_prefix)
        elif args.cmd == "pack":
            characters = [item.strip() for item in args.characters.split(",") if item.strip()]
            result = pack_candidates(ws_path(args.workspace), characters, parse_aliases(args.alias), args.columns, args.max_edge, args.force)
        else:
            result = promote(ws_path(args.workspace), args.character_id, args.force)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except BridgeError as exc:
        print(json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
