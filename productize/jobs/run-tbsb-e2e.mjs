#!/usr/bin/env node
/**
 * Playwright E2E for minigame_master/core/demo/turn_based_skill_battle.
 *
 * Verifies the real demo surface instead of hard-coding timer/pause assertions:
 * - countdown runs and freezes while paused
 * - authored cooldown N blocks the next N player turns
 * - enemy response advances exactly once after accepted actions
 * - restart resets turn/hp/cooldowns/countdown
 * - defeat, victory and retreat settle once
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const DEMO_ROOT = path.join(
  LORE_ROOT,
  "minigame_master/core/demo/turn_based_skill_battle"
);
const VITE_CONFIG = path.join(DEMO_ROOT, "vite.config.mjs");
const VITE_BIN = path.join(LORE_ROOT, "node_modules/.bin/vite");
const REPORTS_DIR = path.join(
  LORE_ROOT,
  "minigame_master/capabilities/reports"
);
const SPEC_HASH_FALLBACK =
  "turn_based_skill_battle:core_demo:v2_timer_controls";
const VIEWPORTS = [
  { id: "mobile_720x1280", width: 720, height: 1280 },
  { id: "desktop_1280x800", width: 1280, height: 800 }
];

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
  if (text.includes("WebSocket connection to") && text.includes("127.0.0.1")) {
    return true;
  }
  if (text.includes("Failed to load resource") && text.includes("favicon")) {
    return true;
  }
  return false;
}

async function main() {
  if (!fs.existsSync(VITE_BIN)) {
    console.error("[FAIL] missing vite; run npm install");
    process.exit(1);
  }
  if (!fs.existsSync(VITE_CONFIG)) {
    console.error(`[FAIL] missing ${VITE_CONFIG}`);
    process.exit(1);
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("[FAIL] playwright not installed");
    process.exit(1);
  }

  const port = await findOpenPort();
  const url =
    `http://127.0.0.1:${port}/?theme=sect&enemyHp=500&playerHp=100` +
    `&enemyAtk=14&durationSec=20&failOnTimeout=true`;
  const errors = [];
  const assertions = {};
  const observed = {};
  const flows = [];

  const vite = spawn(
    VITE_BIN,
    [
      "--config",
      VITE_CONFIG,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
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
    await waitForUrl(`http://127.0.0.1:${port}/`, 25000);
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });
    observed.byViewport = {};

    for (const vp of VIEWPORTS) {
      const prefix = vp.id;
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });

      page.on("pageerror", (err) =>
        errors.push(`[${prefix}] Page Error: ${err.message || err}`)
      );
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

      const waitForState = async (predicate, timeout = 10000) =>
        page.waitForFunction(
          predicate,
          null,
          { timeout }
        );

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
            return { present: true, nonBlank: false, error: String(error) };
          }
        });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      await page.waitForSelector('[data-testid="start-run"]', { timeout: 15000 });

      const meta = await page.evaluate(() => window.__LW_TBSB_DEMO_META__ || null);
      observed.demoMeta = meta;
      assertions[`${prefix}_startButton`] =
        (await page.locator('[data-testid="start-run"]').count()) === 1;
      assertions[`${prefix}_hasSpecHash`] =
        typeof meta?.specHash === "string" && meta.specHash.length > 0;
      assertions[`${prefix}_cardId`] =
        meta?.cardId === "turn_based_skill_battle";
      assertions[`${prefix}_releaseEligibleFalse`] =
        meta?.releaseEligible === false;
      assertions[`${prefix}_themeTitle`] =
        typeof meta?.title === "string" && meta.title.length > 0;

      await page.locator('[data-testid="start-run"]').click();
      await waitForState(() => {
        try {
          const state = JSON.parse(
            document.querySelector('[data-testid="test-state"]').textContent
          );
          return state.mode === "run" && state.status === "running";
        } catch {
          return false;
        }
      }, 15000);

      const duringStart = await readState();
      await page.waitForTimeout(450);
      const duringRun = await readState();
      const runningCanvas = await readCanvas();

      assertions[`${prefix}_running`] = duringStart.status === "running";
      assertions[`${prefix}_timerUpdated`] =
        Number.isFinite(duringStart.timer) &&
        Number.isFinite(duringRun.timer) &&
        duringRun.timer < duringStart.timer - 0.1;
      assertions[`${prefix}_pauseControl`] =
        (await page.locator('[data-testid="pause-run"]').count()) === 1;
      assertions[`${prefix}_restartControl`] =
        (await page.locator('[data-testid="restart-run"]').count()) === 1;
      assertions[`${prefix}_canvasNonblank`] = Boolean(runningCanvas.nonBlank);
      assertions[`${prefix}_specHash`] =
        duringStart.specHash === meta?.specHash &&
        duringStart.cardId === "turn_based_skill_battle";

      if (vp.id === "mobile_720x1280") {
        const cooldownStart = await page.evaluate(() => {
          const adapter = window.__LW_TBSB_DEMO__;
          const heavy = adapter?.config?.skillDeck?.find((s) => s.id === "heavy");
          if (!adapter || !heavy) return { ok: false };
          const before = adapter.getTestState();
          const accepted = adapter.onSkillClick(heavy);
          return {
            ok: true,
            accepted,
            beforeSkillsUsed: before.skillsUsed,
            afterUseSkillsUsed: adapter.state.skillsUsed,
            immediateCooldown: adapter.state.cooldowns.heavy,
            turn: adapter.state.turn
          };
        });
        await page.waitForTimeout(750);
        const afterHeavyEnemy = await readState();

        const blockedProbe = await page.evaluate(() => {
          const adapter = window.__LW_TBSB_DEMO__;
          const heavy = adapter?.config?.skillDeck?.find((s) => s.id === "heavy");
          if (!adapter || !heavy) return { ok: false };
          const before = adapter.state.skillsUsed;
          const accepted = adapter.onSkillClick(heavy);
          return {
            ok: true,
            accepted,
            before,
            after: adapter.state.skillsUsed,
            cooldown: adapter.state.cooldowns.heavy
          };
        });

        await page.evaluate(() => {
          const adapter = window.__LW_TBSB_DEMO__;
          const strike = adapter?.config?.skillDeck?.find((s) => s.id === "strike");
          adapter?.onSkillClick?.(strike);
        });
        await page.waitForTimeout(750);
        const afterOneAdvance = await readState();

        await page.evaluate(() => {
          const adapter = window.__LW_TBSB_DEMO__;
          const strike = adapter?.config?.skillDeck?.find((s) => s.id === "strike");
          adapter?.onSkillClick?.(strike);
        });
        await page.waitForTimeout(750);
        const afterTwoAdvance = await readState();

        observed.cooldownProbe = {
          cooldownStart,
          afterHeavyEnemy,
          blockedProbe,
          afterOneAdvance,
          afterTwoAdvance
        };
        assertions.skillAccepted =
          cooldownStart.ok === true && cooldownStart.accepted === true;
        assertions.enemyTurnAdvanced =
          cooldownStart.turn === "enemy" &&
          afterHeavyEnemy.turn === "player";
        assertions.cooldownAuthoredValue =
          afterHeavyEnemy.cooldowns?.heavy === 2;
        assertions.cooldownBlocksReuse =
          blockedProbe.ok === true &&
          blockedProbe.accepted === false &&
          blockedProbe.after === blockedProbe.before;
        assertions.cooldownTicksByPlayerTurn =
          afterOneAdvance.cooldowns?.heavy === 1 &&
          afterTwoAdvance.cooldowns?.heavy === 0;

        const pauseBefore = await readState();
        await page.locator('[data-testid="pause-run"]').click();
        await waitForState(() => {
          try {
            return (
              JSON.parse(
                document.querySelector('[data-testid="test-state"]').textContent
              ).status === "paused"
            );
          } catch {
            return false;
          }
        });
        const pauseStart = await readState();
        await page.waitForTimeout(500);
        const pauseFrozen = await readState();

        await page.locator('[data-testid="pause-run"]').click();
        await waitForState(() => {
          try {
            return (
              JSON.parse(
                document.querySelector('[data-testid="test-state"]').textContent
              ).status === "running"
            );
          } catch {
            return false;
          }
        });
        await page.waitForTimeout(350);
        const pauseResumed = await readState();

        observed.pauseProbe = {
          before: pauseBefore,
          paused: pauseStart,
          frozen: pauseFrozen,
          resumed: pauseResumed
        };
        assertions.pauseStatus = pauseStart.status === "paused";
        assertions.resumeStatus = pauseResumed.status === "running";
        assertions.pauseTimerFrozen =
          Math.abs(Number(pauseFrozen.timer) - Number(pauseStart.timer)) < 0.05;
        assertions.resumeTimerContinues =
          Number(pauseResumed.timer) < Number(pauseFrozen.timer) - 0.1;
        flows.push({
          id: "mobile_pause_resume",
          status:
            assertions.pauseStatus &&
            assertions.pauseTimerFrozen &&
            assertions.resumeStatus &&
            assertions.resumeTimerContinues
              ? "passed"
              : "failed"
        });

        const beforeRestart = await readState();
        await page.locator('[data-testid="restart-run"]').click();
        await waitForState(() => {
          try {
            const state = JSON.parse(
              document.querySelector('[data-testid="test-state"]').textContent
            );
            return (
              state.mode === "run" &&
              state.status === "running" &&
              state.skillsUsed === 0 &&
              state.turn === "player"
            );
          } catch {
            return false;
          }
        });
        const afterRestart = await readState();
        observed.restartProbe = { beforeRestart, afterRestart };
        assertions.restartResetsBattle =
          afterRestart.hp === 100 &&
          afterRestart.enemyHp === 500 &&
          afterRestart.skillsUsed === 0 &&
          afterRestart.turn === "player" &&
          Object.values(afterRestart.cooldowns || {}).every((v) => v === 0) &&
          afterRestart.timer > 19;
        flows.push({
          id: "mobile_restart_running",
          status: assertions.restartResetsBattle ? "passed" : "failed"
        });

        await page.evaluate(() => {
          window.__LW_TBSB_DEMO__?.damagePlayer?.(9999, "hp_zero");
        });
        await waitForState(() => {
          try {
            const state = JSON.parse(
              document.querySelector('[data-testid="test-state"]').textContent
            );
            return state.mode === "result" && state.resultSuccess === false;
          } catch {
            return false;
          }
        });
        const afterFail = await readState();
        const duplicateFail = await page.evaluate(() => {
          const adapter = window.__LW_TBSB_DEMO__;
          const first = adapter?.result || null;
          const second = adapter?.finish?.(false, "hp_zero") || null;
          return {
            sameResult: first === second,
            buttonCount: adapter?.ui?.buttons?.length,
            status: adapter?.status
          };
        });
        const afterDuplicateFail = await readState();
        observed.afterFail = afterFail;
        observed.duplicateFail = duplicateFail;
        assertions.failHpZero =
          afterFail.resultReason === "hp_zero" &&
          afterFail.resultSuccess === false;
        assertions.failSettledOnce =
          afterDuplicateFail.settlementCount === 1 &&
          duplicateFail.sameResult === true;
        assertions.buttonsClearedOnFinish = duplicateFail.buttonCount === 0;
        flows.push({
          id: "mobile_fail_hp_zero",
          status:
            assertions.failHpZero &&
            assertions.failSettledOnce &&
            assertions.buttonsClearedOnFinish
              ? "passed"
              : "failed"
        });

        await page.locator('[data-testid="restart-run"]').click();
        await waitForState(() => {
          try {
            const state = JSON.parse(
              document.querySelector('[data-testid="test-state"]').textContent
            );
            return (
              state.mode === "run" &&
              state.status === "running" &&
              state.resultSuccess === null
            );
          } catch {
            return false;
          }
        });

        await page.evaluate(() => {
          window.__LW_TBSB_DEMO__?.damageEnemy?.(999999);
        });
        await waitForState(() => {
          try {
            const state = JSON.parse(
              document.querySelector('[data-testid="test-state"]').textContent
            );
            return state.mode === "result" && state.resultSuccess === true;
          } catch {
            return false;
          }
        });
        const afterWin = await readState();
        const duplicateWin = await page.evaluate(() => {
          const adapter = window.__LW_TBSB_DEMO__;
          const first = adapter?.result || null;
          const second = adapter?.finish?.(true, "boss_defeated") || null;
          return { sameResult: first === second, status: adapter?.status };
        });
        const afterDuplicateWin = await readState();
        observed.afterWin = afterWin;
        observed.duplicateWin = duplicateWin;
        assertions.winResultSuccess = afterWin.resultSuccess === true;
        assertions.winResultReason =
          afterWin.resultReason === "boss_defeated";
        assertions.winSettledOnce =
          afterDuplicateWin.settlementCount === 1 &&
          duplicateWin.sameResult === true;
        flows.push({
          id: "mobile_win",
          status:
            assertions.winResultSuccess &&
            assertions.winResultReason &&
            assertions.winSettledOnce
              ? "passed"
              : "failed"
        });

        observed.byViewport[prefix] = {
          duringStart,
          duringRun,
          runningCanvas,
          afterRestart,
          afterFail,
          afterWin
        };
      } else {
        await page.locator('[data-testid="retreat-run"]').click();
        await waitForState(() => {
          try {
            const state = JSON.parse(
              document.querySelector('[data-testid="test-state"]').textContent
            );
            return (
              state.mode === "result" &&
              state.resultReason === "retreated"
            );
          } catch {
            return false;
          }
        }, 15000);
        const afterRetreat = await readState();
        assertions[`${prefix}_retreat`] =
          afterRetreat.resultReason === "retreated" &&
          afterRetreat.settlementCount === 1;
        flows.push({
          id: "desktop_retreat",
          status: assertions[`${prefix}_retreat`] ? "passed" : "failed"
        });
        observed.byViewport[prefix] = {
          duringStart,
          duringRun,
          runningCanvas,
          afterRetreat
        };
      }

      const shotDir = path.join(
        REPORTS_DIR,
        "visual/turn_based_skill_battle"
      );
      fs.mkdirSync(shotDir, { recursive: true });
      await page.screenshot({
        path: path.join(shotDir, `${prefix}_latest.png`),
        fullPage: false
      });
      await page.close();
    }

    await browser.close();
  } catch (err) {
    errors.push(String(err?.stack || err));
  } finally {
    await stopVite();
  }

  assertions.consoleErrors = errors.length;
  const failedAssertions = Object.entries(assertions)
    .filter(([key, value]) => key !== "consoleErrors" && value !== true)
    .map(([key]) => key);
  const status =
    errors.length === 0 && failedAssertions.length === 0 ? "passed" : "failed";
  const releaseEligible =
    process.env.RELEASE_ELIGIBLE === "1" && status === "passed";

  const report = {
    schemaVersion: "loreweaver.runtime-e2e.v1",
    gate: "turn_based_skill_battle_demo_e2e",
    status,
    createdAt: new Date().toISOString(),
    cardId: "turn_based_skill_battle",
    specHash: observed.demoMeta?.specHash || SPEC_HASH_FALLBACK,
    runtimeVersion:
      observed.demoMeta?.runtimeVersion ||
      "minigame_master.core.demo.turn_based_skill_battle",
    releaseEligible,
    viewports: VIEWPORTS.map((v) => v.id),
    assertions,
    failedAssertions,
    flows,
    errors,
    observed: {
      demoMeta: observed.demoMeta,
      cooldownProbe: observed.cooldownProbe,
      pauseProbe: observed.pauseProbe,
      restartProbe: observed.restartProbe,
      afterFail: observed.afterFail,
      afterWin: observed.afterWin
    },
    notes: [
      "Core demo E2E only — not workbench IDE path.",
      "Timer/pause/restart assertions are observed from the visible demo surface.",
      releaseEligible
        ? "RELEASE_ELIGIBLE=1 certification mark applied."
        : "releaseEligible false until production certification."
    ],
    productionCertification: releaseEligible
      ? {
          ownerDirectedProductionReady: true,
          ownerCommand: "production_ready",
          approvedAt: new Date().toISOString(),
          waivers: [
            "device_class_fps: accepted headless soak avgFps proxy (same as survivor_horde)",
            "vlm_visual_overflow: deferred; deterministic visual_audit screenshots used",
            "standalone_export_host: demo browser E2E used as primary browser gate for turn-based battle card"
          ]
        }
      : undefined,
    viteLogTail: viteLog.slice(-2000)
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(
      REPORTS_DIR,
      "runtime_e2e_turn_based_skill_battle_latest.json"
    ),
    `${JSON.stringify(report, null, 2)}\n`
  );

  if (status === "passed") {
    const browserSummary = {
      schemaVersion: "loreweaver.standalone-browser-report.v1",
      status: "passed",
      createdAt: new Date().toISOString(),
      cardId: "turn_based_skill_battle",
      specHash: report.specHash,
      runtimeVersion: report.runtimeVersion,
      releaseEligible,
      sourceReport: "runtime_e2e_turn_based_skill_battle_latest.json",
      assertions: report.assertions,
      errors: report.errors,
      flows: report.flows,
      productionCertification: report.productionCertification || null,
      notes: [
        "Derived from core demo Playwright E2E (turn_based_skill_battle).",
        "Per-card filename avoids clobbering survivor_horde standalone_browser_report.json."
      ]
    };
    fs.writeFileSync(
      path.join(
        REPORTS_DIR,
        "standalone_browser_report_turn_based_skill_battle.json"
      ),
      `${JSON.stringify(browserSummary, null, 2)}\n`
    );
  }

  console.log(JSON.stringify(report, null, 2));
  if (status !== "passed") process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
