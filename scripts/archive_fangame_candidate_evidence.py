#!/usr/bin/env python3
"""Freeze current exact-ZIP trial evidence with per-file hashes."""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "data/workspaces/xuanjie-shimu-local/reports"
EVIDENCE = ROOT / "docs/fangame/evidence"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    desktop = read_json(REPORTS / "standalone_browser_report.json")
    mobile = read_json(REPORTS / "standalone_browser_report_390x844.json")
    artifact = ROOT / desktop["artifact"]
    artifact_hash = digest(artifact)
    match = re.search(r"(\d{14})\.zip$", artifact.name)
    if not match or desktop["status"] != "passed" or desktop["artifactSha256"] != artifact_hash:
        raise ValueError("verified candidate identity missing")
    if mobile["status"] != "passed" or mobile["artifactSha256"] != artifact_hash:
        raise ValueError("mobile report does not match candidate")
    if len(desktop["stageResults"]) != 12 or len(mobile["stageResults"]) != 12:
        raise ValueError("12 stage observations required in each viewport")
    tag = match.group(1)
    with zipfile.ZipFile(artifact) as archive:
        entries = len(archive.namelist())
        if archive.testzip() is not None:
            raise ValueError("candidate ZIP is corrupt")

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []

    def add(source: Path, name: str, scope: str = "exact_zip", compress: bool = False) -> None:
        if not source.is_file():
            raise FileNotFoundError(source)
        target = EVIDENCE / f"{name}_{tag}{source.suffix}{'.gz' if compress else ''}"
        if compress:
            target.write_bytes(gzip.compress(source.read_bytes(), mtime=0))
        else:
            shutil.copyfile(source, target)
        items.append({"name": target.name, "path": str(target.relative_to(ROOT)), "sha256": digest(target), "scope": scope})

    add(REPORTS / "standalone_browser_report.json", "standalone_browser_desktop", compress=True)
    add(REPORTS / "standalone_browser_report_390x844.json", "standalone_browser_mobile", compress=True)
    specialties = sorted(REPORTS.glob("standalone_*latest.json"))
    for source in specialties:
        report = read_json(source)
        if report.get("status") != "passed" or report.get("artifactSha256") != artifact_hash:
            raise ValueError(f"specialty evidence does not match candidate: {source.name}")
        add(source, source.stem.removesuffix("_latest"))

    for seed in (1, 2):
        source = EVIDENCE / f"survivor_seed{seed}_{tag}.json"
        report = read_json(source)
        if (report.get("status") != "passed" or report.get("artifactSha256") != artifact_hash
                or report.get("seedSalt") != seed):
            raise ValueError(f"seed evidence does not match candidate: {source.name}")
        items.append({"name": source.name, "path": str(source.relative_to(ROOT)), "sha256": digest(source), "scope": "exact_zip"})

    screenshots = [
        *(REPORTS / f"candidate_stage_{number:02d}{suffix}.png" for suffix in ("", "_390x844") for number in range(1, 13)),
        *(REPORTS / f"node4_live_wave_{wave}_844x390.png" for wave in (1, 2, 3)),
        REPORTS / "node4_fire_combo_844x390.png",
        REPORTS / "node4_wind_combo_844x390.png",
        REPORTS / "candidate_node5_bow_390x844.png",
        REPORTS / "candidate_node9_field_direction_390x844.png",
        REPORTS / "candidate_fan_notice_dialog_390x844.png",
        REPORTS / "candidate_node12_black_blade_390x844.png",
        REPORTS / "candidate_node12_purple_bow_390x844.png",
        REPORTS / "candidate_node12_white_ape_390x844.png",
        REPORTS / "candidate_node1_ranged_bow_390x844.png",
        REPORTS / "candidate_node1_cold_blade_390x844.png",
        REPORTS / "candidate_node6_ranged_bow_390x844.png",
        REPORTS / "candidate_node6_cold_sweep_390x844.png",
        REPORTS / "candidate_node7_moon_silver_390x844.png",
        REPORTS / "candidate_node8_siege_wave5_390x844.png",
        REPORTS / "candidate_node10_awakening_390x844.png",
    ]
    for source in screenshots:
        add(source, source.stem)

    decision = read_json(REPORTS / "release_decision_latest.json")
    if decision["status"] != "candidate_allowed" or decision["releaseCertified"] is not False:
        raise ValueError("candidate policy decision missing")
    add(REPORTS / "release_decision_latest.json", "release_decision")
    add(REPORTS / "bow_action_integration_latest.json", "bow_action_integration", "source_art")
    add(REPORTS / "cold_blade_integration_latest.json", "cold_blade_integration", "source_art")
    add(REPORTS / "cold_blade_base_integration_latest.json", "cold_blade_base_integration", "source_art")
    add(REPORTS / "white_ape_silver_integration_latest.json", "white_ape_silver_integration", "source_art")
    add(REPORTS / "arena_wave_art_aliases_latest.json", "arena_wave_art_aliases", "source_art")
    add(REPORTS / "art_preflight_node245_latest.json", "art_preflight_node245")
    audio_report = read_json(REPORTS / "audio_ambience_source_latest.json")
    if audio_report["status"] != "passed" or audio_report["artifactSha256"] != artifact_hash:
        raise ValueError("audio ambience evidence does not match candidate")
    add(REPORTS / "audio_ambience_source_latest.json", "audio_ambience_source", "source_and_exact_zip")
    index = {
        "artifact": desktop["artifact"],
        "artifactSha256": artifact_hash,
        "payloadHash": desktop["payloadHash"],
        "zipEntries": entries,
        "desktopStagesPassed": len(desktop["stageResults"]),
        "mobileStagesPassed": len(mobile["stageResults"]),
        "exactZipSpecialtyReports": len(specialties),
        "evidence": items,
    }
    path = EVIDENCE / f"standalone_bow_action_candidate_evidence_{tag}.json"
    path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"index": str(path.relative_to(ROOT)), "indexSha256": digest(path), "items": len(items), **{key: index[key] for key in ("artifactSha256", "zipEntries", "desktopStagesPassed", "mobileStagesPassed", "exactZipSpecialtyReports")}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
