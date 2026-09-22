#!/usr/bin/env python3
"""Deterministic contract check for the LoreWeaver sprite-gen adapter."""
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / "minigame_master" / "capabilities" / "imagegen" / "sprite_gen_adapter.py"
spec = importlib.util.spec_from_file_location("sprite_gen_adapter", ADAPTER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"cannot load sprite-gen adapter: {ADAPTER}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def make_run(ws: Path, asset_id: str, subject: str, rows: dict, timings: dict, size: tuple[int, int]) -> Path:
    run = ws / f"assets/imagegen/sprite-gen/{asset_id}/run"
    run.mkdir(parents=True)
    atlas = Image.new("RGBA", size, (0, 0, 0, 0))
    atlas.save(run / "sprite-sheet-alpha.png")
    (run / "sprite-request.json").write_text(
        json.dumps({"subject": subject, "states": {name: {} for name in rows}}, indent=2),
        encoding="utf-8",
    )
    (run / "manifest.json").write_text(json.dumps({
        "sprite_sheet_alpha": "sprite-sheet-alpha.png",
        "degraded_static_fallback": False,
        "subject": subject,
        "animation": {"rows": timings},
        "frame_layout": {
            "sheetWidth": size[0], "sheetHeight": size[1],
            "cellWidth": 64, "cellHeight": 64,
            "rows": rows,
        },
    }, indent=2), encoding="utf-8")
    return run


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="lw-sprite-gen-") as tmp:
        ws = Path(tmp) / "workspace"
        hero = make_run(
            ws,
            "hero",
            "character",
            {
                "idle": [{"x": 0, "y": 0, "w": 64, "h": 64}, {"x": 64, "y": 0, "w": 64, "h": 64}],
                "walk": [{"x": 0, "y": 64, "w": 64, "h": 64}, {"x": 64, "y": 64, "w": 64, "h": 64}],
                "attack": [{"x": 0, "y": 0, "w": 64, "h": 64}],
            },
            {
                "idle": {"fps": 4, "loop": True},
                "walk": {"fps": 8, "loop": True},
                "attack": {"fps": 8, "loop": False},
            },
            (128, 128),
        )
        effect = make_run(
            ws,
            "void-slash",
            "effect",
            {
                "cast": [{"x": 0, "y": 0, "w": 64, "h": 64}],
                "loop": [
                    {"x": 0, "y": 0, "w": 64, "h": 64},
                    {"x": 64, "y": 0, "w": 64, "h": 64},
                    {"x": 128, "y": 0, "w": 64, "h": 64},
                ],
                "impact": [{"x": 0, "y": 0, "w": 64, "h": 64}],
            },
            {
                "cast": {"fps": 12, "loop": False},
                "loop": {"fps": 15, "loop": True},
                "impact": {"fps": 15, "loop": False},
            },
            (192, 64),
        )

        result = module.adopt(ws, hero, "hero", "player")
        assert result["status"] == "candidate_ready"
        candidate = ws / result["candidateDir"]
        manifest = json.loads((candidate / "manifest.json").read_text(encoding="utf-8"))
        expected = {
            "player", "player_idle", "player_idle_0", "player_idle_1",
            "player_walk", "player_walk_0", "player_walk_1",
            "player_attack", "player_attack_0",
        }
        assert expected.issubset(manifest["frames"])
        assert manifest["clipSets"]["player"]["walk"]["keys"] == ["player_walk_0", "player_walk_1"]
        assert manifest["assetKind"] == "character"

        fx = module.adopt(ws, effect, "void-slash", "vfx_void_slash")
        assert fx["assetKind"] == "effect"
        fx_manifest = json.loads((ws / fx["candidateDir"] / "manifest.json").read_text(encoding="utf-8"))
        assert len(fx_manifest["clipSets"]["vfx_void_slash"]["loop"]["keys"]) == 3

        promoted = module.promote(ws, "hero", False)
        assert promoted["status"] == "promoted"
        assert promoted["assetCount"] == 1
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert runtime["semanticPrefixes"] == ["player"]
        assert "player_walk_1" in runtime["frames"]

        promoted_fx = module.promote(ws, "void-slash", False)
        assert promoted_fx["assetCount"] == 2
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert set(runtime["semanticPrefixes"]) == {"player", "vfx_void_slash"}
        assert "player_walk_1" in runtime["frames"]
        assert "vfx_void_slash_loop_2" in runtime["frames"]
        assert runtime["clipSets"]["vfx_void_slash"]["loop"]["fps"] == 15
        assert runtime["clipSets"]["vfx_void_slash"]["impact"]["loop"] is False
        assert (ws / "assets/imagegen/manifest.js").read_text(encoding="utf-8").startswith("export default {")

        provenance = json.loads((ws / "assets/imagegen/provenance.json").read_text(encoding="utf-8"))
        assert len(provenance["assets"]) == 2
        assert {item["assetKind"] for item in provenance["assets"]} == {"character", "effect"}

        (ws / "assets/imagegen/atlas.png").write_bytes(b"externally-modified")
        try:
            module.promote(ws, "hero", False)
        except module.BridgeError as exc:
            assert str(exc) == "runtime_art_modified_use_force"
        else:
            raise AssertionError("promotion ignored an externally modified runtime atlas")

    route_text = (ROOT / "backend" / "sprite_gen_routes.py").read_text(encoding="utf-8")
    for endpoint in (
        "/imagegen/sprite-gen/status",
        "/workspaces/{ws_id}/imagegen/sprite-gen/generate",
        "/workspaces/{ws_id}/imagegen/sprite-gen/adopt",
        "/workspaces/{ws_id}/imagegen/sprite-gen/promote",
    ):
        assert endpoint in route_text
    assert 'subject not in {"character", "effect"}' in route_text
    assert 'payload.get("assetId") or payload.get("characterId")' in route_text

    bridge_text = (ROOT / "minigame_master" / "capabilities" / "imagegen" / "sprite_gen_bridge.py").read_text(encoding="utf-8")
    assert "--subject" in bridge_text
    assert "EFFECT_STATES" in bridge_text
    assert "multi-candidate-bundle" in bridge_text

    assert module.VERSION == "2.5.3"
    requirements = (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8")
    assert module.PIN in requirements
    assert 'python_version >= "3.11"' in requirements

    print(json.dumps({
        "status": "passed",
        "check": "sprite-gen-bridge",
        "version": module.VERSION,
        "capabilities": ["character", "effect", "multi-candidate-bundle"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
