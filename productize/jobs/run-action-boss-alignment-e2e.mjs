#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ID = '__golden_survivor_vertical_slice_ci';
const WORKSPACE_REL = `data/workspaces/${WORKSPACE_ID}`;
const WORKSPACE = path.join(ROOT, WORKSPACE_REL);
const SEED = 'action-boss-alignment-v1';
const ADVANCE_FRAMES = 205;

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: 'failed', reason, ...extra }, null, 2));
  process.exit(2);
}
function parseLastJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const starts = [];
  for (let index = 0; index < raw.length; index += 1) if (raw[index] === '{') starts.push(index);
  for (const start of starts.reverse()) {
    try { return JSON.parse(raw.slice(start)); } catch {}
  }
  return null;
}
function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}
function contentType(file) {
  return {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg'
  }[path.extname(file).toLowerCase()] || 'application/octet-stream';
}
function startStaticServer(root, port) {
  return new Promise((resolve, reject) => {
    const normalizedRoot = `${path.resolve(root)}${path.sep}`;
    const server = http.createServer((req, res) => {
      let requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (requestPath === '/') requestPath = '/index.html';
      const file = path.resolve(root, requestPath.replace(/^\/+/, ''));
      if (!`${file}${path.sep}`.startsWith(normalizedRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}
function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compileCandidate() {
  if (!fs.existsSync(WORKSPACE)) fail('golden_workspace_missing_run_golden_candidate_first');
  const tsx = path.join(ROOT, 'node_modules/.bin/tsx');
  const result = spawnSync(tsx, [
    path.join(ROOT, 'productize/release-compiler.mjs'),
    `--workspace=${WORKSPACE_REL}`,
    '--mode=candidate'
  ], { cwd: ROOT, encoding: 'utf8', env: process.env, timeout: 180000 });
  if (result.status !== 0) fail('action_boss_candidate_compile_failed', { stdout: result.stdout?.slice(-3000), stderr: result.stderr?.slice(-3000) });
  const compiler = parseLastJson(result.stdout);
  const exporter = parseLastJson(compiler?.exporterOutput);
  if (!exporter?.stage) fail('action_boss_candidate_stage_missing', { compiler });
  return { stage: path.resolve(exporter.stage), artifact: exporter.artifact || null };
}

const node = {
  id: 91,
  title: 'Action Boss Alignment Probe',
  intro: 'Read the telegraph, dodge the danger zone, then counter during the explicit counter window.',
  taunts: [],
  mechanics: 'dodge_counter_boss',
  rewards: '',
  resourceMultiplier: 1,
  durationLimit: 90,
  goalValue: 100,
  difficulty: 2,
  gameplay: {
    adapter: 'phaser',
    cardId: 'dodge_counter_boss',
    modifiers: [],
    knobs: {
      playerHp: 100,
      bossHp: 300,
      breakGaugeMax: 100,
      allowPause: true,
      allowQuit: true,
      victoryMode: 'boss_only'
    },
    patchLevel: 'L2'
  }
};

async function execute(playwright, stage, runId) {
  const port = await findOpenPort();
  const server = await startStaticServer(stage, port);
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    const errors = [];
    const apiRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text()); });
    page.on('pageerror', (error) => errors.push(error?.message || String(error)));
    page.on('request', (request) => { if (/\/api(?:\/|$|\?)/.test(request.url())) apiRequests.push(request.url()); });
    await page.addInitScript(({ seed }) => {
      window.__LOREWEAVER_DETERMINISM__ = { mode: 'verification', seed, scope: 'adapter_state_trace' };
    }, { seed: SEED });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__ != null, null, { timeout: 30000 });
    await page.evaluate((runtimeNode) => {
      const game = window.__LOREWEAVER_GAME__;
      try { game.scene.stop('LevelActiveScene'); } catch {}
      game.scene.start('LevelActiveScene', { node: runtimeNode });
    }, node);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ready = await page.evaluate(() => {
        const game = window.__LOREWEAVER_GAME__;
        const scene = game?.scene?.keys?.LevelActiveScene;
        const api = window.__LOREWEAVER_RUNTIME_OBSERVATION__;
        const caps = api?.capabilities?.() || {};
        return Boolean(game?.scene?.isActive?.('LevelActiveScene'))
          && scene?.node?.gameplay?.cardId === 'dodge_counter_boss'
          && (scene?.adapter?.status === 'running' || window.__LOREWEAVER_TEST_HOOKS__?.status === 'running')
          && caps.pause === true && caps.resume === true && caps.semanticInput === true && caps.exactFrameAdvance === true;
      });
      if (ready) break;
      const canvas = await page.locator('canvas').boundingBox().catch(() => null);
      if (canvas) await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(250);
    }

    const pause = await page.evaluate(() => window.__LOREWEAVER_RUNTIME_OBSERVATION__?.pause?.({ reason: 'action_boss_alignment' }));
    if (pause?.status !== 'passed') throw new Error(`action_boss_pause_failed:${JSON.stringify(pause)}`);
    await page.waitForFunction(() => {
      const loop = window.__LOREWEAVER_GAME__?.loop;
      return Boolean(loop) && Number(loop._coolDown || 0) === 0 && loop.running === true && loop.sleeping !== true;
    }, null, { timeout: 10000, polling: 25 });

    const outcome = await page.evaluate(({ frames }) => {
      const api = window.__LOREWEAVER_RUNTIME_OBSERVATION__;
      const before = api.snapshot();
      const move = api.input({ action: 'move', x: 20, y: 1220 });
      const advance = api.advanceFrames({ frames });
      const atCounter = api.snapshot();
      const primary = api.input({ action: 'primary' });
      const afterPrimary = api.snapshot();
      const trace = api.trace();
      const resume = api.resume({ reason: 'action_boss_alignment_complete' });
      return { before, move, advance, atCounter, primary, afterPrimary, trace, resume, capabilities: api.capabilities() };
    }, { frames: ADVANCE_FRAMES });

    if (outcome.move?.status !== 'passed') throw new Error(`action_boss_semantic_move_failed:${JSON.stringify(outcome.move)}`);
    if (outcome.advance?.status !== 'passed') throw new Error(`action_boss_exact_frame_failed:${JSON.stringify(outcome.advance)}`);
    if (outcome.atCounter?.state?.phase !== 'counter') throw new Error(`action_boss_counter_window_not_reached:${outcome.atCounter?.state?.phase}`);
    if (outcome.atCounter?.state?.hp !== 100) throw new Error(`action_boss_semantic_dodge_failed:hp=${outcome.atCounter?.state?.hp}`);
    if (outcome.primary?.status !== 'passed' || outcome.primary?.result?.accepted !== true) throw new Error(`action_boss_semantic_primary_failed:${JSON.stringify(outcome.primary)}`);
    if (!(Number(outcome.afterPrimary?.state?.bossHp) < 300)) throw new Error(`action_boss_counter_did_not_damage_boss:${outcome.afterPrimary?.state?.bossHp}`);
    if (!(Number(outcome.afterPrimary?.state?.gauge) > 0)) throw new Error(`action_boss_counter_did_not_build_gauge:${outcome.afterPrimary?.state?.gauge}`);
    if (outcome.resume?.status !== 'passed') throw new Error(`action_boss_resume_failed:${JSON.stringify(outcome.resume)}`);
    if (outcome.before?.sessionId !== outcome.afterPrimary?.sessionId || outcome.afterPrimary?.sessionId !== outcome.trace?.sessionId) {
      throw new Error('action_boss_same_session_identity_failed');
    }
    const random = outcome.atCounter?.state?.determinism?.random;
    if (random?.controlled !== true || random?.source !== 'seeded_prng' || random?.calls !== 3) {
      throw new Error(`action_boss_seeded_random_not_observed:${JSON.stringify(random)}`);
    }
    if (errors.length || apiRequests.length) throw new Error(`action_boss_browser_errors:${JSON.stringify({ errors, apiRequests })}`);

    const stateProjection = {
      hp: outcome.afterPrimary.state.hp,
      bossHp: outcome.afterPrimary.state.bossHp,
      gauge: outcome.afterPrimary.state.gauge,
      phase: outcome.afterPrimary.state.phase,
      counters: outcome.afterPrimary.state.counters,
      attackZone: outcome.afterPrimary.state.attackZone,
      randomState: outcome.afterPrimary.state.determinism?.random?.state,
      randomCalls: outcome.afterPrimary.state.determinism?.random?.calls
    };
    return {
      runId,
      sessionId: outcome.afterPrimary.sessionId,
      capabilities: outcome.capabilities,
      stateProjection,
      projectionHash: hashJson(stateProjection),
      frameResult: outcome.advance.result,
      primaryResult: outcome.primary.result
    };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  let playwright;
  try { playwright = await import('playwright'); }
  catch (error) { fail('playwright_not_installed', { error: error?.message || String(error) }); }
  const build = compileCandidate();
  const first = await execute(playwright, build.stage, 'run-a');
  const second = await execute(playwright, build.stage, 'run-b');
  if (first.sessionId === second.sessionId) fail('action_boss_sessions_must_be_independent');
  if (first.projectionHash !== second.projectionHash) {
    fail('action_boss_seeded_replay_state_mismatch', { first, second });
  }
  const report = {
    schemaVersion: 'loreweaver.action-boss-alignment-browser-report.v1',
    status: 'passed',
    createdAt: new Date().toISOString(),
    releaseEligible: false,
    fixture: false,
    synthetic: true,
    evidenceMeaning: 'Synthetic alignment node executed through the real exported LoreWeaver RuntimeKernel in two independent Chromium sessions. This proves runtime capability support only; it is not human/device/release evidence.',
    sourceConcept: 'https://github.com/tettethu/VibeGame/tree/main/src/skeletons/2d-action-boss-fight',
    adaptation: 'LoreWeaver dodge-counter action-boss variant using dodge_counter_boss; no VibeGame runtime or SceneTree code is copied.',
    candidateArtifact: build.artifact,
    seed: SEED,
    exactFrames: ADVANCE_FRAMES,
    assertions: [
      'semantic move avoids the telegraphed attack zone',
      'exact Phaser frame advance reaches the explicit counter window',
      'semantic primary is rejected/accepted by the real counter state machine rather than pointer emulation',
      'accepted counter damages boss and builds break gauge',
      'same seed yields identical declared runtime state projection across independent browser sessions',
      'zero backend API requests and zero browser errors'
    ],
    runs: [first, second]
  };
  const reportPath = path.join(WORKSPACE, 'reports/action_boss_alignment_browser_latest.json');
  writeJson(reportPath, report);
  console.log(JSON.stringify({ status: 'passed', report: path.relative(ROOT, reportPath).split(path.sep).join('/'), projectionHash: first.projectionHash }, null, 2));
}

main().catch((error) => fail('action_boss_alignment_browser_error', { error: error?.stack || error?.message || String(error) }));
