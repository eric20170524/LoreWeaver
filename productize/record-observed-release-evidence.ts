#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileRuntimeSpec } from "../src/runtime/compileRuntimeSpec.ts";
import { assembleWorkspaceSpec } from "./lib/workspace-spec.mjs";
import { buildReleaseIdentity } from "./lib/release-policy.mjs";
import { hashExecutablePayloadManifest } from "./lib/executable-payload.mjs";
import {
  buildDeviceVerificationEvidence,
  buildHumanPlaytestEvidence
} from "./lib/observed-release-evidence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const WORKSPACES_ROOT = path.join(LORE_ROOT, "data/workspaces");
const EXPORTS_ROOT = path.join(LORE_ROOT, "productize/exports");
const args = process.argv.slice(2);
const valueArg = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

function fail(reason: string, extra: Record<string, unknown> = {}): never {
  console.log(JSON.stringify({ status: "blocked", reason, ...extra }, null, 2));
  process.exit(2);
}
function repoRelative(file: string) {
  return path.relative(LORE_ROOT, file).split(path.sep).join("/");
}
function safeWithin(file: string, root: string) {
  const absolute = path.resolve(file);
  const normalizedRoot = path.resolve(root);
  return absolute === normalizedRoot || absolute.startsWith(`${normalizedRoot}${path.sep}`);
}
function readJson(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("json_read_failed", { file, error: error instanceof Error ? error.message : String(error) });
  }
}
function parseJsonOutput(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const starts: number[] = [];
  for (let index = 0; index < raw.length; index += 1) if (raw[index] === "{") starts.push(index);
  for (const start of starts.reverse()) {
    try { return JSON.parse(raw.slice(start)); } catch {}
  }
  return null;
}
function sha256File(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function walkFiles(dir: string, base = dir): Array<{path: string; bytes: number; sha256: string}> {
  const files: Array<{path: string; bytes: number; sha256: string}> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, base));
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(full);
      files.push({
        path: path.relative(base, full).split(path.sep).join("/"),
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex")
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function browserEligible(report: any) {
  const errors = report?.errors || {};
  const noErrors = ["console", "page", "requests"].every(
    (key) => Array.isArray(errors[key]) && errors[key].length === 0
  );
  return report?.status === "passed"
    && report?.releaseEligible === true
    && report?.zeroApiRequests === true
    && report?.stale !== true
    && report?.freshness !== "stale"
    && typeof report?.specHash === "string" && report.specHash.length > 0
    && typeof report?.runtimeVersion === "string" && report.runtimeVersion.length > 0
    && typeof report?.payloadHash === "string" && report.payloadHash.length > 0
    && typeof report?.artifact === "string" && report.artifact.length > 0
    && typeof report?.artifactSha256 === "string" && report.artifactSha256.length > 0
    && noErrors;
}
function attemptPlayerTaskSync(workspaceId: string) {
  const python = process.env.PYTHON || process.env.PYTHON3 || (process.platform === "win32" ? "python" : "python3");
  const script = path.join(LORE_ROOT, "productize/sync-release-task.py");
  const result = spawnSync(python, [script, `--workspace-id=${workspaceId}`, "--role=player"], {
    cwd: LORE_ROOT,
    encoding: "utf8",
    env: process.env,
    timeout: 30000,
    shell: false
  });
  const payload = parseJsonOutput(result.stdout || "");
  if (payload) return payload;
  return {
    schemaVersion: "loreweaver.release-task-sync.v1",
    status: "blocked",
    action: "noop",
    role: "player",
    reason: result.error
      ? `task_sync_process_error:${result.error.message}`
      : `task_sync_non_json_output:${result.status}:${String(result.stderr || "").slice(-500)}`
  };
}

const workspaceArg = valueArg("--workspace");
const kindArg = valueArg("--kind");
const inputArg = valueArg("--input");
const browserArg = valueArg("--browser-report");
const cardArg = valueArg("--card-id");
if (!workspaceArg || !kindArg || !inputArg || !["human", "device"].includes(kindArg)) {
  fail("missing_or_invalid_arguments", {
    usage: "tsx productize/record-observed-release-evidence.ts --workspace=data/workspaces/<id> --kind=human|device --input=<repo-relative.json> [--browser-report=<repo-relative.json>] [--card-id=<id>]"
  });
}

const workspace = path.resolve(LORE_ROOT, workspaceArg);
if (!safeWithin(workspace, WORKSPACES_ROOT) || !fs.existsSync(workspace)) {
  fail("workspace_missing_or_outside_allowed_root");
}
const workspaceId = path.basename(workspace);
const inputPath = path.resolve(LORE_ROOT, inputArg);
if (!safeWithin(inputPath, LORE_ROOT) || !fs.existsSync(inputPath)) {
  fail("observation_input_missing_or_outside_repo");
}
const reportsDir = path.join(workspace, "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const browserPath = browserArg
  ? path.resolve(LORE_ROOT, browserArg)
  : path.join(reportsDir, "standalone_browser_report.json");
if (!safeWithin(browserPath, LORE_ROOT) || !fs.existsSync(browserPath)) {
  fail("browser_report_missing_or_outside_repo");
}

const browser = readJson(browserPath);
if (!browserEligible(browser)) fail("browser_report_not_release_eligible_exact_candidate");
const cardId = String(cardArg || browser.cardId || "").trim();
if (!cardId) fail("card_id_required_when_browser_report_is_workspace_scoped");
if (browser.cardId && String(browser.cardId) !== cardId) {
  fail("card_id_mismatch_with_browser_report", { browser: browser.cardId, requested: cardId });
}

let resolvedSpec: any;
try {
  resolvedSpec = compileRuntimeSpec(assembleWorkspaceSpec(workspace));
} catch (error) {
  fail("current_workspace_runtime_compilation_failed", {
    error: error instanceof Error ? error.message : String(error)
  });
}
if (browser.specHash !== resolvedSpec.specHash || browser.runtimeVersion !== resolvedSpec.runtimeVersion) {
  fail("browser_candidate_not_current_workspace_identity", {
    browserSpecHash: browser.specHash,
    currentSpecHash: resolvedSpec.specHash,
    browserRuntimeVersion: browser.runtimeVersion,
    currentRuntimeVersion: resolvedSpec.runtimeVersion
  });
}

const artifactPath = path.resolve(LORE_ROOT, browser.artifact);
if (!safeWithin(artifactPath, EXPORTS_ROOT) || !fs.existsSync(artifactPath)) {
  fail("candidate_artifact_missing_or_outside_exports");
}
const artifactSha256 = sha256File(artifactPath);
if (artifactSha256 !== browser.artifactSha256) {
  fail("candidate_artifact_sha_mismatch", { expected: browser.artifactSha256, actual: artifactSha256 });
}
const stage = artifactPath.replace(/\.zip$/i, "");
if (!fs.existsSync(stage) || !fs.statSync(stage).isDirectory()) {
  fail("candidate_stage_missing_for_payload_verification");
}
const payloadIdentity = hashExecutablePayloadManifest(walkFiles(stage));
if (payloadIdentity.payloadHash !== browser.payloadHash) {
  fail("candidate_payload_hash_mismatch", { expected: browser.payloadHash, actual: payloadIdentity.payloadHash });
}

const baseIdentity = buildReleaseIdentity({ resolvedSpec });
const identity = {
  ...baseIdentity,
  cardId,
  payloadHash: browser.payloadHash,
  artifact: browser.artifact,
  artifactSha256: browser.artifactSha256,
  browserReport: repoRelative(browserPath)
};
const input = readJson(inputPath);
const built = kindArg === "human"
  ? buildHumanPlaytestEvidence({ input, identity })
  : buildDeviceVerificationEvidence({ input, identity });
if (!built.ok || !built.report) {
  fail("observation_input_rejected", { kind: kindArg, errors: built.errors || [] });
}

const prefix = kindArg === "human" ? "human_playtest" : "device_verification";
const latestPath = path.join(reportsDir, `${prefix}_${cardId}_latest.json`);
const historyDir = path.join(reportsDir, "evidence-history");
fs.mkdirSync(historyDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const historyPath = path.join(historyDir, `${prefix}_${cardId}_${stamp}.json`);
const serialized = `${JSON.stringify(built.report, null, 2)}\n`;
fs.writeFileSync(latestPath, serialized);
fs.writeFileSync(historyPath, serialized);

const taskSync = kindArg === "human" && built.report.status === "passed"
  ? attemptPlayerTaskSync(workspaceId)
  : {
      schemaVersion: "loreweaver.release-task-sync.v1",
      status: "passed",
      action: "noop",
      role: "player",
      reason: kindArg === "human" ? "human_evidence_not_passed" : "device_evidence_is_release_gate_not_player_role"
    };

console.log(JSON.stringify({
  status: built.report.status,
  releaseEligible: built.report.releaseEligible,
  kind: kindArg,
  cardId,
  specHash: built.report.specHash,
  payloadHash: built.report.payloadHash,
  artifactSha256: built.report.artifactSha256,
  report: repoRelative(latestPath),
  history: repoRelative(historyPath),
  taskSync
}, null, 2));

if (built.report.status !== "passed") process.exit(2);