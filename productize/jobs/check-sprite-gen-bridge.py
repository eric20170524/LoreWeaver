#!/usr/bin/env python3
"""Deterministic contract check for the LoreWeaver sprite-gen adapter."""
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / "minigame_master" / "capabilities" / "imagegen" / "sprite_gen_adapter.py"
spec = importlib.util.spec_from_file_location("sprite_gen_adapter", ADAPTER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"cannot load sprite-gen adapter: {ADAPTER}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="lw-sprite-gen-") as tmp:
        ws = Path(tmp) / "workspace"
        run = ws / "assets/imagegen/sprite-gen/hero/run"
        run.mkdir(parents=True)
        (run / "sprite-sheet-alpha.png").write_bytes(b"synthetic-png-fixture")
        (run / "manifest.json").write_text(json.dumps({
            "sprite_sheet_alpha": "sprite-sheet-alpha.png",
            "degraded_static_fallback": False,
            "animation": {"rows": {
                "idle": {"fps": 4, "loop": True},
                "walk": {"fps": 8, "loop": True},
                "attack": {"fps": 8, "loop": False},
            }},
            "frame_layout": {
                "sheetWidth": 128, "sheetHeight": 128,
                "cellWidth": 64, "cellHeight": 64,
                "rows": {
                    "idle": [{"x": 0, "y": 0, "w": 64, "h": 64}, {"x": 64, "y": 0, "w": 64, "h": 64}],
                    "walk": [{"x": 0, "y": 64, "w": 64, "h": 64}, {"x": 64, "y": 64, "w": 64, "h": 64}],
                    "attack": [{"x": 0, "y": 0, "w": 64, "h": 64}],
                },
            },
        }, indent=2), encoding="utf-8")

        result = module.adopt(ws, run, "hero", "player")
        assert result["status"] == "candidate_ready"
        candidate = ws / result["candidateDir"]
        manifest = json.loads((candidate / "manifest.json").read_text(encoding="utf-8"))
        expected = {
            "player", "player_idle", "player_idle_0", "player_idle_1",
            "player_walk", "player_walk_0", "player_walk_1",
            "player_attack", "player_attack_0",
        }
        assert expected.issubset(manifest["frames"])
        assert manifest["clips"]["walk"]["keys"] == ["player_walk_0", "player_walk_1"]
        assert manifest["atlasImage"].endswith("/loreweaver/atlas.png")

        promoted = module.promote(ws, "hero", False)
        assert promoted["status"] == "promoted"
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert runtime["atlasImage"] == "assets/imagegen/atlas.png"
        assert runtime["generatedAtlasStatus"] == "sprite_gen_promoted"
        assert (ws / "assets/imagegen/manifest.js").read_text(encoding="utf-8").startswith("export default {")

        (ws / "assets/imagegen/atlas.png").write_bytes(b"different-runtime")
        try:
            module.promote(ws, "hero", False)
        except module.BridgeError as exc:
            assert str(exc) == "runtime_art_exists_use_force"
        else:
            raise AssertionError("promotion overwrote a different runtime atlas without --force")

    print(json.dumps({"status": "passed", "check": "sprite-gen-bridge"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
