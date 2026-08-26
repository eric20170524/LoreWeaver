/**
 * Evidence-derived release maturity for LoreWeaver.
 *
 * `card.status === "production_ready"` remains a legacy catalog compatibility
 * signal only. `release_certified` is derived from current automatic evidence
 * plus trusted, identity-bound real human/device observations.
 */

import { isTrustedObservedReleaseEvidence } from "./observed-release-evidence.mjs";
import {
  exactCandidateIdentityMismatches,
  isExactCandidateEvidence
} from "./exact-candidate-evidence.mjs";

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

function checkOk(gate, key) {
  return bool(gate?.checks?.[key]?.ok);
}

function runtimeSupported(card) {
  if (!card || typeof card !== "object") return false;
  const status = String(card.status || "");
  if (["runtime_ready", "gate_verified", "production_ready"].includes(status)) return true;
  return Boolean(card.runtime?.adapter || card.runtime?.template);
}

function collectMissingAutomaticEvidence(productionGate) {
  const missing = [];
  for (const key of AUTO_CHECK_KEYS) {
    if (!checkOk(productionGate, key)) missing.push(key);
  }
  return missing;
}

export function evaluateReleaseMaturity({
  card,
  productionGate,
  humanPlaytest = null,
  deviceVerification = null,
  expectedCandidateIdentity = null,
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

  const humanObservedTrusted = isTrustedObservedReleaseEvidence(humanPlaytest, "human");
  const deviceObservedTrusted = isTrustedObservedReleaseEvidence(deviceVerification, "device");
  const humanIdentityMismatches = humanObservedTrusted
    ? exactCandidateIdentityMismatches(humanPlaytest, expectedCandidateIdentity)
    : [];
  const deviceIdentityMismatches = deviceObservedTrusted
    ? exactCandidateIdentityMismatches(deviceVerification, expectedCandidateIdentity)
    : [];
  const humanPassed = humanObservedTrusted && isExactCandidateEvidence(humanPlaytest, expectedCandidateIdentity);
  const devicePassed = deviceObservedTrusted && isExactCandidateEvidence(deviceVerification, expectedCandidateIdentity);
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
  if (!humanPassed) blockers.push("human_playtest_missing_invalid_or_candidate_mismatch");
  if (!devicePassed) blockers.push("device_verification_missing_invalid_or_candidate_mismatch");
  if (normalizedWaivers.length) blockers.push(`waivers_present:${normalizedWaivers.length}`);

  return {
    schemaVersion: "loreweaver.release-maturity.v2",
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
    evidencePolicy: {
      human: "real_observed_exact_candidate",
      device: "physical_device_observed_exact_candidate",
      expectedCandidateIdentityRequired: true
    },
    evidenceIdentityMismatches: {
      human: humanIdentityMismatches,
      device: deviceIdentityMismatches
    },
    missingEvidence: [...new Set(missingEvidence)],
    waivers: normalizedWaivers,
    blockers: [...new Set(blockers)]
  };
}

export function isReleaseCertified(result) {
  return result?.certificationTier === "release_certified" && result?.releaseCertified === true;
}
