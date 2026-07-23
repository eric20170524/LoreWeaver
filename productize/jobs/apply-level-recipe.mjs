#!/usr/bin/env node
/**
 * Apply a Level Recipe onto a workspace node JSON.
 *
 * Usage:
 *   node productize/jobs/apply-level-recipe.mjs \
 *     --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
 *     --workspace 20260611-060754-719406 \
 *     --node 1
 *
 * Compiles the recipe first (must pass). Writes node gameplay + optional theme title/intro.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function findNodeFile(nodesDir, nodeId) {
  const want = String(nodeId);
  for (const f of fs.readdirSync(nodesDir)) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(nodesDir, f);
    const n = readJson(p);
    if (String(n.id) === want) return { path: p, node: n };
  }
  return null;
}

function main() {
  const recipeRel =
    arg("--recipe") ||
    "minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.fixture.json";
  const workspaceId = arg("--workspace") || "20260611-060754-719406";
  const nodeId = arg("--node") || "1";
  const dryRun = process.argv.includes("--dry-run");

  const recipePath = path.isAbsolute(recipeRel)
    ? recipeRel
    : path.join(LORE_ROOT, recipeRel);

  // Compile first
  const compile = spawnSync(
    process.execPath,
    [path.join(LORE_ROOT, "productize/jobs/compile-level-recipe.mjs"), recipePath],
    { encoding: "utf8", cwd: LORE_ROOT }
  );
  if (compile.status !== 0) {
    console.error(compile.stdout || compile.stderr);
    console.error("[FAIL] recipe compile failed; refuse apply");
    process.exit(1);
  }

  const recipe = readJson(recipePath);
  const nodesDir = path.join(
    LORE_ROOT,
    "data/workspaces",
    workspaceId,
    "loreweaver/nodes"
  );
  if (!fs.existsSync(nodesDir)) {
    console.error(`[FAIL] nodes dir missing: ${nodesDir}`);
    process.exit(1);
  }

  const found = findNodeFile(nodesDir, nodeId);
  if (!found) {
    console.error(`[FAIL] node id ${nodeId} not found in ${nodesDir}`);
    process.exit(1);
  }

  const contentPath =
    typeof recipe.contentPackRef === "string"
      ? path.join(LORE_ROOT, recipe.contentPackRef)
      : path.join(LORE_ROOT, recipe.contentPackRef.path);
  const content = fs.existsSync(contentPath) ? readJson(contentPath) : null;
  const locale = recipe.locale || content?.defaultLocale || "zh-CN";

  const pickLoc = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    return obj[locale] || obj[content?.defaultLocale] || Object.values(obj)[0] || null;
  };

  const before = structuredClone(found.node);
  const node = found.node;
  node.mechanics = recipe.cardId;
  node.gameplay = {
    ...(node.gameplay || {}),
    adapter: "phaser",
    cardId: recipe.cardId,
    modifiers: recipe.modifiers || [],
    knobs: {
      ...((node.gameplay && node.gameplay.knobs) || {}),
      ...(recipe.knobs || {}),
      recipeId: recipe.recipeId,
      balanceProfile: recipe.balanceProfile || null
    },
    patchLevel: "L2"
  };

  if (content?.levelMeta) {
    const title = pickLoc(content.levelMeta.title);
    const intro = pickLoc(content.levelMeta.intro);
    if (title) node.title = title;
    if (intro) node.intro = intro;
  }
  if (recipe.knobs?.durationSec) node.durationLimit = recipe.knobs.durationSec;
  if (recipe.knobs?.goalValue != null) node.goalValue = recipe.knobs.goalValue;
  if (recipe.knobs?.difficulty != null) node.difficulty = recipe.knobs.difficulty;

  const applied = {
    schemaVersion: "loreweaver.level-recipe-apply.v1",
    createdAt: new Date().toISOString(),
    dryRun,
    workspaceId,
    nodeId: String(nodeId),
    nodePath: path.relative(LORE_ROOT, found.path),
    recipeId: recipe.recipeId,
    cardId: recipe.cardId,
    contentThemeId: content?.themeId || null,
    before: {
      title: before.title,
      cardId: before.gameplay?.cardId || null,
      durationLimit: before.durationLimit
    },
    after: {
      title: node.title,
      cardId: node.gameplay.cardId,
      durationLimit: node.durationLimit,
      modifiers: (node.gameplay.modifiers || []).map((m) => m.id || m)
    },
    contentHash: crypto
      .createHash("sha256")
      .update(fs.readFileSync(contentPath))
      .digest("hex")
      .slice(0, 16)
  };

  if (!dryRun) {
    fs.writeFileSync(found.path, JSON.stringify(node, null, 2) + "\n");
  }

  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, "level_recipe_apply_latest.json");
  fs.writeFileSync(out, JSON.stringify(applied, null, 2));
  console.log(JSON.stringify(applied, null, 2));
  console.log(dryRun ? "[dry-run] no write" : `[ok] wrote ${found.path}`);
}

main();
