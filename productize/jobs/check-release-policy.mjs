#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildReleaseIdentity,
  collectWorkspaceCardIds,
  evaluateWorkspaceReleasePolicy
} from "../lib/release-policy.mjs";
import {
  buildDeviceVerificationEvidence,
  buildHumanPlaytestEvidence
} from "../lib/observed-release-evidence.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
function seedCard(cardsRoot, cardId) {
  writeJson(path.join(cardsRoot, `${cardId}.json`), {
    schemaVersion: "2.0",
    id: cardId,
    status: "production_ready",
    runtime: { adapter: "TestAdapter" },
    exportPolicy: { productionReady: true }
  });
}
function seedAutomaticEvidence(reportsDir, cardId) {
  writeJson(path.join(reportsDir, "node_smoke_latest.json"), {
    status: "passed",
    summary: { passed: 1, failed: 0 }
  });
  writeJson(path.join(reportsDir, `standalone_browser_report_${cardId}.json`), {
    status: "passed",
    cardId,
    releaseEligible: true
  });
  writeJson(path.join(reportsDir, `visual_audit_${cardId}_latest.json`), {
    status: "passed",
    cardId
  });
  writeJson(path.join(reportsDir, `performance_report_${cardId}_latest.json`), {
    status: "passed",
    cardId
  });
  writeJson(path.join(reportsDir, `runtime_e2e_${cardId}_latest.json`), {
    status: "passed",
    cardId,
    releaseEligible: true
  });
}
function seedHumanAndDevice(workspaceReports, cardId, releaseIdentity, candidateIdentity) {
  const identity = { ...releaseIdentity, ...candidateIdentity, cardId };
  const human = buildHumanPlaytestEvidence({
    identity,
    input: {
      kind: "human_playtest",
      humanObserved: true,
      fixture: false,
      synthetic: false,
      sessions: [{
        sessionId: `${cardId}-human-1`,
        completed: true,
        understoodCoreLoop: true,
        wouldReplay: true,
        completionSeconds: 120,
        understandingSeconds: 8,
        difficulty: 3,
        fun: 4,
        clarity: 4,
        blockingIssues: [],
        failureReasons: [],
        suggestions: []
      }]
    }
  }).report;
  const device = buildDeviceVerificationEvidence({
    identity,
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
        deviceModel: `${cardId}-physical-device`,
        os: "physical-os",
        browser: "physical-browser",
        viewport: { width: 720, height: 1280 },
        completed: true,
        interactionOk: true,
        consoleErrors: 0,
        fps: { p50: 60, p95: 55, min: 40 }
      }]
    }
  }).report;
  writeJson(path.join(workspaceReports, `human_playtest_${cardId}_latest.json`), human);
  writeJson(path.join(workspaceReports, `device_verification_${cardId}_latest.json`), device);
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-release-policy-"));
  const cardsRoot = path.join(root, "cards");
  const reportsDir = path.join(root, "reports");
  const workspaceReportsDir = path.join(root, "workspace-reports");
  const gameSpec = {
    nodes: [
      { id: 1, gameplay: { cardId: "alpha" } },
      { id: 2, gameplay: { cardId: "beta" } },
      { id: 3, gameplay: { cardId: "alpha" } }
    ]
  };
  const releaseIdentity = buildReleaseIdentity({ gameSpec });
  const candidateIdentity = {
    specHash: releaseIdentity.specHash,
    runtimeVersion: releaseIdentity.runtimeVersion,
    payloadHash: "sha256:candidate-payload",
    artifact: "productize/exports/candidate.zip",
    artifactSha256: "sha256:candidate-artifact"
  };

  assert(JSON.stringify(collectWorkspaceCardIds(gameSpec)) === JSON.stringify(["alpha", "beta"]), "card ids should dedupe and sort");
  for (const cardId of ["alpha", "beta"]) {
    seedCard(cardsRoot, cardId);
    seedAutomaticEvidence(reportsDir, cardId);
  }

  const candidate = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    mode: "candidate",
    cardsRoot
  });
  assert(candidate.exportAllowed === true, "candidate export should be allowed without observed evidence");
  assert(candidate.releaseCertified === false, "candidate should not be certified");

  const blockedNoCandidateIdentity = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    mode: "certified",
    cardsRoot
  });
  assert(blockedNoCandidateIdentity.exportAllowed === false, "certified export must require exact Candidate identity");
  assert(blockedNoCandidateIdentity.missingEvidence.includes("exactCandidateIdentity"));

  seedHumanAndDevice(workspaceReportsDir, "alpha", releaseIdentity, candidateIdentity);
  const partiallyReady = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    candidateIdentity,
    mode: "certified",
    cardsRoot
  });
  assert(partiallyReady.exportAllowed === false, "all used cards must be certified");
  assert(partiallyReady.blockers.some((item) => item.startsWith("beta:")), "beta blockers should remain visible");

  seedHumanAndDevice(workspaceReportsDir, "beta", releaseIdentity, candidateIdentity);
  const certified = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    candidateIdentity,
    mode: "certified",
    cardsRoot
  });
  assert(certified.exportAllowed === true, `expected certified export, got ${JSON.stringify(certified.blockers)}`);
  assert(certified.releaseCertified === true, "all-card release should certify");
  assert(certified.certificationTier === "release_certified", "tier should be release_certified");
  assert(certified.exactCandidateReady === true, "exact Candidate identity must be recorded");

  const wrongCandidate = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    candidateIdentity: { ...candidateIdentity, payloadHash: "sha256:other" },
    mode: "certified",
    cardsRoot
  });
  assert(wrongCandidate.exportAllowed === false, "old Candidate observed evidence must not certify a new payload");
  assert(wrongCandidate.cardDecisions.some((item) =>
    item.maturity.evidenceIdentityMismatches.human.some((mismatch) => mismatch.startsWith("payloadHash:"))
  ));

  const withWaiver = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    candidateIdentity,
    mode: "certified",
    cardsRoot,
    waivers: ["temporary_device_exception"]
  });
  assert(withWaiver.exportAllowed === false, "waiver must prevent strict certified export");

  console.log("PASSED workspace release policy checks");
}

try {
  main();
} catch (error) {
  console.error("FAILED", error);
  process.exit(1);
}
