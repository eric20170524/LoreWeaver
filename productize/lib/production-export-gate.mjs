/**
 * Production export hard-gate evaluation (pure policy).
 *
 * Fail-closed: missing / failed / stale / identity-mismatched evidence blocks publish.
 * Soft warnings alone are never enough for productionExportAllowed.
 *
 * Multi-card: prefers per-card report filenames, then shared "*_latest" only when cardId matches.
 */

import fs from "node:fs";
import path from "node:path";

export const REQUIRED_PRODUCTION_REPORT_SPECS = [
  {
    key: "nodeSmoke",
    requireCardId: false,
    requireReleaseEligible: false,
    candidates: (cardId) => ["node_smoke_latest.json"]
  },
  {
    key: "standaloneBrowser",
    requireCardId: true,
    requireReleaseEligible: true,
    candidates: (cardId) => [
      `standalone_browser_report_${cardId}.json`,
      `standalone_browser_${cardId}_latest.json`,
      "standalone_browser_report.json"
    ]
  },
  {
    key: "visualAudit",
    requireCardId: true,
    requireReleaseEligible: false,
    candidates: (cardId) => [
      `visual_audit_${cardId}_latest.json`,
      "visual_audit_latest.json"
    ]
  },
  {
    key: "performance",
    requireCardId: true,
    requireReleaseEligible: false,
    candidates: (cardId) => [
      `performance_report_${cardId}_latest.json`,
      "performance_report_latest.json"
    ]
  },
  {
    key: "demoE2e",
    requireCardId: true,
    requireReleaseEligible: true,
    optional: false,
    candidates: (cardId) => [
      `runtime_e2e_${cardId}_latest.json`
    ]
  }
];

// Back-compat export name used by older docs/tests
export const REQUIRED_PRODUCTION_REPORTS = REQUIRED_PRODUCTION_REPORT_SPECS.map((s) => ({
  key: s.key,
  file: s.candidates("CARD")[0],
  requireCardId: s.requireCardId,
  requireReleaseEligible: s.requireReleaseEligible
}));

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
 * Pick first existing report whose cardId matches (when requireCardId) or has no cardId conflict.
 */
export function resolveCardReport(reportsDir, cardId, candidates, { requireCardId = false } = {}) {
  for (const file of candidates) {
    const filePath = path.join(reportsDir, file);
    const report = parseJsonFileSafe(filePath);
    if (!report) continue;
    if (requireCardId) {
      if (report.cardId != null && report.cardId !== cardId) continue;
    } else if (report.cardId != null && cardId && report.cardId !== cardId) {
      // node smoke is workspace-level — allow missing cardId
      continue;
    }
    return { file, report, path: filePath };
  }
  return { file: candidates[0] || null, report: null, path: null };
}

/**
 * Compare optional identity fields when both sides present.
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
    if (actual == null || actual === "") continue;
    if (String(actual) !== String(expected)) {
      mismatches.push(`${field}: report=${actual} expected=${expected}`);
    }
  }
  return mismatches;
}

/**
 * Evaluate production export readiness for a card.
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

  for (const spec of REQUIRED_PRODUCTION_REPORT_SPECS) {
    const candidates = spec.candidates(cardId);
    const resolved = resolveCardReport(reportsDir, cardId, candidates, {
      requireCardId: spec.requireCardId
    });
    const report = resolved.report;
    const check = {
      file: resolved.file,
      candidates,
      present: Boolean(report),
      stale: report ? isStaleReport(report) : true,
      status: report?.status ?? null,
      releaseEligible: report?.releaseEligible,
      cardId: report?.cardId ?? null
    };

    if (!report) {
      if (spec.optional) {
        check.ok = true;
        check.skipped = true;
        checks[spec.key] = check;
        continue;
      }
      reasons.push(
        `Hard Gate Blocker: ${candidates.join(" | ")} missing, empty, or cardId mismatch`
      );
      check.ok = false;
      checks[spec.key] = check;
      continue;
    }

    if (isStaleReport(report)) {
      reasons.push(
        `Hard Gate Blocker: ${resolved.file} is stale` +
          (report.staleReason ? ` (${report.staleReason})` : "")
      );
      check.ok = false;
      checks[spec.key] = check;
      continue;
    }

    if (spec.key === "nodeSmoke") {
      if (!smokeOk(report)) {
        reasons.push(
          `Hard Gate Blocker: E2E smoke report missing, empty, failed, or stale (${resolved.file})`
        );
        check.ok = false;
      } else {
        check.ok = true;
      }
    } else {
      if (!reportPassed(report)) {
        reasons.push(
          `Hard Gate Blocker: ${resolved.file} missing, empty, failed, or stale`
        );
        check.ok = false;
        checks[spec.key] = check;
        continue;
      }
      if (spec.requireReleaseEligible && report.releaseEligible !== true) {
        reasons.push(`Hard Gate Blocker: ${resolved.file} releaseEligible!=true`);
        check.ok = false;
      }
      if (spec.requireCardId && report.cardId !== identity.cardId) {
        reasons.push(
          `Hard Gate Blocker: ${resolved.file} cardId mismatch (report=${report.cardId}, expected=${identity.cardId})`
        );
        check.ok = false;
      }
      const idMis = identityMismatches(report, identity);
      if (idMis.length) {
        reasons.push(
          `Hard Gate Blocker: ${resolved.file} identity mismatch: ${idMis.join("; ")}`
        );
        check.ok = false;
      }
      if (check.ok !== false) check.ok = true;
    }

    checks[spec.key] = check;
  }

  // Card-scoped companions: stale blocks; wrong-card global companions ignored
  const companionCandidates = [
    `runtime_e2e_${cardId}_latest.json`,
    `runtime_e2e_standalone_${cardId}_latest.json`,
    `${cardId}_c7_readiness_latest.json`,
    `${cardId}_gate_readiness_latest.json`
  ];
  // Legacy survivor names
  if (cardId === "survivor_horde") {
    companionCandidates.push(
      "runtime_e2e_survivor_horde_latest.json",
      "runtime_e2e_standalone_survivor_latest.json",
      "survivor_c7_readiness_latest.json"
    );
  }
  if (cardId === "rhythm_timing") {
    companionCandidates.push("rhythm_gate_readiness_latest.json");
  }
  if (cardId === "drag_collect_grid") {
    companionCandidates.push("drag_gate_readiness_latest.json");
  }

  for (const companion of [...new Set(companionCandidates)]) {
    const p = path.join(reportsDir, companion);
    if (!fs.existsSync(p)) continue;
    const report = parseJsonFileSafe(p);
    if (!report) continue;
    if (report.cardId && report.cardId !== cardId) continue;
    if (isStaleReport(report)) {
      reasons.push(`Hard Gate Blocker: companion report stale (${companion})`);
      checks[companion] = { present: true, stale: true, ok: false };
    }
  }

  const productionExportAllowed = statusOk && exportOk && reasons.length === 0;

  return {
    productionExportAllowed,
    status: productionExportAllowed ? "passed" : "failed",
    reasons,
    checks,
    cardId,
    expectedIdentity: identity
  };
}
