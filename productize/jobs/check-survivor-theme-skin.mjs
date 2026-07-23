#!/usr/bin/env node
/**
 * Prove theme content packs drive survivor_horde demo copy without code changes.
 * Loads demo twice with ?theme=wasteland and ?theme=cyber and asserts different titles.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const DEMO_ROOT = path.join(LORE_ROOT, "minigame_master/core/demo/survivor_horde");
const VITE_CONFIG = path.join(DEMO_ROOT, "vite.config.mjs");
const VITE_BIN = path.join(LORE_ROOT, "node_modules/.bin/vite");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function waitForUrl(url, timeoutMs = 25000) {
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

async function main() {
  if (!fs.existsSync(VITE_BIN)) {
    console.error("[FAIL] vite missing");
    process.exit(1);
  }
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("[FAIL] playwright missing");
    process.exit(1);
  }

  const port = await findOpenPort();
  const base = `http://127.0.0.1:${port}/`;
  const vite = spawn(
    VITE_BIN,
    ["--config", VITE_CONFIG, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: LORE_ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  const stop = () =>
    new Promise((resolve) => {
      if (vite.exitCode != null) return resolve();
      vite.once("exit", () => resolve());
      vite.kill("SIGTERM");
      setTimeout(() => {
        if (vite.exitCode == null) vite.kill("SIGKILL");
      }, 2000);
    });

  const errors = [];
  const observed = {};
  try {
    await waitForUrl(base);
    const browser = await playwright.chromium.launch({ headless: true });

    async function probe(theme) {
      const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
      page.on("pageerror", (e) => errors.push(`${theme}: ${e.message}`));
      await page.goto(`${base}?theme=${theme}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });
      await page.waitForFunction(() => window.__LW_THEME__ && window.__LW_SURVIVOR_DEMO_META__, null, {
        timeout: 10000
      });
      const meta = await page.evaluate(() => ({
        theme: window.__LW_THEME__
          ? {
              themeKey: window.__LW_THEME__.themeKey,
              themeId: window.__LW_THEME__.themeId,
              title: window.__LW_THEME__.getText("level.title"),
              victory: window.__LW_THEME__.getText("level.victory"),
              failure: window.__LW_THEME__.getText("level.failure"),
              retreat: window.__LW_THEME__.getText("level.retreat"),
              hud: window.__LW_THEME__.hudParts()
            }
          : null,
        demoMeta: window.__LW_SURVIVOR_DEMO_META__ || null,
        state: (() => {
          try {
            return JSON.parse(document.querySelector('[data-testid="test-state"]')?.textContent || "{}");
          } catch {
            return {};
          }
        })()
      }));
      await page.locator('[data-testid="start-run"]').click();
      await page.waitForFunction(() => {
        try {
          const s = JSON.parse(document.querySelector('[data-testid="test-state"]')?.textContent || "{}");
          return s.mode === "run";
        } catch {
          return false;
        }
      }, null, { timeout: 10000 });
      const runState = await page.evaluate(() => {
        try {
          return JSON.parse(document.querySelector('[data-testid="test-state"]')?.textContent || "{}");
        } catch {
          return {};
        }
      });
      await page.close();
      return { ...meta, runState };
    }

    const wasteland = await probe("wasteland");
    const cyber = await probe("cyber");
    observed.wasteland = wasteland;
    observed.cyber = cyber;

    await browser.close();

    const assertions = {
      wastelandThemeId: wasteland.theme?.themeId === "survivor_horde_golden_demo",
      cyberThemeId: cyber.theme?.themeId === "survivor_horde_cyber_pulse",
      titlesDiffer: wasteland.theme?.title !== cyber.theme?.title,
      wastelandTitleZh: String(wasteland.theme?.title || "").includes("荒域"),
      cyberTitleZh: String(cyber.theme?.title || "").includes("霓虹"),
      victoryDiffers: wasteland.theme?.victory !== cyber.theme?.victory,
      hudHpDiffers: wasteland.theme?.hud?.hp !== cyber.theme?.hud?.hp,
      stateTitleMatchesMeta:
        wasteland.state?.title === wasteland.theme?.title &&
        cyber.state?.title === cyber.theme?.title,
      noPageErrors: errors.length === 0
    };

    const passed = Object.values(assertions).every(Boolean);
    const report = {
      schemaVersion: "loreweaver.theme-skin-check.v1",
      cardId: "survivor_horde",
      status: passed ? "passed" : "failed",
      createdAt: new Date().toISOString(),
      releaseEligible: false,
      assertions,
      observed,
      errors,
      notes: [
        "Swap packs with ?theme=wasteland | ?theme=cyber — no adapter code change.",
        "Does not grant production_ready by itself."
      ]
    };
    fs.mkdirSync(REPORTS, { recursive: true });
    const out = path.join(REPORTS, "survivor_theme_skin_latest.json");
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, assertions, errors, report: out }, null, 2));
    if (!passed) process.exit(1);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await stop();
  }
}

main();
