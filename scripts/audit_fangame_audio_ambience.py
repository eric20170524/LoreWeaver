#!/usr/bin/env python3
"""Measure authored environment beds without claiming subjective listening QA."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path
from zipfile import ZipFile

import numpy as np

from build_fangame_audio import AMBIENCE_FAMILIES, ROOT, STAGES, render_stage


def rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(signal.astype(np.float64)))))


def main() -> None:
    browser_report = json.loads((ROOT / "data/workspaces/xuanjie-shimu-local/reports/standalone_browser_report.json").read_text())
    artifact = ROOT / browser_report["artifact"]
    artifact_hash = hashlib.sha256(artifact.read_bytes()).hexdigest()
    if browser_report["status"] != "passed" or artifact_hash != browser_report["artifactSha256"]:
        raise ValueError("verified candidate identity mismatch")
    provenance_path = ROOT / "assets/audio/procedural/provenance.json"
    provenance = json.loads(provenance_path.read_text())
    items = {item["id"]: item for item in provenance["items"]}
    with ZipFile(artifact) as archive:
        prefix = artifact.stem + "/"
        packaged_provenance = json.loads(archive.read(prefix + "assets/audio/procedural/provenance.json"))
        if packaged_provenance != provenance:
            raise ValueError("packaged audio provenance mismatch")
        for item in provenance["items"]:
            packaged_hash = hashlib.sha256(archive.read(prefix + item["path"])).hexdigest()
            if packaged_hash != item["sha256"]:
                raise ValueError(f"packaged audio hash mismatch: {item['id']}")
            local_file = ROOT / item["path"]
            if hashlib.sha256(local_file.read_bytes()).hexdigest() != item["sha256"]:
                raise ValueError(f"source audio hash mismatch: {item['id']}")
            probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "default=noprint_wrappers=1:nokey=1", str(local_file)],
                                   text=True, capture_output=True, check=True)
            if float(probe.stdout.strip()) <= 0:
                raise ValueError(f"undecodable audio file: {item['id']}")
    observations = []
    for index, stage in enumerate(STAGES, 1):
        name, root_hz, bpm, style, motif = stage
        item = items[name]
        if item.get("ambienceFamily") != AMBIENCE_FAMILIES.get(name):
            raise ValueError(f"ambience provenance mismatch: {name}")
        audio_file = ROOT / item["path"]
        if hashlib.sha256(audio_file.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError(f"audio file hash mismatch: {name}")
        duration = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(audio_file)
        ], text=True).strip())
        if not 14 <= duration <= 27:
            raise ValueError(f"unexpected loop duration: {name} {duration}")
        observation = {"id": name, "ambienceFamily": item.get("ambienceFamily"),
                       "mp3Sha256": item["sha256"], "durationSec": round(duration, 3)}
        analysis = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(audio_file),
                                   "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
                                  text=True, capture_output=True, check=True)
        summary = analysis.stderr.split("Summary:")[-1]
        loudness = re.search(r"^\s*I:\s*(-?\d+(?:\.\d+)?) LUFS", summary, re.M)
        peak = re.search(r"^\s*Peak:\s*(-?\d+(?:\.\d+)?) dBFS", summary, re.M)
        if not loudness or not peak:
            raise ValueError(f"loudness measurement missing: {name}")
        observation["integratedLufs"] = float(loudness.group(1))
        observation["truePeakDbfs"] = float(peak.group(1))
        if not -17 <= observation["integratedLufs"] <= -14 or observation["truePeakDbfs"] > -1:
            raise ValueError(f"BGM loudness or peak out of range: {name}")
        if name in AMBIENCE_FAMILIES:
            full = render_stage(index, *stage, include_ambience=True)
            base = render_stage(index, *stage, include_ambience=False)
            layer = full - base
            ratio_db = 20 * np.log10(max(rms(layer), 1e-10) / max(rms(full), 1e-10))
            observation["layerRms"] = round(rms(layer), 6)
            observation["layerToMixDb"] = round(float(ratio_db), 2)
            if not -35 <= ratio_db <= -14:
                raise ValueError(f"ambience mix outside low-level range: {name} {ratio_db:.2f} dB")
        observations.append(observation)
    report = {"status": "passed", "scope": "deterministic source synthesis, exact-ZIP 34-file integrity, 34 decodable MP3, 12 BGM loudness and peak measurements",
              "limitations": "No claim about human listening, perceived loudness balance, or physical-device speakers",
              "artifact": browser_report["artifact"], "artifactSha256": artifact_hash,
              "packagedAudioFiles": len(provenance["items"]),
              "provenanceSha256": hashlib.sha256(provenance_path.read_bytes()).hexdigest(),
              "ambienceFamilies": sorted(set(AMBIENCE_FAMILIES.values())), "tracks": observations}
    destination = ROOT / "data/workspaces/xuanjie-shimu-local/reports/audio_ambience_source_latest.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": "passed", "ambienceTracks": [item for item in observations if item["ambienceFamily"]],
                      "provenanceSha256": report["provenanceSha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
