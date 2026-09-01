#!/usr/bin/env node
/**
 * Shared-kernel standalone exporter.
 *
 * Authoritative workspace artifacts -> compileRuntimeSpec -> shared runtime bundle
 * -> production assets -> integrity manifest -> archive.
 *
 * Product semantics:
 * - candidate: may be built with incomplete release evidence, but is explicitly
 *   marked UNVERIFIED_CANDIDATE and is never releaseEligible.
 * - certified: legacy compatibility path only; requires a matching evidence-derived
 *   Release Decision AND a matching real-browser package report. New Certified
 *   releases are promoted from an already verified Candidate by release-compiler.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileRuntimeSpec } from "../src/runtime/compileRuntimeSpec.ts";
import { assembleWorkspaceSpec } from "./lib/workspace-spec.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const WORKSPACES_ROOT = path.join(LORE_ROOT, "data/workspaces");
const DECISION_SCHEMAS = new Set([
  "loreweaver.workspace-release-decision.v1",
  "loreweaver.workspace-release-decision.v2"
]);
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const allowUnverifiedBrowser = args.includes("--allow-unverified-browser");
const wsRel = valueArg("--workspace");
const releaseMode = valueArg("--release-mode") || "candidate";
const releaseDecisionArg = valueArg("--release-decision");
if (!wsRel) {
  fail("Error: Missing --workspace parameter. Usage: tsx productize/export-standalone.mjs --workspace=<path_to_workspace>");
}
if (!["candidate", "certified"].includes(releaseMode)) {
  fail(`Error: invalid --release-mode=${releaseMode}; expected candidate or certified`);
}
const browserReportArg = valueArg("--browser-report");
const wsPath = path.resolve(LORE_ROOT, wsRel);
if (!fs.existsSync(wsPath)) {
  fail(`Error: Specified workspace directory does not exist: ${wsPath}`);
}
const outDir = path.join(LORE_ROOT, "productize/exports");
fs.mkdirSync(outDir, { recursive: true });

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

function copyTree(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (!filter(from, entry)) continue;
    if (entry.isDirectory()) copyTree(from, to, filter);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
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

function validateBrowserReport(reportPath, resolvedSpec) {
  if (!reportPath) return { valid: false, reason: "browser report not supplied", report: null };
  const absolute = path.resolve(LORE_ROOT, reportPath);
  if (!fs.existsSync(absolute)) return { valid: false, reason: `browser report missing: ${absolute}`, report: null };
  const report = readJson(absolute, "standalone browser report");
  const errors = report.errors || {};
  const noErrors = ["console", "page", "requests"].every((key) => Array.isArray(errors[key]) && errors[key].length === 0);
  const valid = report.status === "passed"
    && report.specHash === resolvedSpec.specHash
    && report.runtimeVersion === resolvedSpec.runtimeVersion
    && report.zeroApiRequests === true
    && noErrors;
  return {
    valid,
    reason: valid ? null : "report must match spec/runtime, pass scenarios, contain explicit empty error captures, and prove zero /api requests",
    report
  };
}

function validateReleaseDecision(decisionPath, resolvedSpec) {
  if (!decisionPath) return { valid: false, reason: "release decision not supplied", decision: null };
  const absolute = path.resolve(LORE_ROOT, decisionPath);
  if (!fs.existsSync(absolute)) return { valid: false, reason: `release decision missing: ${absolute}`, decision: null };
  const decision = readJson(absolute, "release decision");
  const valid = DECISION_SCHEMAS.has(decision.schemaVersion)
    && decision.mode === "certified"
    && decision.exportAllowed === true
    && decision.releaseCertified === true
    && decision.certificationTier === "release_certified"
    && decision.identity?.specHash === resolvedSpec.specHash
    && (!decision.identity?.runtimeVersion || decision.identity.runtimeVersion === resolvedSpec.runtimeVersion)
    && (!Array.isArray(decision.waivers) || decision.waivers.length === 0);
  return {
    valid,
    reason: valid ? null : "decision must be certified, waiver-free, and match current spec/runtime identity",
    decision,
    path: absolute
  };
}

const normalizedWsRoot = `${path.resolve(WORKSPACES_ROOT)}${path.sep}`;
if (!`${wsPath}${path.sep}`.startsWith(normalizedWsRoot)) {
  fail(`Workspace must be below ${WORKSPACES_ROOT}`);
}
if (!fs.existsSync(wsPath)) fail(`Workspace missing: ${wsPath}`);

let resolvedSpec;
try {
  resolvedSpec = compileRuntimeSpec(assembleWorkspaceSpec(wsPath));
} catch (error) {
  fail(`Runtime spec compilation failed: ${error instanceof Error ? error.message : error}`);
}

const releaseDecisionGate = validateReleaseDecision(releaseDecisionArg, resolvedSpec);
if (releaseMode === "certified" && !releaseDecisionGate.valid) {
  fail(`Certified export blocked: ${releaseDecisionGate.reason}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lw-shared-export-"));
const runtimeSpecPath = path.join(tempRoot, "resolved-runtime-spec.json");
const buildOut = path.join(tempRoot, "dist");
fs.writeFileSync(runtimeSpecPath, `${JSON.stringify(resolvedSpec, null, 2)}\n`);

const viteBin = path.join(LORE_ROOT, "node_modules/.bin/vite");
const build = spawnSync(viteBin, ["build", "--config", "vite.config.standalone.ts"], {
  cwd: LORE_ROOT,
  encoding: "utf8",
  env: {
    ...process.env,
    LOREWEAVER_RUNTIME_SPEC_PATH: runtimeSpecPath,
    LOREWEAVER_STANDALONE_OUT_DIR: buildOut
  }
});
if (build.status !== 0) {
  console.error(build.stdout);
  console.error(build.stderr);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fail("Shared standalone Vite build failed");
}
if (!fs.existsSync(path.join(buildOut, "index.html"))) fail("Shared standalone build produced no index.html");

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const stageName = `standalone-${path.basename(wsPath)}-${stamp}`;
const stage = path.join(outDir, stageName);
fs.rmSync(stage, { recursive: true, force: true });
copyTree(buildOut, stage);

const assetsSrc = path.join(wsPath, "assets");
if (fs.existsSync(assetsSrc)) {
  copyTree(assetsSrc, path.join(stage, "assets"), (from, entry) => {
    if (entry.isDirectory() && ["source", ".git", "reports", "cache"].includes(entry.name)) return false;
    if (/(^|\/)(\.env|secrets?|provider-config)(\/|$)/i.test(from)) return false;
    return true;
  });
}

const nodesDir = path.join(stage, "nodes");
fs.mkdirSync(nodesDir, { recursive: true });
for (const node of resolvedSpec.gameSpec.nodes || []) {
  fs.writeFileSync(path.join(nodesDir, `${node.id}.json`), `${JSON.stringify(node, null, 2)}\n`);
}

fs.writeFileSync(path.join(stage, "runtime-spec.json"), `${JSON.stringify(resolvedSpec, null, 2)}\n`);

const browserGate = validateBrowserReport(browserReportArg, resolvedSpec);
const releaseEligible = releaseMode === "certified" && releaseDecisionGate.valid && browserGate.valid;
const releaseStatus = {
  schemaVersion: "loreweaver.release-status.v1",
  createdAt: new Date().toISOString(),
  mode: releaseMode,
  artifactLabel: releaseEligible ? "CERTIFIED_RELEASE" : "UNVERIFIED_CANDIDATE",
  releaseEligible,
  certificationTier: releaseEligible ? "release_certified" : (releaseDecisionGate.decision?.certificationTier || "experimental"),
  nonReleaseMarker: releaseEligible ? null : "UNVERIFIED_CANDIDATE",
  missingEvidence: releaseDecisionGate.decision?.missingEvidence || [],
  blockers: releaseDecisionGate.decision?.blockers || [],
  waivers: releaseDecisionGate.decision?.waivers || [],
  specHash: resolvedSpec.specHash,
  runtimeVersion: resolvedSpec.runtimeVersion
};
fs.writeFileSync(path.join(stage, "RELEASE_STATUS.json"), `${JSON.stringify(releaseStatus, null, 2)}\n`);
if (!releaseEligible) {
  fs.writeFileSync(path.join(stage, "UNVERIFIED_CANDIDATE"), "This artifact is not release certified.\n");
}

const readme = `# LoreWeaver Standalone\n\nThis package runs the shared LoreWeaver RuntimeKernel with an embedded resolved runtime spec.\n\n- Artifact label: ${releaseStatus.artifactLabel}\n- Release eligible: ${releaseStatus.releaseEligible}\n- Certification tier: ${releaseStatus.certificationTier}\n- Runtime: ${resolvedSpec.runtimeVersion}\n- Spec: ${resolvedSpec.specHash}\n\nUse ./start.sh, start.bat, or any static web server.\n`;
fs.writeFileSync(path.join(stage, "README.md"), readme);

const startSh = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  echo "Starting at http://localhost:8080"
  python3 -m http.server 8080
elif command -v python >/dev/null 2>&1; then
  echo "Starting at http://localhost:8080"
  python -m http.server 8080
elif command -v npx >/dev/null 2>&1; then
  echo "Starting with npx serve"
  npx serve -p 8080
else
  echo "No static web server found (python3/python/npx)." >&2
  exit 1
fi
`;
fs.writeFileSync(path.join(stage, "start.sh"), startSh);
fs.chmodSync(path.join(stage, "start.sh"), 0o755);

const startBat = `@echo off
cd /d "%~dp0"
echo Starting local web server...

python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Python... (http://localhost:8080)
    python -m http.server 8080
    goto :end
)

npx --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Node (npx serve)...
    npx serve -p 8080
    goto :end
)

php -v >nul 2>&1
if %errorlevel% equ 0 (
    echo Using PHP... (http://localhost:8080)
    php -S localhost:8080
    goto :end
)

echo Error: No supported local server found. Please install Python, Node.js, or PHP.
pause
exit /b 1

:end
pause
`;
fs.writeFileSync(path.join(stage, "start.bat"), startBat);

const preManifestFiles = walkFiles(stage);
const releaseManifest = {
  schemaVersion: "loreweaver.release-manifest.v3",
  createdAt: new Date().toISOString(),
  workspaceId: path.basename(wsPath),
  releaseMode,
  artifactLabel: releaseStatus.artifactLabel,
  certificationTier: releaseStatus.certificationTier,
  nonReleaseMarker: releaseStatus.nonReleaseMarker,
  runtimeMode: "shared_kernel_v2",
  runtimeVersion: resolvedSpec.runtimeVersion,
  specHash: resolvedSpec.specHash,
  sourceRevision: resolvedSpec.sourceRevision,
  appliedPatchIds: resolvedSpec.appliedPatchIds,
  catalogHashes: resolvedSpec.catalogHashes,
  adapterVersions: { registry: "loreweaver.adapter-registry.v2" },
  buildCommand: "vite build --config vite.config.standalone.ts",
  files: preManifestFiles,
  fileCount: preManifestFiles.length,
  totalBytes: preManifestFiles.reduce((sum, file) => sum + file.bytes, 0),
  filters: ["no node_modules", "no docs_collab", "no reports", "no source atlases", "no legacy js/main.js"],
  gates: {
    runtimeSpec: "passed",
    sharedBundle: "passed",
    integrity: "passed",
    browser: browserGate.valid ? "passed" : "pending",
    evidencePolicy: releaseDecisionGate.valid ? "passed" : "candidate_only",
    releaseEligible
  }
};
fs.writeFileSync(path.join(stage, "release-manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`);

const forbidden = walkFiles(stage).map((item) => item.path).filter((file) =>
  file === "js/main.js"
  || file.startsWith("docs_collab/")
  || file.startsWith("node_modules/")
  || file.startsWith("reports/")
  || file.includes("/.env")
);
if (forbidden.length) fail(`Forbidden export contents: ${forbidden.join(", ")}`);

const zipPath = path.join(outDir, `${stageName}.zip`);
fs.rmSync(zipPath, { force: true });
const zip = spawnSync("zip", ["-q", "-r", zipPath, stageName], { cwd: outDir, encoding: "utf8" });
if (zip.status !== 0) fail(`Archive failed: ${zip.stderr || "zip exited non-zero"}`);
const artifact = fs.readFileSync(zipPath);
const artifactSha256 = crypto.createHash("sha256").update(artifact).digest("hex");

const exportReport = {
  schemaVersion: "loreweaver.export-smoke.v3",
  createdAt: new Date().toISOString(),
  status: releaseEligible ? "passed" : "candidate_built",
  releaseMode,
  artifactLabel: releaseStatus.artifactLabel,
  certificationTier: releaseStatus.certificationTier,
  nonReleaseMarker: releaseStatus.nonReleaseMarker,
  releaseEligible,
  runtimeMode: "shared_kernel_v2",
  runtimeVersion: resolvedSpec.runtimeVersion,
  specHash: resolvedSpec.specHash,
  sourceRevision: resolvedSpec.sourceRevision,
  artifact: {
    path: path.relative(LORE_ROOT, zipPath).split(path.sep).join("/"),
    sha256: artifactSha256,
    independent: browserGate.valid
  },
  buildAssertions: {
    sharedKernelBundle: true,
    embeddedResolvedSpec: true,
    releaseStatusEmbedded: true,
    legacyEntryAbsent: true,
    nodeModulesAbsent: true,
    docsCollabAbsent: true
  },
  browserVerification: browserGate.valid
    ? { status: "passed", report: path.relative(LORE_ROOT, path.resolve(LORE_ROOT, browserReportArg)) }
    : { status: "required", reason: browserGate.reason },
  releaseDecision: releaseDecisionGate.decision || null,
  errors: browserGate.report?.errors || null
};
const reportPath = path.join(LORE_ROOT, "minigame_master/capabilities/reports/export_standalone_latest.json");
fs.writeFileSync(reportPath, `${JSON.stringify({ ...exportReport, stage }, null, 2)}\n`);
const workspaceReports = path.join(wsPath, "reports");
fs.mkdirSync(workspaceReports, { recursive: true });
fs.writeFileSync(path.join(workspaceReports, "export_smoke_latest.json"), `${JSON.stringify(exportReport, null, 2)}\n`);
fs.writeFileSync(path.join(workspaceReports, "export_artifact_meta.json"), `${JSON.stringify({
  path: exportReport.artifact.path,
  sha256: artifactSha256,
  builtAt: exportReport.createdAt,
  independent: browserGate.valid,
  releaseMode,
  artifactLabel: releaseStatus.artifactLabel,
  releaseEligible,
  certificationTier: releaseStatus.certificationTier,
  nonReleaseMarker: releaseStatus.nonReleaseMarker,
  specHash: resolvedSpec.specHash
}, null, 2)}\n`);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log(JSON.stringify({
  status: exportReport.status,
  releaseMode,
  artifactLabel: releaseStatus.artifactLabel,
  releaseEligible: exportReport.releaseEligible,
  certificationTier: releaseStatus.certificationTier,
  nonReleaseMarker: releaseStatus.nonReleaseMarker,
  artifact: exportReport.artifact.path,
  stage,
  runtimeVersion: resolvedSpec.runtimeVersion,
  specHash: resolvedSpec.specHash,
  sha256: artifactSha256,
  browserGate: exportReport.browserVerification
}, null, 2));

if (!browserGate.valid && !allowUnverifiedBrowser) {
  fail("Standalone candidate built, but browser verification is missing. Re-run via release-compiler candidate mode or provide --browser-report=...");
}
