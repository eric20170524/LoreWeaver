#!/usr/bin/env python3
"""Drive the shipped orchestration generator. Does not write the Shi Mu preset."""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PRESET_PATH = ROOT / "data" / "presets" / "xuanjiezhimen_fangame_preset.json"
ENV_PATH = ROOT / ".env"


def load_project_env() -> None:
    if not ENV_PATH.is_file():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def scrub_keys() -> None:
    for key in ("XAI_API_KEY", "GROK_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER"):
        os.environ.pop(key, None)
    os.environ["OLLAMA_API_BASE"] = "http://127.0.0.1:11434"


async def fallback_once() -> dict:
    from backend.agents import WorldBuilderAgent
    from backend.llm_client import resolve_provider

    provider = resolve_provider()
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        gdd = await WorldBuilderAgent.generate_gdd("石牧")
    log = buffer.getvalue()
    preset = json.loads(PRESET_PATH.read_text(encoding="utf-8"))
    if provider == "grok" or "generated via grok" in log or "generated via ollama" in log:
        raise AssertionError(f"fallback claimed a model provider: {provider} {log}")
    if provider == "ollama":
        raise AssertionError("OLLAMA_API_BASE rerouted the provider")
    if gdd.get("title") != preset.get("title"):
        raise AssertionError("fallback title is not the procedural preset")
    if [node.get("id") for node in gdd.get("nodes") or []] != [node.get("id") for node in preset.get("nodes") or []]:
        raise AssertionError("fallback nodes are not the procedural preset")
    if gdd.get("provider") == "grok":
        raise AssertionError("procedural result labeled grok")
    return {
        "provider": provider,
        "title": gdd.get("title"),
        "nodeCount": len(gdd.get("nodes") or []),
        "claimedGrok": False,
        "logHasOllamaNotice": "OLLAMA_API_BASE" in log,
    }


async def live_once() -> dict:
    load_project_env()
    from backend.agents import WorldBuilderAgent
    from backend.llm_client import resolve_provider

    provider = resolve_provider()
    if provider != "grok":
        return {"skipped": True, "provider": provider, "reason": "no grok key"}
    before = PRESET_PATH.read_bytes()
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        gdd = await WorldBuilderAgent.generate_gdd("clockwork harbor festival")
    log = buffer.getvalue()
    if PRESET_PATH.read_bytes() != before:
        raise AssertionError("live generation overwrote the Shi Mu preset")
    if "generated via grok" not in log:
        raise AssertionError(f"live log did not report grok: {log[:500]}")
    title = gdd.get("title")
    nodes = gdd.get("nodes") or []
    if not isinstance(title, str) or not title.strip():
        raise AssertionError("live title empty")
    if not isinstance(nodes, list) or not nodes:
        raise AssertionError("live nodes empty")
    return {"provider": "grok", "title": title, "nodeCount": len(nodes)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("fallback", "live"), required=True)
    args = parser.parse_args()
    if args.mode == "fallback":
        scrub_keys()
        first = asyncio.run(fallback_once())
        second = asyncio.run(fallback_once())
        if first != second:
            raise AssertionError(f"fallback runs diverged: {first} vs {second}")
        print(json.dumps({"mode": "fallback", "runs": [first, second]}, ensure_ascii=False))
        return
    print(json.dumps({"mode": "live", "result": asyncio.run(live_once())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
