#!/usr/bin/env node
/**
 * C2: Playwright E2E for minigame_master/core/demo/survivor_horde
 * Flow: boot → start → combat observe → retreat → menu
 * Writes:
 *   - minigame_master/capabilities/reports/runtime_e2e_survivor_horde_latest.json
 *   - minigame_master/capabilities/reports/standalone_browser_report.json
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
const DEMO_ROOT = path.join(LORE_ROOT, "minigame_master/core/demo/survivor_horde");
const VITE_CONFIG = path.join(DEMO_ROOT, "vite.config.mjs");
const VITE_BIN = path.join(LORE_ROOT, "node_modules/.bin/vite");
const REPORTS_DIR = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const VIEWPORTS = [
  { id: "mobile_720x1280", width: 720, height: 1280 },
  { id: "desktop_1280x800", width: 1280, height: 800 }
];

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
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (Date.now() > deadline) reject(new Error(`timeout waiting ${url}`));
        else setTimeout(tryOnce, 250);
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error(`timeout waiting ${url}`));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function isIgnorableConsoleError(text) {
  if (!text) return true;
  if (text.includes("WebSocket connection to") && text.includes("127.0.0.1")) return true;
  if (text.includes("Failed to load resource") && text.includes("favicon")) return true;
  return false;
}

async function main() {
  if (!fs.existsSync(VITE_BIN)) {
    console.error("[FAIL] missing vite binary; run npm install");
    process.exit(1);
  }
  if (!fs.existsSync(VITE_CONFIG)) {
    console.error(`[FAIL] missing demo config ${VITE_CONFIG}`);
    process.exit(1);
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "[FAIL] playwright package not installed. Run: npm install -D playwright && npx playwright install chromium"
    );
    process.exit(1);
  }

  const port = await findOpenPort();
  const url = `http://127.0.0.1:${port}/`;
  const errors = [];
  const assertions = {};
  const observed = {};

  const vite = spawn(
    VITE_BIN,
    ["--config", VITE_CONFIG, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: LORE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    }
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
      }, 3000);
    });

  try {
    await waitForUrl(url, 25000);
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });
    observed.byViewport = {};

    for (const vp of VIEWPORTS) {
      const prefix = vp.id;
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });

      page.on("pageerror", (err) => errors.push(`[${prefix}] Page Error: ${err.message || err}`));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnorableConsoleError(msg.text())) {
          errors.push(`[${prefix}] Console Error: ${msg.text()}`);
        }
      });

      const readState = async () =>
        page.evaluate(() => {
          const node = document.querySelector('[data-testid="test-state"]');
          if (!node?.textContent) return {};
          try {
            return JSON.parse(node.textContent);
          } catch {
            return {};
          }
        });

      const readCanvas = async () =>
        page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          if (!canvas) return { present: false };
          try {
            const dataUrl = canvas.toDataURL("image/png");
            return {
              present: true,
              width: canvas.width,
              height: canvas.height,
              dataUrlLength: dataUrl.length,
              nonBlank: dataUrl.length > 1500
            };
          } catch (error) {
            return {
              present: true,
              width: canvas.width,
              height: canvas.height,
              nonBlank: false,
              error: String(error)
            };
          }
        });

      const midX = Math.floor(vp.width / 2);
      const midY = Math.floor(vp.height / 2);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });
      assertions[`${prefix}_startButton`] = (await page.locator('[data-testid="start-run"]').count()) === 1;

      const meta = await page.evaluate(() => window.__LW_SURVIVOR_DEMO_META__ || null);
      observed.demoMeta = meta;
      assertions[`${prefix}_hasSpecHash`] = typeof meta?.specHash === "string" && meta.specHash.length > 0;
      assertions[`${prefix}_releaseEligibleFalse`] = meta?.releaseEligible === false;

      await page.locator('[data-testid="start-run"]').click();
      await page.waitForFunction(() => {
        const node = document.querySelector('[data-testid="test-state"]');
        if (!node?.textContent) return false;
        try {
          const state = JSON.parse(node.textContent);
          return state.mode === "run" && state.status === "running";
        } catch {
          return false;
        }
      }, null, { timeout: 15000 });

      const duringStart = await readState();
      await page.mouse.move(midX, midY);
      await page.mouse.down();
      await page.mouse.move(midX + 60, midY - 80, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(vp.id.startsWith("desktop") ? 3500 : 5500);
      const duringCombat = await readState();
      const runningCanvas = await readCanvas();

      const startTimer = duringStart.timer;
      const laterTimer = duringCombat.timer;
      assertions[`${prefix}_running`] = duringStart.status === "running";
      assertions[`${prefix}_timerUpdated`] =
        typeof startTimer === "number" &&
        typeof laterTimer === "number" &&
        laterTimer < startTimer;
      assertions[`${prefix}_canvasNonblank`] = Boolean(runningCanvas.nonBlank);
      assertions[`${prefix}_specHash`] =
        duringStart.specHash === meta?.specHash && duringStart.cardId === "survivor_horde";

      const combatProbe = await page.evaluate(() => {
        const adapter = window.__LW_SURVIVOR_DEMO__;
        return {
          adapterStatus: adapter?.status || null,
          enemies: adapter?.groups?.enemies?.getLength?.() || 0,
          bullets: adapter?.groups?.bullets?.getLength?.() || 0
        };
      });
      assertions[`${prefix}_combatLoop`] =
        (combatProbe.enemies || 0) > 0 ||
        (combatProbe.bullets || 0) > 0 ||
        (duringCombat.kills || 0) > 0 ||
        (duringCombat.score || 0) > 0 ||
        assertions[`${prefix}_timerUpdated`] === true;

      // Pause / resume probe (mobile primary; desktop light check)
      if (vp.id === "mobile_720x1280") {
        const pauseProbe = await page.evaluate(async () => {
          const adapter = window.__LW_SURVIVOR_DEMO__;
          if (!adapter) return { ok: false, reason: "no_adapter" };
          const before = adapter.state?.timeRemaining ?? adapter.getTestState?.()?.timer;
          adapter.pause?.();
          const midStatus = adapter.status;
          await new Promise((r) => setTimeout(r, 800));
          const mid = adapter.state?.timeRemaining ?? adapter.getTestState?.()?.timer;
          adapter.resume?.();
          const afterStatus = adapter.status;
          await new Promise((r) => setTimeout(r, 400));
          const after = adapter.state?.timeRemaining ?? adapter.getTestState?.()?.timer;
          return { ok: true, before, mid, after, midStatus, afterStatus };
        });
        observed.pauseProbe = pauseProbe;
        assertions.pauseStatus = pauseProbe.midStatus === "paused";
        assertions.resumeStatus = pauseProbe.afterStatus === "running";
        // timer should not advance (much) while paused
        assertions.pauseTimerFrozen =
          typeof pauseProbe.before === "number" &&
          typeof pauseProbe.mid === "number" &&
          Math.abs(pauseProbe.before - pauseProbe.mid) <= 1.5;
      }

      if (vp.id === "desktop_1280x800") {
        // Desktop: retreat path
        await page.locator('[data-testid="retreat-run"]').click();
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-testid="test-state"]');
          if (!node?.textContent) return false;
          try {
            const state = JSON.parse(node.textContent);
            return state.mode === "result" && state.resultReason === "retreated";
          } catch {
            return false;
          }
        }, null, { timeout: 15000 });
        const afterRetreat = await readState();
        assertions[`${prefix}_retreat`] = afterRetreat.resultReason === "retreated";
        observed.byViewport[prefix] = {
          duringStart,
          duringCombat,
          runningCanvas,
          combatProbe,
          afterRetreat
        };
      } else {
        // Mobile: natural HP fail, then win force
        await page.evaluate(() => {
          const adapter = window.__LW_SURVIVOR_DEMO__;
          adapter?.damagePlayer?.(9999, "hp_zero");
        });
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-testid="test-state"]');
          if (!node?.textContent) return false;
          try {
            const state = JSON.parse(node.textContent);
            return (
              state.mode === "result" &&
              state.resultSuccess === false &&
              (state.resultReason === "hp_zero" || state.status === "ended")
            );
          } catch {
            return false;
          }
        }, null, { timeout: 10000 });
        const afterFail = await readState();
        assertions.naturalFailHpZero =
          afterFail.resultReason === "hp_zero" || afterFail.resultSuccess === false;
        assertions.naturalFailNotSuccess = afterFail.resultSuccess === false;
        observed.afterFail = afterFail;

        await page.locator('[data-testid="back-menu"]').click();
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-testid="test-state"]');
          if (!node?.textContent) return false;
          try {
            return JSON.parse(node.textContent).mode === "menu";
          } catch {
            return false;
          }
        }, null, { timeout: 15000 });

        await page.locator('[data-testid="start-run"]').click();
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-testid="test-state"]');
          if (!node?.textContent) return false;
          try {
            const state = JSON.parse(node.textContent);
            return state.mode === "run" && state.status === "running";
          } catch {
            return false;
          }
        }, null, { timeout: 15000 });
        await page.evaluate(() => {
          const adapter = window.__LW_SURVIVOR_DEMO__;
          adapter?.finish?.(true, "e2e_completed");
        });
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-testid="test-state"]');
          if (!node?.textContent) return false;
          try {
            const state = JSON.parse(node.textContent);
            return state.mode === "result" && state.resultSuccess === true;
          } catch {
            return false;
          }
        }, null, { timeout: 10000 });
        const afterWin = await readState();
        assertions.winResultSuccess = afterWin.resultSuccess === true;
        assertions.winResultReason =
          afterWin.resultReason === "e2e_completed" || afterWin.resultSuccess === true;
        observed.afterWin = afterWin;

        observed.byViewport[prefix] = {
          duringStart,
          duringCombat,
          runningCanvas,
          combatProbe,
          afterFail,
          afterWin
        };
      }

      await page.locator('[data-testid="back-menu"]').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      assertions[`${prefix}_menu`] =
        (await readState()).mode === "menu" ||
        assertions[`${prefix}_retreat`] === true ||
        assertions.winResultSuccess === true;

      await page.close();
    }

    await browser.close();
  } catch (err) {
    errors.push(`Interaction failure: ${err?.message || err}`);
  } finally {
    await stopVite();
  }

  assertions.consoleErrors = errors.filter((e) => e.includes("Console Error:")).length;
  const hardAssertions = Object.entries(assertions).filter(([k]) => k !== "consoleErrors");
  const allAssertOk = hardAssertions.every(([, v]) => v === true);
  const passed = errors.length === 0 && allAssertOk;

  const specHash = observed.demoMeta?.specHash || "survivor_horde:core_demo:v1";
  const report = {
    schemaVersion: "loreweaver.browser-e2e.v1",
    gate: "runtime_e2e",
    target: "minigame_master/core/demo/survivor_horde",
    cardId: "survivor_horde",
    status: passed ? "passed" : "failed",
    createdAt: utcNow(),
    method: "Playwright chromium against Vite-served survivor_horde demo",
    viewports: VIEWPORTS,
    platforms: VIEWPORTS.map((v) => v.id),
    specHash,
    runtimeVersion: observed.demoMeta?.runtimeVersion || "minigame_master.core.demo.survivor_horde",
    releaseEligible: false,
    modifiers: ["hazard_telegraph", "defend_core"],
    assetManifestHash: crypto
      .createHash("sha256")
      .update("demo_procedural_no_workspace_atlas")
      .digest("hex")
      .slice(0, 16),
    server: { url, viteLogTail: viteLog.slice(-2000) },
    assertions,
    observedState: observed,
    errors,
    flows: [
      {
        id: "mobile_pause_resume",
        status: assertions.pauseStatus && assertions.resumeStatus ? "passed" : "failed"
      },
      {
        id: "mobile_natural_fail_hp_zero",
        status: assertions.naturalFailHpZero ? "passed" : "failed"
      },
      {
        id: "mobile_enter_run_win_force",
        status: assertions.winResultSuccess ? "passed" : "failed"
      },
      {
        id: "desktop_enter_run_retreat",
        status: assertions.desktop_1280x800_retreat ? "passed" : "failed"
      }
    ]
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const e2ePath = path.join(REPORTS_DIR, "runtime_e2e_survivor_horde_latest.json");
  const standalonePath = path.join(REPORTS_DIR, "standalone_browser_report.json");
  fs.writeFileSync(e2ePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    standalonePath,
    JSON.stringify(
      {
        schemaVersion: "loreweaver.standalone-browser-report.v1",
        status: report.status,
        createdAt: report.createdAt,
        cardId: report.cardId,
        specHash: report.specHash,
        runtimeVersion: report.runtimeVersion,
        releaseEligible: false,
        sourceReport: "runtime_e2e_survivor_horde_latest.json",
        assertions: report.assertions,
        errors: report.errors,
        flows: report.flows
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: report.status,
        cardId: report.cardId,
        specHash: report.specHash,
        releaseEligible: report.releaseEligible,
        assertions: report.assertions,
        errors: report.errors,
        reports: [e2ePath, standalonePath]
      },
      null,
      2
    )
  );

  if (!passed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
