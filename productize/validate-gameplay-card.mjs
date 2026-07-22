#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const cardPath = process.argv[2] || path.join(LORE_ROOT, "productize/coldstart/latest-card.json");
// If missing, try find newest workspace card
function findCard() {
  if (fs.existsSync(cardPath) && fs.statSync(cardPath).isFile()) return cardPath;
  if (fs.existsSync(cardPath) && fs.statSync(cardPath).isDirectory()) {
    const candidateFiles = [
      path.join(cardPath, "loreweaver/gameplay-card.v2.json"),
      path.join(cardPath, "loreweaver/gameplay-cards.json"),
      path.join(cardPath, "loreweaver/catalogs/gameplay-card-v2.json")
    ];
    for (const f of candidateFiles) {
      if (fs.existsSync(f)) return f;
    }
  }
  const wsRoot = path.join(LORE_ROOT, "data/workspaces");
  if (fs.existsSync(wsRoot)) {
    const dirs = fs.readdirSync(wsRoot);
    for (const d of dirs) {
      const candidates = [
        path.join(wsRoot, d, "loreweaver/gameplay-card.v2.json"),
        path.join(wsRoot, d, "loreweaver/gameplay-cards.json"),
        path.join(wsRoot, d, "loreweaver/catalogs/gameplay-card-v2.json")
      ];
      for (const f of candidates) {
        if (fs.existsSync(f)) return f;
      }
    }
  }
  return null;
}

const resolved = findCard();
if (!resolved) {
  console.error("No gameplay card found");
  process.exit(1);
}
const card = JSON.parse(fs.readFileSync(resolved, "utf8"));
const reasons = [];
if (card.schemaVersion !== "2.0") reasons.push("schemaVersion must be 2.0");
for (const k of ["id", "title", "status", "runtime", "inputs", "objectives", "failure", "maturityImpact", "performanceBudget", "testScenarios"]) {
  if (card[k] == null) reasons.push(`missing ${k}`);
}
if (card.status === "design_only" && card.exportPolicy?.productionReady) {
  reasons.push("design_only cards cannot be productionReady");
}
if (card.status === "design_only") {
  // ok blocked
} else if (!card.runtime?.template || !card.runtime?.adapter) {
  reasons.push("runtime.template/adapter required for non-design cards");
}
const report = {
  schemaVersion: "loreweaver.gameplay-card-validate.v1",
  status: reasons.length === 0 ? "passed" : "failed",
  cardPath: path.relative(LORE_ROOT, resolved).split(path.sep).join("/"),
  reasons,
  productionExportAllowed: card.status !== "design_only" && card.exportPolicy?.productionReady !== false,
  createdAt: new Date().toISOString()
};
fs.writeFileSync(path.join(LORE_ROOT, "capabilities/reports/gameplay_card_validate_latest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exit(1);
