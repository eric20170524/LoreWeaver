/**
 * Mark gate/release evidence stale when recipe/content/asset/runtime identity changes.
 * Fail-closed: stale reports cannot satisfy productionExportAllowed or release_certified.
 */

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_STALE_TARGETS = [
  "standalone_browser_report.json",
  "visual_audit_latest.json",
  "performance_report_latest.json",
  "runtime_e2e_survivor_horde_latest.json",
  "runtime_e2e_standalone_survivor_latest.json",
  "survivor_c7_readiness_latest.json",
  "survivor_theme_skin_latest.json",
  "gameplay_card_validate_latest.json"
];

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))];
}

export function releaseEvidenceTargets(cardIds = []) {
  const targets = [
    "human_playtest_latest.json",
    "device_verification_latest.json",
    "standalone_browser_report.json",
    "visual_audit_latest.json",
    "release_decision_latest.json",
    "export_smoke_latest.json",
    "export_artifact_meta.json"
  ];
  for (const raw of cardIds || []) {
    const cardId = String(raw || "").trim();
    if (!cardId) continue;
    targets.push(
      `human_playtest_${cardId}_latest.json`,
      `human_playtest_${cardId}.json`,
      `device_verification_${cardId}_latest.json`,
      `device_verification_${cardId}.json`,
      `standalone_browser_report_${cardId}.json`,
      `visual_audit_${cardId}_latest.json`,
      `performance_report_${cardId}_latest.json`,
      `runtime_e2e_${cardId}_latest.json`
    );
  }
  return dedupe(targets);
}

/**
 * Downstream evidence bound to a selected exact Candidate.
 * Browser reports are intentionally excluded: the newly verified Browser report
 * becomes the fresh identity anchor. A changed Candidate invalidates human/device
 * observations; a changed screenshot invalidates VLM even when the ZIP is identical.
 */
export function candidateReselectionEvidenceTargets(cardIds = [], {
  candidateChanged = true,
  screenshotChanged = true
} = {}) {
  if (!candidateChanged && !screenshotChanged) return [];
  const targets = ["release_decision_latest.json"];

  if (candidateChanged) {
    targets.push(
      "human_playtest_latest.json",
      "device_verification_latest.json",
      "export_artifact_meta.json"
    );
    for (const raw of cardIds || []) {
      const cardId = String(raw || "").trim();
      if (!cardId) continue;
      targets.push(
        `human_playtest_${cardId}_latest.json`,
        `human_playtest_${cardId}.json`,
        `device_verification_${cardId}_latest.json`,
        `device_verification_${cardId}.json`
      );
    }
  }

  if (candidateChanged || screenshotChanged) {
    targets.push("visual_audit_latest.json");
    for (const raw of cardIds || []) {
      const cardId = String(raw || "").trim();
      if (!cardId) continue;
      targets.push(`visual_audit_${cardId}_latest.json`);
    }
  }

  return dedupe(targets);
}

function changed(previous, next, field) {
  const left = previous?.[field] ?? null;
  const right = next?.[field] ?? null;
  return String(left ?? "") !== String(right ?? "");
}

/**
 * Invalidate only package-bound downstream evidence after a newly verified
 * Candidate becomes the selected Browser anchor.
 *
 * No previous Browser report => no reselection, so nothing is invalidated.
 * Same Candidate + same screenshot => idempotent re-verification, no invalidation.
 */
