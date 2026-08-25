/**
 * Evidence-derived release maturity for LoreWeaver.
 *
 * This module intentionally does NOT replace the legacy gameplay-card status yet.
 * `card.status === "production_ready"` remains a catalog compatibility signal,
 * while `certificationTier` expresses what the current evidence actually proves.
 *
 * The evaluator is pure so Workbench, CLI and future release compiler paths can
 * share the exact same policy without copying runtime or export logic.
 */

export const RELEASE_CERTIFICATION_TIERS = Object.freeze([
  "experimental",
  "runtime_supported",
  "runtime_verified",
  "browser_verified",
  "visual_verified",
  "human_playtested",
  "device_verified",
  "conditionally_certified",
  "release_certified"
]);

const AUTO_CHECK_KEYS = Object.freeze([
  "nodeSmoke",
  "demoE2e",
  "standaloneBrowser",
  "visualAudit",
  "performance"
]);

function bool(value) {
  return value === true;
}

function isFreshPassedEvidence(report) {
  if (!report || typeof report !== "object") return false;
  if (report.status !== "passed") return false;
  if (report.stale === true) return false;
  if (report.artifactStatus === "stale") return false;
  if (report.freshness === "stale") return false;
  if (report.identityMatches === false) return false;
  return true;
}

function checkOk(gate, key) {
  return bool(gate?.checks?.[key]?.ok);
}

function runtimeSupported(card) {
  if (!card || typeof card !== "object") return false;
  const status = String(card.status || "");
  if (["runtime_ready", "gate_verified", "production_ready"].includes(status)) {
    return true;
  }
  return Boolean(card.runtime?.adapter || card.runtime?.template);
}

function collectMissingAutomaticEvidence(productionGate) {
  const missing = [];
  for (const key of AUTO_CHECK_KEYS) {
    if (!checkOk(productionGate, key)) missing.push(key);
  }
  return missing;
}

/**
 * Derive the highest release maturity proven by current evidence.
 *
 * Inputs:
 * - card: Gameplay Card metadata.
 * - productionGate: result of evaluateProductionExportGate().
 * - humanPlaytest: optional report with status=passed and freshness/identity flags.
 * - deviceVerification: optional report with status=passed and freshness/identity flags.
 * - waivers: explicit release waivers. Any waiver prevents release_certified.
 */
export function evaluateReleaseMaturity({
  card,
  productionGate,
  humanPlaytest = null,
  deviceVerification = null,
  waivers = []
} = {}) {
  const legacyProductionReady = card?.status === "production_ready";
  const supported = runtimeSupported(card);
  const automaticMissing = collectMissingAutomaticEvidence(productionGate);
  const automaticGatePassed = productionGate?.productionExportAllowed === true;

  const runtimeVerified = checkOk(productionGate, "nodeSmoke") && checkOk(productionGate, "demoE2e");
  const browserVerified = runtimeVerified && checkOk(productionGate, "standaloneBrowser");
  const visualVerified = browserVerified && checkOk(productionGate, "visualAudit");
  const performanceVerified = visualVerified && checkOk(productionGate, "performance");
  const humanPassed = isFreshPassedEvidence(humanPlaytest);
  const devicePassed = isFreshPassedEvidence(deviceVerification);
  const normalizedWaivers = Array.isArray(waivers) ? waivers.filter(Boolean) : [];

  let certificationTier = "experimental";
  if (supported) certificationTier = "runtime_supported";
  if (runtimeVerified) certificationTier = "runtime_verified";
  if (browserVerified) certificationTier = "browser_verified";
  if (visualVerified) certificationTier = "visual_verified";
  if (performanceVerified && humanPassed) certificationTier = "human_playtested";
  if (performanceVerified && humanPassed && devicePassed) certificationTier = "device_verified";

  const releaseCertified =
    automaticGatePassed &&
    humanPassed &&
    devicePassed &&
    normalizedWaivers.length === 0;

  const conditionallyCertified =
    !releaseCertified &&
    automaticGatePassed &&
    (humanPassed || devicePassed || normalizedWaivers.length > 0 || legacyProductionReady);

  if (conditionallyCertified) certificationTier = "conditionally_certified";
  if (releaseCertified) certificationTier = "release_certified";

  const missingEvidence = [...automaticMissing];
  if (!humanPassed) missingEvidence.push("humanPlaytest");
  if (!devicePassed) missingEvidence.push("deviceVerification");

  const blockers = [];
  if (!supported) blockers.push("runtime_not_supported");
  for (const item of automaticMissing) blockers.push(`automatic_evidence:${item}`);
  if (!humanPassed) blockers.push("human_playtest_missing_or_invalid");
  if (!devicePassed) blockers.push("device_verification_missing_or_invalid");
  if (normalizedWaivers.length) blockers.push(`waivers_present:${normalizedWaivers.length}`);

  return {
    schemaVersion: "loreweaver.release-maturity.v1",
    certificationTier,
    releaseCertified,
    conditionallyCertified,
    legacyProductionReady,
    legacyProductionExportAllowed: automaticGatePassed,
    evidence: {
      runtimeSupported: supported,
      runtimeVerified,
      browserVerified,
      visualVerified,
      performanceVerified,
      humanPlaytested: humanPassed,
      deviceVerified: devicePassed
    },
    missingEvidence: [...new Set(missingEvidence)],
    waivers: normalizedWaivers,
    blockers: [...new Set(blockers)]
  };
}

export function isReleaseCertified(result) {
  return result?.certificationTier === "release_certified" && result?.releaseCertified === true;
}
