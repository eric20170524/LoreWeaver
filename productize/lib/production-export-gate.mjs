/**
 * Production export hard-gate evaluation (pure policy).
 *
 * Fail-closed: missing / failed / stale / identity-mismatched evidence blocks publish.
 * Soft warnings alone are never enough for productionExportAllowed.
 */

import fs from "node:fs";
import path from "node:path";

export const REQUIRED_PRODUCTION_REPORTS = [
  {
    key: "nodeSmoke",
    file: "node_smoke_latest.json",
    requireCardId: false,
    requireReleaseEligible: false
  },
  {
    key: "standaloneBrowser",
    file: "standalone_browser_report.json",
    requireCardId: true,
    requireReleaseEligible: true
  },
  {
    key: "visualAudit",
    file: "visual_audit_latest.json",
    requireCardId: true,
    requireReleaseEligible: false
  },
  {
    key: "performance",
    file: "performance_report_latest.json",
    requireCardId: true,
    requireReleaseEligible: false
  }
];

export function parseJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isStaleReport(report) {
  if (!report || typeof report !== "object") return true;
  if (report.status === "stale") return true;
  if (report.artifactStatus === "stale") return true;
  if (report.stale === true) return true;
  if (report.freshness === "stale") return true;
  return false;
}

function reportPassed(report) {
  if (!report) return false;
  if (isStaleReport(report)) return false;
  if (report.status !== "passed") return false;
  return true;
}

function smokeOk(report) {
  if (!reportPassed(report)) return false;
  const passed = report.passed ?? report.summary?.passed;
  const failed = report.failed ?? report.summary?.failed ?? 0;
  if (!passed || failed > 0) return false;
  return true;
}

/**
 * Compare optional identity fields when both sides present.
 * @param {object} report
 * @param {object|null} expectedIdentity { cardId, recipeHash, contentHash, atlasHash, runtimeVersion }
 */
export function identityMismatches(report, expectedIdentity) {
  if (!report || !expectedIdentity) return [];
  const mismatches = [];
  const pairs = [
    ["cardId", expectedIdentity.cardId],
    ["recipeHash", expectedIdentity.recipeHash],
    ["contentHash", expectedIdentity.contentHash],
    ["atlasHash", expectedIdentity.atlasHash],
    ["runtimeVersion", expectedIdentity.runtimeVersion]
  ];
  for (const [field, expected] of pairs) {
    if (expected == null || expected === "") continue;
    const actual = report[field];
    if (actual == null || actual === "") continue; // report does not claim this identity yet
    if (String(actual) !== String(expected)) {
      mismatches.push(`${field}: report=${actual} expected=${expected}`);
    }
  }
  return mismatches;
}

/**
 * Evaluate production export readiness for a card.
 *
 * @param {object} opts
 * @param {object} opts.card - gameplay card JSON
 * @param {string} opts.reportsDir
 * @param {object|null} [opts.expectedIdentity]
 * @returns {{
 *   productionExportAllowed: boolean,
 *   status: 'passed'|'failed',
 *   reasons: string[],
 *   checks: object,
 *   cardId: string|null
 * }}
 */
