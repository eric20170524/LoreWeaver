#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { evaluateProductionExportGate } from "../lib/production-export-gate.mjs";

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

function passedEvidence() {
  return {
    status: "passed",
    freshness: "fresh",
    identityMatches: true
  };
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

  const legacy = evaluateProductionExportGate({ card, reportsDir });
  assert.equal(legacy.productionExportAllowed, true);
  assert.equal(legacy.maturity.certificationTier, "conditionally_certified");
  assert.equal(legacy.maturity.releaseCertified, false);
  assert(legacy.maturity.missingEvidence.includes("humanPlaytest"));
  assert(legacy.maturity.missingEvidence.includes("deviceVerification"));

  const certified = evaluateProductionExportGate({
    card,
    reportsDir,
    humanPlaytest: passedEvidence(),
    deviceVerification: passedEvidence()
  });
  assert.equal(certified.productionExportAllowed, true);
  assert.equal(certified.maturity.certificationTier, "release_certified");
  assert.equal(certified.maturity.releaseCertified, true);

  const waiver = evaluateProductionExportGate({
    card,
    reportsDir,
    humanPlaytest: passedEvidence(),
    deviceVerification: passedEvidence(),
    waivers: ["device_lab_pending"]
  });
  assert.equal(waiver.productionExportAllowed, true);
  assert.equal(waiver.maturity.certificationTier, "conditionally_certified");
  assert.equal(waiver.maturity.releaseCertified, false);

  console.log("PASSED production export maturity integration checks");
}

main();
