#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectWorkspaceCardIds,
  evaluateWorkspaceReleasePolicy
} from "../lib/release-policy.mjs";

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

function seedHumanAndDevice(workspaceReports, cardId) {
  writeJson(path.join(workspaceReports, `human_playtest_${cardId}_latest.json`), {
    schemaVersion: "loreweaver.human-playtest-evidence.v1",
    status: "passed",
    cardId,
    createdAt: new Date().toISOString(),
    identityMatches: true,
    freshness: "fresh",
    sessions: [{
      sessionId: "s1",
      completed: true,
      understoodCoreLoop: true,
      wouldReplay: true,
      blockingIssues: []
    }],
    summary: {
      sessionCount: 1,
      completionRate: 1,
      coreLoopUnderstandingRate: 1,
      blockingIssueCount: 0
    }
  });
  writeJson(path.join(workspaceReports, `device_verification_${cardId}_latest.json`), {
    schemaVersion: "loreweaver.device-verification-evidence.v1",
    status: "passed",
    cardId,
    createdAt: new Date().toISOString(),
    identityMatches: true,
    freshness: "fresh",
    devices: [{
      deviceId: "device-1",
      deviceClass: "desktop",
      os: "test",
      browser: "chromium",
      viewport: { width: 1280, height: 720 },
      interactionPassed: true,
      consoleErrorCount: 0,
      fps: { p50: 60, p95: 55, min: 50 }
    }],
    summary: {
      deviceCount: 1,
      interactionPassRate: 1,
      consoleErrorCount: 0,
      performanceBudgetPassed: true
    }
  });
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
  assert(candidate.exportAllowed === true, "candidate export should be allowed without human/device evidence");
  assert(candidate.releaseCertified === false, "candidate should not be certified");
  assert(candidate.nonReleaseMarker === "UNVERIFIED_CANDIDATE", "candidate needs non-release marker");

  const blocked = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    mode: "certified",
    cardsRoot
  });
  assert(blocked.exportAllowed === false, "certified export should block missing human/device evidence");
  assert(blocked.missingEvidence.some((item) => item.includes("humanPlaytest")), "missing human evidence should be explicit");

  seedHumanAndDevice(workspaceReportsDir, "alpha");
  const partiallyReady = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    mode: "certified",
    cardsRoot
  });
  assert(partiallyReady.exportAllowed === false, "all used cards must be certified");
  assert(partiallyReady.blockers.some((item) => item.startsWith("beta:")), "beta blockers should remain visible");

  seedHumanAndDevice(workspaceReportsDir, "beta");
  const certified = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
    mode: "certified",
    cardsRoot
  });
  assert(certified.exportAllowed === true, `expected certified export, got ${JSON.stringify(certified.blockers)}`);
  assert(certified.releaseCertified === true, "all-card release should certify");
  assert(certified.certificationTier === "release_certified", "tier should be release_certified");
  assert(certified.nonReleaseMarker === null, "certified release must not carry candidate marker");

  const withWaiver = evaluateWorkspaceReleasePolicy({
    gameSpec,
    reportsDir,
    workspaceReportsDir,
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
