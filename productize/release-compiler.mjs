#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileRuntimeSpec } from "../src/runtime/compileRuntimeSpec.ts";
import { assembleWorkspaceSpec } from "./lib/workspace-spec.mjs";
import { evaluateWorkspaceReleasePolicy, RELEASE_MODES } from "./lib/release-policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const WORKSPACES_ROOT = path.join(LORE_ROOT, "data/workspaces");
const SHARED_REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const valuesArg = (name) => args
  .filter((arg) => arg.startsWith(`${name}=`))
  .map((arg) => arg.slice(name.length + 1))
  .filter(Boolean);

function outputAndExit(payload, exitCode = 0) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(exitCode);
}

function relativeRepoPath(absolutePath) {
  return path.relative(LORE_ROOT, absolutePath).split(path.sep).join("/");
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch {
    return null;
  }
}

function resolveMatchingPackageBrowserReport(explicitArg, workspaceReportsDir, resolvedSpec) {
  const candidates = [];
  if (explicitArg) candidates.push(path.resolve(LORE_ROOT, explicitArg));
  candidates.push(
    path.join(workspaceReportsDir, "standalone_browser_report.json"),
    path.join(SHARED_REPORTS, "standalone_browser_report.json")
  );
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const errors = report.errors || {};
      const noErrors = ["console", "page", "requests"].every(
        (key) => Array.isArray(errors[key]) && errors[key].length === 0
      );
      if (
        report.status === "passed" &&
        report.releaseEligible === true &&
        report.specHash === resolvedSpec.specHash &&
        report.runtimeVersion === resolvedSpec.runtimeVersion &&
        report.zeroApiRequests === true &&
        typeof report.payloadHash === "string" && report.payloadHash.length > 0 &&
        typeof report.artifact === "string" && report.artifact.length > 0 &&
        typeof report.artifactSha256 === "string" && report.artifactSha256.length > 0 &&
        noErrors
      ) {
        return candidate;
      }
    } catch {
      // Continue to next candidate.
    }
  }
  return null;
}

const workspaceArg = valueArg("--workspace");
const mode = valueArg("--mode") || "candidate";
const browserReportArg = valueArg("--browser-report");
const waivers = valuesArg("--waiver");
const dryRun = args.includes("--dry-run");

if (!workspaceArg) {
  outputAndExit({
    status: "failed",
    reason: "missing_workspace",
    usage: "tsx productize/release-compiler.mjs --workspace=data/workspaces/<id> --mode=candidate|certified"
  }, 2);
}
if (!RELEASE_MODES.includes(mode)) {
  outputAndExit({ status: "failed", reason: `invalid_release_mode:${mode}` }, 2);
}

const wsPath = path.resolve(LORE_ROOT, workspaceArg);
const normalizedRoot = `${path.resolve(WORKSPACES_ROOT)}${path.sep}`;
if (!`${wsPath}${path.sep}`.startsWith(normalizedRoot) || !fs.existsSync(wsPath)) {
  outputAndExit({ status: "failed", reason: "workspace_outside_allowed_root_or_missing" }, 2);
}

let gameSpec;
let resolvedSpec;
try {
  gameSpec = assembleWorkspaceSpec(wsPath);
  resolvedSpec = compileRuntimeSpec(gameSpec);
} catch (error) {
  outputAndExit({
    status: "failed",
    reason: "runtime_spec_compilation_failed",
    error: error instanceof Error ? error.message : String(error)
  }, 2);
}

const workspaceReportsDir = path.join(wsPath, "reports");
fs.mkdirSync(workspaceReportsDir, { recursive: true });
const decision = evaluateWorkspaceReleasePolicy({
  gameSpec: resolvedSpec.gameSpec,
  resolvedSpec,
  reportsDir: SHARED_REPORTS,
  workspaceReportsDir,
  mode,
  waivers
});
const packageBrowserReport = resolveMatchingPackageBrowserReport(
  browserReportArg,
  workspaceReportsDir,
  resolvedSpec
);

