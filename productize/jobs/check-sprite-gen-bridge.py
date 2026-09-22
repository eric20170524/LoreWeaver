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

        from PIL import Image
        red = Image.new("RGBA", (64, 64), (255, 0, 0, 255))
        blue = Image.new("RGBA", (64, 64), (0, 0, 255, 255))
        for name, color, prefix, image in (
            ("hero", (255, 0, 0, 255), "player", red),
            ("bandit", (0, 0, 255, 255), "enemy_bandit_cultivator", blue),
        ):
            cand = ws / "assets/imagegen/sprite-gen" / name / "loreweaver"
            cand.mkdir(parents=True, exist_ok=True)
            image.save(cand / "atlas.png")
            (cand / "manifest.json").write_text(json.dumps({
                "semanticPrefix": prefix,
                "clips": {"idle": {"keys": [f"{prefix}_idle_0"], "fps": 4, "loop": True}},
                "frameSize": {"w": 64, "h": 64},
                "frames": {prefix: {"frame": {"x": 0, "y": 0, "w": 64, "h": 64}}, f"{prefix}_idle_0": {"frame": {"x": 0, "y": 0, "w": 64, "h": 64}}},
            }), encoding="utf-8")
            (cand / "provenance.json").write_text("{}", encoding="utf-8")
        try:
            module.pack_candidates(ws, ["hero", "bandit"], columns=2, max_edge=100, force=True)
        except module.BridgeError as exc:
            assert str(exc).startswith("atlas_exceeds_webgl_max_edge:")
        else:
            raise AssertionError("pack accepted an atlas larger than the WebGL max edge")
        packed = module.pack_candidates(
            ws, ["hero", "bandit"],
            aliases={"enemy_bandit_cultivator": ["enemy_arena_elite_1"]},
            columns=2, max_edge=4096, force=True,
        )
        assert packed["status"] == "packed"
        assert packed["atlasSize"] == {"w": 128, "h": 64}
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert runtime["frames"]["player"]["frame"]["x"] == 0
        assert runtime["frames"]["enemy_bandit_cultivator"]["frame"]["x"] == 64
        assert runtime["frames"]["enemy_arena_elite_1"]["frame"]["x"] == 64
        assert runtime["atlasSize"]["w"] <= module.MAX_ATLAS_EDGE
        assert runtime["atlasSize"]["h"] <= module.MAX_ATLAS_EDGE

    route_text = (ROOT / "backend" / "sprite_gen_routes.py").read_text(encoding="utf-8")
    for endpoint in (
        "/imagegen/sprite-gen/status",
        "/workspaces/{ws_id}/imagegen/sprite-gen/generate",
        "/workspaces/{ws_id}/imagegen/sprite-gen/adopt",
        "/workspaces/{ws_id}/imagegen/sprite-gen/promote",
        "/workspaces/{ws_id}/imagegen/sprite-gen/pack",
    ):
        assert endpoint in route_text
    assert module.VERSION == "2.5.3"
    requirements = (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8")
    assert module.PIN in requirements
    assert 'python_version >= "3.11"' in requirements

    print(json.dumps({"status": "passed", "check": "sprite-gen-bridge", "version": module.VERSION}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
