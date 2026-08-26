#!/usr/bin/env node
import { strict as assert } from "node:assert";
import {
  buildDeviceVerificationEvidence,
  buildHumanPlaytestEvidence,
  isTrustedObservedReleaseEvidence,
  validateDeviceObservationInput,
  validateHumanObservationInput
} from "../lib/observed-release-evidence.mjs";
import {
  exactCandidateIdentityMismatches,
  isExactCandidateEvidence
} from "../lib/exact-candidate-evidence.mjs";
import { evaluateReleaseMaturity } from "../lib/release-maturity.mjs";

const identity = {
  cardId: "survivor_horde",
  specHash: "sha256:spec",
  runtimeVersion: "2.0.0",
  recipeHash: "sha256:recipe",
  contentHash: "sha256:content",
  atlasHash: "sha256:atlas",
  payloadHash: "sha256:payload",
  artifact: "productize/exports/candidate.zip",
  artifactSha256: "sha256:artifact",
  browserReport: "data/workspaces/test/reports/standalone_browser_report.json"
};

const humanInput = {
  kind: "human_playtest",
  humanObserved: true,
  fixture: false,
  synthetic: false,
  sessions: [{
    sessionId: "human-1",
    completed: true,
    understoodCoreLoop: true,
    wouldReplay: true,
    completionSeconds: 180,
    understandingSeconds: 12,
    difficulty: 3,
    fun: 4,
    clarity: 4,
    blockingIssues: [],
    failureReasons: [],
    suggestions: ["keep the climax telegraph visible"]
  }]
};

const deviceInput = {
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
    deviceClass: "mobile-midrange",
    deviceModel: "physical-test-device",
    os: "physical-os",
    browser: "physical-browser",
    viewport: { width: 720, height: 1280 },
    completed: true,
    interactionOk: true,
    consoleErrors: 0,
    fps: { p50: 60, p95: 55, min: 42 }
  }]
};

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

const human = buildHumanPlaytestEvidence({ input: humanInput, identity, createdAt: "2026-08-26T00:00:00Z" });
const device = buildDeviceVerificationEvidence({ input: deviceInput, identity, createdAt: "2026-08-26T00:00:00Z" });
assert.equal(human.ok, true);
assert.equal(device.ok, true);
assert.equal(human.report.status, "passed");
assert.equal(device.report.status, "passed");
assert.equal(isTrustedObservedReleaseEvidence(human.report, "human"), true);
assert.equal(isTrustedObservedReleaseEvidence(device.report, "device"), true);
assert.equal(isExactCandidateEvidence(human.report, identity), true);
assert.equal(isExactCandidateEvidence(device.report, identity), true);

const wrongPayload = { ...human.report, payloadHash: "sha256:other" };
assert.equal(isExactCandidateEvidence(wrongPayload, identity), false);
assert(exactCandidateIdentityMismatches(wrongPayload, identity).some((item) => item.startsWith("payloadHash:")));
assert.equal(isExactCandidateEvidence(human.report, null), false, "missing expected Candidate identity must fail closed");

assert(validateHumanObservationInput({ ...humanInput, synthetic: true }).includes("synthetic_evidence_forbidden"));
assert(validateDeviceObservationInput({ ...deviceInput, headless: true }).includes("headless_evidence_forbidden"));
assert(validateDeviceObservationInput({ ...deviceInput, emulated: true }).includes("emulated_evidence_forbidden"));

const card = {
  id: "survivor_horde",
  status: "production_ready",
  runtime: { adapter: "SurvivorHordeAdapter" }
};
const certified = evaluateReleaseMaturity({
  card,
  productionGate: passingGate(),
  humanPlaytest: human.report,
  deviceVerification: device.report,
  expectedCandidateIdentity: identity
});
assert.equal(certified.releaseCertified, true);

const noIdentity = evaluateReleaseMaturity({
  card,
  productionGate: passingGate(),
  humanPlaytest: human.report,
  deviceVerification: device.report
});
assert.equal(noIdentity.releaseCertified, false);
assert(noIdentity.evidenceIdentityMismatches.human.includes("expected_candidate_identity_missing"));

console.log(JSON.stringify({
  schemaVersion: "loreweaver.observed-release-evidence-check.v1",
  status: "passed",
  checks: [
    "real_human_observation_contract",
    "physical_device_observation_contract",
    "synthetic_headless_emulated_rejected",
    "exact_candidate_hash_match_required",
    "missing_expected_candidate_identity_fails_closed"
  ]
}, null, 2));
