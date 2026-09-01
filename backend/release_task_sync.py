"""Synchronize real Workspace release evidence into the TaskContract Player role.

This bridge is intentionally narrow:
- Browser verification proves `runtime` only.
- A completed Grok/Codex critic proves `visual` only.
- Recorded real human sessions prove `feel` only.

All sources must bind the same exact Candidate identity. Device verification stays
a Certified release gate and is not re-labelled as Player feel/runtime evidence.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.task_contract import next_required_role
from backend.task_repository import TaskRepository, TaskRepositoryError

REAL_VLM_PROVIDERS = {"grok", "codex"}
IDENTITY_FIELDS = ("specHash", "runtimeVersion", "payloadHash", "artifact", "artifactSha256")


class ReleaseTaskSyncError(ValueError):
    """Raised when a release evidence bundle violates Task role boundaries."""


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _fresh(report: dict[str, Any] | None) -> bool:
    return bool(
        report
        and report.get("status") == "passed"
        and report.get("releaseEligible") is True
        and report.get("stale") is not True
        and report.get("freshness") != "stale"
        and report.get("artifactStatus") != "stale"
        and report.get("fixture") is not True
        and report.get("synthetic") is not True
    )


def _browser_eligible(report: dict[str, Any] | None) -> bool:
    if not _fresh(report):
        return False
    errors = report.get("errors") or {}
    return bool(
        report.get("zeroApiRequests") is True
        and all(isinstance(errors.get(key), list) and not errors.get(key) for key in ("console", "page", "requests"))
        and all(report.get(field) for field in IDENTITY_FIELDS)
    )


def _identity_matches(anchor: dict[str, Any], report: dict[str, Any] | None) -> bool:
    return bool(
        report
        and all(report.get(field) == anchor.get(field) for field in IDENTITY_FIELDS)
    )


def _visual_eligible(anchor: dict[str, Any], report: dict[str, Any] | None) -> bool:
    return bool(
        _fresh(report)
        and report.get("identityMatches") is True
        and report.get("evidenceKind") == "real_vlm_exact_candidate"
        and str(report.get("provider") or "") in REAL_VLM_PROVIDERS
        and _identity_matches(anchor, report)
        and report.get("screenshotSha256") == anchor.get("screenshotSha256")
    )


def _human_eligible(anchor: dict[str, Any], report: dict[str, Any] | None, card_id: str) -> bool:
    pass_criteria = ((report or {}).get("summary") or {}).get("passCriteria") or {}
    return bool(
        _fresh(report)
        and report.get("schemaVersion") == "loreweaver.human-playtest-evidence.v1"
        and report.get("identityMatches") is True
        and report.get("humanObserved") is True
        and report.get("cardId") == card_id
        and isinstance(report.get("sessions"), list)
        and len(report.get("sessions")) > 0
        and pass_criteria.get("atLeastOneSessionCompleted") is True
        and pass_criteria.get("allSessionsUnderstoodCoreLoop") is True
        and pass_criteria.get("noBlockingIssues") is True
        and _identity_matches(anchor, report)
    )


def _card_ids(browser: dict[str, Any]) -> list[str]:
    values = browser.get("cardIds") or ([browser.get("cardId")] if browser.get("cardId") else [])
    return sorted({str(value).strip() for value in values if str(value or "").strip()})


def _criteria_ids(task: dict[str, Any], kind: str) -> list[str]:
    return [
        str(item.get("id"))
        for item in task.get("acceptanceCriteria") or []
        if kind in (item.get("evidenceKinds") or []) and item.get("id")
    ]


def _select_player_task(
    repository: TaskRepository,
    workspace_id: str,
    explicit_task_id: str | None,
) -> tuple[str, dict[str, Any]] | None:
    if explicit_task_id:
        task = repository.read(workspace_id, explicit_task_id)
        return (explicit_task_id, task) if next_required_role(task) == "player" else None
    matches: list[tuple[str, dict[str, Any]]] = []
    for summary in repository.list(workspace_id):
        task_id = str(summary.get("id") or "")
        if not task_id:
            continue
        task = repository.read(workspace_id, task_id)
        if next_required_role(task) == "player":
            matches.append((task_id, task))
    if len(matches) > 1:
        raise ReleaseTaskSyncError(
            "multiple_tasks_require_player:" + ",".join(task_id for task_id, _ in matches)
        )
    return matches[0] if matches else None


def sync_player_release_evidence(
    *,
    repository: TaskRepository,
    workspace_id: str,
    workspace_dir: Path,
    explicit_task_id: str | None = None,
) -> dict[str, Any]:
    selected = _select_player_task(repository, workspace_id, explicit_task_id)
    if selected is None:
        return {
            "schemaVersion": "loreweaver.release-task-sync.v1",
            "status": "passed",
            "action": "noop",
            "role": "player",
            "reason": "no_task_waiting_for_player",
            "taskId": explicit_task_id,
        }
    task_id, task = selected
    reports = workspace_dir / "reports"
    browser_path = reports / "standalone_browser_report.json"
    browser = _read_json(browser_path)
    gaps: list[str] = []
    if not _browser_eligible(browser):
        gaps.append("runtime:standalone_browser_report_not_eligible")
        card_ids: list[str] = []
    else:
        card_ids = _card_ids(browser)
        if not card_ids:
            gaps.append("runtime:browser_card_ids_missing")

    visual_path = reports / "visual_audit_latest.json"
    visual = _read_json(visual_path)
    if browser and not _visual_eligible(browser, visual):
        gaps.append("visual:real_exact_candidate_vlm_missing_or_ineligible")

    human_reports: list[tuple[str, Path, dict[str, Any]]] = []
    if browser:
        for card_id in card_ids:
            path = reports / f"human_playtest_{card_id}_latest.json"
            report = _read_json(path)
            if not _human_eligible(browser, report, card_id):
                gaps.append(f"feel:human_playtest_missing_or_ineligible:{card_id}")
            elif report is not None:
                human_reports.append((card_id, path, report))

    if gaps:
        return {
            "schemaVersion": "loreweaver.release-task-sync.v1",
            "status": "passed",
            "action": "noop",
            "role": "player",
            "reason": "player_evidence_incomplete",
            "taskId": task_id,
            "cardIds": card_ids,
            "evidenceGaps": gaps,
        }

    assert browser is not None and visual is not None
    runtime_criteria = _criteria_ids(task, "runtime")
    visual_criteria = _criteria_ids(task, "visual")
    feel_criteria = _criteria_ids(task, "feel")
    evidence_refs: list[dict[str, Any]] = [
        {
            "id": f"runtime-{str(browser['payloadHash'])[:16]}",
            "kind": "runtime",
            "path": "reports/standalone_browser_report.json",
            "status": "passed",
            "criterionIds": runtime_criteria,
            "fixture": False,
            "synthetic": False,
            "stale": False,
        },
        {
            "id": f"visual-{str(visual.get('screenshotSha256') or '')[:16]}",
            "kind": "visual",
            "path": "reports/visual_audit_latest.json",
            "status": "passed",
            "criterionIds": visual_criteria,
            "fixture": False,
            "synthetic": False,
            "stale": False,
        },
    ]
    for card_id, human_path, report in human_reports:
        evidence_refs.append(
            {
                "id": f"feel-{card_id}-{str(report.get('artifactSha256') or '')[:12]}",
                "kind": "feel",
                "path": human_path.relative_to(workspace_dir).as_posix(),
                "status": "passed",
                "criterionIds": feel_criteria,
                "fixture": False,
                "synthetic": False,
                "stale": False,
            }
        )

    try:
        updated = repository.append(
            workspace_id,
            task_id,
            role="player",
            verdict="passed",
            summary=(
                "Exact Candidate runtime, real VLM visual review, and real human feel evidence are all fresh and identity-matched."
            ),
            evidence_refs=evidence_refs,
            findings=[],
            expected_last_round_hash=TaskRepository.last_round_hash(task),
        )
    except TaskRepositoryError as exc:
        raise ReleaseTaskSyncError(str(exc)) from exc

    return {
        "schemaVersion": "loreweaver.release-task-sync.v1",
        "status": "passed",
        "action": "handoff_appended",
        "role": "player",
        "taskId": task_id,
        "taskStatus": updated.get("status"),
        "cardIds": card_ids,
        "evidenceRefs": evidence_refs,
        "lastRoundHash": TaskRepository.last_round_hash(updated),
    }
