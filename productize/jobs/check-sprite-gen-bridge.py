#!/usr/bin/env python3
"""Deterministic contract check for the LoreWeaver sprite-gen adapter."""
from __future__ import annotations

import importlib.util
import json
import shutil
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


def write_pack_character(ws: Path, name: str, prefix: str, color: tuple[int, int, int, int]) -> None:
    cand = ws / "assets/imagegen/sprite-gen" / name / "loreweaver"
    cand.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (64, 64), color).save(cand / "atlas.png")
    (cand / "manifest.json").write_text(json.dumps({
        "semanticPrefix": prefix,
        "clips": {"idle": {"keys": [f"{prefix}_idle_0"], "fps": 4, "loop": True}},
        "frameSize": {"w": 64, "h": 64},
        "frames": {
            prefix: {"frame": {"x": 0, "y": 0, "w": 64, "h": 64}},
            f"{prefix}_idle_0": {"frame": {"x": 0, "y": 0, "w": 64, "h": 64}},
        },
    }), encoding="utf-8")
    (cand / "provenance.json").write_text("{}", encoding="utf-8")


def write_effect(ws: Path, name: str, prefix: str, color: tuple[int, int, int, int]) -> None:
    fx = ws / "assets/imagegen/sprite-gen" / name / "loreweaver"
    fx.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (32, 16), color).save(fx / "atlas.png")
    (fx / "manifest.json").write_text(json.dumps({
        "assetKind": "effect",
        "semanticPrefix": prefix,
        "clips": {"impact": {"keys": [f"{prefix}_impact_0"], "fps": 15, "loop": False}},
        "clipSets": {prefix: {"impact": {"keys": [f"{prefix}_impact_0"], "fps": 15, "loop": False}}},
        "frames": {f"{prefix}_impact_0": {"frame": {"x": 0, "y": 0, "w": 32, "h": 16}}},
    }), encoding="utf-8")
    (fx / "provenance.json").write_text(json.dumps({
        "assetId": name,
        "assetKind": "effect",
        "semanticPrefix": prefix,
        "promoted": False,
    }), encoding="utf-8")


