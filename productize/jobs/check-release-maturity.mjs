#!/usr/bin/env node

import { strict as assert } from "node:assert";
import {
  evaluateReleaseMaturity,
  isReleaseCertified
} from "../lib/release-maturity.mjs";

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

function passingEvidence(extra = {}) {
  return {
    status: "passed",
    freshness: "fresh",
    identityMatches: true,
    ...extra
  };
}

function main() {
  const card = {
    id: "survivor_horde",
    status: "production_ready",
    runtime: { adapter: "SurvivorHordeAdapter" }
  };

  const noEvidence = evaluateReleaseMaturity({ card, productionGate: null });
  assert.equal(noEvidence.certificationTier, "runtime_supported");
  assert.equal(noEvidence.releaseCertified, false);
  assert(noEvidence.missingEvidence.includes("humanPlaytest"));
  assert(noEvidence.missingEvidence.includes("deviceVerification"));

  const legacyAutomaticOnly = evaluateReleaseMaturity({
    card,
    productionGate: passingGate()
  });
  assert.equal(legacyAutomaticOnly.certificationTier, "conditionally_certified");
  assert.equal(legacyAutomaticOnly.legacyProductionReady, true);
  assert.equal(legacyAutomaticOnly.legacyProductionExportAllowed, true);
  assert.equal(legacyAutomaticOnly.releaseCertified, false);

  const withHumanOnly = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: passingEvidence()
  });
  assert.equal(withHumanOnly.certificationTier, "conditionally_certified");
  assert.equal(withHumanOnly.evidence.humanPlaytested, true);
  assert.equal(withHumanOnly.evidence.deviceVerified, false);

  const fullyCertified = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: passingEvidence(),
    deviceVerification: passingEvidence()
  });
  assert.equal(fullyCertified.certificationTier, "release_certified");
  assert.equal(fullyCertified.releaseCertified, true);
  assert.equal(isReleaseCertified(fullyCertified), true);

  const staleHuman = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: passingEvidence({ stale: true }),
    deviceVerification: passingEvidence()
  });
  assert.equal(staleHuman.releaseCertified, false);
  assert(staleHuman.blockers.includes("human_playtest_missing_or_invalid"));

  const identityMismatchDevice = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: passingEvidence(),
    deviceVerification: passingEvidence({ identityMatches: false })
  });
  assert.equal(identityMismatchDevice.releaseCertified, false);
  assert(identityMismatchDevice.blockers.includes("device_verification_missing_or_invalid"));

  const waiverBlocksCertification = evaluateReleaseMaturity({
    card,
    productionGate: passingGate(),
    humanPlaytest: passingEvidence(),
    deviceVerification: passingEvidence(),
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
    humanPlaytest: passingEvidence(),
    deviceVerification: passingEvidence()
  });
  assert.equal(autoFailure.releaseCertified, false);
  assert.equal(autoFailure.certificationTier, "browser_verified");
  assert(autoFailure.missingEvidence.includes("visualAudit"));

  console.log("PASSED release maturity policy checks");
}

main();