export function markCandidateReselectionEvidenceStale({
  workspaceReportsDir,
  cardIds = [],
  previousBrowserReport = null,
  nextBrowserReport = null,
  dryRun = false
}) {
  const candidateFields = [
    "specHash",
    "runtimeVersion",
    "payloadHash",
    "artifact",
    "artifactSha256"
  ];
  const candidateChanged = Boolean(previousBrowserReport) && candidateFields.some((field) =>
    changed(previousBrowserReport, nextBrowserReport, field)
  );
  const screenshotChanged = Boolean(previousBrowserReport) && changed(
    previousBrowserReport,
    nextBrowserReport,
    "screenshotSha256"
  );

  if (!workspaceReportsDir || !previousBrowserReport || (!candidateChanged && !screenshotChanged)) {
    return {
      changed: false,
      candidateChanged,
      screenshotChanged,
      targets: [],
      result: null
    };
  }

  const targets = candidateReselectionEvidenceTargets(cardIds, {
    candidateChanged,
    screenshotChanged
  });
  const identity = {
    mutation: "candidate_reselected",
    previous: {
      specHash: previousBrowserReport.specHash ?? null,
      runtimeVersion: previousBrowserReport.runtimeVersion ?? null,
      payloadHash: previousBrowserReport.payloadHash ?? null,
      artifact: previousBrowserReport.artifact ?? null,
      artifactSha256: previousBrowserReport.artifactSha256 ?? null,
      screenshotSha256: previousBrowserReport.screenshotSha256 ?? null
    },
    next: {
      specHash: nextBrowserReport?.specHash ?? null,
      runtimeVersion: nextBrowserReport?.runtimeVersion ?? null,
      payloadHash: nextBrowserReport?.payloadHash ?? null,
      artifact: nextBrowserReport?.artifact ?? null,
      artifactSha256: nextBrowserReport?.artifactSha256 ?? null,
      screenshotSha256: nextBrowserReport?.screenshotSha256 ?? null
    }
  };
  const result = markGateReportsStale({
    reportsDir: workspaceReportsDir,
    reason: candidateChanged ? "exact_candidate_reselected" : "candidate_screenshot_reselected",
    identity,
    targets,
    dryRun
  });
  return {
    changed: true,
    candidateChanged,
    screenshotChanged,
    targets,
    result
  };
}

/**
 * @param {object} opts
 * @param {string} opts.reportsDir
 * @param {string} opts.reason
 * @param {object} [opts.identity] - new identity that invalidated reports
 * @param {string[]} [opts.targets]
 * @param {boolean} [opts.dryRun=false]
 * @returns {{ marked: Array<object>, skipped: Array<object> }}
 */
export function markGateReportsStale({
  reportsDir,
  reason,
  identity = null,
  targets = DEFAULT_STALE_TARGETS,
  dryRun = false
}) {
  const marked = [];
  const skipped = [];
  const staleAt = new Date().toISOString();

  for (const file of dedupe(targets)) {
    const p = path.join(reportsDir, file);
    if (!fs.existsSync(p)) {
      skipped.push({ file, reason: "missing" });
      continue;
    }
    let report;
    try {
      report = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      skipped.push({ file, reason: `parse_error: ${e.message}` });
      continue;
    }
    if (!report || typeof report !== "object") {
      skipped.push({ file, reason: "not_object" });
      continue;
    }

    const previousStatus = report.status;
    const next = {
      ...report,
      status: "stale",
      artifactStatus: "stale",
      stale: true,
      freshness: "stale",
      staleReason: reason,
      staleAt,
      previousStatus,
      invalidatedBy: identity || null
    };

    if (file === "release_decision_latest.json") {
      next.exportAllowed = false;
      next.releaseCertified = false;
      next.nonReleaseMarker = "STALE_RELEASE_DECISION";
    }
    if (file === "export_artifact_meta.json") {
      next.releaseEligible = false;
      next.nonReleaseMarker = "STALE_ARTIFACT_IDENTITY";
    }

    if (!dryRun) {
      fs.writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`);
    }
    marked.push({
      file,
      previousStatus,
      dryRun: Boolean(dryRun)
    });
  }

  return { marked, skipped, staleAt, reason, identity };
}

/**
 * Invalidate both shared automatic gates and workspace-scoped human/device/release
 * evidence after an authoring identity mutation.
 */
export function markReleaseEvidenceStale({
  sharedReportsDir = null,
  workspaceReportsDir = null,
  cardIds = [],
  reason,
  identity = null,
  dryRun = false
}) {
  const results = {};
  if (sharedReportsDir) {
    results.shared = markGateReportsStale({
      reportsDir: sharedReportsDir,
      reason,
      identity,
      targets: dedupe([...DEFAULT_STALE_TARGETS, ...releaseEvidenceTargets(cardIds)]),
      dryRun
    });
  }
  if (workspaceReportsDir) {
    results.workspace = markGateReportsStale({
      reportsDir: workspaceReportsDir,
      reason,
      identity,
      targets: releaseEvidenceTargets(cardIds),
      dryRun
    });
  }
  return results;
}
