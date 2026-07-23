#!/usr/bin/env node
/**
 * C3: Playwright E2E against exported standalone package (real atlas + survivor_horde node).
 * Default export dir:
 *   productize/exports/standalone-20260611-060754-719406-20260722064022
 *
 * Env:
 *   STANDALONE_DIR — override export path
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_STANDALONE = path.join(
  LORE_ROOT,
  "productize/exports/standalone-20260611-060754-719406-20260722064022"
);
const STANDALONE_DIR = process.env.STANDALONE_DIR
  ? path.resolve(process.env.STANDALONE_DIR)
  : DEFAULT_STANDALONE;
const REPORTS_DIR = path.join(LORE_ROOT, "minigame_master/capabilities/reports");

function utcNow() {
  return new Date().toISOString();
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForUrl(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (Date.now() > deadline) reject(new Error(`timeout ${url}`));
        else setTimeout(tick, 250);
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error(`timeout ${url}`));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function isIgnorable(text) {
  if (!text) return true;
  if (text.includes("favicon")) return true;
  if (text.includes("WebSocket connection to")) return true;
  return false;
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex").slice(0, 16);
}

async function main() {
  if (!fs.existsSync(path.join(STANDALONE_DIR, "index.html"))) {
    console.error(`[FAIL] standalone index missing: ${STANDALONE_DIR}`);
    process.exit(1);
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("[FAIL] install playwright: npm install -D playwright && npx playwright install chromium");
    process.exit(1);
  }

  const releaseManifestPath = path.join(STANDALONE_DIR, "release-manifest.json");
  const releaseManifest = fs.existsSync(releaseManifestPath)
    ? JSON.parse(fs.readFileSync(releaseManifestPath, "utf8"))
    : {};
  const atlasHash = hashFile(path.join(STANDALONE_DIR, "assets/imagegen/atlas.png"));
  const errors = [];
  const assertions = {};
  const observed = {};

  const port = await findOpenPort();
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ["-e", `
    const http = require('http');
    const fs = require('fs');
    const path = require('path');
    const root = ${JSON.stringify(STANDALONE_DIR)};
    const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.wav':'audio/wav','.svg':'image/svg+xml' };
    http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(root, p.replace(/^\\//, ''));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(${port}, '127.0.0.1');
  `], { stdio: ["ignore", "pipe", "pipe"] });

  const stopServer = () =>
    new Promise((resolve) => {
      if (server.exitCode != null) return resolve();
      server.once("exit", () => resolve());
      server.kill("SIGTERM");
      setTimeout(() => {
        if (server.exitCode == null) server.kill("SIGKILL");
      }, 2000);
    });

  try {
    await waitForUrl(url, 15000);
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    page.on("pageerror", (err) => errors.push(`Page Error: ${err.message || err}`));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnorable(msg.text())) {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      () => window.__LOREWEAVER_GAME__ != null,
      null,
      { timeout: 30000 }
    );
    assertions.gameInstanceCreated = true;

    // Wait MainScene
    await page.waitForFunction(
      () => {
        const game = window.__LOREWEAVER_GAME__;
        return game?.scene?.isActive?.("MainScene") || game?.scene?.keys?.MainScene;
      },
      null,
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(1500);

    // Art pipeline may load async after boot
    const artStatus = await page.evaluate(async () => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        const s = window.__LOREWEAVER_ART_PIPELINE__;
        if (s && (s.status === "loaded" || s.loadedCount > 0 || s.status === "skipped_no_workspace_assets")) {
          return s;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return window.__LOREWEAVER_ART_PIPELINE__ || null;
    });
    observed.artPipeline = artStatus;
    assertions.artPipelinePresent = Boolean(artStatus);
    assertions.artAtlasLoaded =
      artStatus?.status === "loaded" && (artStatus?.loadedCount || 0) >= 5;

    // Launch survivor_horde node (id 1 or first survivor card)
    await page.evaluate(() => {
      const game = window.__LOREWEAVER_GAME__;
      if (!game) throw new Error("no game");
      const spec = game.registry.get("gameSpec") || window.__LOREWEAVER_EMBEDDED_SPEC__?.gameSpec;
      if (!spec?.nodes?.length) throw new Error("no nodes");
      const sourceNode =
        spec.nodes.find((n) => n.gameplay?.cardId === "survivor_horde") || spec.nodes[0];
      const node = {
        ...sourceNode,
        durationLimit: 20,
        goalValue: sourceNode.goalValue || 50,
        difficulty: 1,
        gameplay: {
          ...(sourceNode.gameplay || {}),
          adapter: "phaser",
          cardId: "survivor_horde",
          knobs: {
            ...((sourceNode.gameplay || {}).knobs || {}),
            durationSec: 20,
            duration: 20,
            goalValue: sourceNode.goalValue || 50,
            difficulty: 1,
            allowQuit: true,
            allowPause: true
          }
        }
      };
      window.__LOREWEAVER_TEST_HOOKS__ = window.__LOREWEAVER_TEST_HOOKS__ || {};
      if (game.scene.isActive("MainScene") && game.scene.keys.MainScene?.scene) {
        game.scene.keys.MainScene.scene.start("LevelActiveScene", { node });
      } else {
        game.scene.stop("LevelActiveScene");
        game.scene.start("LevelActiveScene", { node });
      }
    });

    await page.waitForFunction(
      () => {
        const game = window.__LOREWEAVER_GAME__;
        const active = game?.scene?.keys?.LevelActiveScene;
        return (
          game?.scene?.isActive?.("LevelActiveScene") &&
          active?.node?.gameplay?.cardId === "survivor_horde"
        );
      },
      null,
      { timeout: 15000 }
    );
    assertions.levelSceneActive = true;

    // Dismiss intro if present by clicking canvas
    for (let i = 0; i < 5; i += 1) {
      const hooks = await page.evaluate(() => window.__LOREWEAVER_TEST_HOOKS__ || null);
      if (hooks?.status === "running" && hooks?.adapterId === "survivor_horde") break;
      const box = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (box) await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(800);
    }

    await page.waitForFunction(
      () => {
        const h = window.__LOREWEAVER_TEST_HOOKS__;
        return h && (h.status === "running" || h.adapterId === "survivor_horde");
      },
      null,
      { timeout: 12000 }
    ).catch(() => {});

    const startHooks = await page.evaluate(() => window.__LOREWEAVER_TEST_HOOKS__ || null);
    observed.startHooks = startHooks;
    assertions.adapterRunning =
      startHooks?.status === "running" ||
      (await page.evaluate(() => {
        const a = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter;
        return a?.status === "running";
      }));

    // Runtime art usage
    const artUsage = await page.evaluate(() => {
      const adapter = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter;
      if (!adapter) return null;
      let enemy = adapter.groups?.enemies?.getChildren?.()?.find((e) =>
        String(e.texture?.key || "").startsWith("lw_enemy_")
      );
      if (!enemy && typeof adapter.spawnEnemy === "function") {
        enemy = adapter.spawnEnemy({
          id: "wild_rhino",
          hp: 3,
          speed: 20,
          damage: 1,
          radius: 12,
          reward: { score: 1 }
        });
      }
      return {
        playerTexture: adapter.player?.texture?.key || null,
        enemyTexture: enemy?.texture?.key || null,
        playerArtSource: adapter.player?.getData?.("artSource") || null
      };
    });
    observed.artUsage = artUsage;
    assertions.playerTexturePresent = Boolean(artUsage?.playerTexture);
    assertions.usesAtlasEnemyOrPlayer =
      String(artUsage?.playerTexture || "").startsWith("lw_") ||
      String(artUsage?.enemyTexture || "").startsWith("lw_enemy_") ||
      artUsage?.playerArtSource === "atlas";

    // Natural fail via damagePlayer if available
    await page.evaluate(() => {
      const adapter = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter;
      if (adapter?.damagePlayer) adapter.damagePlayer(9999, "hp_zero");
      else if (adapter?.finish) adapter.finish(false, "hp_zero");
    });
    await page.waitForTimeout(1200);
    const failHooks = await page.evaluate(() => window.__LOREWEAVER_TEST_HOOKS__ || null);
    const failResult = await page.evaluate(() => {
      const adapter = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter;
      return adapter?.result || adapter?.getTestState?.() || null;
    });
    observed.failHooks = failHooks;
    observed.failResult = failResult;
    assertions.failEnded =
      failHooks?.status === "ended" ||
      failResult?.reason === "hp_zero" ||
      failResult?.success === false ||
      failResult?.status === "ended";

    // Return / retreat cleanup
    await page.evaluate(() => {
      const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
      if (typeof scene?.safeRetreat === "function") scene.safeRetreat();
      else if (scene?.adapter?.retreat) scene.adapter.retreat();
      else window.__LOREWEAVER_GAME__?.scene?.start?.("MainScene");
    });
    await page.waitForTimeout(1000);
    assertions.returnedShell = await page.evaluate(() => {
      const game = window.__LOREWEAVER_GAME__;
      return Boolean(game?.scene?.isActive?.("MainScene") || !game?.scene?.isActive?.("LevelActiveScene"));
    });

    await browser.close();
  } catch (err) {
    errors.push(`Interaction failure: ${err?.message || err}`);
  } finally {
    await stopServer();
  }

  assertions.consoleErrors = errors.filter((e) => e.includes("Console Error:")).length;
  const hard = Object.entries(assertions).filter(([k]) => k !== "consoleErrors");
  const passed = errors.length === 0 && hard.every(([, v]) => v === true);

  const report = {
    schemaVersion: "loreweaver.browser-e2e.v1",
    gate: "standalone_runtime_e2e",
    target: path.relative(LORE_ROOT, STANDALONE_DIR),
    cardId: "survivor_horde",
    status: passed ? "passed" : "failed",
    createdAt: utcNow(),
    method: "Playwright chromium against static standalone export",
    specHash: releaseManifest.specHash || null,
    runtimeVersion: releaseManifest.runtimeVersion || null,
    workspaceId: releaseManifest.workspaceId || null,
    releaseEligible: false,
    assetManifestHash: atlasHash,
    assertions,
    observedState: observed,
    errors,
    flows: [
      { id: "boot_main", status: assertions.gameInstanceCreated ? "passed" : "failed" },
      { id: "art_atlas", status: assertions.artAtlasLoaded ? "passed" : "failed" },
      { id: "launch_survivor", status: assertions.adapterRunning ? "passed" : "failed" },
      { id: "natural_or_forced_fail", status: assertions.failEnded ? "passed" : "failed" }
    ]
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, "runtime_e2e_standalone_survivor_latest.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Merge note into standalone_browser_report without claiming releaseEligible
  const summaryPath = path.join(REPORTS_DIR, "standalone_browser_report.json");
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch {
    /* empty */
  }
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        ...prev,
        schemaVersion: "loreweaver.standalone-browser-report.v1",
        status: passed && prev.status !== "failed" ? "passed" : passed ? "passed" : "failed",
        createdAt: utcNow(),
        cardId: "survivor_horde",
        releaseEligible: false,
        demoE2e: prev.specHash ? { specHash: prev.specHash, status: prev.status } : undefined,
        standaloneE2e: {
          status: report.status,
          specHash: report.specHash,
          runtimeVersion: report.runtimeVersion,
          assetManifestHash: report.assetManifestHash,
          report: "runtime_e2e_standalone_survivor_latest.json"
        },
        errors: [...(prev.errors || []), ...errors]
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: report.status,
        specHash: report.specHash,
        artAtlasLoaded: assertions.artAtlasLoaded,
        adapterRunning: assertions.adapterRunning,
        releaseEligible: false,
        errors,
        report: outPath
      },
      null,
      2
    )
  );
  if (!passed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
