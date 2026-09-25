#!/usr/bin/env python3
"""Pack the campaign's accepted environment frames without touching character art."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FRAMES_DIR = ROOT / "assets/imagegen/environments/frames"
ATLAS_PATH = ROOT / "assets/imagegen/environments/environment-atlas.png"
LANDSCAPE_DIR = ROOT / "assets/imagegen/environments/landscape"
LANDSCAPE_KEYS = (
    "node4_forge_gate.png",
    "node4_wind_gallery.png",
    "node4_flame_edge.png",
)
FRAME_SIZE = (512, 910)
COLS = 3
ENV_KEYS = (
    "env_bg_desert",
    "env_bg_cliff",
    "env_bg_arena",
    "env_bg_tide",
    "env_bg_city",
    "env_bg_poison",
    "env_bg_tournament",
    "env_bg_ruins",
    "env_bg_escort",
    "env_bg_wall",
    "env_bg_void",
    "env_bg_finale",
)


def pack(workspace: Path) -> dict:
    rows = (len(ENV_KEYS) + COLS - 1) // COLS
    atlas_size = (COLS * FRAME_SIZE[0], rows * FRAME_SIZE[1])
    if max(atlas_size) > 4096:
        raise ValueError(f"environment atlas exceeds WebGL max edge: {atlas_size}")

    atlas = Image.new("RGB", atlas_size)
    env_frames = {}
    source_hashes = {}
    for index, key in enumerate(ENV_KEYS):
        source = FRAMES_DIR / f"{key}.png"
        with Image.open(source) as original:
            if original.size != FRAME_SIZE:
                raise ValueError(f"{source} must be {FRAME_SIZE}, got {original.size}")
            image = original.convert("RGB")
        source_hashes[key] = hashlib.sha256(source.read_bytes()).hexdigest()
        x = index % COLS * FRAME_SIZE[0]
        y = index // COLS * FRAME_SIZE[1]
        atlas.paste(image, (x, y))
        env_frames[key] = {
            "atlas": "environment",
            "frame": {"x": x, "y": y, "w": FRAME_SIZE[0], "h": FRAME_SIZE[1]},
        }

    ATLAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_PATH, optimize=True)
    target_dir = workspace / "assets/imagegen"
    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ATLAS_PATH, target_dir / "environment-atlas.png")
    provenance = {
        "schemaVersion": "loreweaver.environment-atlas-provenance.v1",
        "generator": "OpenAI built-in image_gen",
        "generatedDate": "2026-09-23",
        "promptSet": "assets/imagegen/environments/PROMPTS.md",
        "sourceFrameSize": {"w": FRAME_SIZE[0], "h": FRAME_SIZE[1]},
        "sourceFramesSha256": source_hashes,
        "atlasSha256": hashlib.sha256(ATLAS_PATH.read_bytes()).hexdigest(),
        "atlasLayout": {"cols": COLS, "rows": rows, "maxEdge": 4096},
    }
    provenance_path = ROOT / "assets/imagegen/environments/provenance.json"
    provenance_path.write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    shutil.copy2(provenance_path, target_dir / "environment-provenance.json")

    landscape_provenance_path = LANDSCAPE_DIR / "provenance.json"
    landscape_provenance = json.loads(landscape_provenance_path.read_text(encoding="utf-8"))
    landscape_target = target_dir / "landscape"
    landscape_target.mkdir(parents=True, exist_ok=True)
    for name in LANDSCAPE_KEYS:
        source = LANDSCAPE_DIR / name
        with Image.open(source) as image:
            if image.size != (1672, 941):
                raise ValueError(f"{source} must be 1672x941, got {image.size}")
        actual_sha = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual_sha != landscape_provenance["sha256"].get(name):
            raise ValueError(f"landscape source hash mismatch: {source}")
        shutil.copy2(source, landscape_target / name)
    shutil.copy2(LANDSCAPE_DIR / "PROMPTS.md", landscape_target / "PROMPTS.md")
    shutil.copy2(landscape_provenance_path, landscape_target / "provenance.json")

    manifest_path = target_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    frames = manifest.setdefault("frames", {})
    for key in ENV_KEYS:
        frames[key] = env_frames[key]
    manifest["environmentAtlas"] = {
        "image": "assets/imagegen/environment-atlas.png",
        "size": {"w": atlas_size[0], "h": atlas_size[1]},
        "frameSize": {"w": FRAME_SIZE[0], "h": FRAME_SIZE[1]},
        "source": "assets/imagegen/environments/frames",
        "provenancePath": "assets/imagegen/environment-provenance.json",
    }
    serialized = json.dumps(manifest, ensure_ascii=False, indent=2)
    manifest_path.write_text(serialized + "\n", encoding="utf-8")
    (target_dir / "manifest.js").write_text(
        "export default " + serialized + ";\n", encoding="utf-8"
    )
    return {
        "workspace": str(workspace),
        "atlas": str(target_dir / "environment-atlas.png"),
        "atlasSize": atlas_size,
        "frames": list(env_frames),
        "landscapeFrames": list(LANDSCAPE_KEYS),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--workspace",
        required=True,
        type=Path,
        help="Workspace directory containing assets/imagegen/manifest.json",
    )
    args = parser.parse_args()
    print(json.dumps(pack(args.workspace.resolve()), ensure_ascii=False, indent=2))
