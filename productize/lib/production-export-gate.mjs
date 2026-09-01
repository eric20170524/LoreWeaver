/**
 * Production export hard-gate evaluation (pure policy).
 *
 * Fail-closed: missing / failed / stale / identity-mismatched evidence blocks publish.
 * Soft warnings alone are never enough for productionExportAllowed.
 *
 * Evidence lookup may receive multiple report roots. The first matching report wins,
 * so workspace-local exact Candidate evidence can override legacy shared automation
 * reports without copying workspace-specific artifacts into a global report pool.
 */

import fs from "node:fs";
import path from "node:path";
import { evaluateReleaseMaturity } from "./release-maturity.mjs";

export const REQUIRED_PRODUCTION_REPORT_SPECS = [
  {
    key: "nodeSmoke",
    requireCardId: false,
    requireReleaseEligible: false,
    candidates: () => ["node_smoke_latest.json"]
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

function normalizeReportDirs(reportsDir, reportDirs = null) {
  const values = [];
  if (Array.isArray(reportDirs)) values.push(...reportDirs);
  if (reportsDir) values.push(reportsDir);
  return [...new Set(values.map((value) => value && path.resolve(value)).filter(Boolean))];
}

export function resolveCardReport(reportsDir, cardId, candidates, { requireCardId = false } = {}) {
  if (!reportsDir) return { file: candidates[0] || null, report: null, path: null };
  for (const file of candidates) {
    const filePath = path.join(reportsDir, file);
    const report = parseJsonFileSafe(filePath);
    if (!report) continue;
    if (requireCardId) {
      if (report.cardId != null && report.cardId !== cardId) continue;
    } else if (report.cardId != null && cardId && report.cardId !== cardId) {
      continue;
    }
    return { file, report, path: filePath, reportsDir };
  }
  return { file: candidates[0] || null, report: null, path: null, reportsDir };
}

export function resolveCardReportFromDirs(reportDirs, cardId, candidates, options = {}) {
  for (const reportsDir of reportDirs || []) {
    const resolved = resolveCardReport(reportsDir, cardId, candidates, options);
    if (resolved.report) return resolved;
  }
  return {
    file: candidates[0] || null,
    report: null,
    path: null,
    reportsDir: (reportDirs || [])[0] || null
  };
}

function resolveNamedReportFromDirs(reportDirs, file, cardId) {
  for (const reportsDir of reportDirs || []) {
    const filePath = path.join(reportsDir, file);
    const report = parseJsonFileSafe(filePath);
    if (!report) continue;
    if (report.cardId && report.cardId !== cardId) continue;
    return { file, report, path: filePath, reportsDir };
  }
  return { file, report: null, path: null, reportsDir: (reportDirs || [])[0] || null };
}

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

function withMaturity(result, {
  card,
  humanPlaytest,
  deviceVerification,
  expectedCandidateIdentity,
  waivers
}) {
  return {
    ...result,
    maturity: evaluateReleaseMaturity({
      card,
      productionGate: result,
      humanPlaytest,
      deviceVerification,
      expectedCandidateIdentity,
      waivers
    })
  };
}

export function evaluateProductionExportGate({
  card,
  reportsDir,
  reportDirs = null,
  expectedIdentity = null,
  humanPlaytest = null,
  deviceVerification = null,
  waivers = []
}) {
  const evidenceDirs = normalizeReportDirs(reportsDir, reportDirs);
  const maturityInput = {
    card,
    humanPlaytest,
    deviceVerification,
    expectedCandidateIdentity: expectedIdentity,
    waivers
  };
  const reasons = [];
  const checks = {};
  const cardId = card?.id || null;

  if (!card || typeof card !== "object") {
    return withMaturity({
      productionExportAllowed: false,
      status: "failed",
      reasons: ["Hard Gate Blocker: card object missing"],
      checks,
      cardId: null
    }, maturityInput);
  }

  const statusOk = card.status === "production_ready";
  const exportOk = card.exportPolicy?.productionReady === true;
  checks.cardStatus = statusOk;
  checks.exportPolicy = exportOk;
  if (!statusOk) {
    reasons.push(`Hard Gate Blocker: card status must be production_ready (got '${card.status}')`);
  }
  if (!exportOk) {
    reasons.push("Hard Gate Blocker: exportPolicy.productionReady must be true");
  }

  const needsEvidence = statusOk || exportOk;
  if (!needsEvidence) {
    return withMaturity({
      productionExportAllowed: false,
      status: reasons.length ? "failed" : "passed",
      reasons,
      checks,
      cardId
    }, maturityInput);
  }

  const identity = {
    cardId: expectedIdentity?.cardId || cardId,
    specHash: expectedIdentity?.specHash || null,
    recipeHash: expectedIdentity?.recipeHash || null,
    contentHash: expectedIdentity?.contentHash || null,
    atlasHash: expectedIdentity?.atlasHash || null,
    runtimeVersion: expectedIdentity?.runtimeVersion || null,
    payloadHash: expectedIdentity?.payloadHash || null,
    artifact: expectedIdentity?.artifact || null,
    artifactSha256: expectedIdentity?.artifactSha256 || null
  };
  maturityInput.expectedCandidateIdentity = identity;

  for (const spec of REQUIRED_PRODUCTION_REPORT_SPECS) {
    const candidates = spec.candidates(cardId);
    const resolved = resolveCardReportFromDirs(evidenceDirs, cardId, candidates, {
      requireCardId: spec.requireCardId
    });
    const report = resolved.report;
    const check = {
      file: resolved.file,
      sourceDir: resolved.reportsDir || null,
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
      reasons.push(`Hard Gate Blocker: ${candidates.join(" | ")} missing, empty, or cardId mismatch`);
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
        reasons.push(`Hard Gate Blocker: E2E smoke report missing, empty, failed, or stale (${resolved.file})`);
        check.ok = false;
      } else {
        check.ok = true;
      }
    } else {
      if (!reportPassed(report)) {
        reasons.push(`Hard Gate Blocker: ${resolved.file} missing, empty, failed, or stale`);
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
        reasons.push(`Hard Gate Blocker: ${resolved.file} identity mismatch: ${idMis.join("; ")}`);
        check.ok = false;
      }
      if (check.ok !== false) check.ok = true;
    }

    checks[spec.key] = check;
  }

  const companionCandidates = [
    `runtime_e2e_${cardId}_latest.json`,
    `runtime_e2e_standalone_${cardId}_latest.json`,
    `${cardId}_c7_readiness_latest.json`,
    `${cardId}_gate_readiness_latest.json`
  ];
  if (cardId === "survivor_horde") {
    companionCandidates.push(
      "runtime_e2e_survivor_horde_latest.json",
      "runtime_e2e_standalone_survivor_latest.json",
      "survivor_c7_readiness_latest.json"
    );
  }
  if (cardId === "rhythm_timing") companionCandidates.push("rhythm_gate_readiness_latest.json");
  if (cardId === "drag_collect_grid") companionCandidates.push("drag_gate_readiness_latest.json");
  if (cardId === "turn_based_skill_battle") companionCandidates.push("tbsb_gate_readiness_latest.json");
  if (cardId === "sequence_synthesis") companionCandidates.push("seq_gate_readiness_latest.json");

  for (const companion of [...new Set(companionCandidates)]) {
    const resolved = resolveNamedReportFromDirs(evidenceDirs, companion, cardId);
    const report = resolved.report;
    if (!report) continue;
    if (isStaleReport(report)) {
      reasons.push(`Hard Gate Blocker: companion report stale (${companion})`);
      checks[companion] = {
        present: true,
        stale: true,
        ok: false,
        sourceDir: resolved.reportsDir || null
      };
    }
  }

  const productionExportAllowed = statusOk && exportOk && reasons.length === 0;

  return withMaturity({
    productionExportAllowed,
    status: productionExportAllowed ? "passed" : "failed",
    reasons,
    checks,
    cardId,
    expectedIdentity: identity,
    evidenceDirs
  }, maturityInput);
}
