#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashExecutablePayloadManifest } from "../lib/executable-payload.mjs";
import {
  buildDeviceVerificationEvidence,
  buildHumanPlaytestEvidence
} from "../lib/observed-release-evidence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const EXPORTS_ROOT = path.join(LORE_ROOT, "productize/exports");
const WORKSPACE_ID = "__certified_promotion_contract_check";
const CARD_ID = "survivor_horde";
const WORKSPACE = path.join(LORE_ROOT, "data/workspaces", WORKSPACE_ID);
const REPORTS = path.join(WORKSPACE, "reports");
const CANDIDATE_NAME = `standalone-${WORKSPACE_ID}-fixture`;
const CANDIDATE_STAGE = path.join(EXPORTS_ROOT, CANDIDATE_NAME);
const CANDIDATE_ZIP = `${CANDIDATE_STAGE}.zip`;
const PROMOTER = path.join(LORE_ROOT, "productize/promote-certified.mjs");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function walkFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, base));
    else if (entry.isFile()) {
      const buffer = fs.readFileSync(full);
      files.push({
        path: path.relative(base, full).split(path.sep).join("/"),
        bytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex")
      });
    }
  }
  return files;
}
function parse(stdout) {
  try { return JSON.parse(String(stdout || "").trim()); } catch { return null; }
}
function rel(file) {
  return path.relative(LORE_ROOT, file).split(path.sep).join("/");
}
function runPromoter(visualPath) {
  return spawnSync(process.execPath, [
    PROMOTER,
    `--workspace-id=${WORKSPACE_ID}`,
    `--release-decision=${rel(path.join(REPORTS, "release_decision_latest.json"))}`,
    `--browser-report=${rel(path.join(REPORTS, "standalone_browser_report.json"))}`,
    `--visual-report=${rel(visualPath)}`
  ], { cwd: LORE_ROOT, encoding: "utf8" });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function cleanupPromotion(output) {
  if (!output) return;
  if (output.stage && String(output.stage).startsWith(EXPORTS_ROOT)) {
    fs.rmSync(output.stage, { recursive: true, force: true });
  }
  if (output.artifact) {
    const artifact = path.resolve(LORE_ROOT, output.artifact);
    if (artifact.startsWith(EXPORTS_ROOT)) fs.rmSync(artifact, { force: true });
  }
}
function seedObservedEvidence(identity) {
  const human = buildHumanPlaytestEvidence({
    identity,
    input: {
      kind: "human_playtest",
      humanObserved: true,
      fixture: false,
      synthetic: false,
      sessions: [{
        sessionId: "fixture-human-1",
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
        deviceModel: "fixture-physical-device",
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
  writeJson(path.join(REPORTS, `human_playtest_${CARD_ID}_latest.json`), human);
  writeJson(path.join(REPORTS, `device_verification_${CARD_ID}_latest.json`), device);
  return { human, device };
}

function main() {
  fs.mkdirSync(EXPORTS_ROOT, { recursive: true });
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.rmSync(CANDIDATE_STAGE, { recursive: true, force: true });
  fs.rmSync(CANDIDATE_ZIP, { force: true });
  fs.mkdirSync(path.join(CANDIDATE_STAGE, "assets"), { recursive: true });
  fs.writeFileSync(path.join(CANDIDATE_STAGE, "index.html"), "<!doctype html><title>fixture</title>\n");
  fs.writeFileSync(path.join(CANDIDATE_STAGE, "runtime-spec.json"), "{\"fixture\":true}\n");
  fs.writeFileSync(path.join(CANDIDATE_STAGE, "assets/runtime.txt"), "runtime bytes\n");
  writeJson(path.join(CANDIDATE_STAGE, "RELEASE_STATUS.json"), {
    schemaVersion: "loreweaver.release-status.v1",
    mode: "candidate",
    artifactLabel: "UNVERIFIED_CANDIDATE",
    releaseEligible: false,
    certificationTier: "visual_verified",
    nonReleaseMarker: "UNVERIFIED_CANDIDATE"
  });
  writeJson(path.join(CANDIDATE_STAGE, "release-manifest.json"), {
    schemaVersion: "loreweaver.release-manifest.v3",
    releaseMode: "candidate",
    gates: { browser: "pending", evidencePolicy: "candidate_only", releaseEligible: false }
  });
  fs.writeFileSync(path.join(CANDIDATE_STAGE, "README.md"), "candidate fixture\n");

  const payloadIdentity = hashExecutablePayloadManifest(walkFiles(CANDIDATE_STAGE));
  const zip = spawnSync("zip", ["-q", "-r", CANDIDATE_ZIP, CANDIDATE_NAME], {
    cwd: EXPORTS_ROOT,
    encoding: "utf8"
  });
  assert(zip.status === 0, `fixture zip failed: ${zip.stderr || ""}`);
  const artifactSha256 = crypto.createHash("sha256").update(fs.readFileSync(CANDIDATE_ZIP)).digest("hex");
  const specHash = "sha256:certified-promotion-contract-fixture";
  const runtimeVersion = "2.0.0";
  const screenshotPath = path.join(REPORTS, "fixture.png");
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(screenshotPath, "fixture screenshot bytes\n");
  const screenshotSha256 = crypto.createHash("sha256").update(fs.readFileSync(screenshotPath)).digest("hex");
  const observedIdentity = {
    cardId: CARD_ID,
    specHash,
    runtimeVersion,
    recipeHash: null,
    contentHash: null,
    atlasHash: null,
    payloadHash: payloadIdentity.payloadHash,
    artifact: rel(CANDIDATE_ZIP),
    artifactSha256
  };

  writeJson(path.join(REPORTS, "release_decision_latest.json"), {
    schemaVersion: "loreweaver.workspace-release-decision.v2",
    mode: "certified",
    status: "release_certified",
    exportAllowed: true,
    releaseCertified: true,
    certificationTier: "release_certified",
    waivers: [],
    identity: observedIdentity,
    exactCandidateReady: true,
    cardDecisions: [{ cardId: CARD_ID }]
  });
  writeJson(path.join(REPORTS, "standalone_browser_report.json"), {
    schemaVersion: "loreweaver.standalone-browser-report.v2",
    status: "passed",
    releaseEligible: true,
    zeroApiRequests: true,
    specHash,
    runtimeVersion,
    payloadHash: payloadIdentity.payloadHash,
    artifact: rel(CANDIDATE_ZIP),
    artifactSha256,
    screenshot: rel(screenshotPath),
    screenshotSha256,
    errors: { console: [], page: [], requests: [] }
  });
  const seededObserved = seedObservedEvidence(observedIdentity);

  const visualPath = path.join(REPORTS, "visual_audit_latest.json");
  const missing = runPromoter(visualPath);
  assert(missing.status !== 0, "missing visual report must block promotion");
  assert(parse(missing.stdout)?.reason === "visual_report_missing_or_outside_repo", `unexpected missing reason: ${missing.stdout}`);

  const baseVisual = {
    schemaVersion: "loreweaver.visual-audit.v2",
    status: "passed",
    releaseEligible: true,
    evidenceKind: "real_vlm_exact_candidate",
    provider: "grok",
    criticStatus: "completed",
    identityMatches: true,
    specHash,
    runtimeVersion,
    payloadHash: payloadIdentity.payloadHash,
    artifact: rel(CANDIDATE_ZIP),
    artifactSha256,
    screenshot: rel(screenshotPath),
    screenshotSha256,
    checks: {
      vlm_hud_occlusion: "PASS",
      vlm_button_overlap: "WARNING",
      vlm_text_overflow: "PASS",
      vlm_touch_readability: "PASS"
    }
  };

  writeJson(visualPath, { ...baseVisual, provider: "fixture_provider" });
  const fakeProvider = runPromoter(visualPath);
  assert(fakeProvider.status !== 0, "non-real VLM provider must block promotion");

  writeJson(visualPath, { ...baseVisual, criticStatus: "failed" });
  const incomplete = runPromoter(visualPath);
  assert(incomplete.status !== 0, "non-completed VLM must block promotion");

  writeJson(visualPath, { ...baseVisual, payloadHash: "wrong-payload" });
  const mismatch = runPromoter(visualPath);
  assert(mismatch.status !== 0, "visual payload mismatch must block promotion");

  writeJson(visualPath, { ...baseVisual, screenshotSha256: "wrong-screenshot" });
  const screenshotMismatch = runPromoter(visualPath);
  assert(screenshotMismatch.status !== 0, "visual screenshot mismatch must block promotion");

  writeJson(visualPath, baseVisual);
  writeJson(path.join(REPORTS, `human_playtest_${CARD_ID}_latest.json`), {
    ...seededObserved.human,
    payloadHash: "wrong-human-payload"
  });
  const humanMismatch = runPromoter(visualPath);
  assert(humanMismatch.status !== 0, "human evidence from another Candidate must block promotion");
  assert(parse(humanMismatch.stdout)?.reason === "observed_release_evidence_not_eligible_or_candidate_mismatch");
  seedObservedEvidence(observedIdentity);

  const success = runPromoter(visualPath);
  const successPayload = parse(success.stdout);
  assert(success.status === 0, `matching evidence should promote: ${success.stdout}\n${success.stderr}`);
  assert(successPayload?.status === "release_certified", `unexpected success payload: ${success.stdout}`);
  assert(successPayload?.payloadHash === payloadIdentity.payloadHash, "promoted payload hash must stay identical");
  assert(successPayload?.screenshotSha256 === screenshotSha256, "promoted screenshot identity must stay bound");
  assert(successPayload?.observedEvidence?.length === 2, "promotion must retain human and device evidence paths");
  const promotedStageIdentity = hashExecutablePayloadManifest(walkFiles(successPayload.stage));
  assert(promotedStageIdentity.payloadHash === payloadIdentity.payloadHash, "certification metadata changed executable payload");

  cleanupPromotion(successPayload);
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.rmSync(CANDIDATE_STAGE, { recursive: true, force: true });
  fs.rmSync(CANDIDATE_ZIP, { force: true });

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.certified-promotion-contract-check.v3",
    status: "passed",
    checks: [
      "missing_exact_vlm_blocks",
      "non_real_vlm_provider_blocks",
      "non_completed_vlm_blocks",
      "vlm_payload_mismatch_blocks",
      "vlm_screenshot_mismatch_blocks",
      "human_candidate_mismatch_blocks",
      "matching_browser_vlm_human_device_promotes",
      "certification_metadata_preserves_payload_hash"
    ],
    payloadHash: payloadIdentity.payloadHash,
    screenshotSha256
  }, null, 2));
}

try {
  main();
} catch (error) {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.rmSync(CANDIDATE_STAGE, { recursive: true, force: true });
  fs.rmSync(CANDIDATE_ZIP, { force: true });
  console.error(error);
  process.exit(1);
}
