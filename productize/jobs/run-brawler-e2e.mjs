#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.BRAWLER_E2E_PORT || 4186);
const BASE = `http://127.0.0.1:${PORT}`;
const configPath = path.join(ROOT, 'minigame_master/core/demo/side_scrolling_brawler/vite.config.mjs');
const viteBin = path.join(ROOT, 'node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [viteBin, '--config', configPath, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' }
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += String(chunk); });
server.stderr.on('data', chunk => { serverLog += String(chunk); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`vite exited early (${server.exitCode})\n${serverLog}`);
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`vite did not become ready\n${serverLog}`);
}

async function state(page) {
  return page.locator('#lw-test-state').evaluate(node => JSON.parse(node.textContent || '{}'));
}

async function waitState(page, predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await state(page);
    if (predicate(last)) return last;
    await sleep(80);
  }
  throw new Error(`${label} timeout; last=${JSON.stringify(last)}`);
}

async function startRun(page, suffix = '') {
  await page.goto(`${BASE}/${suffix}`, { waitUntil: 'domcontentloaded' });
  await waitState(page, s => s.mode === 'menu', 'menu');
  await page.getByTestId('start-run').click();
  await waitState(page, s => s.status === 'running', 'running');
  await page.locator('canvas').click({ position: { x: 20, y: 20 } });
}

async function advanceUntilWaveLock(page, timeout = 7000) {
  await page.keyboard.down('KeyD');
  try {
    return await waitState(
      page,
      s => s.status === 'ended' || (s.locked === true && s.aliveEnemies > 0),
      'wave locked',
      timeout
    );
  } finally {
    await page.keyboard.up('KeyD');
  }
}

async function pulseCombatKey(page, key) {
  // Keep the key down across multiple possible RAF samples so Phaser JustDown
  // observes the same input a real player produces, even on a loaded CI runner.
  await page.keyboard.down(key);
  await sleep(80);
  await page.keyboard.up(key);
}

async function clearCurrentWave(page, attackKey = 'KeyJ') {
  await waitState(page, s => s.locked === true && s.aliveEnemies > 0, 'wave locked');
  for (let i = 0; i < 6; i += 1) {
    await pulseCombatKey(page, attackKey);
    await sleep(170);
    const s = await state(page);
    if (s.aliveEnemies === 0 || s.status === 'ended') break;
  }
  return waitState(page, s => s.status === 'ended' || s.locked === false, 'wave clear');
}

async function scenarioVictory(page) {
  await startRun(page);
  await advanceUntilWaveLock(page);
  await clearCurrentWave(page, 'KeyJ');
  await advanceUntilWaveLock(page);
  await clearCurrentWave(page, 'KeyK');
  const result = await waitState(page, s => s.status === 'ended', 'victory result', 12000);
  if (result.resultSuccess !== true) throw new Error(`victory expected; ${JSON.stringify(result)}`);
  if (result.resultReason !== 'all_clear') throw new Error(`all_clear expected; ${JSON.stringify(result)}`);
  if (result.wavesCleared !== 2 || result.kills !== 2) throw new Error(`victory telemetry mismatch; ${JSON.stringify(result)}`);
  if (result.settlementCount !== 1) throw new Error(`settlement must be exactly once; ${JSON.stringify(result)}`);
  return result;
}

async function scenarioPauseRestart(page) {
  await startRun(page);
  await waitState(page, s => s.elapsedSec >= 1, 'elapsed started', 4000);
  await page.getByTestId('pause-run').click();
  const paused = await waitState(page, s => s.status === 'paused', 'paused');
  await sleep(1300);
  const stillPaused = await state(page);
  if (stillPaused.elapsedSec !== paused.elapsedSec) throw new Error(`elapsed changed while paused: ${paused.elapsedSec} -> ${stillPaused.elapsedSec}`);
  await page.getByTestId('pause-run').click();
  await waitState(page, s => s.status === 'running', 'resumed');
  await waitState(page, s => s.elapsedSec > paused.elapsedSec, 'elapsed resumed', 3000);

  await advanceUntilWaveLock(page);
  await page.getByTestId('restart-run').click();
  const reset = await waitState(page, s => s.status === 'running' && s.wavesCleared === 0 && s.kills === 0 && s.locked === false, 'restart reset');
  if (reset.hp !== 100 || reset.lives !== 2 || reset.playerX > 100) throw new Error(`restart did not reset run: ${JSON.stringify(reset)}`);
  return reset;
}

async function scenarioFailure(page) {
  await startRun(page, '?mode=fail');
  await advanceUntilWaveLock(page);
  const result = await waitState(page, s => s.status === 'ended', 'failure result', 8000);
  if (result.resultSuccess !== false || result.resultReason !== 'hp_zero') throw new Error(`hp-zero failure expected; ${JSON.stringify(result)}`);
  if (result.settlementCount !== 1) throw new Error(`failure settlement must be exactly once; ${JSON.stringify(result)}`);
  return result;
}

async function runScenario(context, label, scenario) {
  const page = await context.newPage();
  const pageErrors = [];
  const onPageError = error => pageErrors.push(error);
  page.on('pageerror', onPageError);
  try {
    const result = await scenario(page);
    if (pageErrors.length > 0) {
      throw new Error(`${label} page error: ${pageErrors.map(error => error.stack || error.message || String(error)).join('\n---\n')}`);
    }
    return result;
  } finally {
    page.removeListener('pageerror', onPageError);
    await page.close().catch(() => {});
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const victory = await runScenario(context, 'victory', scenarioVictory);
  const pauseRestart = await runScenario(context, 'pause-restart', scenarioPauseRestart);
  const failure = await runScenario(context, 'failure', scenarioFailure);

  console.log(JSON.stringify({
    cardId: 'side_scrolling_brawler',
    status: 'passed',
    assertions: {
      victory: { success: victory.resultSuccess, reason: victory.resultReason, wavesCleared: victory.wavesCleared, kills: victory.kills, settlementCount: victory.settlementCount },
      pauseRestart: { hp: pauseRestart.hp, lives: pauseRestart.lives, playerX: pauseRestart.playerX, wavesCleared: pauseRestart.wavesCleared },
      failure: { success: failure.resultSuccess, reason: failure.resultReason, settlementCount: failure.settlementCount }
    }
  }, null, 2));
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
  await sleep(150);
  if (server.exitCode == null) server.kill('SIGKILL');
}