def check_repack_snapshot_and_straight_alpha() -> None:
    """Pack A, append, pack B, append again. B must survive, and alpha 128 stays 128."""
    with tempfile.TemporaryDirectory(prefix="lw-sprite-gen-repack-") as tmp:
        ws = Path(tmp) / "workspace"
        write_pack_character(ws, "hero", "player", (255, 0, 0, 255))
        write_pack_character(ws, "bandit", "enemy_bandit_cultivator", (0, 0, 255, 255))
        write_effect(ws, "soft_glow", "vfx_soft_glow", (200, 80, 40, 128))
        module.pack_candidates(ws, ["hero"], columns=2, max_edge=4096, force=True)
        module.append_effects(ws, ["soft_glow"], force=True)
        first = Image.open(ws / "assets/imagegen/atlas.png").convert("RGBA")
        assert first.getpixel((0, 0)) == (255, 0, 0, 255)
        assert first.getpixel((64, 0)) == (200, 80, 40, 128)
        module.pack_candidates(ws, ["bandit"], columns=2, max_edge=4096, force=True)
        snap = Image.open(ws / "assets/imagegen/character-pack/atlas.png").convert("RGBA")
        assert snap.getpixel((0, 0)) == (0, 0, 255, 255)
        snap_manifest = json.loads((ws / "assets/imagegen/character-pack/manifest.json").read_text(encoding="utf-8"))
        assert "player" not in snap_manifest["frames"]
        assert snap_manifest["frames"]["enemy_bandit_cultivator"]["frame"]["x"] == 0
        module.append_effects(ws, ["soft_glow"], force=True)
        atlas = Image.open(ws / "assets/imagegen/atlas.png").convert("RGBA")
        assert atlas.getpixel((0, 0)) == (0, 0, 255, 255)
        assert atlas.getpixel((64, 0)) == (200, 80, 40, 128)
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert "player" not in runtime["frames"]
        assert runtime["frames"]["enemy_bandit_cultivator"]["frame"] == {"x": 0, "y": 0, "w": 64, "h": 64}
        assert runtime["frames"]["vfx_soft_glow_impact_0"]["frame"]["x"] == 64


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

        layers_dir = hero / "layers"
        layers_dir.mkdir(parents=True)
        Image.new("RGBA", (128, 64), (0, 0, 0, 0)).save(layers_dir / "armed_walk.png")
        (layers_dir / "armed_walk.manifest.json").write_text(json.dumps({
            "sprite_sheet_alpha": "armed_walk.png",
            "degraded_static_fallback": False,
            "animation": {"rows": {"armed_walk": {"fps": 10, "loop": True}}},
            "frame_layout": {
                "sheetWidth": 128, "sheetHeight": 64,
                "cellWidth": 64, "cellHeight": 64,
                "rows": {"armed_walk": [
                    {"x": 0, "y": 0, "w": 64, "h": 64},
                    {"x": 64, "y": 0, "w": 64, "h": 64},
                ]},
            },
        }, indent=2), encoding="utf-8")

        video_set = ws / "assets/imagegen/sprite-gen/hero-video/video-set"
        video_set.mkdir(parents=True)
        video_items = []
        for state, frames, delay_ms, loop, kind in (
            ("walk", 12, 41.67, True, "periodic"),
            ("attack", 9, 41.67, False, "one-shot"),
        ):
            item_name = f"side-{state}"
            loop_dir = video_set / item_name / "loop"
            loop_dir.mkdir(parents=True)
            Image.new("RGBA", (frames * 32, 48), (0, 0, 0, 0)).save(loop_dir / f"{item_name}.strip.png")
            (loop_dir / f"{item_name}.strip.json").write_text(json.dumps({
                "frames": frames, "w": 32, "h": 48,
                "delay_ms": delay_ms, "loop": loop, "kind": kind,
            }, indent=2), encoding="utf-8")
            video_items.append({
                "item": item_name, "direction": "side", "state": state, "ok": True,
            })
        (video_set / "set.report.json").write_text(json.dumps({
            "kind": "sprite-gen-video-set-report",
            "failed": [],
            "items": video_items,
        }, indent=2), encoding="utf-8")

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

        layer = module.adopt_layer(ws, hero, "armed_walk", "hero-armed", "player_armed")
        assert layer["assetKind"] == "layer"
        promoted_layer = module.promote(ws, "hero-armed", False)
        assert promoted_layer["assetCount"] == 3
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert runtime["clipSets"]["player_armed"]["armed_walk"]["fps"] == 10

        video = module.adopt_video_set(ws, video_set, "hero-video", "player", direction="side", states=["walk", "attack"])
        assert video["assetKind"] == "video-loop"
        video_manifest = json.loads((ws / video["candidateDir"] / "manifest.json").read_text(encoding="utf-8"))
        assert len(video_manifest["clipSets"]["player"]["walk"]["keys"]) == 12
        video_fps = video_manifest["clipSets"]["player"]["walk"]["fps"]
        assert 23.9 < video_fps < 24.1
        assert video_fps != 23
        assert video_manifest["clipSets"]["player"]["attack"]["loop"] is False
        assert video_manifest["clipSets"]["player"]["attack"]["kind"] == "one-shot"

        promoted_video = module.promote(ws, "hero-video", False)
        assert "hero" in promoted_video["replacedAssets"]
        runtime = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert len(runtime["clipSets"]["player"]["walk"]["keys"]) == 12
        assert runtime["clipSets"]["player"]["attack"]["loop"] is False
        assert "player_armed" in runtime["clipSets"]
        assert "vfx_void_slash" in runtime["clipSets"]

        (ws / "assets/imagegen/atlas.png").write_bytes(b"externally-modified")
        try:
            module.promote(ws, "hero", False)
        except module.BridgeError as exc:
            assert str(exc) == "runtime_art_modified_use_force"
        else:
            raise AssertionError("promotion ignored an externally modified runtime atlas")

        # Explicit force takeover of a foreign runtime starts from the selected
        # candidate only; stale sprite-gen promoted flags must not be resurrected.
        (ws / "assets/imagegen/provenance.json").write_text(json.dumps({
            "schemaVersion": "foreign.runtime.v1",
            "provider": "other-art-pipeline",
            "characterId": "ghost",
        }), encoding="utf-8")
        forced = module.promote(ws, "hero", True)
        assert forced["assetCount"] == 1
        assert forced["semanticPrefixes"] == ["player"]

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
        assert runtime["clipSets"]["player"]["idle"]["keys"] == ["player_idle_0"]
        assert runtime["clipSets"]["enemy_bandit_cultivator"]["idle"]["loop"] is True

        fitted = module.pack_candidates(
            ws, ["hero", "bandit", "hero"],
            columns=2, max_edge=100, force=True, fit_max_edge=True,
        )
        assert fitted["atlasSize"]["w"] <= 100
        assert fitted["atlasSize"]["h"] <= 100
        fitted_prov = json.loads((ws / "assets/imagegen/provenance.json").read_text(encoding="utf-8"))
        assert "fit_max_edge" in fitted_prov["postprocess"]
        assert fitted_prov["atlasLayout"]["cols"] == 2
        assert fitted_prov["atlasLayout"]["rows"] == 2

        # Packed character atlas: effects occupy the unused cell and must not move characters.
        clear = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
        clear.paste(Image.new("RGBA", (64, 64), (255, 0, 0, 255)), (0, 0))
        clear.save(ws / "assets/imagegen/atlas.png")
        packed_manifest = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        packed_manifest["frames"] = {
            "player_idle_0": {"frame": {"x": 0, "y": 0, "w": 64, "h": 64}}
        }
        (ws / "assets/imagegen/manifest.json").write_text(json.dumps(packed_manifest), encoding="utf-8")
        (ws / "assets/imagegen/provenance.json").write_text(json.dumps({
            "schemaVersion": "loreweaver.sprite-gen-provenance.v1",
            "provider": "sprite-gen",
            "characters": ["hero"],
            "atlasLayout": {"cols": 2, "rows": 1, "cell": {"w": 64, "h": 64}},
            "runtimeAtlasSha256": "ignored-by-force",
        }), encoding="utf-8")
        # pack now records a character snapshot. This case hand-builds the runtime
        # atlas, so drop that snapshot and let append copy the prepared sheet.
        hand_snapshot = ws / "assets/imagegen/character-pack"
        if hand_snapshot.exists():
            shutil.rmtree(hand_snapshot)
        fx = ws / "assets/imagegen/sprite-gen/void_slash/loreweaver"
        fx.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (32, 16), (0, 255, 255, 255)).save(fx / "atlas.png")
        (fx / "manifest.json").write_text(json.dumps({
            "assetKind": "effect",
            "semanticPrefix": "vfx_void_slash",
            "clips": {"impact": {"keys": ["vfx_void_slash_impact_0"], "fps": 15, "loop": False}},
            "clipSets": {"vfx_void_slash": {"impact": {"keys": ["vfx_void_slash_impact_0"], "fps": 15, "loop": False}}},
            "frames": {
                "vfx_void_slash_impact_0": {"frame": {"x": 0, "y": 0, "w": 32, "h": 16}}
            },
        }), encoding="utf-8")
        (fx / "provenance.json").write_text(json.dumps({
            "assetId": "void_slash",
            "assetKind": "effect",
            "semanticPrefix": "vfx_void_slash",
            "promoted": False,
        }), encoding="utf-8")
        appended = module.append_effects(ws, ["void_slash"], force=True)
        assert appended["status"] == "effects_appended"
        assert appended["atlasSize"] == {"w": 128, "h": 64}
        appended_manifest = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        assert appended_manifest["frames"]["player_idle_0"]["frame"] == {"x": 0, "y": 0, "w": 64, "h": 64}
        assert appended_manifest["frames"]["vfx_void_slash_impact_0"]["frame"]["x"] == 64
        assert appended_manifest["clipSets"]["vfx_void_slash"]["impact"]["loop"] is False
        assert json.loads((fx / "provenance.json").read_text(encoding="utf-8"))["promoted"] is False

        wide = ws / "assets/imagegen/sprite-gen/wide_glow/loreweaver"
        wide.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (90, 40), (255, 128, 0, 128)).save(wide / "atlas.png")
        (wide / "manifest.json").write_text(json.dumps({
            "assetKind": "effect",
            "semanticPrefix": "vfx_wide_glow",
            "clips": {"loop": {"keys": ["vfx_wide_glow_loop_0"], "fps": 12, "loop": True}},
            "clipSets": {"vfx_wide_glow": {"loop": {"keys": ["vfx_wide_glow_loop_0"], "fps": 12, "loop": True}}},
            "frames": {"vfx_wide_glow_loop_0": {"frame": {"x": 0, "y": 0, "w": 90, "h": 40}}},
        }), encoding="utf-8")
        (wide / "provenance.json").write_text(json.dumps({
            "assetId": "wide_glow", "assetKind": "effect", "semanticPrefix": "vfx_wide_glow", "promoted": False,
        }), encoding="utf-8")
        scaled = module.append_effects(ws, ["wide_glow"], force=True)
        assert scaled["atlasSize"] == {"w": 128, "h": 64}
        scaled_manifest = json.loads((ws / "assets/imagegen/manifest.json").read_text(encoding="utf-8"))
        wide_frame = scaled_manifest["frames"]["vfx_wide_glow_loop_0"]["frame"]
        assert wide_frame["w"] <= 64 and wide_frame["h"] <= 64
        assert wide_frame["x"] == 64

    check_repack_snapshot_and_straight_alpha()

    route_text = (ROOT / "backend" / "sprite_gen_routes.py").read_text(encoding="utf-8")
    for endpoint in (
        "/imagegen/sprite-gen/status",
        "/workspaces/{ws_id}/imagegen/sprite-gen/generate",
        "/workspaces/{ws_id}/imagegen/sprite-gen/compose-layer",
        "/workspaces/{ws_id}/imagegen/sprite-gen/video-set",
        "/workspaces/{ws_id}/imagegen/sprite-gen/adopt",
        "/workspaces/{ws_id}/imagegen/sprite-gen/promote",
        "/workspaces/{ws_id}/imagegen/sprite-gen/pack",
    ):
        assert endpoint in route_text
    assert 'subject not in {"character", "effect"}' in route_text
    assert 'payload.get("assetId") or payload.get("characterId")' in route_text

    bridge_text = (ROOT / "minigame_master" / "capabilities" / "imagegen" / "sprite_gen_bridge.py").read_text(encoding="utf-8")
    assert "--subject" in bridge_text
    assert "EFFECT_STATES" in bridge_text
    assert '--fit-align-y", "center"' in bridge_text
    assert "compose-layer" in bridge_text
    assert "video-set" in bridge_text
    assert "layer-contract-json" in bridge_text
    assert "multi-candidate-bundle" in bridge_text

    assert module.VERSION == "2.5.3"
    requirements = (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8")
    assert module.PIN in requirements
    assert 'python_version >= "3.11"' in requirements

    print(json.dumps({
        "status": "passed",
        "check": "sprite-gen-bridge",
        "version": module.VERSION,
        "capabilities": ["character", "effect", "layer", "video-loop", "multi-candidate-bundle"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
