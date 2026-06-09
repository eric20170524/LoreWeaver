import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const loreRoot = path.resolve(scriptDir, "../..");
const repoRoot = path.resolve(loreRoot, "..");
const reportsDir = path.join(loreRoot, "workflow", "reports");

function runStep(step) {
  const startedAt = new Date().toISOString();
  const proc = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    encoding: "utf8"
  });

  return {
    name: step.name,
    command: [step.cmd, ...step.args].join(" "),
    cwd: step.cwd,
    status: proc.status === 0 ? "passed" : "failed",
    exitCode: proc.status,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdout: proc.stdout,
    stderr: proc.stderr
  };
}

const viteBin = path.join(loreRoot, "node_modules", ".bin", "vite");

const steps = [
  {
    name: "loreweaver_typescript",
    cwd: loreRoot,
    cmd: "npm",
    args: ["run", "lint"]
  },
  {
    name: "loreweaver_build",
    cwd: loreRoot,
    cmd: "npm",
    args: ["run", "build"]
  },
  {
    name: "survivor_horde_demo_build",
    cwd: repoRoot,
    cmd: viteBin,
    args: [
      "build",
      "--config",
      "minigame_master/core/demo/survivor_horde/vite.config.mjs",
      "--outDir",
      "/private/tmp/lw_survivor_demo_dist"
    ]
  },
  {
    name: "survivor_horde_runtime_e2e",
    cwd: repoRoot,
    cmd: "python3",
    args: [
      "LoreWeaver/workflow/scripts/run_e2e_test.py",
      "--game",
      "survivor_horde"
    ]
  }
];

fs.mkdirSync(reportsDir, { recursive: true });

const results = steps.map(runStep);
const report = {
  gate: "build",
  status: results.every((item) => item.status === "passed") ? "passed" : "failed",
  createdAt: new Date().toISOString(),
  results
};

fs.writeFileSync(
  path.join(reportsDir, "build_gate_latest.json"),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify({
  gate: report.gate,
  status: report.status,
  results: results.map((item) => ({ name: item.name, status: item.status, exitCode: item.exitCode }))
}, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
