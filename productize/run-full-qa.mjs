#!/usr/bin/env node
/**
 * LW-048: Orchestrate full QA suite for the mature campaign workspace.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const wsRel = args.find((a) => a.startsWith("--workspace="))?.split("=")[1];

if (!wsRel) {
  console.error("Error: Missing --workspace parameter. Usage: node productize/run-full-qa.mjs --workspace=<path_to_workspace>");
  process.exit(1);
}

const WS = path.resolve(LORE_ROOT, wsRel);
if (!fs.existsSync(WS)) {
  console.error(`Error: Workspace path does not exist: ${WS}`);
  process.exit(1);
}

function run(cmd, args, cwd = WS) {
  console.log(`\n>>> ${cmd} ${args.join(" ")} (cwd=${path.relative(LORE_ROOT, cwd)})`);
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 });
  if (res.stdout) process.stdout.write(res.stdout.slice(-4000));
  if (res.stderr) process.stderr.write(res.stderr.slice(-2000));
  return { status: res.status ?? 1, cmd: `${cmd} ${args.join(" ")}` };
}

const steps = [];
const runCmd = (cmd, argsArr, cwd = LORE_ROOT) => steps.push(run(cmd, argsArr, cwd));

// 1. Build general project
runCmd("npm", ["run", "build"]);

// 2. Content safety scan if script present
const contentScript = path.join(LORE_ROOT, "minigame_master/capabilities/verification/content_safety_scan.mjs");
if (fs.existsSync(contentScript)) {
  runCmd("node", [contentScript, WS], LORE_ROOT);
}

// 3. Asset verification job
runCmd("node", ["productize/run-asset-job.mjs", `--workspace=${path.relative(LORE_ROOT, WS)}`, "--job=audio_verify"], LORE_ROOT);

// 4. Export standalone candidate
runCmd("node", ["productize/export-standalone.mjs", `--workspace=${path.relative(LORE_ROOT, WS)}`, "--allow-unverified-browser"], LORE_ROOT);

const failed = steps.filter((s) => s.status !== 0);
const report = {
  schemaVersion: "loreweaver.full-qa.v1",
  gate: "full_qa_export_safety",
  status: failed.length === 0 ? "passed" : "failed",
  createdAt: new Date().toISOString(),
  workspace: path.relative(LORE_ROOT, WS).split(path.sep).join("/"),
  steps: steps.map((s) => ({ command: s.cmd, exitCode: s.status, passed: s.status === 0 })),
  summary: {
    stepCount: steps.length,
    passed: steps.filter((s) => s.status === 0).length,
    failed: failed.length
  }
};

const out = path.join(WS, "reports/full_qa_latest.json");
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(LORE_ROOT, "minigame_master/capabilities/reports/full_qa_latest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
if (report.status !== "passed") process.exit(1);
