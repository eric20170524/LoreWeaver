#!/usr/bin/env python3
"""Install the approved cold-iron Shi Mu attack poses into existing atlas cells."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/imagegen/cold-blade/shi_mu_cold_blade_attack_2x2.png"
ATLAS_DIR = ROOT / "data/workspaces/xuanjie-shimu-local/assets/imagegen"
REPORT = ROOT / "data/workspaces/xuanjie-shimu-local/reports/cold_blade_integration_latest.json"
KEYS = [f"player_attack_{index}" for index in range(4)]
# The third blade extends a little past the generator's nominal 2x2 seam.
# These non-overlapping regions retain each complete pose before alpha trimming.
REGIONS = [(0, 0, 680, 627), (680, 0, 1254, 627),
           (0, 627, 700, 1254), (700, 627, 1254, 1254)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fit_pose(source: Image.Image, region: tuple[int, int, int, int], size: int = 227) -> Image.Image:
    pose = source.crop(region)
    alpha = pose.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"empty pose in {region}")
    pose = pose.crop(bbox)
    scale = min((size - 8) / pose.width, (size - 8) / pose.height)
    fitted = pose.resize((round(pose.width * scale), round(pose.height * scale)), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (size, size))
    cell.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return cell


def run() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1254, 1254):
        raise ValueError(f"unexpected approved sheet size: {source.size}")
    cells = [fit_pose(source, region) for region in REGIONS]
    distinct = []
    for first, second in zip(cells, cells[1:]):
        difference = ImageChops.difference(first, second).convert("RGB")
        changed = sum(max(difference.getpixel((x, y))) > 24
                      for y in range(227) for x in range(227))
        if changed < 2500:
            raise ValueError(f"near duplicate poses: {changed}")
        distinct.append(changed)

    atlas_hashes = {}
    for directory in (ATLAS_DIR / "character-pack", ATLAS_DIR):
        atlas_path = directory / "atlas.png"
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        atlas = Image.open(atlas_path).convert("RGBA")
        if max(atlas.size) > 4096:
            raise ValueError(f"atlas exceeds WebGL texture limit: {atlas.size}")
        for index, key in enumerate(KEYS):
            rect = manifest["frames"][key]["frame"]
            x, y, width, height = (rect[field] for field in ("x", "y", "w", "h"))
            if (width, height) != (227, 227):
                raise ValueError(f"unexpected cell for {key}: {rect}")
            atlas.paste(cells[index], (x, y))
        atlas.save(atlas_path, optimize=True)
        atlas_hashes[str(atlas_path.relative_to(ROOT))] = sha256(atlas_path)
        provenance_path = directory / "provenance.json"
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        provenance["runtimeAtlasSha256"] = sha256(atlas_path)
        provenance["playerColdBlade"] = {
            "actionSource": str(SOURCE.relative_to(ROOT)),
            "actionSourceSha256": sha256(SOURCE),
            "actionFrameOrder": ["raise", "sweep", "strike", "recover"],
            "note": "Black iron blade; later flame remains a separate runtime effect.",
        }
        provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT.write_text(json.dumps({
        "status": "passed", "source": str(SOURCE.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE), "frameKeys": KEYS,
        "adjacentChangedPixels227": distinct, "atlasSha256": atlas_hashes,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(REPORT)


if __name__ == "__main__":
    run()
