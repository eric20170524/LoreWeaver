#!/usr/bin/env python3
"""Slice the accepted full-pose bow sheet into the existing player_bow atlas cells."""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/imagegen/bow-action-v3/shi_mu_bow_action_2x2.png"
CELL_DIR = ROOT / "assets/imagegen/bow-action-v3/cells"
ATLAS_DIR = ROOT / "data/workspaces/xuanjie-shimu-local/assets/imagegen"
REPORT = ROOT / "data/workspaces/xuanjie-shimu-local/reports/bow_action_integration_latest.json"
KEYS = [f"player_bow_attack_{i}" for i in range(4)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_sheet_seam_fragments(cell: Image.Image) -> int:
    """Drop detached pixels spilled from the upper row into a lower sheet cell."""
    width, height = cell.size
    alpha = cell.getchannel("A").load()
    rgba = cell.load()
    seen = bytearray(width * height)
    removed = 0
    for start_y in range(12):
        for start_x in range(width):
            start = start_y * width + start_x
            if seen[start] or alpha[start_x, start_y] == 0:
                continue
            queue = deque([(start_x, start_y)])
            seen[start] = 1
            points = []
            max_y = start_y
            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                max_y = max(max_y, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        offset = ny * width + nx
                        if not seen[offset] and alpha[nx, ny] > 0:
                            seen[offset] = 1
                            queue.append((nx, ny))
            if len(points) < 500 and max_y <= 10:
                for x, y in points:
                    rgba[x, y] = (0, 0, 0, 0)
                removed += len(points)
    return removed


def run() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.width != source.height or source.width % 2:
        raise ValueError(f"expected even square 2x2 sheet: {source.size}")
    side = source.width // 2
    CELL_DIR.mkdir(parents=True, exist_ok=True)
    cells = []
    seam_pixels_removed = []
    for index, key in enumerate(KEYS):
        x, y = (index % 2) * side, (index // 2) * side
        cell = source.crop((x, y, x + side, y + side)).resize((256, 256), Image.Resampling.LANCZOS)
        seam_pixels_removed.append(remove_sheet_seam_fragments(cell) if index >= 2 else 0)
        alpha_pixels = sum(pixel > 16 for pixel in cell.getchannel("A").tobytes())
        if alpha_pixels < 3000:
            raise ValueError(f"empty action frame: {key} ({alpha_pixels} opaque pixels)")
        out = CELL_DIR / f"attack_{index}.png"
        cell.save(out, optimize=True)
        cells.append(cell)

    distinct = []
    for first, second in zip(cells, cells[1:]):
        difference = ImageChops.difference(first, second).convert("RGB")
        pixels = difference.tobytes()
        changed = sum(any(channel > 24 for channel in pixels[offset:offset + 3])
                      for offset in range(0, len(pixels), 3))
        distinct.append(changed)
        if changed < 2500:
            raise ValueError(f"adjacent frames read as duplicate: {changed} changed pixels")

    atlas_hashes = {}
    for directory in (ATLAS_DIR / "character-pack", ATLAS_DIR):
        atlas_path = directory / "atlas.png"
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        atlas = Image.open(atlas_path).convert("RGBA")
        if max(atlas.size) > 4096:
            raise ValueError(f"atlas exceeds WebGL limit: {atlas.size}")
        for index, key in enumerate(KEYS):
            rect = manifest["frames"][key]["frame"]
            x, y, width, height = (rect[field] for field in ("x", "y", "w", "h"))
            if x < 0 or y < 0 or x + width > atlas.width or y + height > atlas.height:
                raise ValueError(f"invalid atlas frame: {key} {rect}")
            atlas.paste(cells[index].resize((width, height), Image.Resampling.LANCZOS), (x, y))
        atlas.save(atlas_path, optimize=True)
        atlas_hashes[str(atlas_path.relative_to(ROOT))] = sha256(atlas_path)
        provenance_path = directory / "provenance.json"
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        provenance["runtimeAtlasSha256"] = sha256(atlas_path)
        provenance.setdefault("playerBow", {})["actionSource"] = str(SOURCE.relative_to(ROOT))
        provenance["playerBow"]["actionSourceSha256"] = sha256(SOURCE)
        provenance["playerBow"]["actionFrameOrder"] = ["nock", "raise", "full_draw", "release"]
        provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    result = {
        "status": "passed",
        "source": str(SOURCE.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE),
        "frameKeys": KEYS,
        "seamPixelsRemoved": seam_pixels_removed,
        "adjacentChangedPixels256": distinct,
        "atlasSha256": atlas_hashes,
    }
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()
