#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { hashExecutablePayloadManifest } from "./lib/executable-payload.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const EXPORTS_ROOT = path.join(LORE_ROOT, "productize/exports");
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
function writeJson(file, value) {
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

const workspaceId = valueArg("--workspace-id");
const decisionArg = valueArg("--release-decision");
const browserArg = valueArg("--browser-report");
if (!workspaceId || !decisionArg || !browserArg) {
  fail("missing_required_arguments", {
    usage: "node productize/promote-certified.mjs --workspace-id=<id> --release-decision=<path> --browser-report=<path>"
  });
}

const decisionPath = safeRepoPath(decisionArg, path.join(LORE_ROOT, "data/workspaces"));
const browserPath = safeRepoPath(browserArg, LORE_ROOT);
if (!decisionPath || !fs.existsSync(decisionPath)) fail("release_decision_missing_or_outside_workspace_root");
if (!browserPath || !fs.existsSync(browserPath)) fail("browser_report_missing_or_outside_repo");

const decision = readJson(decisionPath, "release decision");
const browser = readJson(browserPath, "browser report");
if (
  decision.schemaVersion !== "loreweaver.workspace-release-decision.v1" ||
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
  browser.specHash !== decision.identity?.specHash ||
  (decision.identity?.runtimeVersion && browser.runtimeVersion !== decision.identity.runtimeVersion)
) {
  fail("browser_evidence_not_eligible_or_identity_mismatch");
}
const errors = browser.errors || {};
if (!["console", "page", "requests"].every((key) => Array.isArray(errors[key]) && errors[key].length === 0)) {
  fail("browser_evidence_contains_errors");
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
writeJson(statusPath, {
  ...releaseStatus,
  createdAt: new Date().toISOString(),
  mode: "certified",
  artifactLabel: "CERTIFIED_RELEASE",
  releaseEligible: true,
  certificationTier: "release_certified",
  nonReleaseMarker: null,
  browserVerified: true,
  payloadHash: browser.payloadHash,
  releaseDecision: decision,
  browserEvidence: path.relative(LORE_ROOT, browserPath).split(path.sep).join("/")
});
writeJson(manifestPath, {
  ...releaseManifest,
  createdAt: new Date().toISOString(),
  releaseMode: "certified",
  artifactLabel: "CERTIFIED_RELEASE",
  certificationTier: "release_certified",
  nonReleaseMarker: null,
  payloadHash: browser.payloadHash,
  gates: {
    ...(releaseManifest.gates || {}),
    browser: "passed",
    evidencePolicy: "passed",
    releaseEligible: true
  }
});
fs.writeFileSync(readmePath, `# LoreWeaver Certified Standalone\n\nThis artifact contains the exact executable payload validated by the referenced browser evidence. Certification metadata is excluded from the executable payload hash.\n\n- Artifact label: CERTIFIED_RELEASE\n- Release eligible: true\n- Certification tier: release_certified\n- Runtime: ${browser.runtimeVersion}\n- Spec: ${browser.specHash}\n- Executable payload: ${browser.payloadHash}\n\nSee RELEASE_STATUS.json and release-manifest.json for machine-readable evidence identity.\n`);

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

console.log(JSON.stringify({
  status: "release_certified",
  artifactLabel: "CERTIFIED_RELEASE",
  releaseEligible: true,
  certificationTier: "release_certified",
  workspaceId,
  specHash: browser.specHash,
  runtimeVersion: browser.runtimeVersion,
  payloadHash: browser.payloadHash,
  sourceCandidate: path.relative(LORE_ROOT, candidateZip).split(path.sep).join("/"),
  browserReport: path.relative(LORE_ROOT, browserPath).split(path.sep).join("/"),
  artifact: path.relative(LORE_ROOT, certifiedZip).split(path.sep).join("/"),
  stage: certifiedStage,
  sha256: certifiedSha
}, null, 2));
