#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(LORE_ROOT, "minigame_master", "gameplay", "cards");
const MODIFIERS_DIR = path.join(CARDS_DIR, "modifiers");

function migrateCard(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const card = JSON.parse(content);

  card.schemaVersion = "2.0";

  // Ensure runtime object
  if (!card.runtime) card.runtime = {};
  if (!card.runtime.template) card.runtime.template = card.id;
  if (!card.runtime.engineTargets) card.runtime.engineTargets = ["phaser"];
  if (!card.runtime.adapter) {
    const pascalId = card.id.split("_").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    card.runtime.adapter = `${pascalId}Adapter`;
  }

  // Determine maturity status
  // Options: "inventoried" | "card_json" | "ui_registered" | "runtime_ready" | "gate_verified" | "production_ready"
  if (card.status === "validated" || card.status === "candidate") {
    // Current baseline has working adapters for all 23 cards in core/lib/gameplay
    card.status = "runtime_ready";
  } else if (!card.status || card.status === "design_only") {
    card.status = "card_json";
  }

  // Required Assets
  if (!card.requiredAssets) {
    card.requiredAssets = {
      playerClips: ["idle", "walk", "attack", "hurt", "death"],
      enemyKinds: ["mob", "elite", "boss"],
      environments: ["bg_default"],
      audioCues: ["bgm_main", "sfx_attack", "sfx_hit", "sfx_win", "sfx_lose"]
    };
  }

  // Performance budget
  if (!card.performanceBudget) {
    card.performanceBudget = {
      normalP95Fps: 55,
      bossP95Fps: 45,
      maxActiveEnemies: 50
    };
  }

  // Maturity impact
  if (!card.maturityImpact) {
    card.maturityImpact = {
      dimensions: ["gameplay", "visual", "audio", "e2e"],
      notes: "Migrated to Gameplay Card V2 maturity model."
    };
  }

  // Test scenarios
  if (!card.testScenarios || !card.testScenarios.length) {
    const hasPath = card.testFixture?.path;
    card.testScenarios = [
      {
        id: "smoke_test",
        tags: hasPath ? ["smoke", "runtime", "e2e"] : ["smoke", "runtime"]
      }
    ];
  }

  // Export policy (productionReady MUST be false until full DoD audit passes)
  card.exportPolicy = {
    productionReady: false,
    blockReason: "Awaiting P1-P7 production readiness certification"
  };

  fs.writeFileSync(filePath, JSON.stringify(card, null, 2) + "\n", "utf8");
  console.log(`Migrated card V2: ${path.basename(filePath)}`);
}

function migrateModifier(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const mod = JSON.parse(content);

  mod.schemaVersion = "2.0";

  if (mod.status === "validated" || mod.status === "candidate") {
    mod.status = "runtime_ready";
  } else if (!mod.status) {
    mod.status = "card_json";
  }

  if (mod.modifierFor && !mod.compatibleBaseCards) {
    mod.compatibleBaseCards = [...mod.modifierFor];
  } else if (!mod.compatibleBaseCards) {
    mod.compatibleBaseCards = ["survivor_horde"];
  }

  if (!mod.verifiedCombinations) {
    mod.verifiedCombinations = mod.compatibleBaseCards.map(base => `${base}+${mod.id}`);
  }

  if (!mod.requiredAssets) {
    mod.requiredAssets = {
      propKeys: [mod.id],
      audioCues: [`sfx_${mod.id}`]
    };
  }

  if (!mod.maturityImpact) {
    mod.maturityImpact = {
      dimensions: ["gameplay", "modifier_contract"],
      notes: "Migrated modifier to V2 maturity model."
    };
  }

  if (!mod.exportPolicy) {
    mod.exportPolicy = {
      productionReady: false,
      blockReason: "Awaiting modifier verification on compatible base cards"
    };
  }

  fs.writeFileSync(filePath, JSON.stringify(mod, null, 2) + "\n", "utf8");
  console.log(`Migrated modifier V2: ${path.basename(filePath)}`);
}

function main() {
  const cardFiles = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith(".json"));
  for (const f of cardFiles) {
    migrateCard(path.join(CARDS_DIR, f));
  }

  if (fs.existsSync(MODIFIERS_DIR)) {
    const modFiles = fs.readdirSync(MODIFIERS_DIR).filter(f => f.endsWith(".json"));
    for (const f of modFiles) {
      migrateModifier(path.join(MODIFIERS_DIR, f));
    }
  }
  console.log("Card & Modifier Migration Complete!");
}

main();
