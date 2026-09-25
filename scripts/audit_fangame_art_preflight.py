#!/usr/bin/env python3
"""Check exact-package atlas coverage for art handoffs awaiting visual review."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "data/workspaces/xuanjie-shimu-local/reports"
REQUIRED = {
    2: {"card": "dodge_counter_boss", "env": "env_bg_cliff",
        "frames": ("enemy_arena_champion_idle", "vfx_hazard_mark")},
    4: {"card": "side_scrolling_brawler", "env": "env_bg_tide",
        "frames": ("player_idle", "vfx_fire_slash", "vfx_wind_slash")},
    5: {"card": "shooter_duel", "env": "env_bg_city",
        "frames": ("player_bow_attack_0", "vfx_purple_bolt")},
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    desktop = json.loads((REPORTS / "standalone_browser_report.json").read_text())
    mobile = json.loads((REPORTS / "standalone_browser_report_390x844.json").read_text())
    artifact = ROOT / desktop["artifact"]
    artifact_sha = digest(artifact)
    if any(report["status"] != "passed" or report["artifactSha256"] != artifact_sha
           for report in (desktop, mobile)):
        raise ValueError("desktop/mobile reports do not match the exact ZIP")

    with zipfile.ZipFile(artifact) as archive:
        prefix = archive.namelist()[0].split("/")[0]
        spec = json.loads(archive.read(f"{prefix}/runtime-spec.json"))["gameSpec"]
        frames = json.loads(archive.read(f"{prefix}/assets/imagegen/manifest.json"))["frames"]
        entries = set(archive.namelist())
        nodes = {int(node["id"]): node for node in spec["nodes"]}
        results = []
        for number, required in REQUIRED.items():
            node = nodes[number]
            gameplay = node["gameplay"]
            knobs = gameplay["knobs"]
            checks = {
                "card": gameplay["cardId"] == required["card"],
                "environmentKey": knobs.get("envKey") == required["env"],
                "atlasFirst": knobs.get("artAtlasFirst") is True,
                "environmentFrame": required["env"] in frames,
                "requiredFrames": all(key in frames for key in required["frames"]),
            }
            for label, report in (("desktop", desktop), ("mobile", mobile)):
                stage = next(item for item in report["stageResults"] if item["stage"] == number)
                screenshot = ROOT / stage["screenshot"]
                state = stage["observed"]["observation"]["state"]
                checks[f"{label}Stage"] = stage["passed"] is True
                checks[f"{label}Screenshot"] = digest(screenshot) == stage["screenshotSha256"]
                checks[f"{label}AtlasLoaded"] = state["artAtlasStatus"] == "loaded"
                checks[f"{label}NoDegradation"] = state["artDegradationCount"] == 0
            landscape = knobs.get("landscapeBackgrounds") or []
            if number == 4:
                checks["threeLandscapeImages"] = len(landscape) == 3 and all(
                    f"{prefix}/{name}" in entries for name in landscape)
            results.append({"nodeId": number, "checks": checks,
                            "frames": [required["env"], *required["frames"]],
                            "landscapeBackgrounds": landscape,
                            "status": "passed" if all(checks.values()) else "failed"})

    output = {"status": "passed" if all(item["status"] == "passed" for item in results) else "failed",
              "artifact": desktop["artifact"], "artifactSha256": artifact_sha,
              "scope": "exact-ZIP assets and desktop/mobile runtime art telemetry",
              "limitations": "Does not assess visual style, composition, VLM quality, human play, or physical devices",
              "nodes": results}
    path = REPORTS / "art_preflight_node245_latest.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": output["status"], "artifactSha256": artifact_sha,
                      "nodes": [{"nodeId": item["nodeId"], "status": item["status"]} for item in results]}))
    if output["status"] != "passed":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
