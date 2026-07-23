#!/usr/bin/env node
/**
 * List Gameplay Card catalog with maturity filtering for orchestrators.
 *
 * Usage:
 *   node productize/jobs/list-gameplay-catalog.mjs
 *   node productize/jobs/list-gameplay-catalog.mjs --production-only
 *   node productize/jobs/list-gameplay-catalog.mjs --json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const CARDS_DIR = path.join(LORE_ROOT, "minigame_master/gameplay/cards");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");

function main() {
  const productionOnly = process.argv.includes("--production-only");
  const asJson = process.argv.includes("--json");

  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  const cards = files.map((f) => {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8"));
    return {
      id: card.id,
      title: card.title,
      category: card.category,
      status: card.status,
      productionReady: card.exportPolicy?.productionReady === true,
      experimental: card.status !== "production_ready",
      adapter: card.runtime?.adapter || null,
      inputs: card.inputs || [],
      fit: card.fit || null,
      knobs: Object.keys(card.knobs || {}),
      requiredAssets: card.requiredAssets || null,
      blockReason: card.exportPolicy?.blockReason || null
    };
  });

  const autoSelectable = cards.filter((c) => c.status === "production_ready" && c.productionReady);
  const experimental = cards.filter((c) => !(c.status === "production_ready" && c.productionReady));

  const filtered = productionOnly ? autoSelectable : cards;
  const catalog = {
    schemaVersion: "loreweaver.gameplay-catalog.v1",
    createdAt: new Date().toISOString(),
    policy: {
      autoSelectOnlyProductionReady: true,
      experimentalRequiresExplicitFlag: true,
      note: "Orchestrators must not auto-pick experimental cards without explicit user/agent flag."
    },
    totals: {
      all: cards.length,
      productionReady: autoSelectable.length,
      experimental: experimental.length
    },
    autoSelectable,
    experimental: productionOnly ? undefined : experimental,
    cards: filtered
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS, "gameplay_catalog_latest.json"),
    JSON.stringify(catalog, null, 2)
  );

  if (asJson) {
    console.log(JSON.stringify(catalog, null, 2));
  } else {
    console.log(`Gameplay catalog: ${catalog.totals.all} cards`);
    console.log(`  production_ready (auto-select): ${catalog.totals.productionReady}`);
    for (const c of autoSelectable) {
      console.log(`    ✓ ${c.id}  [${c.status}]  ${c.title}`);
    }
    console.log(`  experimental (explicit only): ${catalog.totals.experimental}`);
    if (!productionOnly) {
      for (const c of experimental.slice(0, 8)) {
        console.log(`    · ${c.id}  [${c.status}]`);
      }
      if (experimental.length > 8) console.log(`    … +${experimental.length - 8} more`);
    }
  }
}

main();