export function evaluateProductionExportGate({ card, reportsDir, expectedIdentity = null }) {
  const reasons = [];
  const checks = {};
  const cardId = card?.id || null;

  if (!card || typeof card !== "object") {
    return {
      productionExportAllowed: false,
      status: "failed",
      reasons: ["Hard Gate Blocker: card object missing"],
      checks,
      cardId: null
    };
  }

  const statusOk = card.status === "production_ready";
  const exportOk = card.exportPolicy?.productionReady === true;
  checks.cardStatus = statusOk;
  checks.exportPolicy = exportOk;
  if (!statusOk) {
    reasons.push(
      `Hard Gate Blocker: card status must be production_ready (got '${card.status}')`
    );
  }
  if (!exportOk) {
    reasons.push("Hard Gate Blocker: exportPolicy.productionReady must be true");
  }

  // Only enforce evidence package for production_ready / export-ready claims
  const needsEvidence = statusOk || exportOk;
  if (!needsEvidence) {
    return {
      productionExportAllowed: false,
      status: reasons.length ? "failed" : "passed",
      reasons,
      checks,
      cardId
    };
  }

  const identity = {
    cardId: expectedIdentity?.cardId || cardId,
    recipeHash: expectedIdentity?.recipeHash || null,
    contentHash: expectedIdentity?.contentHash || null,
    atlasHash: expectedIdentity?.atlasHash || null,
    runtimeVersion: expectedIdentity?.runtimeVersion || null
  };

  for (const spec of REQUIRED_PRODUCTION_REPORTS) {
    const filePath = path.join(reportsDir, spec.file);
    const report = parseJsonFileSafe(filePath);
    const check = {
      file: spec.file,
      present: Boolean(report),
      stale: report ? isStaleReport(report) : true,
      status: report?.status ?? null,
      releaseEligible: report?.releaseEligible,
      cardId: report?.cardId ?? null
    };

    if (!report) {
      reasons.push(`Hard Gate Blocker: ${spec.file} missing or empty`);
      check.ok = false;
      checks[spec.key] = check;
      continue;
    }

    if (isStaleReport(report)) {
      reasons.push(
        `Hard Gate Blocker: ${spec.file} is stale` +
          (report.staleReason ? ` (${report.staleReason})` : "")
      );
      check.ok = false;
      checks[spec.key] = check;
      continue;
    }

    if (spec.key === "nodeSmoke") {
      if (!smokeOk(report)) {
        reasons.push(
          `Hard Gate Blocker: E2E smoke report missing, empty, failed, or stale (${spec.file})`
        );
        check.ok = false;
      } else {
        check.ok = true;
      }
    } else {
      if (!reportPassed(report)) {
        reasons.push(
          `Hard Gate Blocker: ${spec.file} missing, empty, failed, or stale`
        );
        check.ok = false;
        checks[spec.key] = check;
        continue;
      }
      if (spec.requireReleaseEligible && report.releaseEligible !== true) {
        reasons.push(
          `Hard Gate Blocker: ${spec.file} releaseEligible!=true`
        );
        check.ok = false;
      }
      if (spec.requireCardId) {
        if (report.cardId !== identity.cardId) {
          reasons.push(
            `Hard Gate Blocker: ${spec.file} cardId mismatch (report=${report.cardId}, expected=${identity.cardId})`
          );
          check.ok = false;
        }
      }
      const idMis = identityMismatches(report, identity);
      if (idMis.length) {
        reasons.push(
          `Hard Gate Blocker: ${spec.file} identity mismatch: ${idMis.join("; ")}`
        );
        check.ok = false;
      }
      if (check.ok !== false) check.ok = true;
    }

    checks[spec.key] = check;
  }

  // Demo / standalone E2E companions (soft if standalone_browser already covers release)
  // but if present and stale, still hard-block to avoid false publish confidence.
  for (const companion of [
    "runtime_e2e_survivor_horde_latest.json",
    "runtime_e2e_standalone_survivor_latest.json",
    "survivor_c7_readiness_latest.json"
  ]) {
    const p = path.join(reportsDir, companion);
    if (!fs.existsSync(p)) continue;
    const report = parseJsonFileSafe(p);
    if (report && isStaleReport(report)) {
      reasons.push(`Hard Gate Blocker: companion report stale (${companion})`);
      checks[companion] = { present: true, stale: true, ok: false };
    }
  }

  const productionExportAllowed =
    statusOk && exportOk && reasons.length === 0;

  return {
    productionExportAllowed,
    status: productionExportAllowed ? "passed" : "failed",
    reasons,
    checks,
    cardId,
    expectedIdentity: identity
  };
}
