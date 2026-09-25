#!/usr/bin/env python3
"""Keep every finite arena wave on packed character sprites after future repacks."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ATLAS_DIR = ROOT / "data/workspaces/xuanjie-shimu-local/assets/imagegen"
REPORT = ROOT / "data/workspaces/xuanjie-shimu-local/reports/arena_wave_art_aliases_latest.json"
SOURCES = {
    "enemy_bandit_cultivator": [f"enemy_arena_elite_{wave}" for wave in range(1, 6)],
    "enemy_human_genius": [f"enemy_arena_boss_{wave}" for wave in range(1, 6)],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run() -> None:
    observations = []
    for directory in (ATLAS_DIR / "character-pack", ATLAS_DIR):
        manifest_path = directory / "manifest.json"
        provenance_path = directory / "provenance.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        frames = manifest["frames"]
        added = []
        for source, targets in SOURCES.items():
            source_frames = {key: value for key, value in frames.items()
                             if key == source or key.startswith(f"{source}_")}
            if not source_frames:
                raise ValueError(f"missing source art: {source}")
            for target in targets:
                for source_key, frame in source_frames.items():
                    target_key = target + source_key[len(source):]
                    if target_key in frames:
                        if frames[target_key]["frame"] != frame["frame"]:
                            raise ValueError(f"existing alias points to different pixels: {target_key}")
                    else:
                        frames[target_key] = deepcopy(frame)
                        added.append(target_key)
                aliases = provenance.setdefault("aliases", {}).setdefault(source, [])
                if target not in aliases:
                    aliases.append(target)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        observations.append({"manifest": str(manifest_path.relative_to(ROOT)),
                             "manifestSha256": sha256(manifest_path),
                             "provenanceSha256": sha256(provenance_path),
                             "addedFrameKeys": len(added), "frameKeysTotal": len(frames)})
    REPORT.write_text(json.dumps({"status": "passed", "waves": [1, 2, 3, 4, 5],
                                  "observations": observations}, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(json.dumps({"status": "passed", "observations": observations}, ensure_ascii=False))


if __name__ == "__main__":
    run()
