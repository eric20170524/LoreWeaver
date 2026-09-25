#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reports = path.join(root, 'data/workspaces/xuanjie-shimu-local/reports');
const anchor = JSON.parse(fs.readFileSync(path.join(reports, 'standalone_browser_report.json'), 'utf8'));
if (anchor.status !== 'passed') throw new Error('verified candidate anchor missing');
const artifact = path.join(root, anchor.artifact);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (sha256(artifact) !== anchor.artifactSha256) throw new Error('candidate artifact SHA mismatch');
const stage = artifact.slice(0, -4);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(stage, `.${url === '/' ? '/index.html' : url}`);
  if (!file.startsWith(`${stage}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256, assertions: {}, scenes: [], errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const audioRequests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/audio/')) audioRequests.push(request.url());
  });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });

  for (const nodeId of [2, 10]) {
    await page.evaluate(id => {
      const game = window.__LOREWEAVER_GAME__;
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === id);
      game.scene.stop('LevelActiveScene');
      game.scene.start('LevelActiveScene', { node });
    }, nodeId);
    for (let i = 0; i < 8; i += 1) {
      const ready = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running');
      if (ready) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
    if (nodeId === 2) {
      const beforeArenaCues = audioRequests.length;
      const phases = await page.evaluate(() => {
        const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
        adapter.movePlayer(20, adapter.scene.scale.height - 110);
        adapter.beginAttack();
        const warning = adapter.state.phase;
        adapter.update(0, adapter.config.warningSec * 1000 + 10);
        const active = adapter.state.phase;
        adapter.update(0, adapter.config.activeSec * 1000 + 10);
        return { warning, active, counter: adapter.state.phase, timeRemaining: adapter.state.timeRemaining };
      });
      await page.waitForFunction(() => {
        const paths = performance.getEntriesByType('resource').map(entry => entry.name);
        return paths.some(url => url.includes('sfx_arena_drum_warning.mp3'))
          && paths.some(url => url.includes('sfx_arena_counter_open.mp3'));
      }, null, { timeout: 8000 });
      const arenaRequests = audioRequests.slice(beforeArenaCues).map(url => new URL(url).pathname);
      report.arenaCues = { phases, audioRequests: arenaRequests };
      report.assertions.node2ArenaPhaseOrder = phases.warning === 'warning' && phases.active === 'active'
        && phases.counter === 'counter' && phases.timeRemaining > 0;
      report.assertions.node2DrumAndWindowFiles = arenaRequests.some(url => url.endsWith('/sfx_arena_drum_warning.mp3'))
        && arenaRequests.some(url => url.endsWith('/sfx_arena_counter_open.mp3'));
    }
    const requestCountBeforeCounter = audioRequests.length;
    const observed = await page.evaluate(() => {
      const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
      const adapter = scene.adapter;
      const before = new Set(scene.children.list);
      adapter.state.phase = 'counter';
      adapter.state.counterUsed = false;
      const accepted = adapter.tryCounter();
      const effects = scene.children.list.filter(item => !before.has(item) && item.active && item.getData?.('artSource') === 'atlas'
        && String(item.getData?.('artRole') || '').startsWith('vfx_')).map(item => ({
        role: item.getData('artRole'), x: item.x, y: item.y, tint: item.tintTopLeft, alpha: item.alpha
      }));
      return { accepted, player: { x: adapter.player.x, y: adapter.player.y }, effects, knobs: {
        counterAuraEffect: adapter.config.counterAuraEffect || null,
        counterAuraTint: adapter.config.counterAuraTint || null,
        counterAudioCue: adapter.config.counterAudioCue || null,
        bgmKey: adapter.config.bgmKey || null
      } };
    });
    if (nodeId === 10) {
      await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('sfx_awakening_heartbeat.mp3')), null, { timeout: 8000 });
    }
    observed.audioRequests = audioRequests.slice(requestCountBeforeCounter).map(url => new URL(url).pathname);
    report.scenes.push({ nodeId, observed });
    report.assertions[`node${nodeId}CounterAccepted`] = observed.accepted === true;
    report.assertions[`node${nodeId}NoPrematureApe`] = !observed.effects.some(effect => effect.role === 'vfx_white_ape');
    if (nodeId === 2) {
      report.assertions.node2OnlyGenericBlade = observed.knobs.counterAuraEffect === null
        && observed.effects.some(effect => effect.role === 'vfx_black_blade')
        && !observed.effects.some(effect => effect.role === 'vfx_hazard_mark');
      report.assertions.node2NoAwakeningHeartbeat = observed.knobs.counterAudioCue === null
        && !observed.audioRequests.some(url => url.includes('sfx_awakening_heartbeat.mp3'));
    } else {
      report.assertions.node10PlayerAwakeningMark = observed.knobs.counterAuraEffect === 'hazard_mark'
        && observed.effects.some(effect => effect.role === 'vfx_hazard_mark'
          && Math.abs(effect.x - observed.player.x) < 1 && Math.abs(effect.y - observed.player.y) < 1
          && effect.tint === 0xb83a2d);
      report.assertions.node10HeartbeatFileTriggered = observed.knobs.counterAudioCue === 'sfx_awakening_heartbeat'
        && observed.knobs.bgmKey === 'node10_siege'
        && observed.audioRequests.some(url => url.endsWith('/sfx_awakening_heartbeat.mp3'))
        && !observed.audioRequests.some(url => url.includes('node11_gauntlet.mp3'))
        && !observed.audioRequests.some(url => url.includes('sfx_arena_'));
      const screenshot = path.join(reports, 'candidate_node10_awakening_390x844.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      report.screenshot = path.relative(root, screenshot);
      report.screenshotSha256 = sha256(screenshot);
    }
    if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report));
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_awakening_vfx_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
