#!/usr/bin/env python3
"""Install cold-iron idle, walk, hurt and death poses without changing atlas layout."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/imagegen/cold-blade/shi_mu_cold_blade_base_4x4.png"
ATLAS_DIR = ROOT / "data/workspaces/xuanjie-shimu-local/assets/imagegen"
REPORT = ROOT / "data/workspaces/xuanjie-shimu-local/reports/cold_blade_base_integration_latest.json"
KEYS = [*(f"player_idle_{i}" for i in range(4)),
        *(f"player_walk_{i}" for i in range(6)),
        *(f"player_hurt_{i}" for i in range(2)),
        *(f"player_death_{i}" for i in range(4))]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def warm_pixels(image: Image.Image) -> int:
    return sum(1 for red, green, blue, alpha in image.get_flattened_data()
               if alpha > 64 and red > 170 and 65 < green < 175 and blue < 80
               and red > green * 1.3)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1254, 1254):
        raise ValueError(f"unexpected approved sheet size: {source.size}")
    cells = []
    counts = {}
    for index, key in enumerate(KEYS):
        col, row = index % 4, index // 4
        x0, x1 = round(col * source.width / 4), round((col + 1) * source.width / 4)
        y0, y1 = round(row * source.height / 4), round((row + 1) * source.height / 4)
        cell = source.crop((x0, y0, x1, y1))
        cell.putalpha(cell.getchannel("A").point(lambda value: 0 if value <= 12 else value))
        cell = cell.resize((227, 227), Image.Resampling.LANCZOS)
        if cell.getchannel("A").getbbox() is None:
            raise ValueError(f"empty frame: {key}")
        count = warm_pixels(cell)
        if count >= 150:
            raise ValueError(f"frame remains fiery: {key} ({count} warm pixels)")
        counts[key] = count
        cells.append(cell)

    atlas_hashes = {}
    for directory in (ATLAS_DIR / "character-pack", ATLAS_DIR):
        atlas_path = directory / "atlas.png"
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        atlas = Image.open(atlas_path).convert("RGBA")
        if max(atlas.size) > 4096:
            raise ValueError(f"atlas exceeds WebGL limit: {atlas.size}")
        for key, cell in zip(KEYS, cells):
            rect = manifest["frames"][key]["frame"]
            if (rect["w"], rect["h"]) != cell.size:
                raise ValueError(f"unexpected frame size: {key} {rect}")
            atlas.paste(cell, (rect["x"], rect["y"]))
        atlas.save(atlas_path, optimize=True)
        atlas_hashes[str(atlas_path.relative_to(ROOT))] = sha256(atlas_path)
        provenance_path = directory / "provenance.json"
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        provenance["runtimeAtlasSha256"] = sha256(atlas_path)
        provenance.setdefault("playerColdBlade", {})["baseSource"] = str(SOURCE.relative_to(ROOT))
        provenance["playerColdBlade"]["baseSourceSha256"] = sha256(SOURCE)
        provenance["playerColdBlade"]["baseFrameKeys"] = KEYS
        provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT.write_text(json.dumps({"status": "passed", "source": str(SOURCE.relative_to(ROOT)),
                                  "sourceSha256": sha256(SOURCE), "frameKeys": KEYS,
                                  "warmPixelCounts": counts, "atlasSha256": atlas_hashes},
                                 ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(REPORT)


if __name__ == "__main__":
    main()
