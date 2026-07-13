import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const loreRoot = path.resolve(scriptDir, "../..");
const repoRoot = path.resolve(loreRoot, "..");
const reportsDir = path.join(loreRoot, "workflow", "reports");

const targetWorkspace = "LoreWeaver/data/workspaces/20260611-060754-719406";
const trackedMirror = "minigame/perfectworld_dahuang";

const scanSurfaces = [
  {
    root: "minigame_master/core/lib",
    role: "shared_export_runtime",
    blocksPublicShare: true
  },
  {
    root: targetWorkspace,
    role: "target_workspace_public_export",
    blocksPublicShare: true
  },
  {
    root: trackedMirror,
    role: "tracked_source_mirror_public_export",
    blocksPublicShare: true
  },
  {
    root: "LoreWeaver/dist",
    role: "generated_loreweaver_app_dist",
    blocksPublicShare: false,
    note: "Generated app bundle is monitored but not blocking for this target workspace slice."
  }
];

const termRules = [
  { term: "完美世界", risk: "external_work_title", blocking: true },
  { term: "仙逆", risk: "external_work_title", blocking: true },
  { term: "凡人修仙", risk: "external_work_title", blocking: true },
  { term: "诡秘之主", risk: "external_work_title", blocking: true },
  { term: "王林", risk: "concrete_character_name", blocking: true },
  { term: "石昊", risk: "concrete_character_name", blocking: true },
  { term: "石毅", risk: "concrete_character_name", blocking: true },
  { term: "安澜", risk: "concrete_character_name", blocking: true },
  { term: "火灵儿", risk: "concrete_character_name", blocking: true },
  { term: "藤化元", risk: "concrete_character_name", blocking: true },
  { term: "百断山", risk: "specific_lore_location", blocking: false },
  { term: "虚神界", risk: "specific_lore_location", blocking: false },
  { term: "鲲鹏", risk: "specific_lore_motif", blocking: false },
  { term: "至尊骨", risk: "specific_lore_motif", blocking: false },
  { term: "重瞳", risk: "specific_lore_motif", blocking: false },
  { term: "柳神", risk: "specific_lore_motif", blocking: false },
  { term: "他化自在", risk: "specific_lore_motif", blocking: false }
];

const playerVisibleFiles = new Set([
  "index.html",
  "meta.json",
  "package.json",
  "css/style.css",
  "js/data.js",
  "nodes/node1.js",
  "nodes/node2.js",
  "nodes/node3.js",
  "scenes/MainScene.js",
  "scenes/MenuScene.js",
  "scenes/GameOverScene.js",
  "loreweaver/project.json",
  "loreweaver/ability-catalog.json",
  "loreweaver/character-design-catalog.json",
  "loreweaver/enemy-design-catalog.json",
  "loreweaver/nodes/node-01-dahuang.json",
  "loreweaver/nodes/node-02-baiduan.json",
  "loreweaver/nodes/node-03-xushenjie.json"
]);

const textFilePattern = /\.(js|mjs|cjs|ts|tsx|json|md|html|css)$/;
const generatedOrHistoricalParts = [
  "/dist/",
  "/docs/",
  "/assets/",
  "/workflow/reports/"
];

function normalizeRel(file) {
  return file.split(path.sep).join("/");
}

function collectFiles(dirRel) {
  const dir = path.join(repoRoot, dirRel);
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) {
    return textFilePattern.test(dirRel) ? [normalizeRel(dirRel)] : [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = normalizeRel(path.join(dirRel, entry.name));
    if (entry.isDirectory()) return collectFiles(rel);
    return textFilePattern.test(entry.name) ? [rel] : [];
  });
}

function relWithinSurface(file, surfaceRoot) {
  const prefix = `${surfaceRoot}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : path.basename(file);
}

function isGeneratedOrHistorical(file) {
  return generatedOrHistoricalParts.some((part) => file.includes(part));
}

function isPlayerVisiblePublicFile(file, surfaceRoot) {
  if (isGeneratedOrHistorical(file)) return false;
  const rel = relWithinSurface(file, surfaceRoot);
  return playerVisibleFiles.has(rel);
}

function lineInfo(source, term) {
  const index = source.indexOf(term);
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const lineEnd = source.indexOf("\n", index);
  const rawLine = source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  const snippet = rawLine.length > 180 ? `${rawLine.slice(0, 177)}...` : rawLine;
  return { line, snippet };
}

function classifyFinding(file, surface, termRule) {
  const publicVisible = isPlayerVisiblePublicFile(file, surface.root);
  if (
    surface.blocksPublicShare
    && termRule.blocking
    && (surface.role === "shared_export_runtime" || publicVisible)
  ) {
    return "warning";
  }
  return "note";
}

const findings = [];
const seenFiles = new Set();

for (const surface of scanSurfaces) {
  for (const file of collectFiles(surface.root)) {
    const dedupeKey = `${surface.root}:${file}`;
    if (seenFiles.has(dedupeKey)) continue;
    seenFiles.add(dedupeKey);

    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const termRule of termRules) {
      if (source.includes(termRule.term)) {
        const { line, snippet } = lineInfo(source, termRule.term);
        findings.push({
          file,
          surfaceRole: surface.role,
          term: termRule.term,
          risk: termRule.risk,
          severity: classifyFinding(file, surface, termRule),
          publicVisible: isPlayerVisiblePublicFile(file, surface.root),
          line,
          snippet
        });
      }
    }
  }
}

fs.mkdirSync(reportsDir, { recursive: true });

const summary = findings.reduce((acc, item) => {
  acc[item.severity] = (acc[item.severity] || 0) + 1;
  return acc;
}, {});
const blocking = findings.filter((item) => item.severity === "warning");
const report = {
  gate: "content_safety_scan",
  status: blocking.length === 0 ? (findings.length === 0 ? "passed" : "passed_with_notes") : "needs_review",
  createdAt: new Date().toISOString(),
  targetWorkspace,
  trackedMirror,
  scanSurfaces,
  summary,
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
