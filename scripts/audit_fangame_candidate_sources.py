#!/usr/bin/env python3
"""Check source records and fan notice inside the verified local candidate ZIP."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "data/workspaces/xuanjie-shimu-local/reports"
EVIDENCE = ROOT / "docs/fangame/evidence"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    browser = json.loads((REPORTS / "standalone_browser_report.json").read_text())
    artifact = ROOT / browser["artifact"]
    artifact_sha = sha(artifact.read_bytes())
    if browser["status"] != "passed" or artifact_sha != browser["artifactSha256"]:
        raise ValueError("verified exact-ZIP browser anchor required")
    tag = re.search(r"(\d{14})\.zip$", artifact.name)
    if not tag:
        raise ValueError("candidate tag missing")

    notice_browser_path = REPORTS / "standalone_fan_notice_latest.json"
    notice_browser = json.loads(notice_browser_path.read_text())
    if (notice_browser["status"] != "passed" or notice_browser["artifactSha256"] != artifact_sha
            or len(notice_browser["assertions"]) != 12):
        raise ValueError("exact-ZIP fan notice browser check required")

    with ZipFile(artifact) as archive:
        if archive.testzip() is not None:
            raise ValueError("corrupt candidate ZIP")
        prefix = artifact.stem + "/"

        def read(name: str) -> bytes:
            return archive.read(prefix + name)

        notice = read("FAN_NOTICE.md").decode("utf-8")
        readme = read("README.md").decode("utf-8")
        credits = read("assets/audio/procedural/CREDITS.md").decode("utf-8")
        for label in ("个人", "非商业", "非官方", "免费", "不宣称获得官方授权", "上传前"):
            if label not in notice:
                raise ValueError(f"fan notice missing {label}")
        if "UNVERIFIED_CANDIDATE" not in readme or "FAN_NOTICE.md" not in readme:
            raise ValueError("candidate label or notice link missing")
        if "original, deterministic synthesis" not in credits or "No third-party recording" not in credits:
            raise ValueError("audio source credits missing")

        audio = json.loads(read("assets/audio/procedural/provenance.json"))
        if len(audio["items"]) != 34:
            raise ValueError("expected 12 BGM and 22 SFX source records")
        for item in audio["items"]:
            if sha(read(item["path"])) != item["sha256"]:
                raise ValueError(f"audio source hash mismatch: {item['id']}")

        sprite = json.loads(read("assets/imagegen/provenance.json"))
        environment = json.loads(read("assets/imagegen/environment-provenance.json"))
        landscape = json.loads(read("assets/imagegen/landscape/provenance.json"))
        if sha(read("assets/imagegen/atlas.png")) != sprite["runtimeAtlasSha256"]:
            raise ValueError("sprite atlas source hash mismatch")
        if sha(read("assets/imagegen/environment-atlas.png")) != environment["atlasSha256"]:
            raise ValueError("environment atlas source hash mismatch")
        if len(environment["sourceFramesSha256"]) != 12:
            raise ValueError("12 environment source records required")
        if len(landscape["sha256"]) != 3:
            raise ValueError("three side-view landscape source records required")
        for filename, expected in landscape["sha256"].items():
            if sha(read("assets/imagegen/landscape/" + filename)) != expected:
                raise ValueError(f"landscape source hash mismatch: {filename}")

        checked = {
            "fanNoticeSha256": sha(read("FAN_NOTICE.md")),
            "readmeSha256": sha(read("README.md")),
            "audioCreditsSha256": sha(read("assets/audio/procedural/CREDITS.md")),
            "audioFiles": len(audio["items"]),
            "environmentSourceRecords": len(environment["sourceFramesSha256"]),
            "landscapeFiles": len(landscape["sha256"]),
            "spriteAtlasSha256": sprite["runtimeAtlasSha256"],
            "environmentAtlasSha256": environment["atlasSha256"],
        }

    report = {
        "status": "passed",
        "scope": "exact-ZIP candidate content labeling and packaged source-record integrity",
        "limitations": "No claim of original-work authorization, independent visual similarity review, platform distribution approval, human playtest, or device performance",
        "artifact": browser["artifact"],
        "artifactSha256": artifact_sha,
        "fanNoticeBrowserReport": str(notice_browser_path.relative_to(ROOT)),
        "fanNoticeBrowserReportSha256": sha(notice_browser_path.read_bytes()),
        "checks": checked,
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    target = EVIDENCE / f"candidate_source_review_{tag.group(1)}.json"
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "artifactSha256": artifact_sha,
                      "report": str(target.relative_to(ROOT)), "reportSha256": sha(target.read_bytes()),
                      "checks": checked}, ensure_ascii=False))


if __name__ == "__main__":
    main()
