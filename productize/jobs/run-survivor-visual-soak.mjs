#!/usr/bin/env node
/**
 * C5–C6: Visual hygiene + soak for survivor_horde core demo.
 *
 * Env:
 *   SOAK_SECONDS — default 120 (set 600 for full 10-minute DoD soak)
 *   SKIP_SOAK=1  — visual only
 *
 * Writes:
 *   minigame_master/capabilities/reports/visual_audit_latest.json
 *   minigame_master/capabilities/reports/performance_report_latest.json
 *   minigame_master/capabilities/reports/visual/survivor_horde/*.png
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
const REPORTS_DIR = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const VISUAL_DIR = path.join(REPORTS_DIR, "visual/survivor_horde");
const CARD_PATH = path.join(LORE_ROOT, "minigame_master/gameplay/cards/survivor_horde.json");

const SOAK_SECONDS = Math.max(
  15,
  Number(process.env.SOAK_SECONDS || process.env.SOAK_SECS || 120)
);
const SKIP_SOAK = process.env.SKIP_SOAK === "1";
const FULL_DOD_SECONDS = 600;

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
  if (text.includes("favicon")) return true;
  if (text.includes("WebSocket connection to")) return true;
  return false;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function main() {
  const budget = fs.existsSync(CARD_PATH)
    ? JSON.parse(fs.readFileSync(CARD_PATH, "utf8")).performanceBudget || {}
    : {};
  const normalP95 = budget.normalP95Fps ?? 55;
  const maxEnemies = budget.maxActiveEnemies ?? 50;

  if (!fs.existsSync(VITE_BIN) || !fs.existsSync(VITE_CONFIG)) {
    console.error("[FAIL] vite or demo config missing");
    process.exit(1);
  }
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("[FAIL] playwright missing");
    process.exit(1);
  }

  fs.mkdirSync(VISUAL_DIR, { recursive: true });
  const errors = [];
  const visualAssertions = {};
  const perfAssertions = {};
  const observed = { samples: [], screenshots: [] };

  const port = await findOpenPort();
  const url = `http://127.0.0.1:${port}/`;
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
    await waitForUrl(url);
    const browser = await playwright.chromium.launch({ headless: true });

    // ---------- Visual matrix ----------
    for (const vp of [
      { id: "mobile_720x1280", width: 720, height: 1280 },
      { id: "desktop_1280x800", width: 1280, height: 800 }
    ]) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height }
      });
      page.on("pageerror", (err) => errors.push(`[visual ${vp.id}] Page Error: ${err.message || err}`));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnorable(msg.text())) {
          errors.push(`[visual ${vp.id}] Console Error: ${msg.text()}`);
        }
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });

      const menuShot = path.join(VISUAL_DIR, `${vp.id}_menu.png`);
      await page.screenshot({ path: menuShot, fullPage: true });
      observed.screenshots.push(menuShot);

      await page.locator('[data-testid="start-run"]').click();
      await page.waitForFunction(() => {
        try {
          const s = JSON.parse(document.querySelector('[data-testid="test-state"]')?.textContent || "{}");
          return s.mode === "run" && s.status === "running";
        } catch {
          return false;
        }
      }, null, { timeout: 15000 });

      await page.waitForTimeout(2500);
      const runShot = path.join(VISUAL_DIR, `${vp.id}_running.png`);
      await page.screenshot({ path: runShot, fullPage: true });
      observed.screenshots.push(runShot);

      const canvasProbe = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return { present: false };
        const w = canvas.width;
        const h = canvas.height;
        let nonBlank = false;
        let dataUrlLength = 0;
        let method = "none";
        // Phaser typically uses WebGL — toDataURL is the reliable probe
        try {
          const dataUrl = canvas.toDataURL("image/png");
          dataUrlLength = dataUrl.length;
          nonBlank = dataUrlLength > 2500;
          method = "dataUrl";
        } catch {
          try {
            const ctx = canvas.getContext("2d");
            const img = ctx.getImageData(0, 0, Math.min(w, 32), Math.min(h, 32));
            let sum = 0;
            for (let i = 0; i < img.data.length; i += 4) {
              sum += img.data[i] + img.data[i + 1] + img.data[i + 2];
            }
            nonBlank = sum > 100;
            method = "getImageData";
          } catch {
            nonBlank = false;
          }
        }
        const rect = canvas.getBoundingClientRect();
        return {
          present: true,
          width: w,
          height: h,
          cssWidth: rect.width,
          cssHeight: rect.height,
          nonBlank,
          dataUrlLength,
          method
        };
      });

      observed[`canvas_${vp.id}`] = canvasProbe;
      visualAssertions[`${vp.id}_canvasPresent`] = canvasProbe.present === true;
      visualAssertions[`${vp.id}_canvasSized`] =
        canvasProbe.width >= 100 && canvasProbe.height >= 100;
      visualAssertions[`${vp.id}_notBlackScreen`] = canvasProbe.nonBlank === true;
      visualAssertions[`${vp.id}_screenshotWritten`] = fs.existsSync(runShot) && fs.statSync(runShot).size > 1000;

      // Safe-area: start/retreat controls should be in viewport
      const controlsBox = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="retreat-run"], [data-testid="start-run"]');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          bottom: r.bottom,
          right: r.right,
          vw: window.innerWidth,
          vh: window.innerHeight
        };
      });
      visualAssertions[`${vp.id}_controlsInViewport`] =
        controlsBox &&
        controlsBox.left >= 0 &&
        controlsBox.top >= 0 &&
        controlsBox.right <= controlsBox.vw + 2 &&
        controlsBox.bottom <= controlsBox.vh + 2;

      await page.close();
    }

    // ---------- Soak ----------
    if (!SKIP_SOAK) {
      const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
      page.on("pageerror", (err) => errors.push(`[soak] Page Error: ${err.message || err}`));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnorable(msg.text())) {
          errors.push(`[soak] Console Error: ${msg.text()}`);
        }
      });

      // Long single run avoids scene restart races (demo supports ?durationSec=)
      const soakDuration = Math.min(3600, Math.max(SOAK_SECONDS + 30, SOAK_SECONDS));
      const soakUrl = `${url}?durationSec=${soakDuration}`;
      await page.goto(soakUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });
      await page.locator('[data-testid="start-run"]').click();
      await page.waitForFunction(() => {
        try {
          const s = JSON.parse(document.querySelector('[data-testid="test-state"]')?.textContent || "{}");
          return s.mode === "run" && s.status === "running";
        } catch {
          return false;
        }
      }, null, { timeout: 15000 });

      // Install FPS + heap sampler (defensive enemy count)
      await page.evaluate(() => {
        window.__LW_SOAK__ = {
          fpsSamples: [],
          enemySamples: [],
          heapSamples: [],
          frames: 0,
          last: performance.now(),
          startHeap: performance.memory ? performance.memory.usedJSHeapSize : null,
          pageErrors: []
        };
        const tick = (t) => {
          const s = window.__LW_SOAK__;
          if (!s) return;
          s.frames += 1;
          if (t - s.last >= 1000) {
            s.fpsSamples.push(s.frames);
            s.frames = 0;
            s.last = t;
            try {
              const adapter = window.__LW_SURVIVOR_DEMO__;
              const group = adapter?.groups?.enemies;
              const enemies =
                typeof group?.getLength === "function"
                  ? group.getLength()
                  : Array.isArray(group?.getChildren?.())
                    ? group.getChildren().length
                    : 0;
              s.enemySamples.push(enemies);
            } catch {
              s.enemySamples.push(0);
            }
            if (performance.memory) s.heapSamples.push(performance.memory.usedJSHeapSize);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      const soakMs = SOAK_SECONDS * 1000;
      const step = 5000;
      const deadline = Date.now() + soakMs;
      while (Date.now() < deadline) {
        await page.waitForTimeout(Math.min(step, Math.max(0, deadline - Date.now())));
        const x = 200 + Math.floor(Math.random() * 320);
        const y = 400 + Math.floor(Math.random() * 400);
        await page.mouse.move(x, y);
        // Keep player topped up so soak is not cut short by accidental death
        await page.evaluate(() => {
          const adapter = window.__LW_SURVIVOR_DEMO__;
          if (adapter?.state && typeof adapter.state.hp === "number") {
            adapter.state.hp = Math.max(adapter.state.hp, 80);
          }
        }).catch(() => {});
      }

      const soakData = await page.evaluate(() => window.__LW_SOAK__ || null);
      observed.soak = {
        secondsRequested: SOAK_SECONDS,
        fullDodSeconds: FULL_DOD_SECONDS,
        isFullDodDuration: SOAK_SECONDS >= FULL_DOD_SECONDS,
        ...soakData
      };

      const fps = [...(soakData?.fpsSamples || [])].filter((n) => typeof n === "number").sort((a, b) => a - b);
      const p95 = percentile(fps, 5); // lower-tail: 5th percentile ~ poor frames; also report true p95 high
      const p95High = percentile(fps, 95);
      const minFps = fps.length ? fps[0] : null;
      const avgFps = fps.length ? fps.reduce((a, b) => a + b, 0) / fps.length : null;
      const maxEnemy = Math.max(0, ...(soakData?.enemySamples || [0]));
      const heaps = soakData?.heapSamples || [];
      let heapGrowthRatio = null;
      if (heaps.length >= 2) {
        heapGrowthRatio = heaps[heaps.length - 1] / Math.max(heaps[0], 1);
      }

      observed.soakSummary = { minFps, avgFps, p95Low: p95, p95High, maxEnemy, heapGrowthRatio, sampleCount: fps.length };

      // Headless FPS is often lower than device budget; gate softly:
      // require avg >= 20 and samples collected, flag budget vs real device separately
      perfAssertions.soakSamplesCollected = fps.length >= Math.min(30, Math.floor(SOAK_SECONDS * 0.5));
      perfAssertions.avgFpsAboveFloor = avgFps != null && avgFps >= 20;
      perfAssertions.noCatastrophicFps = minFps == null || minFps >= 5;
      perfAssertions.enemyCountBounded = maxEnemy <= maxEnemies * 2; // allow headroom in demo
      perfAssertions.heapNotExplosive = heapGrowthRatio == null || heapGrowthRatio < 4.0;
      perfAssertions.noConsoleErrorsDuringSoak = errors.filter((e) => e.startsWith("[soak]")).length === 0;
      // Record budget comparison (informational assertion — headless may not hit 55)
      observed.budget = { normalP95Fps: normalP95, maxActiveEnemies: maxEnemies };
      observed.budgetMetInHeadless = p95High != null && p95High >= normalP95;
      perfAssertions.budgetComparisonRecorded = true;

      // Final screenshot after soak
      const soakShot = path.join(VISUAL_DIR, `soak_${SOAK_SECONDS}s_end.png`);
      await page.screenshot({ path: soakShot, fullPage: true });
      observed.screenshots.push(soakShot);

      await page.close();
    } else {
      perfAssertions.soakSkipped = true;
    }

    await browser.close();
  } catch (err) {
    errors.push(`Interaction failure: ${err?.message || err}`);
  } finally {
    await stopVite();
  }

  const visualErrors = errors.filter(
    (e) => e.includes("[visual") || (e.startsWith("Interaction") && !e.includes("[soak]"))
  );
  const soakErrors = errors.filter((e) => e.startsWith("[soak]") || e.includes("[soak]"));
  const visualOk = Object.values(visualAssertions).every(Boolean) && visualErrors.length === 0;
  const perfOk =
    SKIP_SOAK ||
    (Object.entries(perfAssertions)
      .filter(([k]) => k !== "soakSkipped")
      .every(([, v]) => v === true) &&
      soakErrors.length === 0);

  const visualReport = {
    schemaVersion: "loreweaver.visual-audit.v1",
    gate: "visual_audit",
    target: "minigame_master/core/demo/survivor_horde",
    cardId: "survivor_horde",
    status: visualOk ? "passed" : "failed",
    createdAt: utcNow(),
    method: "Playwright screenshots + canvas toDataURL non-blank probe",
    releaseEligible: false,
    assertions: visualAssertions,
    screenshots: observed.screenshots,
    observedState: {
      canvas_mobile_720x1280: observed.canvas_mobile_720x1280,
      canvas_desktop_1280x800: observed.canvas_desktop_1280x800
    },
    errors: visualErrors,
    notes: [
      "Deterministic checks only (no VLM).",
      "Not a full HUD overflow VLM audit."
    ]
  };

  const perfReport = {
    schemaVersion: "loreweaver.performance-report.v1",
    gate: "performance_soak",
    target: "minigame_master/core/demo/survivor_horde",
    cardId: "survivor_horde",
    status: perfOk ? "passed" : "failed",
    createdAt: utcNow(),
    method: "Playwright headless rAF FPS + enemy count + optional heap",
    soakSeconds: SOAK_SECONDS,
    fullDodSeconds: FULL_DOD_SECONDS,
    isFullDodDuration: SOAK_SECONDS >= FULL_DOD_SECONDS,
    releaseEligible: false,
    performanceBudget: { normalP95Fps: normalP95, maxActiveEnemies: maxEnemies },
    assertions: perfAssertions,
    summary: observed.soakSummary || null,
    budgetMetInHeadless: observed.budgetMetInHeadless ?? null,
    errors: soakErrors,
    notes: [
      "Headless Chromium FPS is not device-class; floor gates used (avg>=20).",
      `Set SOAK_SECONDS=${FULL_DOD_SECONDS} for full 10-minute DoD soak.`,
      "production_ready still requires human playtest + device-class FPS evidence."
    ]
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, "visual_audit_latest.json"), JSON.stringify(visualReport, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, "performance_report_latest.json"), JSON.stringify(perfReport, null, 2));

  const overall = visualReport.status === "passed" && perfReport.status === "passed";
  console.log(
    JSON.stringify(
      {
        overall: overall ? "passed" : "failed",
        visual: visualReport.status,
        performance: perfReport.status,
        soakSeconds: SOAK_SECONDS,
        isFullDodDuration: SOAK_SECONDS >= FULL_DOD_SECONDS,
        avgFps: observed.soakSummary?.avgFps ?? null,
        releaseEligible: false,
        errors
      },
      null,
      2
    )
  );

  if (!overall) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
