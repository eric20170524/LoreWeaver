#!/usr/bin/env python3
"""Install the accepted silver white-ape loop into its existing effect slots."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/imagegen/white-ape-silver-v2/white_ape_silver_3x2.png"
CELL_DIR = SOURCE.parent / "cells"
ASSET_DIR = ROOT / "data/workspaces/xuanjie-shimu-local/assets/imagegen"
EFFECT_DIR = ASSET_DIR / "sprite-gen/white_ape/loreweaver"
REPORT = ROOT / "data/workspaces/xuanjie-shimu-local/reports/white_ape_silver_integration_latest.json"
KEYS = [f"vfx_white_ape_loop_{index}" for index in range(6)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1536, 1024):
        raise ValueError(f"expected a 1536x1024 3x2 sheet: {source.size}")
    CELL_DIR.mkdir(parents=True, exist_ok=True)
    cells = []
    for index, key in enumerate(KEYS):
        x, y = (index % 3) * 512, (index // 3) * 512
        cell = source.crop((x, y, x + 512, y + 512))
        opaque = cell.getchannel("A").point(lambda value: 255 if value > 16 else 0)
        bbox = opaque.getbbox()
        if not bbox or min(bbox[0], bbox[1], 512 - bbox[2], 512 - bbox[3]) < 20:
            raise ValueError(f"clipped or empty effect frame {key}: {bbox}")
        cell = cell.resize((256, 256), Image.Resampling.LANCZOS)
        cell.save(CELL_DIR / f"loop_{index}.png", optimize=True)
        cells.append(cell)
    changed_pixels = []
    for first, second in zip(cells, cells[1:]):
        difference = ImageChops.difference(first, second).convert("RGB")
        pixels = difference.tobytes()
        changed = sum(any(channel > 24 for channel in pixels[offset:offset + 3])
                      for offset in range(0, len(pixels), 3))
        if changed < 1500:
            raise ValueError(f"adjacent frames read as duplicates: {changed}")
        changed_pixels.append(changed)

    hashes = {}
    for directory in (EFFECT_DIR, ASSET_DIR):
        atlas_path = directory / "atlas.png"
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        atlas = Image.open(atlas_path).convert("RGBA")
        if max(atlas.size) > 4096:
            raise ValueError(f"atlas exceeds WebGL limit: {atlas.size}")
        for index, key in enumerate(KEYS):
            rect = manifest["frames"][key]["frame"]
            x, y, width, height = (rect[field] for field in ("x", "y", "w", "h"))
            if not (0 <= x < atlas.width and 0 <= y < atlas.height
                    and x + width <= atlas.width and y + height <= atlas.height):
                raise ValueError(f"invalid atlas frame: {key} {rect}")
            atlas.paste(cells[index].resize((width, height), Image.Resampling.LANCZOS), (x, y))
        atlas.save(atlas_path, optimize=True)
        hashes[str(atlas_path.relative_to(ROOT))] = sha256(atlas_path)
        provenance_path = directory / "provenance.json"
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        provenance.setdefault("whiteApeSilver", {})["loopSource"] = str(SOURCE.relative_to(ROOT))
        provenance["whiteApeSilver"]["loopSourceSha256"] = sha256(SOURCE)
        provenance["whiteApeSilver"]["frameKeys"] = KEYS
        if directory == ASSET_DIR:
            provenance["runtimeAtlasSha256"] = hashes[str(atlas_path.relative_to(ROOT))]
        provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    result = {
        "status": "passed", "source": str(SOURCE.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE), "frameKeys": KEYS,
        "adjacentChangedPixels256": changed_pixels, "atlasSha256": hashes,
    }
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()
