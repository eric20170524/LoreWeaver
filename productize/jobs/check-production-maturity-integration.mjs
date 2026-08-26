#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { evaluateProductionExportGate } from "../lib/production-export-gate.mjs";
import {
  buildDeviceVerificationEvidence,
  buildHumanPlaytestEvidence
} from "../lib/observed-release-evidence.mjs";

function writeJson(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function seedAutomaticEvidence(dir, cardId) {
  writeJson(dir, "node_smoke_latest.json", {
    status: "passed",
    summary: { passed: 1, failed: 0 }
  });
  writeJson(dir, `standalone_browser_report_${cardId}.json`, {
    status: "passed",
    cardId,
    releaseEligible: true
  });
  writeJson(dir, `visual_audit_${cardId}_latest.json`, {
    status: "passed",
    cardId
  });
  writeJson(dir, `performance_report_${cardId}_latest.json`, {
    status: "passed",
    cardId
  });
  writeJson(dir, `runtime_e2e_${cardId}_latest.json`, {
    status: "passed",
    cardId,
    releaseEligible: true
  });
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

function observedEvidence() {
  const human = buildHumanPlaytestEvidence({
    identity,
    input: {
      kind: "human_playtest",
      humanObserved: true,
      fixture: false,
      synthetic: false,
      sessions: [{
        sessionId: "h1",
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
  }).report;
  return { human, device };
}

function main() {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-maturity-"));
  const card = {
    id: "survivor_horde",
    status: "production_ready",
    runtime: { adapter: "SurvivorHordeAdapter" },
    exportPolicy: { productionReady: true }
  };
  seedAutomaticEvidence(reportsDir, card.id);
  const { human, device } = observedEvidence();

  const legacy = evaluateProductionExportGate({ card, reportsDir });
  assert.equal(legacy.productionExportAllowed, true);
  assert.equal(legacy.maturity.certificationTier, "conditionally_certified");
  assert.equal(legacy.maturity.releaseCertified, false);
  assert(legacy.maturity.missingEvidence.includes("humanPlaytest"));
  assert(legacy.maturity.missingEvidence.includes("deviceVerification"));

  const certified = evaluateProductionExportGate({
    card,
    reportsDir,
    expectedIdentity: identity,
    humanPlaytest: human,
    deviceVerification: device
  });
  assert.equal(certified.productionExportAllowed, true);
  assert.equal(certified.maturity.certificationTier, "release_certified");
  assert.equal(certified.maturity.releaseCertified, true);

  const wrongCandidate = evaluateProductionExportGate({
    card,
    reportsDir,
    expectedIdentity: { ...identity, payloadHash: "sha256:other" },
    humanPlaytest: human,
    deviceVerification: device
  });
  assert.equal(wrongCandidate.maturity.releaseCertified, false);

  const waiver = evaluateProductionExportGate({
    card,
    reportsDir,
    expectedIdentity: identity,
    humanPlaytest: human,
    deviceVerification: device,
    waivers: ["device_lab_pending"]
  });
  assert.equal(waiver.productionExportAllowed, true);
  assert.equal(waiver.maturity.certificationTier, "conditionally_certified");
  assert.equal(waiver.maturity.releaseCertified, false);

  console.log("PASSED production export maturity integration checks");
}

main();
