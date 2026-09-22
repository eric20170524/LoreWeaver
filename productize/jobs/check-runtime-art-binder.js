#!/usr/bin/env node
/**
 * RuntimeArtBinder Asset Contract & Fallback Policy Checker (Phase A1 runtime kernel)
 * - requiredAssets structure for all base cards
 * - survivor_horde golden fixture (releaseEligible must stay false until C7)
 * - prototype: procedural fallback allowed + artSource / degradations exposed
 * - production: missing critical art throws ArtAssetMissingError
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RuntimeArtBinder, {
  ArtAssetMissingError
} from "../../minigame_master/core/lib/graphics/RuntimeArtBinder.js";
import { createMockPhaser } from "../../minigame_master/core/lib/testing/MockPhaserScene.js";
import TestHooks from "../../minigame_master/core/lib/contracts/TestHooks.js";
import VFX from "../../minigame_master/core/lib/juice/VFX.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const CARDS_DIR = path.join(LORE_ROOT, "minigame_master", "gameplay", "cards");
const FIXTURE_PATH = path.join(CARDS_DIR, "fixtures", "survivor_horde", "golden_asset_fixture.json");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  return false;
}

function testCardContracts(binder) {
  const cardFiles = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  let validContractCount = 0;

  for (const f of cardFiles) {
    const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8"));
    const required = card.requiredAssets;
    const hasRequiredArrays =
      required &&
      Array.isArray(required.playerClips) &&
      Array.isArray(required.enemyKinds) &&
      Array.isArray(required.environments) &&
      Array.isArray(required.audioCues);

    if (!hasRequiredArrays) {
      console.error(`[FAIL] Card ${card.id} missing requiredAsset contract arrays`);
      continue;
    }

    const playerClip = required.playerClips[0] || "idle";
    const enemyKind = required.enemyKinds[0] || "mob";
    const playerRes = binder.resolve("player", { clip: playerClip });
    const enemyRes = binder.resolve("enemy", { enemyId: enemyKind });
    const hasValidKeyOrFallbackTrigger = playerRes !== undefined && enemyRes !== undefined;

    if (hasRequiredArrays && hasValidKeyOrFallbackTrigger) {
      validContractCount++;
    }
  }

  console.log(
    `RequiredAssets Contract Check: ${validContractCount}/${cardFiles.length} cards have valid requiredAssets declarations.`
  );
  return validContractCount === cardFiles.length;
}

function testGoldenFixture() {
  if (!fs.existsSync(FIXTURE_PATH)) {
    return fail(`Golden asset fixture missing at ${FIXTURE_PATH}`);
  }

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const prod = fixture.fallbackPolicy?.productionMode || {};
  const proto = fixture.fallbackPolicy?.prototypeMode || {};

  const validFixture =
    fixture.cardId === "survivor_horde" &&
    fixture.requiredAssets?.playerClips?.length >= 5 &&
    fixture.requiredAssets?.enemyKinds?.length >= 3 &&
    prod.allowProceduralFallback === false &&
    prod.releaseEligible === false &&
    prod.onMissingAsset === "throw_hard_error" &&
    proto.allowProceduralFallback === true;

  if (!validFixture) {
    return fail("survivor_horde golden asset fixture contract check failed");
  }
  console.log(`[PASS] survivor_horde golden asset fixture validated (${FIXTURE_PATH})`);
  console.log(`       production releaseEligible=${prod.releaseEligible}, allowProceduralFallback=${prod.allowProceduralFallback}`);
  return true;
}

function testPrototypeFallbackAndTelemetry() {
  const mock = createMockPhaser();
  const binder = new RuntimeArtBinder({ runtimeMode: "prototype" });
  binder.install(mock.scene, null);
  binder.clearDegradations();

  const sprite = binder.createSprite(mock.scene, "player", { x: 10, y: 20 });
  const artSource = sprite?.getData?.("artSource") || sprite?._data?.get?.("artSource");
  if (artSource !== "primitive" && artSource !== "fallback") {
    return fail(`prototype createSprite expected artSource primitive|fallback, got ${artSource}`);
  }

  const telemetry = binder.getArtTelemetry();
  if (telemetry.runtimeMode !== "prototype" || telemetry.allowProceduralFallback !== true) {
    return fail("prototype telemetry mode/flags incorrect");
  }
  if (!telemetry.degradationCount || telemetry.degradations.length < 1) {
    return fail("prototype missing art must record degradations");
  }

  const hooks = new TestHooks("__LW_ART_TEST_HOOKS__");
  binder.syncToTestHooks(hooks);
  const snap = hooks.snapshot();
  if (snap.artRuntimeMode !== "prototype" || snap.artDegradationCount < 1) {
    return fail("TestHooks did not receive art degradation telemetry");
  }
  if (snap.artSourceSummary !== "degraded") {
    return fail(`TestHooks artSourceSummary expected degraded, got ${snap.artSourceSummary}`);
  }

  // validateRequiredAssets soft-fails in prototype
  const validation = binder.validateRequiredAssets({
    playerClips: ["idle", "walk", "attack", "hurt", "death"],
    enemyKinds: ["mob", "elite", "boss"],
    environments: ["bg_default"]
  });
  if (validation.ok) {
    return fail("prototype validateRequiredAssets should report missing issues without atlas");
  }

  console.log("[PASS] prototype mode: procedural fallback + artSource + TestHooks degradations");
  return true;
}

function testProductionHardFail() {
  const mock = createMockPhaser();
  const binder = new RuntimeArtBinder({ runtimeMode: "production" });
  binder.install(mock.scene, null);
  binder.clearDegradations();

  if (binder.allowProceduralFallback !== false) {
    return fail("production mode must set allowProceduralFallback=false by default");
  }

  let threw = false;
  try {
    binder.createSprite(mock.scene, "player", { x: 0, y: 0 });
  } catch (err) {
    threw = err instanceof ArtAssetMissingError || err?.code === "ART_ASSET_MISSING";
    if (!threw) {
      return fail(`production createSprite threw unexpected error: ${err?.name || err}`);
    }
  }
  if (!threw) {
    return fail("production createSprite must throw ArtAssetMissingError when player atlas missing");
  }

  // apply golden fixture policy explicitly
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  binder.applyFallbackPolicy(fixture.fallbackPolicy);
  if (binder.allowProceduralFallback !== false) {
    return fail("applyFallbackPolicy(production) must keep allowProceduralFallback=false");
  }

  threw = false;
  try {
    binder.validateRequiredAssets(fixture.requiredAssets, {
      enemyIdMap: {
        mob: "wild_rhino",
        elite: "green_scaled_eagle",
        boss: "qiongqi_cub"
      }
    });
  } catch (err) {
    threw = err instanceof ArtAssetMissingError || err?.code === "ART_ASSET_MISSING";
  }
  if (!threw) {
    return fail("production validateRequiredAssets must throw when required assets missing");
  }

  // With a texture present, production createSprite succeeds as atlas
  mock.scene.textures.addCanvas("lw_runtime_player_idle");
  mock.scene.textures.addCanvas("player_idle");
  binder.clearDegradations();
  const okSprite = binder.createSprite(mock.scene, "player", { x: 1, y: 1 });
  const src = okSprite?.getData?.("artSource") || okSprite?._data?.get?.("artSource");
  if (src !== "atlas") {
    return fail(`production with texture should artSource=atlas, got ${src}`);
  }

  console.log("[PASS] production mode: missing critical art throws; present atlas uses artSource=atlas");
  return true;
}

function testProductionBackgroundHardFail() {
  const mock = createMockPhaser();
  const binder = new RuntimeArtBinder({ runtimeMode: "production" });
  binder.install(mock.scene, null);
  let threw = false;
  try {
    binder.createBackground(mock.scene, { width: 100, height: 100 });
  } catch (err) {
    threw = err instanceof ArtAssetMissingError || err?.code === "ART_ASSET_MISSING";
  }
  if (!threw) {
    return fail("production createBackground must throw when environment texture missing");
  }
  console.log("[PASS] production createBackground hard-fails without env atlas");
  return true;
}

function testManifestDrivenClipSets() {
  const mock = createMockPhaser();
  const binder = new RuntimeArtBinder();
  binder.scene = mock.scene;
  binder.manifest = {
    semanticPrefix: "bundle",
    clipSets: {
      player: {
        walk: {
          keys: Array.from({ length: 12 }, (_, i) => `player_walk_${i}`),
          fps: 24,
          loop: true
        }
      },
      vfx_void_slash: {
        loop: {
          keys: Array.from({ length: 10 }, (_, i) => `vfx_void_slash_loop_${i}`),
          fps: 15,
          loop: true
        },
        impact: {
          keys: ["vfx_void_slash_impact_0", "vfx_void_slash_impact_1"],
          fps: 18,
          loop: false
        }
      }
    }
  };

  for (const key of binder.manifest.clipSets.player.walk.keys) mock.scene.textures.addCanvas(key);
  for (const key of binder.manifest.clipSets.vfx_void_slash.loop.keys) mock.scene.textures.addCanvas(key);
  for (const key of binder.manifest.clipSets.vfx_void_slash.impact.keys) mock.scene.textures.addCanvas(key);

  const playerKeys = binder.resolveClipKeys("player", "walk");
  if (playerKeys.length !== 12) {
    return fail(`manifest clipSets must expose all 12 player frames, got ${playerKeys.length}`);
  }
  const fxKeys = binder.resolveClipKeys("vfx_void_slash", "loop");
  if (fxKeys.length !== 10) {
    return fail(`manifest clipSets must expose all 10 VFX frames, got ${fxKeys.length}`);
  }

  const walkSpec = binder.resolveClipSpec("player", "walk");
  const impactSpec = binder.resolveClipSpec("vfx_void_slash", "impact");
  if (walkSpec?.fps !== 24 || walkSpec?.loop !== true) {
    return fail("player walk clip timing was not read from manifest");
  }
  if (impactSpec?.fps !== 18 || impactSpec?.loop !== false) {
    return fail("VFX impact one-shot timing was not read from manifest");
  }

  let created = null;
  mock.scene.anims.create = (cfg) => {
    created = cfg;
    return cfg;
  };
  mock.scene.anims.exists = () => false;
  const sprite = mock.scene.add.sprite(0, 0);
  sprite.play = () => sprite;
  sprite.anims = { currentAnim: null, isPlaying: false };
  binder.playClip(sprite, "vfx_void_slash", "impact");
  if (!created || created.frameRate !== 18 || created.repeat !== 0) {
    return fail(`manifest one-shot timing expected fps=18 repeat=0, got ${JSON.stringify(created)}`);
  }

  const runtimeArt = binder.createContext(mock.scene);
  const effect = VFX.spriteClip(mock.scene, runtimeArt, "void_slash", 10, 20, { clip: "impact" });
  if (!effect || effect.getData?.("artSource") !== "atlas") {
    return fail("VFX.spriteClip should consume promoted atlas VFX before procedural fallback");
  }
  const expectedDuration = Math.ceil((2 / 18) * 1000);
  if (effect.getData?.("artClipDurationMs") !== expectedDuration) {
    return fail("one-shot VFX duration must derive from manifest keys/fps");
  }
  mock.tick(expectedDuration + 1);
  if (effect.active !== false) {
    return fail("one-shot atlas VFX must destroy itself after manifest-derived duration");
  }

  console.log("[PASS] manifest clipSets drive arbitrary frame counts, fps, loop, and generic VFX roles");
  return true;
}

function main() {
  console.log("Running RuntimeArtBinder Asset Contract & Fallback Policy Checker...");
  const mock = createMockPhaser();
  const binder = new RuntimeArtBinder();
  binder.install(mock.scene, null);

  const steps = [
    () => testCardContracts(binder),
    () => testGoldenFixture(),
    () => testPrototypeFallbackAndTelemetry(),
    () => testProductionHardFail(),
    () => testProductionBackgroundHardFail(),
    () => testManifestDrivenClipSets()
  ];

  for (const step of steps) {
    if (!step()) {
      process.exit(1);
    }
  }

  const binderStatus = binder.getStatus();
  const atlasLoaded = binderStatus.status === "loaded";
  console.log(
    `RuntimeArtBinder Status: ${binderStatus.status} (Workspace Atlas Loaded: ${atlasLoaded})`
  );
  console.log("All A1 runtime kernel checks passed.");
  process.exit(0);
}

main();
