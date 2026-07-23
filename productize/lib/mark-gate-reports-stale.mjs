/**
 * Mark production gate reports stale when recipe/content/asset identity changes.
 * Fail-closed: stale reports cannot satisfy productionExportAllowed until re-run.
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

  for (const file of targets) {
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
