#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(LORE_ROOT, "minigame_master", "capabilities", "reports");

const VALID_STATUSES = [
  "inventoried",
  "card_json",
  "ui_registered",
  "runtime_ready",
  "gate_verified",
  "production_ready"
];

function parseJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return null;
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Validates Base Card or Modifier Card against V2 Schema structural rules
 */
function validateCardAgainstV2Schema(card, filePath, isModifier = false) {
  const reasons = [];

  // Schema version
  if (card.schemaVersion !== "2.0") reasons.push("schemaVersion must be '2.0'");

  // ID format
  if (!card.id || typeof card.id !== "string" || !/^[a-z0-9_]+$/.test(card.id)) {
    reasons.push("id must be a snake_case string matching ^[a-z0-9_]+$");
  }

  // Title
  if (!card.title || typeof card.title !== "string") {
    reasons.push("title string is required");
  }

  // Status enum
  if (!card.status || !VALID_STATUSES.includes(card.status)) {
    reasons.push(`status '${card.status}' invalid. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  if (isModifier) {
    // Modifier-specific V2 structural checks
    if (!Array.isArray(card.compatibleBaseCards) || card.compatibleBaseCards.length === 0) {
      reasons.push("modifier must specify non-empty compatibleBaseCards array");
    }
    if (!card.requiredAssets || typeof card.requiredAssets !== "object") {
      reasons.push("modifier requiredAssets must be an object contract");
    }
    if (!card.maturityImpact || !Array.isArray(card.maturityImpact.dimensions)) {
      reasons.push("modifier maturityImpact.dimensions must be an array");
    }
    if (!card.exportPolicy || typeof card.exportPolicy.productionReady !== "boolean") {
      reasons.push("modifier exportPolicy must specify productionReady boolean");
    }
    return reasons;
  }

  // Base Card structural checks
  if (!card.runtime || typeof card.runtime !== "object") {
    reasons.push("runtime must be an object");
  } else {
    if (!Array.isArray(card.runtime.engineTargets) || card.runtime.engineTargets.length === 0) {
      reasons.push("runtime.engineTargets must be a non-empty array");
    }
    if (!card.runtime.adapter || typeof card.runtime.adapter !== "string") {
      reasons.push("runtime.adapter is required");
    }
    if (!card.runtime.template || typeof card.runtime.template !== "string") {
      reasons.push("runtime.template is required");
    }
  }

  for (const arrKey of ["inputs", "objectives", "failure"]) {
    if (!Array.isArray(card[arrKey]) || card[arrKey].length === 0) {
      reasons.push(`field '${arrKey}' must be a non-empty array`);
    }
  }

  if (!card.performanceBudget || typeof card.performanceBudget !== "object") {
    reasons.push("performanceBudget must be an object");
  } else {
    if (typeof card.performanceBudget.normalP95Fps !== "number" || typeof card.performanceBudget.bossP95Fps !== "number") {
      reasons.push("performanceBudget must specify normalP95Fps and bossP95Fps as numbers");
    }
  }

  if (!card.maturityImpact || !Array.isArray(card.maturityImpact.dimensions) || card.maturityImpact.dimensions.length === 0) {
    reasons.push("maturityImpact.dimensions must be a non-empty array");
  }

  if (!Array.isArray(card.testScenarios) || card.testScenarios.length === 0) {
    reasons.push("testScenarios must be a non-empty array of scenario objects");
  } else {
    for (const sc of card.testScenarios) {
      if (!sc.id || !Array.isArray(sc.tags)) {
        reasons.push("each testScenario item must contain id string and tags array");
        break;
      }
    }
  }

  if (!card.requiredAssets || typeof card.requiredAssets !== "object") {
    reasons.push("requiredAssets must be an object contract");
  } else {
    for (const assetKey of ["playerClips", "enemyKinds", "environments", "audioCues"]) {
      if (!Array.isArray(card.requiredAssets[assetKey])) {
        reasons.push(`requiredAssets.${assetKey} must be an array`);
      }
    }
  }

  if (!card.exportPolicy || typeof card.exportPolicy !== "object" || typeof card.exportPolicy.productionReady !== "boolean") {
    reasons.push("exportPolicy must specify productionReady boolean");
  }

  if (card.exportPolicy?.productionReady === true && card.status !== "production_ready") {
    reasons.push(`exportPolicy.productionReady cannot be true when status is '${card.status}' (must be 'production_ready')`);
  }

  // Hard Gate Evidence check for production_ready (parses specHash, runtimeVersion, passed status)
  if (card.status === "production_ready" || card.exportPolicy?.productionReady === true) {
    // 1. E2E Smoke Report check (handles both top-level and summary.passed)
    const e2eReport = parseJsonFileSafe(path.join(REPORTS_DIR, "node_smoke_latest.json"));
    const e2ePassed = e2eReport?.passed ?? e2eReport?.summary?.passed;
    const e2eFailed = e2eReport?.failed ?? e2eReport?.summary?.failed ?? 0;

    if (!e2eReport || e2eReport.status !== "passed" || !e2ePassed || e2eFailed > 0) {
      reasons.push("Hard Gate Blocker: E2E smoke report missing, empty, or failed (node_smoke_latest.json)");
    }

    // 2. Standalone Browser E2E Report check
    const standaloneReport = parseJsonFileSafe(path.join(REPORTS_DIR, "standalone_browser_report.json"));
    if (!standaloneReport || standaloneReport.status !== "passed" || standaloneReport.releaseEligible !== true || standaloneReport.specHash !== card.id) {
      reasons.push("Hard Gate Blocker: Standalone browser report missing, empty, failed, or specHash mismatch (standalone_browser_report.json)");
    }

    // 3. Visual/VLM Audit Report check
    const visualReport = parseJsonFileSafe(path.join(REPORTS_DIR, "visual_audit_latest.json"));
    if (!visualReport || visualReport.status !== "passed" || visualReport.cardId !== card.id) {
      reasons.push("Hard Gate Blocker: Visual/VLM audit report missing, empty, failed, or cardId mismatch (visual_audit_latest.json)");
    }

    // 4. Performance & Soak Report check
    const perfReport = parseJsonFileSafe(path.join(REPORTS_DIR, "performance_report_latest.json"));
    if (!perfReport || perfReport.status !== "passed" || perfReport.cardId !== card.id) {
      reasons.push("Hard Gate Blocker: Performance/soak report missing, empty, failed, or cardId mismatch (performance_report_latest.json)");
    }
  }

  return reasons;
}

function findCard(cardPath) {
  if (cardPath && fs.existsSync(cardPath) && fs.statSync(cardPath).isFile()) return cardPath;
  if (cardPath && fs.existsSync(cardPath) && fs.statSync(cardPath).isDirectory()) {
    const candidateFiles = [
      path.join(cardPath, "loreweaver/gameplay-card.v2.json"),
      path.join(cardPath, "loreweaver/gameplay-cards.json"),
      path.join(cardPath, "loreweaver/catalogs/gameplay-card-v2.json")
    ];
    for (const f of candidateFiles) {
      if (fs.existsSync(f)) return f;
    }
  }

  const defaultCold = path.join(LORE_ROOT, "productize/coldstart/latest-card.json");
  if (fs.existsSync(defaultCold)) return defaultCold;

  const survivorCard = path.join(LORE_ROOT, "minigame_master/gameplay/cards/survivor_horde.json");
  if (fs.existsSync(survivorCard)) return survivorCard;

  return null;
}

function main() {
  const arg = process.argv[2];

  const modifiersDir = path.join(LORE_ROOT, "minigame_master/gameplay/cards/modifiers");
  let modifierFiles = [];
  if (fs.existsSync(modifiersDir)) {
    modifierFiles = fs.readdirSync(modifiersDir).filter(f => f.endsWith(".json"));
  }

  if (arg === "--all") {
    const cardsDir = path.join(LORE_ROOT, "minigame_master/gameplay/cards");
    const files = fs.readdirSync(cardsDir).filter(f => f.endsWith(".json"));
    let totalFailed = 0;
    const results = [];

    // Validate 23 base cards with full V2 schema rules
    for (const f of files) {
      const p = path.join(cardsDir, f);
      const c = JSON.parse(fs.readFileSync(p, "utf8"));
      const reasons = validateCardAgainstV2Schema(c, p, false);
      if (reasons.length > 0) totalFailed++;
      results.push({ cardId: c.id, file: f, type: "base_card", status: reasons.length === 0 ? "passed" : "failed", reasons });
    }

    // Validate 24 modifiers with full V2 modifier schema rules
    for (const f of modifierFiles) {
      const p = path.join(modifiersDir, f);
      const c = JSON.parse(fs.readFileSync(p, "utf8"));
      const reasons = validateCardAgainstV2Schema(c, p, true);
      if (reasons.length > 0) totalFailed++;
      results.push({ cardId: c.id, file: `modifiers/${f}`, type: "modifier", status: reasons.length === 0 ? "passed" : "failed", reasons });
    }

    const report = {
      schemaVersion: "loreweaver.gameplay-card-validate-all.v1",
      validatorType: "v2_schema_structural_validator",
      status: totalFailed === 0 ? "passed" : "failed",
      totalBaseCards: files.length,
      totalModifiers: modifierFiles.length,
      total: files.length + modifierFiles.length,
      failed: totalFailed,
      results,
      createdAt: new Date().toISOString()
    };

    const reportPath = path.join(REPORTS_DIR, "gameplay_card_validate_all_latest.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Refresh single latest validation report
    const latestSinglePath = path.join(REPORTS_DIR, "gameplay_card_validate_latest.json");
    const survivorPath = path.join(LORE_ROOT, "minigame_master/gameplay/cards/survivor_horde.json");
    if (fs.existsSync(survivorPath)) {
      const survivorCard = JSON.parse(fs.readFileSync(survivorPath, "utf8"));
      const survivorReasons = validateCardAgainstV2Schema(survivorCard, survivorPath, false);
      const singleReport = {
        schemaVersion: "loreweaver.gameplay-card-validate.v1",
        status: survivorReasons.length === 0 ? "passed" : "failed",
        cardPath: "minigame_master/gameplay/cards/survivor_horde.json",
        reasons: survivorReasons,
        productionExportAllowed: survivorCard.status === "production_ready" && survivorCard.exportPolicy?.productionReady === true && survivorReasons.length === 0,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(latestSinglePath, `${JSON.stringify(singleReport, null, 2)}\n`);
    }

    console.log(JSON.stringify(report, null, 2));
    if (totalFailed > 0) process.exit(1);
    return;
  }

  const resolved = findCard(arg);
  if (!resolved) {
    console.error("No gameplay card found to validate");
    process.exit(1);
  }

  const card = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const reasons = validateCardAgainstV2Schema(card, resolved, false);

  const report = {
    schemaVersion: "loreweaver.gameplay-card-validate.v1",
    status: reasons.length === 0 ? "passed" : "failed",
    cardPath: path.relative(LORE_ROOT, resolved).split(path.sep).join("/"),
    reasons,
    productionExportAllowed: card.status === "production_ready" && card.exportPolicy?.productionReady === true && reasons.length === 0,
    createdAt: new Date().toISOString()
  };

  const outPath = path.join(REPORTS_DIR, "gameplay_card_validate_latest.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") process.exit(1);
}

main();
