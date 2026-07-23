#!/usr/bin/env node
/**
 * Compile / validate a Level Recipe against:
 *  - structural shape
 *  - Gameplay Card existence + maturity
 *  - Theme Content Pack file
 *  - asset/audio refs on disk (when workspace present)
 *
 * Usage:
 *   node productize/jobs/compile-level-recipe.mjs [recipePath]
 *   node productize/jobs/compile-level-recipe.mjs --all
 *
 * Env:
 *   REQUIRE_PRODUCTION_CARD=0  allow non-production cards
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateThemeContentPack } from "../../minigame_master/core/lib/utils/ThemeContentResolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const CARDS_DIR = path.join(LORE_ROOT, "minigame_master/gameplay/cards");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const DEFAULT_RECIPE = path.join(
  CARDS_DIR,
  "fixtures/survivor_horde/level_recipe.fixture.json"
);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function resolveRef(ref) {
  if (!ref) return null;
  if (typeof ref === "string") {
    return path.isAbsolute(ref) ? ref : path.join(LORE_ROOT, ref);
  }
  if (ref.path) {
    return path.isAbsolute(ref.path) ? ref.path : path.join(LORE_ROOT, ref.path);
  }
  return null;
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function loadCard(cardId) {
  const p = path.join(CARDS_DIR, `${cardId}.json`);
  if (!fs.existsSync(p)) return null;
  return { path: p, card: readJson(p) };
}

function compileRecipe(recipePath, opts = {}) {
  const reasons = [];
  const warnings = [];
  if (!fs.existsSync(recipePath)) {
    return {
      status: "failed",
      recipePath,
      reasons: [`recipe missing: ${recipePath}`]
    };
  }

  let recipe;
  try {
    recipe = readJson(recipePath);
  } catch (e) {
    return { status: "failed", recipePath, reasons: [`invalid json: ${e.message}`] };
  }

  for (const k of ["schemaVersion", "recipeId", "cardId", "knobs", "contentPackRef", "assetPackRef"]) {
    if (recipe[k] == null || recipe[k] === "") reasons.push(`missing required field: ${k}`);
  }
  if (recipe.schemaVersion && recipe.schemaVersion !== "1.0") {
    reasons.push(`schemaVersion must be 1.0, got ${recipe.schemaVersion}`);
  }

  const cardLoad = loadCard(recipe.cardId);
  if (!cardLoad) {
    reasons.push(`unknown cardId: ${recipe.cardId}`);
  }

  const requireProduction =
    opts.requireProductionCard != null
      ? Boolean(opts.requireProductionCard)
      : recipe.requireProductionCard != null
        ? Boolean(recipe.requireProductionCard)
        : recipe.status === "production_recipe" || recipe.productionReady === true;

  if (cardLoad) {
    const { card } = cardLoad;
    if (requireProduction) {
      if (card.status !== "production_ready" || card.exportPolicy?.productionReady !== true) {
        reasons.push(
          `card ${recipe.cardId} is not production_ready (status=${card.status}, productionReady=${card.exportPolicy?.productionReady})`
        );
      }
    } else if (card.status === "runtime_ready") {
      warnings.push(`card ${recipe.cardId} is runtime_ready only — experimental recipe`);
    }

    // knob keys must be known if card declares knobs
    const allowed = new Set(Object.keys(card.knobs || {}));
    // also allow common playability aliases
    for (const extra of [
      "durationSec",
      "duration",
      "goalValue",
      "difficulty",
      "artRuntimeMode",
      "allowQuit",
      "allowPause"
    ]) {
      allowed.add(extra);
    }
    for (const key of Object.keys(recipe.knobs || {})) {
      if (!allowed.has(key)) {
        warnings.push(`knob '${key}' not in card knobs schema (allowed experimental)`);
      }
    }

    // modifiers compatibility
    for (const mod of recipe.modifiers || []) {
      const modPath = path.join(CARDS_DIR, "modifiers", `${mod.id}.json`);
      if (!fs.existsSync(modPath)) {
        reasons.push(`modifier missing: ${mod.id}`);
        continue;
      }
      const modCard = readJson(modPath);
      const compat = modCard.compatibleBaseCards || [];
      if (compat.length && !compat.includes(recipe.cardId)) {
        reasons.push(`modifier ${mod.id} not compatible with base ${recipe.cardId}`);
      }
    }
  }

  // Content pack
  const contentPath = resolveRef(recipe.contentPackRef);
  let contentPack = null;
  let contentHash = null;
  if (!contentPath || !fs.existsSync(contentPath)) {
    reasons.push(`contentPackRef not found: ${recipe.contentPackRef}`);
  } else {
    contentPack = readJson(contentPath);
    contentHash = sha256File(contentPath);
    const v = validateThemeContentPack(contentPack);
    if (!v.valid) {
      reasons.push(...v.errors.map((e) => `contentPack: ${e}`));
    }
  }

  // Assets
  const asset = recipe.assetPackRef || {};
  const wsId = asset.workspaceId;
  const wsRoot = wsId ? path.join(LORE_ROOT, "data/workspaces", wsId) : null;
  let atlasHash = null;
  let manifestHash = null;
  if (wsRoot && fs.existsSync(wsRoot)) {
    const manRel = asset.imagegenManifest || "assets/imagegen/manifest.json";
    const atlasRel = asset.imagegenAtlas || "assets/imagegen/atlas.png";
    const manAbs = path.join(wsRoot, manRel);
    const atlasAbs = path.join(wsRoot, atlasRel);
    if (!fs.existsSync(manAbs)) reasons.push(`imagegen manifest missing: ${manAbs}`);
    else manifestHash = sha256File(manAbs);
    if (!fs.existsSync(atlasAbs)) reasons.push(`imagegen atlas missing: ${atlasAbs}`);
    else atlasHash = sha256File(atlasAbs);
  } else if (requireProduction) {
    reasons.push(`workspace not found for production recipe: ${wsId}`);
  } else {
    warnings.push(`workspace not found (non-production ok): ${wsId}`);
  }

  // Audio cues (optional soft)
  const audio = recipe.audioPackRef || {};
  const audioRoot = audio.workspaceId
    ? path.join(LORE_ROOT, "data/workspaces", audio.workspaceId, audio.root || "assets/audio")
    : null;
  const missingCues = [];
  if (audioRoot && fs.existsSync(audioRoot) && audio.cues) {
    for (const [cue, rel] of Object.entries(audio.cues)) {
      const p = path.join(audioRoot, rel);
      if (!fs.existsSync(p)) missingCues.push(`${cue}→${rel}`);
    }
  }
  if (missingCues.length) {
    if (requireProduction) reasons.push(`audio cues missing: ${missingCues.join(", ")}`);
    else warnings.push(`audio cues missing: ${missingCues.join(", ")}`);
  }

  const recipeHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        recipeId: recipe.recipeId,
        cardId: recipe.cardId,
        modifiers: recipe.modifiers || [],
        knobs: recipe.knobs || {},
        contentHash,
        atlasHash,
        manifestHash,
        balanceProfile: recipe.balanceProfile || null
      })
    )
    .digest("hex");

  const status = reasons.length ? "failed" : "passed";
  return {
    schemaVersion: "loreweaver.level-recipe-compile.v1",
    status,
    createdAt: new Date().toISOString(),
    recipePath: path.relative(LORE_ROOT, recipePath),
    recipeId: recipe.recipeId,
    cardId: recipe.cardId,
    cardStatus: cardLoad?.card?.status || null,
    requireProductionCard: Boolean(requireProduction),
    recipeHash,
    contentHash,
    atlasHash,
    manifestHash,
    contentThemeId: contentPack?.themeId || null,
    locale: recipe.locale || contentPack?.defaultLocale || null,
    balanceProfile: recipe.balanceProfile || null,
    modifiers: (recipe.modifiers || []).map((m) => m.id),
    knobs: recipe.knobs || {},
    reasons,
    warnings,
    resolved: {
      contentPackPath: contentPath ? path.relative(LORE_ROOT, contentPath) : null,
      workspaceId: wsId || null
    }
  };
}

function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const experimental = process.env.REQUIRE_PRODUCTION_CARD === "0";
  const recipes = all
    ? [
        DEFAULT_RECIPE,
        path.join(CARDS_DIR, "fixtures/survivor_horde/level_recipe.cyber_pulse.json")
      ].filter((p) => fs.existsSync(p))
    : [args.find((a) => !a.startsWith("--")) || DEFAULT_RECIPE];

  const results = recipes.map((p) =>
    compileRecipe(path.isAbsolute(p) ? p : path.join(LORE_ROOT, p), {
      requireProductionCard: experimental ? false : undefined
    })
  );

  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, "level_recipe_compile_latest.json");
  const summary = {
    schemaVersion: "loreweaver.level-recipe-compile-all.v1",
    status: results.every((r) => r.status === "passed") ? "passed" : "failed",
    createdAt: new Date().toISOString(),
    results
  };
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== "passed") process.exit(1);
}

main();
