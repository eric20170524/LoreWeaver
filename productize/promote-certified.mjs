#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { hashExecutablePayloadManifest } from "./lib/executable-payload.mjs";
import { isTrustedObservedReleaseEvidence } from "./lib/observed-release-evidence.mjs";
import { runReleaseTaskSync } from "./lib/release-task-sync.mjs";
import {
  exactCandidateIdentityMismatches,
  isExactCandidateEvidence
} from "./lib/exact-candidate-evidence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const EXPORTS_ROOT = path.join(LORE_ROOT, "productize/exports");
const WORKSPACES_ROOT = path.join(LORE_ROOT, "data/workspaces");
const REAL_VLM_PROVIDERS = new Set(["grok", "codex"]);
const DECISION_SCHEMAS = new Set([
  "loreweaver.workspace-release-decision.v1",
  "loreweaver.workspace-release-decision.v2"
]);
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: "blocked", reason, ...extra }, null, 2));
  process.exit(2);
}
function readJson(file, label = file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${error instanceof Error ? error.message : error}`);
  }
}
function readJsonSafe(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function repoRelative(file) {
  return path.relative(LORE_ROOT, file).split(path.sep).join("/");
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
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function safeRepoPath(rel, allowedRoot) {
  if (!rel) return null;
  const absolute = path.resolve(LORE_ROOT, rel);
  const root = `${path.resolve(allowedRoot)}${path.sep}`;
  if (!`${absolute}${path.sep}`.startsWith(root)) return null;
  return absolute;
}
function copyTree(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
}
function evidenceCandidates(kind, cardId) {
  if (kind === "human") {
    return [
      `human_playtest_${cardId}_latest.json`,
      `human_playtest_${cardId}.json`,
      "human_playtest_latest.json"
    ];
  }
  return [
    `device_verification_${cardId}_latest.json`,
    `device_verification_${cardId}.json`,
    "device_verification_latest.json"
  ];
}
function findObservedEvidence(reportsDir, kind, cardId) {
  for (const file of evidenceCandidates(kind, cardId)) {
    const full = path.join(reportsDir, file);
    const report = readJsonSafe(full);
    if (!report) continue;
    if (report.cardId && String(report.cardId) !== String(cardId)) continue;
    return { file: full, report };
  }
  return null;
}

const workspaceId = valueArg("--workspace-id");
const decisionArg = valueArg("--release-decision");
const browserArg = valueArg("--browser-report");
const visualArg = valueArg("--visual-report");
if (!workspaceId || !decisionArg || !browserArg || !visualArg) {
  fail("missing_required_arguments", {
    usage: "node productize/promote-certified.mjs --workspace-id=<id> --release-decision=<path> --browser-report=<path> --visual-report=<path>"
  });
}

const decisionPath = safeRepoPath(decisionArg, WORKSPACES_ROOT);
const browserPath = safeRepoPath(browserArg, LORE_ROOT);
const visualPath = safeRepoPath(visualArg, LORE_ROOT);
if (!decisionPath || !fs.existsSync(decisionPath)) fail("release_decision_missing_or_outside_workspace_root");
if (!browserPath || !fs.existsSync(browserPath)) fail("browser_report_missing_or_outside_repo");
if (!visualPath || !fs.existsSync(visualPath)) fail("visual_report_missing_or_outside_repo");

const decision = readJson(decisionPath, "release decision");
const browser = readJson(browserPath, "browser report");
const visual = readJson(visualPath, "visual report");
if (
  !DECISION_SCHEMAS.has(decision.schemaVersion) ||
  decision.mode !== "certified" ||
  decision.exportAllowed !== true ||
  decision.releaseCertified !== true ||
  decision.certificationTier !== "release_certified" ||
  (Array.isArray(decision.waivers) && decision.waivers.length > 0)
) {
  fail("release_decision_not_certified_or_has_waivers");
}
if (
  browser.status !== "passed" ||
  browser.releaseEligible !== true ||
  browser.zeroApiRequests !== true ||
  !browser.payloadHash ||
  !browser.artifact ||
  !browser.artifactSha256 ||
  !browser.screenshot ||
  !browser.screenshotSha256 ||
  browser.specHash !== decision.identity?.specHash ||
  (decision.identity?.runtimeVersion && browser.runtimeVersion !== decision.identity.runtimeVersion)
) {
  fail("browser_evidence_not_eligible_or_identity_mismatch");
}
const errors = browser.errors || {};
if (!["console", "page", "requests"].every((key) => Array.isArray(errors[key]) && errors[key].length === 0)) {
  fail("browser_evidence_contains_errors");
}

const visualChecks = Object.values(visual.checks || {}).map((value) => String(value).toUpperCase());
if (
  visual.status !== "passed" ||
  visual.releaseEligible !== true ||
  visual.evidenceKind !== "real_vlm_exact_candidate" ||
  !REAL_VLM_PROVIDERS.has(String(visual.provider || "")) ||
  visual.criticStatus !== "completed" ||
  visual.identityMatches === false ||
  visual.specHash !== browser.specHash ||
  visual.runtimeVersion !== browser.runtimeVersion ||
  visual.payloadHash !== browser.payloadHash ||
  visual.artifact !== browser.artifact ||
  visual.artifactSha256 !== browser.artifactSha256 ||
  visual.screenshot !== browser.screenshot ||
  visual.screenshotSha256 !== browser.screenshotSha256 ||
  visualChecks.length === 0 ||
  !visualChecks.every((value) => value === "PASS" || value === "WARNING")
) {
  fail("real_vlm_evidence_not_eligible_or_payload_or_screenshot_identity_mismatch");
}

// Defense in depth: a hand-edited release decision cannot stand in for actual
// observed human/device evidence. Re-read both evidence files from the workspace
// and bind them to the same executable Candidate verified above.
const workspaceReportsDir = path.join(WORKSPACES_ROOT, workspaceId, "reports");
const cardIds = [...new Set((decision.cardDecisions || []).map((item) => String(item?.cardId || "").trim()).filter(Boolean))];
if (!cardIds.length) fail("release_decision_missing_card_evidence_scope");
const observedEvidence = [];
for (const cardId of cardIds) {
  const expectedIdentity = {
    cardId,
    specHash: browser.specHash,
    runtimeVersion: browser.runtimeVersion,
    recipeHash: decision.identity?.recipeHash ?? null,
    contentHash: decision.identity?.contentHash ?? null,
    atlasHash: decision.identity?.atlasHash ?? null,
    payloadHash: browser.payloadHash,
    artifact: browser.artifact,
    artifactSha256: browser.artifactSha256
  };
  for (const kind of ["human", "device"]) {
    const found = findObservedEvidence(workspaceReportsDir, kind, cardId);
    if (!found) {
      fail("observed_release_evidence_missing", { cardId, kind });
    }
    const trusted = isTrustedObservedReleaseEvidence(found.report, kind);
    const exact = isExactCandidateEvidence(found.report, expectedIdentity);
    if (!trusted || !exact) {
      fail("observed_release_evidence_not_eligible_or_candidate_mismatch", {
        cardId,
        kind,
        trusted,
        identityMismatches: exactCandidateIdentityMismatches(found.report, expectedIdentity)
      });
    }
    observedEvidence.push({
      cardId,
      kind,
      file: repoRelative(found.file)
    });
  }
}

const candidateZip = safeRepoPath(browser.artifact, EXPORTS_ROOT);
if (!candidateZip || !fs.existsSync(candidateZip)) fail("candidate_artifact_missing_or_outside_exports");
const candidateBytes = fs.readFileSync(candidateZip);
const candidateSha = crypto.createHash("sha256").update(candidateBytes).digest("hex");
if (candidateSha !== browser.artifactSha256) {
  fail("candidate_artifact_sha_mismatch", { report: browser.artifactSha256, actual: candidateSha });
}

const candidateStage = candidateZip.replace(/\.zip$/i, "");
if (!fs.existsSync(candidateStage) || !fs.statSync(candidateStage).isDirectory()) {
  fail("candidate_stage_missing_for_payload_verification");
}
const beforeIdentity = hashExecutablePayloadManifest(walkFiles(candidateStage));
if (beforeIdentity.payloadHash !== browser.payloadHash) {
  fail("candidate_payload_hash_mismatch", { report: browser.payloadHash, actual: beforeIdentity.payloadHash });
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const certifiedName = `certified-${workspaceId}-${stamp}`;
const certifiedStage = path.join(EXPORTS_ROOT, certifiedName);
copyTree(candidateStage, certifiedStage);

const statusPath = path.join(certifiedStage, "RELEASE_STATUS.json");
const manifestPath = path.join(certifiedStage, "release-manifest.json");
const readmePath = path.join(certifiedStage, "README.md");
if (!fs.existsSync(statusPath) || !fs.existsSync(manifestPath)) {
  fail("candidate_missing_release_metadata");
}
const releaseStatus = readJson(statusPath);
const releaseManifest = readJson(manifestPath);
const browserRel = repoRelative(browserPath);
const visualRel = repoRelative(visualPath);
const decisionRel = repoRelative(decisionPath);
writeJson(statusPath, {
  ...releaseStatus,
  createdAt: new Date().toISOString(),
  mode: "certified",
  artifactLabel: "CERTIFIED_RELEASE",
  releaseEligible: true,
  certificationTier: "release_certified",
  nonReleaseMarker: null,
  browserVerified: true,
  visualVerified: true,
  humanDeviceVerified: true,
  payloadHash: browser.payloadHash,
  screenshotSha256: browser.screenshotSha256,
  releaseDecision: decision,
  browserEvidence: browserRel,
  visualEvidence: visualRel,
  observedEvidence
});
writeJson(manifestPath, {
  ...releaseManifest,
  createdAt: new Date().toISOString(),
  releaseMode: "certified",
  artifactLabel: "CERTIFIED_RELEASE",
  certificationTier: "release_certified",
  nonReleaseMarker: null,
  payloadHash: browser.payloadHash,
  screenshotSha256: browser.screenshotSha256,
  gates: {
    ...(releaseManifest.gates || {}),
    browser: "passed",
    visual: "passed",
    human: "passed",
    device: "passed",
    evidencePolicy: "passed",
    releaseEligible: true
  },
  observedEvidence
});
fs.writeFileSync(readmePath, `# LoreWeaver Certified Standalone\n\nThis artifact contains the exact executable payload validated by browser, real-VLM, human playtest and physical-device evidence. Certification metadata is excluded from the executable payload hash.\n\n- Artifact label: CERTIFIED_RELEASE\n- Release eligible: true\n- Certification tier: release_certified\n- Runtime: ${browser.runtimeVersion}\n- Spec: ${browser.specHash}\n- Executable payload: ${browser.payloadHash}\n- Screenshot SHA-256: ${browser.screenshotSha256}\n- Browser evidence: ${browserRel}\n- Visual evidence: ${visualRel}\n- Observed evidence count: ${observedEvidence.length}\n\nSee RELEASE_STATUS.json and release-manifest.json for machine-readable evidence identity.\n`);

const afterIdentity = hashExecutablePayloadManifest(walkFiles(certifiedStage));
if (afterIdentity.payloadHash !== browser.payloadHash || afterIdentity.payloadHash !== beforeIdentity.payloadHash) {
  fs.rmSync(certifiedStage, { recursive: true, force: true });
  fail("certification_metadata_changed_executable_payload", {
    browser: browser.payloadHash,
    before: beforeIdentity.payloadHash,
    after: afterIdentity.payloadHash
  });
}

const certifiedZip = path.join(EXPORTS_ROOT, `${certifiedName}.zip`);
fs.rmSync(certifiedZip, { force: true });
const zip = spawnSync("zip", ["-q", "-r", certifiedZip, certifiedName], {
  cwd: EXPORTS_ROOT,
  encoding: "utf8"
});
if (zip.status !== 0) fail("certified_archive_failed", { stderr: zip.stderr || "" });
const certifiedBytes = fs.readFileSync(certifiedZip);
const certifiedSha = crypto.createHash("sha256").update(certifiedBytes).digest("hex");
const certifiedArtifactRel = repoRelative(certifiedZip);
const certifiedStageRel = repoRelative(certifiedStage);
const sourceCandidateRel = repoRelative(candidateZip);

// Only after the Certified archive exists and the executable payload has already
// been proven unchanged do we publish the promotion event consumed by the final
// Task Orchestrator role. This report cannot make an otherwise invalid release
// certified; it merely records a promotion that already passed every hard gate.
const promotionReportPath = path.join(workspaceReportsDir, "certified_promotion_latest.json");
const promotionReport = {
  schemaVersion: "loreweaver.certified-promotion-report.v1",
  status: "release_certified",
  createdAt: new Date().toISOString(),
  workspaceId,
  releaseEligible: true,
  certificationTier: "release_certified",
  metadataOnlyPromotion: true,
  payloadPreserved: true,
  payloadHash: browser.payloadHash,
  specHash: browser.specHash,
  runtimeVersion: browser.runtimeVersion,
  screenshotSha256: browser.screenshotSha256,
  sourceCandidate: sourceCandidateRel,
  browserReport: browserRel,
  visualReport: visualRel,
  observedEvidence,
  releaseDecision: decisionRel,
  artifact: certifiedArtifactRel,
  artifactSha256: certifiedSha,
  stage: certifiedStageRel,
  fixture: false,
  synthetic: false,
  stale: false
};
writeJson(promotionReportPath, promotionReport);

const taskSync = runReleaseTaskSync({
  workspaceId,
  role: "orchestrator"
});

console.log(JSON.stringify({
  status: "release_certified",
  artifactLabel: "CERTIFIED_RELEASE",
  releaseEligible: true,
  certificationTier: "release_certified",
  workspaceId,
  specHash: browser.specHash,
  runtimeVersion: browser.runtimeVersion,
  payloadHash: browser.payloadHash,
  screenshotSha256: browser.screenshotSha256,
  sourceCandidate: sourceCandidateRel,
  browserReport: browserRel,
  visualReport: visualRel,
  observedEvidence,
  artifact: certifiedArtifactRel,
  stage: certifiedStage,
  sha256: certifiedSha,
  promotionReport: repoRelative(promotionReportPath),
  taskSync
}, null, 2));
