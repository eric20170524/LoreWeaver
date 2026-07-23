#!/usr/bin/env node
/**
 * Apply a Level Recipe onto a workspace node JSON.
 *
 * Usage:
 *   node productize/jobs/apply-level-recipe.mjs \
 *     --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
 *     --workspace 20260611-060754-719406 \
 *     --node 1
 *   node productize/jobs/apply-level-recipe.mjs --list
 *   node productize/jobs/apply-level-recipe.mjs --dry-run ...
 *
 * Compiles the recipe first (must pass). Writes node gameplay + optional theme title/intro.
 * On write, marks dependent production gate reports stale (fail-closed until re-run).
 */

import {
  applyLevelRecipe,
  listBundledRecipes,
  LORE_ROOT
} from "../lib/apply-level-recipe-core.mjs";

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function main() {
  if (process.argv.includes("--list")) {
    const recipes = listBundledRecipes(LORE_ROOT);
    console.log(JSON.stringify({ recipes }, null, 2));
    return;
  }

  const recipeRel =
    arg("--recipe") ||
    "minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.fixture.json";
  const workspaceId = arg("--workspace") || "20260611-060754-719406";
  const nodeId = arg("--node") || "1";
  const dryRun = process.argv.includes("--dry-run");
  const noStale = process.argv.includes("--no-stale");

  const result = applyLevelRecipe({
    recipePath: recipeRel,
    workspaceId,
    nodeId,
    dryRun,
    markStale: !noStale
  });

  if (result.ok === false || result.status === "failed") {
    if (result.compileStdout) console.error(result.compileStdout);
    if (result.compileStderr) console.error(result.compileStderr);
    console.error(JSON.stringify(result, null, 2));
    console.error("[FAIL] recipe apply refused");
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
  console.log(dryRun ? "[dry-run] no write" : `[ok] wrote ${result.nodePath}`);
}

main();
