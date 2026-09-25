#!/usr/bin/env python3
"""Verify the exact candidate ZIP carries the full cold-iron player motion set."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data/workspaces/xuanjie-shimu-local/reports"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def warm_pixels(image: Image.Image) -> int:
    return sum(1 for red, green, blue, alpha in image.get_flattened_data()
               if alpha > 64 and red > 170 and 65 < green < 175 and blue < 80
               and red > green * 1.3)


def main() -> None:
    anchor = json.loads((REPORTS / "standalone_browser_report.json").read_text())
    artifact = ROOT / anchor["artifact"]
    if anchor["status"] != "passed" or sha256(artifact) != anchor["artifactSha256"]:
        raise ValueError("exact candidate identity missing")
    with zipfile.ZipFile(artifact) as archive:
        atlas_name = next(name for name in archive.namelist() if name.endswith("/assets/imagegen/atlas.png"))
        manifest_name = next(name for name in archive.namelist() if name.endswith("/assets/imagegen/manifest.json"))
        atlas = Image.open(io.BytesIO(archive.read(atlas_name))).convert("RGBA")
        manifest = json.loads(archive.read(manifest_name))
    if max(atlas.size) > 4096:
        raise ValueError(f"atlas exceeds WebGL limit: {atlas.size}")

    local_atlas = Image.open(ROOT / "data/workspaces/xuanjie-shimu-local/assets/imagegen/atlas.png").convert("RGBA")
    keys = [*(f"player_idle_{index}" for index in range(4)),
            *(f"player_walk_{index}" for index in range(6)),
            *(f"player_attack_{index}" for index in range(4)),
            *(f"player_hurt_{index}" for index in range(2)),
            *(f"player_death_{index}" for index in range(4))]
    frames = []
    for key in keys:
        rect = manifest["frames"][key]["frame"]
        box = (rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"])
        frame = atlas.crop(box)
        if frame.getchannel("A").getbbox() is None or warm_pixels(frame) >= 150:
            raise ValueError(f"warm or empty blade frame: {key}")
        if ImageChops.difference(frame, local_atlas.crop(box)).getbbox():
            raise ValueError(f"package/source atlas mismatch: {key}")
        frames.append({"key": key, "warmPixels": warm_pixels(frame), "bbox": frame.getchannel("A").getbbox()})

    report = {
        "status": "passed", "artifact": anchor["artifact"],
        "artifactSha256": anchor["artifactSha256"], "atlasSize": atlas.size,
        "frames": frames,
        "note": "Pixel predicate detects bright orange flame; warm clothing trim remains below 150 pixels per frame.",
    }
    path = REPORTS / "standalone_cold_blade_latest.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
