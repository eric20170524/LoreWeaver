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
function seedWorkspaceAutomaticEvidence(workspaceReports, cardId, { browser = "passed", visual = "passed" } = {}) {
  writeJson(path.join(workspaceReports, `standalone_browser_report_${cardId}.json`), {
    status: browser,
    stale: browser === "stale",
    freshness: browser === "stale" ? "stale" : "fresh",
    cardId,
    releaseEligible: browser === "passed"
  });
  writeJson(path.join(workspaceReports, `visual_audit_${cardId}_latest.json`), {
    status: visual,
    stale: visual === "stale",
    freshness: visual === "stale" ? "stale" : "fresh",
    cardId
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

  // Workspace exact-Candidate browser/visual evidence must override stale/failed
  // shared reports. This is the normal publish-UI path.
  for (const cardId of ["alpha", "beta"]) {
    seedWorkspaceAutomaticEvidence(workspaceReportsDir, cardId);
    writeJson(path.join(reportsDir, `standalone_browser_report_${cardId}.json`), {
      status: "failed",
      cardId,
      releaseEligible: false
    });
    writeJson(path.join(reportsDir, `visual_audit_${cardId}_latest.json`), {
      status: "stale",
      stale: true,
      freshness: "stale",
      cardId,
      staleReason: "shared_report_must_not_override_workspace"
    });
  }
  const workspaceWins = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    candidateIdentity,
    mode: "certified",
    cardsRoot
  });
  assert(workspaceWins.exportAllowed === true, `workspace evidence should override shared stale/failed reports: ${JSON.stringify(workspaceWins.blockers)}`);
  for (const item of workspaceWins.cardDecisions) {
    assert(item.productionGate.checks.standaloneBrowser.sourceDir === path.resolve(workspaceReportsDir), `${item.cardId} browser must come from workspace reports`);
    assert(item.productionGate.checks.visualAudit.sourceDir === path.resolve(workspaceReportsDir), `${item.cardId} visual must come from workspace reports`);
  }

  // Conversely, a local stale report is authoritative. Never bypass it with a
  // shared PASS report, otherwise re-verified Candidate identity can be escaped.
  writeJson(path.join(workspaceReportsDir, "visual_audit_alpha_latest.json"), {
    status: "stale",
    stale: true,
    freshness: "stale",
    staleReason: "new_candidate_selected",
    cardId: "alpha"
  });
  writeJson(path.join(reportsDir, "visual_audit_alpha_latest.json"), {
    status: "passed",
    cardId: "alpha"
  });
  const workspaceStaleBlocks = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    candidateIdentity,
    mode: "certified",
    cardsRoot
  });
  assert(workspaceStaleBlocks.exportAllowed === false, "workspace stale evidence must block even when shared fallback passes");
  const alphaDecision = workspaceStaleBlocks.cardDecisions.find((item) => item.cardId === "alpha");
  assert(alphaDecision?.productionGate.checks.visualAudit.sourceDir === path.resolve(workspaceReportsDir), "stale local visual report must remain authoritative");
  assert(alphaDecision?.productionGate.checks.visualAudit.stale === true, "local stale visual evidence must be visible in gate checks");

  // Restore local visual PASS for the remaining identity tests.
  seedWorkspaceAutomaticEvidence(workspaceReportsDir, "alpha");

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

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.release-policy-check.v2",
    status: "passed",
    checks: [
      "multi_card_candidate_policy",
      "exact_candidate_required",
      "all_cards_require_observed_evidence",
      "workspace_automatic_evidence_overrides_shared_stale_or_failed",
      "workspace_stale_evidence_does_not_fallback_to_shared_pass",
      "observed_evidence_candidate_identity_match",
      "waiver_prevents_strict_certification"
    ]
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("FAILED", error);
  process.exit(1);
}
