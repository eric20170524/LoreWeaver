#!/usr/bin/env node
/**
 * Fail-closed unit/integration checks for production export hard-gate + stale identity.
 *
 * Uses real shipped modules (production-export-gate, mark-gate-reports-stale).
 * Does not mock the unit under test.
 *
 * Env:
 *   GATE_SCRATCH=/path  optional scratch dir for temp report fixtures (defaults to os.tmpdir)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { evaluateProductionExportGate } from "../lib/production-export-gate.mjs";
import { markGateReportsStale } from "../lib/mark-gate-reports-stale.mjs";
import {
  applyLevelRecipe,
  applyRecipeToNode,
  listBundledRecipes
} from "../lib/apply-level-recipe-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const REAL_REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const SURVIVOR = path.join(
  LORE_ROOT,
  "minigame_master/gameplay/cards/survivor_horde.json"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}

function seedPassingReports(dir, cardId = "survivor_horde") {
  writeJson(path.join(dir, "node_smoke_latest.json"), {
    schemaVersion: "loreweaver.node-smoke.v1",
    status: "passed",
    summary: { total: 1, passed: 1, failed: 0 }
  });
  writeJson(path.join(dir, "standalone_browser_report.json"), {
    schemaVersion: "loreweaver.standalone-browser-report.v1",
    status: "passed",
    cardId,
    releaseEligible: true,
    specHash: `${cardId}:test`,
    runtimeVersion: "test"
  });
  writeJson(path.join(dir, "visual_audit_latest.json"), {
    schemaVersion: "loreweaver.visual-audit.v1",
    status: "passed",
    cardId
  });
  writeJson(path.join(dir, "performance_report_latest.json"), {
    schemaVersion: "loreweaver.performance-report.v1",
    status: "passed",
    cardId
  });
  writeJson(path.join(dir, `runtime_e2e_${cardId}_latest.json`), {
    schemaVersion: "loreweaver.runtime-e2e.v1",
    status: "passed",
    cardId,
    releaseEligible: true,
    specHash: `${cardId}:test`
  });
}

function seedPassingReportsPerCard(dir, cardId) {
  writeJson(path.join(dir, "node_smoke_latest.json"), {
    schemaVersion: "loreweaver.node-smoke.v1",
    status: "passed",
    summary: { total: 1, passed: 1, failed: 0 }
  });
  writeJson(path.join(dir, `standalone_browser_report_${cardId}.json`), {
    schemaVersion: "loreweaver.standalone-browser-report.v1",
    status: "passed",
    cardId,
    releaseEligible: true,
    specHash: `${cardId}:test`,
    runtimeVersion: "test"
  });
  writeJson(path.join(dir, `visual_audit_${cardId}_latest.json`), {
    schemaVersion: "loreweaver.visual-audit.v1",
    status: "passed",
    cardId
  });
  writeJson(path.join(dir, `performance_report_${cardId}_latest.json`), {
    schemaVersion: "loreweaver.performance-report.v1",
    status: "passed",
    cardId
  });
  writeJson(path.join(dir, `runtime_e2e_${cardId}_latest.json`), {
    schemaVersion: "loreweaver.runtime-e2e.v1",
    status: "passed",
    cardId,
    releaseEligible: true
  });
}

function main() {
  const card = JSON.parse(fs.readFileSync(SURVIVOR, "utf8"));
  const scratchRoot =
    process.env.GATE_SCRATCH ||
    path.join(os.tmpdir(), `lw-export-gate-${Date.now()}`);
  fs.mkdirSync(scratchRoot, { recursive: true });
  const logLines = [];
  const log = (s) => {
    logLines.push(s);
    console.log(s);
  };

  // --- 1) Temp dir: pass then fail-closed ---
  const tmpReports = path.join(scratchRoot, "reports_pass");
  seedPassingReports(tmpReports);
  const pass1 = evaluateProductionExportGate({ card, reportsDir: tmpReports });
  assert(pass1.productionExportAllowed === true, `expected pass: ${JSON.stringify(pass1.reasons)}`);
  log(`[ok] temp pass productionExportAllowed=true`);

  // corrupt releaseEligible
  const standalonePath = path.join(tmpReports, "standalone_browser_report.json");
  const st = JSON.parse(fs.readFileSync(standalonePath, "utf8"));
  st.releaseEligible = false;
  writeJson(standalonePath, st);
  const failRelease = evaluateProductionExportGate({ card, reportsDir: tmpReports });
  assert(
    failRelease.productionExportAllowed === false,
    "expected fail when releaseEligible=false"
  );
  assert(
    failRelease.reasons.some((r) => r.includes("releaseEligible")),
    `expected releaseEligible reason, got ${failRelease.reasons}`
  );
  log(`[ok] fail-closed on releaseEligible=false`);

  // restore and mark stale
  st.releaseEligible = true;
  writeJson(standalonePath, st);
  const staleResult = markGateReportsStale({
    reportsDir: tmpReports,
    reason: "test_identity_change",
    identity: { recipeId: "test_recipe", cardId: "survivor_horde" }
  });
  assert(staleResult.marked.length >= 2, "expected multiple reports marked stale");
  const failStale = evaluateProductionExportGate({ card, reportsDir: tmpReports });
  assert(failStale.productionExportAllowed === false, "expected fail when reports stale");
  assert(
    failStale.reasons.some((r) => r.includes("stale")),
    `expected stale reason, got ${failStale.reasons}`
  );
  log(`[ok] fail-closed on stale reports (${staleResult.marked.length} marked)`);

  // cardId mismatch
  const tmpMis = path.join(scratchRoot, "reports_mismatch");
  seedPassingReports(tmpMis, "other_card");
  // keep smoke ok; visual/perf/standalone wrong card
  writeJson(path.join(tmpMis, "node_smoke_latest.json"), {
    status: "passed",
    summary: { passed: 1, failed: 0 }
  });
  const failId = evaluateProductionExportGate({ card, reportsDir: tmpMis });
  assert(failId.productionExportAllowed === false, "expected cardId mismatch fail");
  assert(
    failId.reasons.some((r) => r.includes("cardId mismatch")),
    `expected cardId mismatch, got ${failId.reasons}`
  );
  log(`[ok] fail-closed on cardId mismatch`);

  // identity hash mismatch when report claims recipeHash
  const tmpHash = path.join(scratchRoot, "reports_hash");
  seedPassingReports(tmpHash);
  const vis = JSON.parse(
    fs.readFileSync(path.join(tmpHash, "visual_audit_latest.json"), "utf8")
  );
  vis.recipeHash = "aaa";
  writeJson(path.join(tmpHash, "visual_audit_latest.json"), vis);
  const failHash = evaluateProductionExportGate({
    card,
    reportsDir: tmpHash,
    expectedIdentity: { cardId: "survivor_horde", recipeHash: "bbb" }
  });
  assert(failHash.productionExportAllowed === false, "expected recipeHash mismatch fail");
  log(`[ok] fail-closed on recipeHash identity mismatch`);

  // Multi-card isolation: shared latest is survivor; rhythm uses per-card files
  const tmpMulti = path.join(scratchRoot, "reports_multi");
  seedPassingReports(tmpMulti, "survivor_horde");
  seedPassingReportsPerCard(tmpMulti, "rhythm_timing");
  const rhythmCard = {
    id: "rhythm_timing",
    status: "production_ready",
    exportPolicy: { productionReady: true }
  };
  const multiSurv = evaluateProductionExportGate({ card, reportsDir: tmpMulti });
  const multiRhythm = evaluateProductionExportGate({
    card: rhythmCard,
    reportsDir: tmpMulti
  });
  assert(multiSurv.productionExportAllowed === true, `survivor multi: ${multiSurv.reasons}`);
  assert(multiRhythm.productionExportAllowed === true, `rhythm multi: ${multiRhythm.reasons}`);
  log(`[ok] multi-card per-file evidence isolation`);

  // --- 2) Recipe list + pure applyRecipeToNode ---
  const recipes = listBundledRecipes(LORE_ROOT);
  assert(recipes.length >= 2, "expected bundled recipes");
  const cyber = recipes.find((r) => String(r.recipeId).includes("cyber"));
  assert(cyber, "cyber recipe present");
  const recipePath = path.join(LORE_ROOT, cyber.path);
  const recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
  const contentPath = path.join(LORE_ROOT, recipe.contentPackRef);
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const sampleNode = {
    id: 99,
    title: "old",
    intro: "old intro",
    mechanics: "other",
    durationLimit: 30,
    gameplay: { cardId: "other", modifiers: [], knobs: {} }
  };
  const { node: afterNode } = applyRecipeToNode(sampleNode, recipe, content, "zh-CN");
  assert(afterNode.gameplay.cardId === "survivor_horde", "cardId applied");
  assert(afterNode.gameplay.knobs.recipeId === recipe.recipeId, "recipeId in knobs");
  assert(
    afterNode.title && afterNode.title !== "old",
    "theme title applied from content pack"
  );
  log(`[ok] applyRecipeToNode mutates cardId/title from recipe+content`);

  // --- 3) Real dry-run apply twice (consistent) ---
  const dry1 = applyLevelRecipe({
    recipePath: cyber.path,
    workspaceId: "20260611-060754-719406",
    nodeId: "1",
    dryRun: true,
    markStale: false
  });
  const dry2 = applyLevelRecipe({
    recipePath: cyber.path,
    workspaceId: "20260611-060754-719406",
    nodeId: "1",
    dryRun: true,
    markStale: false
  });
  assert(dry1.ok !== false && dry1.status === "passed", `dry1 fail ${JSON.stringify(dry1)}`);
  assert(dry2.ok !== false && dry2.status === "passed", `dry2 fail ${JSON.stringify(dry2)}`);
  assert(dry1.after.cardId === dry2.after.cardId, "consistent cardId");
  assert(dry1.after.title === dry2.after.title, "consistent title");
  assert(dry1.recipeId === recipe.recipeId, "recipeId matches");
  log(`[ok] dual dry-run apply consistent cardId=${dry1.after.cardId} title=${dry1.after.title}`);

  // --- 4) Real reports dir evaluation (snapshot; may pass or fail depending on stale state) ---
  const realEval = evaluateProductionExportGate({ card, reportsDir: REAL_REPORTS });
  log(
    `[info] real reports productionExportAllowed=${realEval.productionExportAllowed} reasons=${realEval.reasons.length}`
  );

  const summary = {
    schemaVersion: "loreweaver.production-export-gate-check.v1",
    status: "passed",
    createdAt: new Date().toISOString(),
    scratchRoot,
    realReportsAllowed: realEval.productionExportAllowed,
    realReasons: realEval.reasons,
    dualDryRun: {
      recipeId: dry1.recipeId,
      cardId: dry1.after.cardId,
      title: dry1.after.title,
      modifiers: dry1.after.modifiers
    },
    log: logLines
  };
  writeJson(path.join(REAL_REPORTS, "production_export_gate_check_latest.json"), summary);
  writeJson(path.join(scratchRoot, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
  console.log("PASSED production export gate checks");
  return 0;
}

try {
  process.exit(main() || 0);
} catch (e) {
  console.error("FAILED", e);
  process.exit(1);
}
