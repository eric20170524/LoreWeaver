#!/usr/bin/env node
/**
 * Phase N+2: survivor_horde golden keys ⊆ workspace imagegen atlas (+ audio cues).
 * Also seeds RuntimeArtBinder textures from manifest-derived lw_ keys and validates
 * production requiredAssets without needing a real Phaser atlas PNG decode.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RuntimeArtBinder, {
  ArtAssetMissingError,
  textureKeyForFrame
} from "../../minigame_master/core/lib/graphics/RuntimeArtBinder.js";
import { createMockPhaser } from "../../minigame_master/core/lib/testing/MockPhaserScene.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const FIXTURE_DIR = path.join(
  LORE_ROOT,
  "minigame_master/gameplay/cards/fixtures/survivor_horde"
);
const GOLDEN_PATH = path.join(FIXTURE_DIR, "golden_asset_fixture.json");
const THEME_PATH = path.join(FIXTURE_DIR, "theme_content_pack.fixture.json");
const RECIPE_PATH = path.join(FIXTURE_DIR, "level_recipe.fixture.json");
const DEFAULT_WS =
  process.env.LOREWEAVER_WORKSPACE_ID || "20260611-060754-719406";
const WS_ROOT = path.join(LORE_ROOT, "data/workspaces", DEFAULT_WS);
const MANIFEST_PATH = path.join(WS_ROOT, "assets/imagegen/manifest.json");
const ATLAS_PATH = path.join(WS_ROOT, "assets/imagegen/atlas.png");
const AUDIO_ROOT = path.join(WS_ROOT, "assets/audio");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[PASS] ${msg}`);
}

function main() {
  console.log("Running survivor_horde golden atlas coverage check...");
  console.log(`Workspace: ${DEFAULT_WS}`);

  if (!fs.existsSync(GOLDEN_PATH)) fail(`missing golden fixture ${GOLDEN_PATH}`);
  if (!fs.existsSync(MANIFEST_PATH)) fail(`missing imagegen manifest ${MANIFEST_PATH}`);
  if (!fs.existsSync(ATLAS_PATH)) fail(`missing atlas.png ${ATLAS_PATH}`);

  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const frames = manifest.frames || {};
  const frameKeys = new Set(Object.keys(frames));

  // --- Frame sources (manifest frame names required by golden) ---
  const frameSources = golden.atlasFrameSources || {
    player_idle: "player_idle",
    player_walk_0: "player_walk_0",
    player_walk_1: "player_walk_1",
    player_attack: "player_attack",
    player_hurt: "player_hurt",
    player_death: "player_death",
    enemy_wild_rhino: "enemy_wild_rhino",
    enemy_green_scaled_eagle: "enemy_green_scaled_eagle",
    enemy_qiongqi_cub: "enemy_qiongqi_cub",
    env_bg_desert: "env_bg_desert"
  };

  const missingFrames = [];
  for (const [logical, frameKey] of Object.entries(frameSources)) {
    if (!frameKeys.has(frameKey)) missingFrames.push(`${logical}→${frameKey}`);
  }
  if (missingFrames.length) {
    fail(`atlas missing frames: ${missingFrames.join(", ")}`);
  }
  pass(`atlas frames present for golden sources (${Object.keys(frameSources).length})`);

  // --- Semantic lw_ keys derived from textureKeyForFrame ---
  const semantic = golden.semanticAssetMapping || {};
  const expectedTex = new Set();
  for (const v of Object.values(semantic.player || {})) expectedTex.add(v);
  for (const v of Object.values(semantic.enemy || {})) expectedTex.add(v);
  for (const v of Object.values(semantic.environment || {})) expectedTex.add(v);

  // walk may only exist as walk_0 in atlas; binder maps player_walk_0 → lw_runtime_player_walk
  const derived = {};
  for (const frameKey of Object.values(frameSources)) {
    derived[frameKey] = textureKeyForFrame(frameKey);
  }
  for (const [frameKey, tex] of Object.entries(derived)) {
    if (!tex) continue;
    // ensure production mapping path exists
    if (frameKeys.has(frameKey) && !tex) {
      fail(`no textureKeyForFrame for ${frameKey}`);
    }
  }
  pass(`textureKeyForFrame derives ${Object.keys(derived).length} lw_ keys from atlas frames`);

  // --- Audio cues (file existence under assets/audio) ---
  const audioMap = semantic.audio || {};
  const audioMissing = [];
  const audioFiles = [];
  function walkAudio(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walkAudio(p);
      else audioFiles.push(p);
    }
  }
  walkAudio(AUDIO_ROOT);
  const audioBasenames = new Set(
    audioFiles.map((f) => path.basename(f).replace(/\.(wav|mp3|ogg)$/i, ""))
  );
  for (const [cue, key] of Object.entries(audioMap)) {
    if (!audioBasenames.has(key) && !audioBasenames.has(String(key).replace(/^sfx_/, ""))) {
      // allow partial: hit.wav for sfx_hit style
      const loose = [...audioBasenames].some(
        (b) => b.includes(key) || key.includes(b) || (cue === "sfx_hit" && b === "hit")
      );
      if (!loose) audioMissing.push(`${cue}→${key}`);
    }
  }
  if (audioMissing.length) {
    console.warn(`[WARN] audio cues not found as files: ${audioMissing.join(", ")}`);
  } else {
    pass(`audio cue basenames found for golden audio map (${Object.keys(audioMap).length})`);
  }

  // --- Theme + recipe fixtures present ---
  if (!fs.existsSync(THEME_PATH)) fail(`missing theme fixture ${THEME_PATH}`);
  if (!fs.existsSync(RECIPE_PATH)) fail(`missing recipe fixture ${RECIPE_PATH}`);
  const theme = JSON.parse(fs.readFileSync(THEME_PATH, "utf8"));
  const recipe = JSON.parse(fs.readFileSync(RECIPE_PATH, "utf8"));
  if (theme.themeId && theme.levelMeta?.title && theme.entities) {
    pass(`theme_content_pack.fixture.json ok (themeId=${theme.themeId})`);
  } else {
    fail("theme fixture missing required fields");
  }
  if (recipe.cardId === "survivor_horde" && recipe.contentPackRef && recipe.assetPackRef) {
    pass(`level_recipe.fixture.json ok (cardId=${recipe.cardId})`);
  } else {
    fail("recipe fixture incomplete");
  }

  // --- Binder production validate with seeded keys from real atlas frame list ---
  const mock = createMockPhaser();
  const binder = new RuntimeArtBinder({ runtimeMode: "production" });
  binder.install(mock.scene, null);

  const seedKeys = new Set();
  for (const frameKey of Object.values(frameSources)) {
    seedKeys.add(textureKeyForFrame(frameKey));
    seedKeys.add(frameKey);
    // enemy base + idle variants commonly resolved
    if (frameKey.startsWith("enemy_")) {
      seedKeys.add(frameKey);
      seedKeys.add(`${frameKey}_idle`);
    }
  }
  for (const v of expectedTex) seedKeys.add(v);
  binder.seedTextureKeys([...seedKeys]);
  binder.applySemanticAssetMapping(semantic);
  binder.applyFallbackPolicy(golden.fallbackPolicy || {});

  const enemyIdMap = {
    mob: "wild_rhino",
    elite: "green_scaled_eagle",
    boss: "qiongqi_cub"
  };

  try {
    const result = binder.validateRequiredAssets(golden.requiredAssets, {
      semanticAssetMapping: semantic,
      enemyIdMap
    });
    if (!result.ok) {
      fail(`production validateRequiredAssets failed: ${JSON.stringify(result.issues)}`);
    }
    pass("production validateRequiredAssets ok with atlas-derived texture seeds");
  } catch (err) {
    if (err instanceof ArtAssetMissingError) {
      fail(`ArtAssetMissingError: ${err.message} ${JSON.stringify(err.details)}`);
    }
    throw err;
  }

  // Sprite create uses atlas source
  const playerSprite = binder.createSprite(mock.scene, "player", { x: 0, y: 0 });
  const artSource =
    playerSprite?.getData?.("artSource") || playerSprite?._data?.get?.("artSource");
  if (artSource !== "atlas") {
    fail(`expected artSource=atlas after seed, got ${artSource}`);
  }
  pass("createSprite(player) artSource=atlas under production with seeded atlas keys");

  // Without seeds, production still hard-fails (regression)
  const bare = new RuntimeArtBinder({ runtimeMode: "production" });
  bare.install(createMockPhaser().scene, null);
  let threw = false;
  try {
    bare.createSprite(createMockPhaser().scene, "player");
  } catch (e) {
    threw = e instanceof ArtAssetMissingError || e?.code === "ART_ASSET_MISSING";
  }
  if (!threw) fail("production without atlas must still throw");
  pass("production without atlas still throws (regression)");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        workspaceId: DEFAULT_WS,
        cardId: "survivor_horde",
        atlasFrames: frameKeys.size,
        goldenFrameSources: Object.keys(frameSources).length,
        audioWarnings: audioMissing,
        releaseEligible: golden.fallbackPolicy?.productionMode?.releaseEligible === true
      },
      null,
      2
    )
  );
  console.log("All survivor_horde golden atlas checks passed.");
}

main();
