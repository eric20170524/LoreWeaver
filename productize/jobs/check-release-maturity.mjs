#!/usr/bin/env node

import { strict as assert } from "node:assert";
import {
  evaluateReleaseMaturity,
  isReleaseCertified
} from "../lib/release-maturity.mjs";
import {
  buildDeviceVerificationEvidence,
  buildHumanPlaytestEvidence
} from "../lib/observed-release-evidence.mjs";

function passingGate() {
  return {
    productionExportAllowed: true,
    checks: {
      nodeSmoke: { ok: true },
      demoE2e: { ok: true },
      standaloneBrowser: { ok: true },
      visualAudit: { ok: true },
      performance: { ok: true }
    }
  };
}

const identity = {
  cardId: "survivor_horde",
  specHash: "sha256:spec",
  runtimeVersion: "2.0.0",
  recipeHash: "sha256:recipe",
  contentHash: "sha256:content",
  atlasHash: "sha256:atlas",
  payloadHash: "sha256:payload",
  artifact: "productize/exports/candidate.zip",
  artifactSha256: "sha256:artifact"
};

function humanEvidence(extra = {}) {
  const built = buildHumanPlaytestEvidence({
    identity,
    createdAt: "2026-08-26T00:00:00Z",
    input: {
      kind: "human_playtest",
      humanObserved: true,
      fixture: false,
      synthetic: false,
      sessions: [{
        sessionId: "s1",
        completed: true,
        understoodCoreLoop: true,
        wouldReplay: true,
        completionSeconds: 180,
        understandingSeconds: 10,
        difficulty: 3,
        fun: 4,
        clarity: 4,
        blockingIssues: [],
        failureReasons: [],
        suggestions: []
      }]
    }
  });
  return { ...built.report, ...extra };
}

function deviceEvidence(extra = {}) {
  const built = buildDeviceVerificationEvidence({
    identity,
    createdAt: "2026-08-26T00:00:00Z",
    input: {
      kind: "device_verification",
      deviceObserved: true,
      fixture: false,
      synthetic: false,
      headless: false,
      emulated: false,
      performanceBudget: { minP50Fps: 50, minMinFps: 30 },
      runs: [{
        physicalDevice: true,
        headless: false,
        emulated: false,
        deviceClass: "mobile",
        deviceModel: "physical-device",
        os: "physical-os",
        browser: "physical-browser",
        viewport: { width: 720, height: 1280 },
        completed: true,
        interactionOk: true,
        consoleErrors: 0,
        fps: { p50: 60, p95: 55, min: 40 }
      }]
    }
  });
  return { ...built.report, ...extra };
}

function main() {
  const card = {
    id: "survivor_horde",
    status: "production_ready",
    runtime: { adapter: "SurvivorHordeAdapter" }
  };

  const noEvidence = evaluateReleaseMaturity({ card, productionGate: null, expectedCandidateIdentity: identity });
  assert.equal(noEvidence.certificationTier, "runtime_supported");
  assert.equal(noEvidence.releaseCertified, false);
  assert(noEvidence.missingEvidence.includes("humanPlaytest"));
  assert(noEvidence.missingEvidence.includes("deviceVerification"));

  const legacyAutomaticOnly = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    expectedCandidateIdentity: identity
  });
  assert.equal(legacyAutomaticOnly.certificationTier, "conditionally_certified");
  assert.equal(legacyAutomaticOnly.legacyProductionReady, true);
  assert.equal(legacyAutomaticOnly.legacyProductionExportAllowed, true);
  assert.equal(legacyAutomaticOnly.releaseCertified, false);

  const withHumanOnly = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: humanEvidence(),
    expectedCandidateIdentity: identity
  });
  assert.equal(withHumanOnly.certificationTier, "conditionally_certified");
  assert.equal(withHumanOnly.evidence.humanPlaytested, true);
  assert.equal(withHumanOnly.evidence.deviceVerified, false);

  const fullyCertified = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: humanEvidence(),
    deviceVerification: deviceEvidence(),
    expectedCandidateIdentity: identity
  });
  assert.equal(fullyCertified.certificationTier, "release_certified");
  assert.equal(fullyCertified.releaseCertified, true);
  assert.equal(isReleaseCertified(fullyCertified), true);

  const noExpectedCandidate = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: humanEvidence(),
    deviceVerification: deviceEvidence()
  });
  assert.equal(noExpectedCandidate.releaseCertified, false);
  assert(noExpectedCandidate.evidenceIdentityMismatches.human.includes("expected_candidate_identity_missing"));

  const staleHuman = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: humanEvidence({ stale: true }),
    deviceVerification: deviceEvidence(),
    expectedCandidateIdentity: identity
  });
  assert.equal(staleHuman.releaseCertified, false);
  assert(staleHuman.blockers.includes("human_playtest_missing_invalid_or_candidate_mismatch"));

  const identityMismatchDevice = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: humanEvidence(),
    deviceVerification: deviceEvidence({ payloadHash: "sha256:other" }),
    expectedCandidateIdentity: identity
  });
  assert.equal(identityMismatchDevice.releaseCertified, false);
  assert(identityMismatchDevice.blockers.includes("device_verification_missing_invalid_or_candidate_mismatch"));
  assert(identityMismatchDevice.evidenceIdentityMismatches.device.some((item) => item.startsWith("payloadHash:")));

  const waiverBlocksCertification = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: humanEvidence(),
    deviceVerification: deviceEvidence(),
    expectedCandidateIdentity: identity,
    waivers: ["headless_fps_proxy"]
  });
  assert.equal(waiverBlocksCertification.certificationTier, "conditionally_certified");
  assert.equal(waiverBlocksCertification.releaseCertified, false);
  assert(waiverBlocksCertification.blockers.includes("waivers_present:1"));

  const failedAutomaticGate = passingGate();
  failedAutomaticGate.productionExportAllowed = false;
  failedAutomaticGate.checks.visualAudit = { ok: false };
  const autoFailure = evaluateReleaseMaturity({
    card,
    productionGate: failedAutomaticGate,
    humanPlaytest: humanEvidence(),
    deviceVerification: deviceEvidence(),
    expectedCandidateIdentity: identity
  });
  assert.equal(autoFailure.releaseCertified, false);
  assert.equal(autoFailure.certificationTier, "browser_verified");
  assert(autoFailure.missingEvidence.includes("visualAudit"));

  console.log("PASSED release maturity policy checks");
}

main();
