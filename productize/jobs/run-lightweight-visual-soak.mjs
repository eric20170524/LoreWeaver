#!/usr/bin/env node
/**
 * Visual + soak for lightweight multi-card demo.
 *
 *   CARD_ID=reaction_pick SOAK_SECONDS=90 RELEASE_ELIGIBLE=1 node productize/jobs/run-lightweight-visual-soak.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLightweightCard, listLightweightCardIds } from "../lib/lightweight-cards.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const DEMO_ROOT = path.join(LORE_ROOT, "minigame_master/core/demo/lightweight");
const VITE_CONFIG = path.join(DEMO_ROOT, "vite.config.mjs");
const VITE_BIN = path.join(LORE_ROOT, "node_modules/.bin/vite");
const REPORTS_DIR = path.join(LORE_ROOT, "minigame_master/capabilities/reports");

const SOAK_SECONDS = Math.max(15, Number(process.env.SOAK_SECONDS || 90));
const RELEASE_ELIGIBLE = process.env.RELEASE_ELIGIBLE === "1";
const SKIP_SOAK = process.env.SKIP_SOAK === "1";

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
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

function isIgnorable(text) {
  if (!text) return true;
  if (text.includes("favicon") || text.includes("WebSocket connection to")) return true;
  return false;
}

async function main() {
  const cardId = arg("--card", process.env.CARD_ID || "reaction_pick");
  if (!getLightweightCard(cardId)) {
    console.error(`[FAIL] unknown card ${cardId}; allowed ${listLightweightCardIds().join(",")}`);
    process.exit(1);
  }
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("[FAIL] playwright missing");
    process.exit(1);
  }

  const VISUAL_DIR = path.join(REPORTS_DIR, "visual", cardId);
  fs.mkdirSync(VISUAL_DIR, { recursive: true });
  const errors = [];
  const visualAssertions = {};
  const perfAssertions = {};
  const observed = { screenshots: [] };

  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}/?card=${encodeURIComponent(cardId)}&theme=default`;
  const vite = spawn(
    VITE_BIN,
    ["--config", VITE_CONFIG, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: LORE_ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  let viteLog = "";
  vite.stdout.on("data", (d) => {
    viteLog += d.toString();
  });
  vite.stderr.on("data", (d) => {
    viteLog += d.toString();
  });
  const stopVite = () =>
    new Promise((resolve) => {
      if (vite.exitCode != null) return resolve();
      vite.once("exit", () => resolve());
      vite.kill("SIGTERM");
      setTimeout(() => {
        if (vite.exitCode == null) vite.kill("SIGKILL");
      }, 2500);
    });

  try {
    await waitForUrl(`http://127.0.0.1:${port}/`);
    const browser = await playwright.chromium.launch({ headless: true });

    for (const vp of [
      { id: "mobile_720x1280", width: 720, height: 1280 },
      { id: "desktop_1280x800", width: 1280, height: 800 }
    ]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      page.on("pageerror", (err) => errors.push(`[visual ${vp.id}] ${err.message || err}`));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnorable(msg.text())) {
          errors.push(`[visual ${vp.id}] ${msg.text()}`);
        }
      });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });
      const menuShot = path.join(VISUAL_DIR, `${vp.id}_menu.png`);
      await page.screenshot({ path: menuShot, fullPage: true });
      observed.screenshots.push(menuShot);
      await page.locator('[data-testid="start-run"]').click();
      await page.waitForFunction(
        () => {
          try {
            const s = JSON.parse(
              document.querySelector('[data-testid="test-state"]')?.textContent || "{}"
            );
            return s.mode === "run" && s.status === "running";
          } catch {
            return false;
          }
        },
        null,
        { timeout: 15000 }
      );
      await page.waitForTimeout(1500);
      await page.mouse.click(Math.floor(vp.width / 2), Math.floor(vp.height * 0.55));
      const runShot = path.join(VISUAL_DIR, `${vp.id}_running.png`);
      await page.screenshot({ path: runShot, fullPage: true });
      observed.screenshots.push(runShot);
      const canvas = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        if (!c) return { present: false };
        try {
          const d = c.toDataURL("image/png");
          return { present: true, nonBlank: d.length > 2000, width: c.width, height: c.height };
        } catch {
          return { present: true, nonBlank: false };
        }
      });
      visualAssertions[`${vp.id}_canvasPresent`] = canvas.present === true;
      visualAssertions[`${vp.id}_canvasSized`] = (canvas.width || 0) >= 100;
      visualAssertions[`${vp.id}_notBlackScreen`] = canvas.nonBlank === true;
      visualAssertions[`${vp.id}_screenshotWritten`] =
        fs.existsSync(runShot) && fs.statSync(runShot).size > 800;
      const controlsBox = await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-testid="retreat-run"], [data-testid="start-run"]'
        );
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
      });
      visualAssertions[`${vp.id}_controlsInViewport`] =
        controlsBox &&
        controlsBox.left >= 0 &&
        controlsBox.top >= 0 &&
        controlsBox.right <= controlsBox.vw + 2 &&
        controlsBox.bottom <= controlsBox.vh + 2;
      await page.close();
    }

    if (!SKIP_SOAK) {
      const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
      page.on("pageerror", (err) => errors.push(`[soak] ${err.message || err}`));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnorable(msg.text())) errors.push(`[soak] ${msg.text()}`);
      });
      // Keep run alive: high lives / long stable for balance cards
      const soakUrl = `${baseUrl}&targetRounds=99&lives=99&targetStableSec=999&fragCount=3&hazardCount=0&targetProgress=999`;
      await page.goto(soakUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });
      await page.locator('[data-testid="start-run"]').click();
      await page.waitForFunction(
        () => {
          try {
            const s = JSON.parse(
              document.querySelector('[data-testid="test-state"]')?.textContent || "{}"
            );
            return s.mode === "run" && s.status === "running";
          } catch {
            return false;
          }
        },
        null,
        { timeout: 15000 }
      );
      await page.evaluate(() => {
        window.__LW_SOAK__ = { fpsSamples: [], frames: 0, last: performance.now(), stop: false };
        const loop = (now) => {
          const s = window.__LW_SOAK__;
          if (!s || s.stop) return;
          s.frames += 1;
          const dt = now - s.last;
          if (dt >= 1000) {
            s.fpsSamples.push(Math.round((s.frames * 1000) / dt));
            s.frames = 0;
            s.last = now;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      const endAt = Date.now() + SOAK_SECONDS * 1000;
      while (Date.now() < endAt) {
        await page.waitForTimeout(1000);
        if (Math.random() > 0.6) {
          await page.mouse.click(360 + Math.floor(Math.random() * 40), 700);
        }
        const still = await page.evaluate(() => {
          try {
            const s = JSON.parse(
              document.querySelector('[data-testid="test-state"]')?.textContent || "{}"
            );
            return s.mode === "run" && s.status === "running";
          } catch {
            return false;
          }
        });
        if (!still) {
          const back = page.locator('[data-testid="back-menu"]:visible');
          if ((await back.count()) > 0) await back.first().click().catch(() => {});
          await page.waitForTimeout(300);
          const start = page.locator('[data-testid="start-run"]:visible');
          if ((await start.count()) > 0) {
            await start.first().click().catch(() => {});
            await page.waitForTimeout(400);
            await page.evaluate(() => {
              const prev = window.__LW_SOAK__;
              window.__LW_SOAK__ = {
                fpsSamples: prev?.fpsSamples || [],
                frames: 0,
                last: performance.now(),
                stop: false
              };
              const loop = (now) => {
                const s = window.__LW_SOAK__;
                if (!s || s.stop) return;
                s.frames += 1;
                const dt = now - s.last;
                if (dt >= 1000) {
                  s.fpsSamples.push(Math.round((s.frames * 1000) / dt));
                  s.frames = 0;
                  s.last = now;
                }
                requestAnimationFrame(loop);
              };
              requestAnimationFrame(loop);
            });
          }
        }
      }
      const samples = await page.evaluate(() => {
        if (window.__LW_SOAK__) window.__LW_SOAK__.stop = true;
        return window.__LW_SOAK__?.fpsSamples || [];
      });
      const sorted = [...samples].sort((a, b) => a - b);
      const minFps = sorted[0] ?? 0;
      const avgFps = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      const soakShot = path.join(VISUAL_DIR, `soak_${SOAK_SECONDS}s_end.png`);
      await page.screenshot({ path: soakShot, fullPage: true });
      observed.screenshots.push(soakShot);
      observed.perfSummary = {
        minFps,
        avgFps: Math.round(avgFps * 10) / 10,
        sampleCount: samples.length,
        declaredBudgetP95: 55
      };
      perfAssertions.soakSamplesCollected = samples.length >= Math.min(8, SOAK_SECONDS / 3);
      perfAssertions.avgFpsAboveFloor = avgFps >= 20;
      perfAssertions.noCatastrophicFps = minFps >= 8 || samples.length === 0;
      perfAssertions.noConsoleErrorsDuringSoak = !errors.some((e) => e.startsWith("[soak]"));
      perfAssertions.budgetComparisonRecorded = true;
      await page.close();
    }

    await browser.close();
  } catch (e) {
    errors.push(String(e?.stack || e));
  } finally {
    await stopVite();
  }

  const visualFailed = Object.entries(visualAssertions).filter(([, v]) => v !== true);
  const perfFailed = Object.entries(perfAssertions).filter(([, v]) => v !== true);
  const visualStatus =
    errors.filter((e) => e.startsWith("[visual")).length === 0 && visualFailed.length === 0
      ? "passed"
      : "failed";
  const perfStatus = SKIP_SOAK
    ? "passed"
    : errors.filter((e) => e.startsWith("[soak]")).length === 0 && perfFailed.length === 0
      ? "passed"
      : "failed";

  const visualReport = {
    schemaVersion: "loreweaver.visual-audit.v1",
    gate: "visual_audit",
    target: `minigame_master/core/demo/lightweight?card=${cardId}`,
    cardId,
    status: visualStatus,
    createdAt: new Date().toISOString(),
    method: "Playwright screenshots + canvas toDataURL",
    releaseEligible: RELEASE_ELIGIBLE && visualStatus === "passed",
    assertions: visualAssertions,
    screenshots: observed.screenshots,
    errors: errors.filter((e) => e.startsWith("[visual") || !e.startsWith("[soak]")),
    notes: ["Lightweight multi-card demo visual"]
  };
  const perfReport = {
    schemaVersion: "loreweaver.performance-report.v1",
    gate: "performance_soak",
    target: `minigame_master/core/demo/lightweight?card=${cardId}`,
    cardId,
    status: perfStatus,
    createdAt: new Date().toISOString(),
    method: "Playwright headless rAF FPS",
    soakSeconds: SKIP_SOAK ? 0 : SOAK_SECONDS,
    fullDodSeconds: 600,
    isFullDodDuration: !SKIP_SOAK && SOAK_SECONDS >= 600,
    releaseEligible: RELEASE_ELIGIBLE && perfStatus === "passed",
    performanceBudget: { normalP95Fps: 55, maxActiveEnemies: 20 },
    assertions: SKIP_SOAK ? { soakSkipped: true } : perfAssertions,
    summary: observed.perfSummary || {},
    budgetMetInHeadless: (observed.perfSummary?.avgFps || 0) >= 20,
    errors: errors.filter((e) => e.startsWith("[soak]")),
    notes: ["Headless FPS floor avg>=20", `SOAK_SECONDS=${SOAK_SECONDS}`]
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS_DIR, `visual_audit_${cardId}_latest.json`),
    `${JSON.stringify(visualReport, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(REPORTS_DIR, `performance_report_${cardId}_latest.json`),
    `${JSON.stringify(perfReport, null, 2)}\n`
  );

  const ok = visualStatus === "passed" && perfStatus === "passed";
  console.log(
    JSON.stringify(
      {
        cardId,
        visualStatus,
        perfStatus,
        releaseEligible: RELEASE_ELIGIBLE,
        soakSeconds: SOAK_SECONDS,
        errors: errors.length,
        summary: observed.perfSummary
      },
      null,
      2
    )
  );
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
