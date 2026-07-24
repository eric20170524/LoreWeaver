#!/usr/bin/env node
/**
 * Batch-certify lightweight runtime_ready cards to production_ready.
 *
 *   node productize/jobs/certify-lightweight-batch.mjs
 *   node productize/jobs/certify-lightweight-batch.mjs --cards reaction_pick,energy_balance
 *   SOAK_SECONDS=60 node productize/jobs/certify-lightweight-batch.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLightweightCard,
  listLightweightCardIds,
  LIGHTWEIGHT_CARDS
} from "../lib/lightweight-cards.mjs";
import { evaluateProductionExportGate } from "../lib/production-export-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const CARDS_DIR = path.join(LORE_ROOT, "minigame_master/gameplay/cards");
const SOAK = process.env.SOAK_SECONDS || "90";

function argList() {
  const idx = process.argv.indexOf("--cards");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1].split(",").map((s) => s.trim()).filter(Boolean);
  }
  return listLightweightCardIds();
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}

function ensureFixtures(cardId, meta) {
  const dir = path.join(CARDS_DIR, "fixtures", cardId);
  fs.mkdirSync(dir, { recursive: true });
  const themeDefault = {
    schemaVersion: "1.0",
    themeId: `${cardId}_default`,
    locales: ["zh-CN", "en"],
    defaultLocale: "zh-CN",
    levelMeta: {
      title: meta.title,
      intro: meta.intro,
      objectiveText: {
        "zh-CN": "完成关卡目标",
        en: "Complete the objective"
      },
      controlHints: {
        "zh-CN": "按提示操作",
        en: "Follow on-screen hints"
      },
      hudLabels: {
        "zh-CN": "生命|进度|分数|状态",
        en: "HP|Progress|Score|Status"
      },
      victoryText: { "zh-CN": "胜利", en: "Victory" },
      failureText: { "zh-CN": "失败", en: "Defeat" },
      retreatText: { "zh-CN": "撤退", en: "Retreated" }
    },
    entities: {
      player: { "zh-CN": "玩家", en: "Player" },
      enemies: { mob: { "zh-CN": "目标", en: "Target" } },
      bosses: { boss: { "zh-CN": "首领", en: "Boss" } },
      pickups: { gem: { "zh-CN": "道具", en: "Item" } },
      skills: { act: { "zh-CN": "操作", en: "Action" } },
      statuses: { ok: { "zh-CN": "正常", en: "OK" } }
    },
    copyKeys: {}
  };
  const themeNeon = JSON.parse(JSON.stringify(themeDefault));
  themeNeon.themeId = `${cardId}_neon`;
  themeNeon.levelMeta.title = {
    "zh-CN": `${meta.title["zh-CN"]}·霓虹`,
    en: `${meta.title.en} Neon`
  };

  writeJson(path.join(dir, "theme_content_pack.fixture.json"), themeDefault);
  writeJson(path.join(dir, "theme_content_pack.neon.json"), themeNeon);

  const recipeBase = {
    schemaVersion: "1.0",
    recipeId: `${cardId}_default_production_v1`,
    cardId,
    status: "production_recipe",
    productionReady: true,
    requireProductionCard: true,
    modifiers: [],
    knobs: {
      ...(meta.knobs || {}),
      allowQuit: true,
      allowPause: true,
      artRuntimeMode: "prototype"
    },
    contentPackRef: `minigame_master/gameplay/cards/fixtures/${cardId}/theme_content_pack.fixture.json`,
    assetPackRef: {
      workspaceId: "20260611-060754-719406",
      imagegenManifest: "assets/imagegen/manifest.json",
      imagegenAtlas: "assets/imagegen/atlas.png"
    },
    audioPackRef: {
      workspaceId: "20260611-060754-719406",
      root: "assets/audio",
      cues: {
        bgm_main: "bgm/node1_battle.wav",
        sfx_hit: "sfx/hit.wav",
        sfx_win: "bgm/victory_sting.wav",
        sfx_lose: "bgm/defeat_sting.wav"
      }
    },
    balanceProfile: "normal_short",
    locale: "zh-CN",
    notes: [`Lightweight production recipe for ${cardId}`]
  };
  const recipeNeon = {
    ...recipeBase,
    recipeId: `${cardId}_neon_production_v1`,
    contentPackRef: `minigame_master/gameplay/cards/fixtures/${cardId}/theme_content_pack.neon.json`
  };
  writeJson(path.join(dir, "level_recipe.fixture.json"), recipeBase);
  writeJson(path.join(dir, "level_recipe.neon.json"), recipeNeon);
  return dir;
}

function promoteCard(cardId, meta) {
  const cardPath = path.join(CARDS_DIR, `${cardId}.json`);
  const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));
  card.status = "production_ready";
  card.exportPolicy = {
    productionReady: true,
    blockReason: null,
    conditionalWaivers: [
      "device_class_fps: headless soak proxy",
      "vlm_visual_overflow: deferred",
      "standalone_zip_host_e2e: lightweight shared demo browser gate"
    ]
  };
  if (!card.requiredAssets || !Array.isArray(card.requiredAssets.playerClips)) {
    card.requiredAssets = {
      playerClips: ["idle"],
      enemyKinds: ["mob"],
      environments: ["bg_default"],
      audioCues: ["bgm_main", "sfx_hit", "sfx_win", "sfx_lose"]
    };
  }
  if (!card.performanceBudget) {
    card.performanceBudget = {
      normalP95Fps: 55,
      bossP95Fps: 45,
      maxActiveEnemies: 20
    };
  }
  // merge knobs keys used by recipes
  card.knobs = card.knobs || {};
  for (const [k, v] of Object.entries(meta.knobs || {})) {
    if (!card.knobs[k]) {
      card.knobs[k] = {
        type: typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v,
        default: v,
        patchLevel: "L1",
        description: `Lightweight cert knob ${k}`
      };
    }
  }
  for (const k of ["allowQuit", "allowPause", "artRuntimeMode"]) {
    if (!card.knobs[k]) {
      card.knobs[k] = {
        type: k === "artRuntimeMode" ? "string" : "boolean",
        default: k === "artRuntimeMode" ? "prototype" : true,
        patchLevel: "L1",
        description: k
      };
    }
  }
  card.testScenarios = [
    ...(Array.isArray(card.testScenarios) ? card.testScenarios : []),
    { id: "lightweight_demo_e2e", tags: ["e2e", "demo", "gate"] }
  ];
  // de-dupe by id
  const seen = new Set();
  card.testScenarios = card.testScenarios.filter((s) => {
    if (!s?.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  card.certificationNotes = {
    status: "production_ready",
    certifiedAt: "2026-07-24",
    demo: "minigame_master/core/demo/lightweight",
    e2eScript: `npm run check:light-e2e -- --card ${cardId}`,
    visualSoakScript: `npm run check:light-soak -- --card ${cardId}`,
    batchScript: "npm run check:light-batch",
    fixtures: `minigame_master/gameplay/cards/fixtures/${cardId}/`,
    evidence: [
      `runtime_e2e_${cardId}_latest.json`,
      `standalone_browser_report_${cardId}.json`,
      `visual_audit_${cardId}_latest.json`,
      `performance_report_${cardId}_latest.json`
    ],
    residuals: [
      "true device-class FPS P95",
      "VLM overflow/HUD audit",
      "full standalone export host E2E matrix"
    ]
  };
  writeJson(cardPath, card);
  return card;
}

function runNode(script, env = {}) {
  const r = spawnSync(process.execPath, [script, ...env._args || []], {
    cwd: LORE_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env, _args: undefined },
    timeout: 600000
  });
  return r;
}

function main() {
  const cards = argList();
  const results = [];

  for (const cardId of cards) {
    const meta = getLightweightCard(cardId);
    if (!meta) {
      results.push({ cardId, status: "skipped", reason: "not in lightweight registry" });
      continue;
    }
    console.log(`\n======== certifying ${cardId} ========`);
    ensureFixtures(cardId, meta);

    // E2E release
    let r = runNode(path.join(LORE_ROOT, "productize/jobs/run-lightweight-e2e.mjs"), {
      RELEASE_ELIGIBLE: "1",
      CARD_ID: cardId,
      _args: ["--card", cardId]
    });
    if (r.status !== 0) {
      console.error(r.stdout?.slice(-2000));
      console.error(r.stderr?.slice(-1000));
      results.push({ cardId, status: "failed", step: "e2e", code: r.status });
      continue;
    }
    console.log(`[ok] e2e ${cardId}`);

    // soak release
    r = runNode(path.join(LORE_ROOT, "productize/jobs/run-lightweight-visual-soak.mjs"), {
      RELEASE_ELIGIBLE: "1",
      SOAK_SECONDS: SOAK,
      CARD_ID: cardId,
      _args: ["--card", cardId]
    });
    if (r.status !== 0) {
      console.error(r.stdout?.slice(-2000));
      console.error(r.stderr?.slice(-1000));
      results.push({ cardId, status: "failed", step: "soak", code: r.status });
      continue;
    }
    console.log(`[ok] soak ${cardId}`);

    // promote after evidence (so recipe requireProduction can pass after)
    const card = promoteCard(cardId, meta);

    // compile recipes
    for (const recipe of [
      `minigame_master/gameplay/cards/fixtures/${cardId}/level_recipe.fixture.json`,
      `minigame_master/gameplay/cards/fixtures/${cardId}/level_recipe.neon.json`
    ]) {
      const cr = spawnSync(
        process.execPath,
        [path.join(LORE_ROOT, "productize/jobs/compile-level-recipe.mjs"), recipe],
        { cwd: LORE_ROOT, encoding: "utf8" }
      );
      if (cr.status !== 0) {
        console.error(cr.stdout?.slice(-1500));
        results.push({ cardId, status: "failed", step: "recipe", recipe });
        continue;
      }
    }

    const gate = evaluateProductionExportGate({ card, reportsDir: REPORTS });
    writeJson(path.join(REPORTS, `light_gate_${cardId}_latest.json`), {
      schemaVersion: "loreweaver.light-gate-readiness.v1",
      status: gate.productionExportAllowed ? "passed" : "failed",
      cardId,
      productionReadyEligible: gate.productionExportAllowed,
      productionExportAllowed: gate.productionExportAllowed,
      reasons: gate.reasons,
      createdAt: new Date().toISOString()
    });

    // validate
    const vr = spawnSync(
      process.execPath,
      [
        path.join(LORE_ROOT, "productize/validate-gameplay-card.mjs"),
        path.join(CARDS_DIR, `${cardId}.json`)
      ],
      { cwd: LORE_ROOT, encoding: "utf8" }
    );
    const ok =
      vr.status === 0 && gate.productionExportAllowed === true;
    results.push({
      cardId,
      status: ok ? "passed" : "failed",
      productionExportAllowed: gate.productionExportAllowed,
      validateCode: vr.status,
      reasons: gate.reasons
    });
    console.log(
      ok
        ? `[PASS] ${cardId} production_ready`
        : `[FAIL] ${cardId} gate=${gate.productionExportAllowed} validate=${vr.status}`
    );
  }

  const summary = {
    schemaVersion: "loreweaver.lightweight-batch-cert.v1",
    createdAt: new Date().toISOString(),
    soakSeconds: Number(SOAK),
    results,
    passed: results.filter((r) => r.status === "passed").map((r) => r.cardId),
    failed: results.filter((r) => r.status !== "passed")
  };
  writeJson(path.join(REPORTS, "lightweight_batch_cert_latest.json"), summary);
  console.log("\n==== BATCH SUMMARY ====");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed.length) process.exit(1);
}

main();
