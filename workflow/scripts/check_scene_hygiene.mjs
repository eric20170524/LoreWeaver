import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const loreRoot = path.resolve(scriptDir, "../..");
const repoRoot = path.resolve(loreRoot, "..");
const reportsDir = path.join(loreRoot, "workflow", "reports");
const GENERATED_DIRS = new Set([".vite", "node_modules", "dist", "coverage"]);

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function collectFiles(dirRel, suffix = ".js") {
  const dir = path.join(repoRoot, dirRel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      if (GENERATED_DIRS.has(entry.name)) return [];
      return collectFiles(rel, suffix);
    }
    return entry.name.endsWith(suffix) ? [rel] : [];
  });
}

const targetFiles = [
  ...collectFiles("minigame_master/core/lib/gameplay/survivor_horde"),
  ...collectFiles("minigame_master/core/demo/survivor_horde")
];

const checks = [];

for (const file of targetFiles) {
  const source = read(file);
  checks.push({
    id: `${file}:no_global_timers`,
    status: /setInterval\s*\(|setTimeout\s*\(/.test(source) ? "failed" : "passed",
    message: "No global setInterval/setTimeout in core gameplay/demo code"
  });
}

const adapterSource = read("minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js");
checks.push({
  id: "survivor_horde:uses_scene_lifecycle",
  status: adapterSource.includes("new SceneLifecycle") && adapterSource.includes("this.lifecycle.cleanup()") ? "passed" : "failed",
  message: "Adapter owns SceneLifecycle and runs cleanup on finish"
});
checks.push({
  id: "survivor_horde:retreat_uses_finish",
  status: /retreat\(\)\s*{[\s\S]*this\.finish\(false/.test(adapterSource) ? "passed" : "failed",
  message: "Retreat path uses the same finish/cleanup flow as failure"
});
checks.push({
  id: "survivor_horde:guards_double_finish",
  status: adapterSource.includes("this.status === 'ended'") && adapterSource.includes("canTransition()") ? "passed" : "failed",
  message: "Finish path has status guard and transition guard"
});

const runnerSource = read("LoreWeaver/src/game/GameRunner.ts");
checks.push({
  id: "gamerunner:cleans_up_adapter_on_shutdown",
  status: runnerSource.includes("this.adapter.destroy()") && runnerSource.includes("this.adapter = null") ? "passed" : "failed",
  message: "GameRunner LevelActiveScene cleans up the gameplay adapter and nullifies it on shutdown"
});
checks.push({
  id: "gamerunner:no_global_timers",
  status: runnerSource.includes("setInterval") || runnerSource.includes("setTimeout") ? "failed" : "passed",
  message: "GameRunner has no global setInterval/setTimeout calls to prevent memory leaks"
});
checks.push({
  id: "gamerunner:retreat_calls_adapter_retreat",
  status: runnerSource.includes("this.adapter.retreat()") ? "passed" : "failed",
  message: "GameRunner LevelActiveScene retreat button triggers adapter.retreat() when adapter is active"
});

for (const file of targetFiles.filter((item) => item.includes("/modifiers/"))) {
  const source = read(file);
  checks.push({
    id: `${file}:modifier_uninstall`,
    status: /uninstall\(\w*\)/.test(source) ? "passed" : "failed",
    message: "Modifier exposes uninstall cleanup hook"
  });
}

const demoHtml = read("minigame_master/core/demo/survivor_horde/index.html");
checks.push({
  id: "survivor_demo:test_state_mirror",
  status: demoHtml.includes('data-testid="test-state"') ? "passed" : "failed",
  message: "Runtime E2E has a stable DOM test-state mirror"
});

fs.mkdirSync(reportsDir, { recursive: true });

const report = {
  gate: "scene_hygiene",
  status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
  createdAt: new Date().toISOString(),
  checks
};

fs.writeFileSync(
  path.join(reportsDir, "scene_hygiene_latest.json"),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
