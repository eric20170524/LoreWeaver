#!/usr/bin/env python3
"""
Antigravity Imagegen Bridge for LoreWeaver Art Department.

Reads a workspace's imagegen manifest or artAssets specification and prints
or formats the Antigravity `generate_image` tool invocation arguments for batch
asset generation.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List


def load_workspace_manifest(ws_dir: str) -> Dict[str, Any]:
    manifest_path = os.path.join(ws_dir, "assets", "imagegen", "manifest.json")
    if not os.path.isfile(manifest_path):
        # Fall back to root manifest or art-pipeline
        alt_path = os.path.join(ws_dir, "loreweaver", "departments", "prep", "art.v1.json")
        if os.path.isfile(alt_path):
            with open(alt_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_generate_image_tasks(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    tasks: List[Dict[str, Any]] = []
    frames = manifest.get("frames") or manifest.get("items") or []

    if isinstance(frames, dict):
        for key, info in frames.items():
            prompt = info.get("prompt") if isinstance(info, dict) else str(info)
            aspect = info.get("aspectRatio", "1:1") if isinstance(info, dict) else "1:1"
            tasks.append({
                "tool": "generate_image",
                "ImageName": f"lw_{key.replace('-', '_')}",
                "Prompt": prompt or f"2D game asset sprite for {key}, pixel art, game UI style",
                "AspectRatio": aspect,
                "TargetKey": key
            })
    elif isinstance(frames, list):
        for item in frames:
            name = item.get("name") or item.get("id") or "asset"
            prompt = item.get("prompt") or f"2D game asset sprite for {name}, transparent background"
            aspect = item.get("aspectRatio", "1:1")
            tasks.append({
                "tool": "generate_image",
                "ImageName": f"lw_{name.replace('-', '_')}",
                "Prompt": prompt,
                "AspectRatio": aspect,
                "TargetKey": name
            })

    # Default fallback demo assets if empty
    if not tasks:
        tasks = [
            {
                "tool": "generate_image",
                "ImageName": "lw_hero_sprite",
                "Prompt": "2D game hero character sprite, side-scrolling action, vibrant color, pixel art, white background",
                "AspectRatio": "1:1",
                "TargetKey": "hero"
            },
            {
                "tool": "generate_image",
                "ImageName": "lw_enemy_boss",
                "Prompt": "2D game boss monster sprite, dark fantasy aura, isolated white background",
                "AspectRatio": "1:1",
                "TargetKey": "boss"
            },
            {
                "tool": "generate_image",
                "ImageName": "lw_env_bg_forest",
                "Prompt": "2D game background layer, mystical forest landscape, seamless parallax style",
                "AspectRatio": "16:9",
                "TargetKey": "env_bg"
            }
        ]

    return tasks


def main():
    parser = argparse.ArgumentParser(description="Antigravity Imagegen Bridge for LoreWeaver")
    parser.add_argument("--workspace", help="Workspace path or workspace ID under data/workspaces")
    parser.add_argument("--out", help="Optional JSON output path for generated tool tasks")

    args = parser.parse_args()

    ws_dir = args.workspace or ""
    if ws_dir and not os.path.isabs(ws_dir):
        lore_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        ws_dir = os.path.join(lore_root, "data", "workspaces", ws_dir)

    manifest = load_workspace_manifest(ws_dir) if ws_dir and os.path.isdir(ws_dir) else {}
    tasks = build_generate_image_tasks(manifest)

    result = {
        "status": "ready",
        "provider": os.getenv("IMAGEGEN_PROVIDER", "antigravity"),
        "antigravity_enabled": os.getenv("LOREWEAVER_ENABLE_ANTIGRAVITY_IMAGEGEN") in ("1", "true", "on"),
        "taskCount": len(tasks),
        "tasks": tasks
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(tasks)} imagegen tasks to {args.out}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