const finalBlockers = [...decision.blockers];
if (mode === "certified" && !packageBrowserReport) {
  finalBlockers.push("standalone_package_browser_report_missing_payload_identity_or_mismatch");
}
const finalAllowed = decision.exportAllowed && (mode === "candidate" || Boolean(packageBrowserReport));
const finalDecision = {
  ...decision,
  exportAllowed: finalAllowed,
  status: finalAllowed ? decision.status : "blocked",
  blockers: [...new Set(finalBlockers)],
  packageBrowserReport: packageBrowserReport ? relativeRepoPath(packageBrowserReport) : null,
  artifactLabel: mode === "certified" ? "CERTIFIED_RELEASE" : "UNVERIFIED_CANDIDATE"
};

const decisionPath = path.join(workspaceReportsDir, "release_decision_latest.json");
fs.writeFileSync(decisionPath, `${JSON.stringify(finalDecision, null, 2)}\n`);

if (dryRun) {
  outputAndExit({
    status: finalDecision.status,
    mode,
    dryRun: true,
    releaseDecision: relativeRepoPath(decisionPath),
    decision: finalDecision
  }, finalAllowed || mode === "candidate" ? 0 : 2);
}

if (!finalAllowed) {
  outputAndExit({
    status: "blocked",
    mode,
    releaseDecision: relativeRepoPath(decisionPath),
    blockers: finalDecision.blockers,
    missingEvidence: finalDecision.missingEvidence,
    certificationTier: finalDecision.certificationTier
  }, 2);
}

if (mode === "certified") {
  const promoter = path.join(LORE_ROOT, "productize/promote-certified.mjs");
  const promote = spawnSync(process.execPath, [
    promoter,
    `--workspace-id=${path.basename(wsPath)}`,
    `--release-decision=${relativeRepoPath(decisionPath)}`,
    `--browser-report=${relativeRepoPath(packageBrowserReport)}`
  ], {
    cwd: LORE_ROOT,
    encoding: "utf8",
    env: process.env
  });
  const promoted = parseJsonOutput(promote.stdout);
  if (promote.status !== 0 || !promoted || promoted.status !== "release_certified") {
    outputAndExit({
      status: "blocked",
      mode,
      reason: promoted?.reason || "candidate_promotion_failed",
      releaseDecision: relativeRepoPath(decisionPath),
      promotion: promoted,
      stdout: (promote.stdout || "").slice(-4000),
      stderr: (promote.stderr || "").slice(-4000)
    }, promote.status || 2);
  }
  outputAndExit({
    status: "release_certified",
    mode,
    releaseDecision: relativeRepoPath(decisionPath),
    certificationTier: "release_certified",
    nonReleaseMarker: null,
    artifact: promoted.artifact,
    stage: promoted.stage,
    sha256: promoted.sha256,
    payloadHash: promoted.payloadHash,
    sourceCandidate: promoted.sourceCandidate,
    browserReport: promoted.browserReport
  });
}

const exporter = path.join(LORE_ROOT, "productize/export-standalone.mjs");
const exporterArgs = [
  exporter,
  `--workspace=${workspaceArg}`,
  "--release-mode=candidate",
  `--release-decision=${relativeRepoPath(decisionPath)}`,
  "--allow-unverified-browser"
];
const tsxBin = path.join(LORE_ROOT, "node_modules/.bin/tsx");
const build = spawnSync(tsxBin, exporterArgs, {
  cwd: LORE_ROOT,
  encoding: "utf8",
  env: process.env
});
if (build.status !== 0) {
  outputAndExit({
    status: "failed",
    mode,
    reason: "standalone_export_failed",
    releaseDecision: relativeRepoPath(decisionPath),
    stdout: (build.stdout || "").slice(-4000),
    stderr: (build.stderr || "").slice(-4000)
  }, build.status || 1);
}

outputAndExit({
  status: "candidate_built",
  mode,
  releaseDecision: relativeRepoPath(decisionPath),
  certificationTier: finalDecision.certificationTier,
  nonReleaseMarker: finalDecision.nonReleaseMarker,
  exporterOutput: (build.stdout || "").trim()
});