import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const loreRoot = path.resolve(scriptDir, "../..");
const repoRoot = path.resolve(loreRoot, "..");
const reportsDir = path.join(loreRoot, "workflow", "reports");

const exportSurfaces = [
  "minigame_master/core/lib",
  "minigame_master/core/demo",
  "LoreWeaver/src",
  "LoreWeaver/dist",
  "LoreWeaver/index.html",
  "LoreWeaver/docs",
  "LoreWeaver/data/workspaces",
  "LoreWeaver/data/presets",
  "LoreWeaver/workflow/reports"
];

const warningSurfaces = [
  "minigame_master/core/lib",
  "minigame_master/core/demo",
  "LoreWeaver/src",
  "LoreWeaver/dist",
  "LoreWeaver/index.html"
];

const sensitiveTerms = [
  "王林",
  "石昊",
  "安澜",
  "藤化元",
  "完美世界",
  "仙逆",
  "凡人修仙",
  "诡秘之主"
];

function collectFiles(dirRel) {
  const dir = path.join(repoRoot, dirRel);
  if (!fs.existsSync(dir)) return [];
  // If it's a single file, return it directly if it matches the text extension
  if (fs.statSync(dir).isFile()) {
    if (/\.(js|ts|tsx|json|md|html|css)$/.test(dirRel)) return [dirRel];
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) return collectFiles(rel);
    if (/\.(js|ts|tsx|json|md|html|css)$/.test(entry.name)) return [rel];
    return [];
  });
}

const findings = [];

for (const surface of exportSurfaces) {
  for (const file of collectFiles(surface)) {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const term of sensitiveTerms) {
      if (source.includes(term)) {
        const isWarning = warningSurfaces.some((ws) => file.startsWith(ws));
        findings.push({
          file,
          term,
          severity: isWarning ? "warning" : "note"
        });
      }
    }
  }
}

fs.mkdirSync(reportsDir, { recursive: true });

const blocking = findings.filter((item) => item.severity === "warning");
const report = {
  gate: "content_safety_scan",
  status: blocking.length === 0 ? "passed" : "needs_review",
  createdAt: new Date().toISOString(),
  exportSurfaces,
  findings
};

fs.writeFileSync(
  path.join(reportsDir, "content_safety_scan_latest.json"),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));

if (blocking.length > 0) {
  process.exit(1);
}
