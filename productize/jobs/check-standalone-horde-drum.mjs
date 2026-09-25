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

const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256, assertions: {}, observed: {}, errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/audio/')) requests.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 6);
    game.scene.keys.MainScene.scene.start('LevelActiveScene', { node });
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ready = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running');
    if (ready) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  const observed = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const intensity = adapter.modifiers.find(item => item.id === 'horde_intensity');
    const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
    const beforeTicks = intensity._waveTicks;
    for (let tick = 0; tick < 5; tick += 1) adapter.spawnWave();
    const beatEvents = adapter.runtimeEventHistory.filter(item => item.kind === 'horde-wave-beat' && item.tick > beforeTicks);
    const swap = adapter.handleSemanticInput({ action: 'toggle_stance' });
    return { cardId: scene.node.gameplay.cardId, durationSec: scene.node.gameplay.knobs.durationSec,
      bgmKey: scene.node.gameplay.knobs.bgmKey, bgmSource: scene.audioResolver.getReport().bgmSource,
      spawnMultiplier: intensity.config.spawnMultiplier, eliteChance: intensity.config.eliteChance,
      enemySpawnRateSec: scene.node.gameplay.knobs.enemySpawnRateSec,
      waveAudioCue: intensity.config.waveAudioCue, waveAudioEveryTicks: intensity.config.waveAudioEveryTicks,
      beforeTicks, afterTicks: intensity._waveTicks, beatEvents, swap,
      stanceControlMode: stance.config.controlMode };
  });
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('sfx_horde_drum.mp3')), null, { timeout: 8000 });
  report.observed = { ...observed, requests };
  report.assertions.node6Contract = observed.cardId === 'survivor_horde' && observed.durationSec === 100
    && observed.bgmKey === 'node6_poison' && observed.bgmSource === 'asset'
    && observed.spawnMultiplier === 3 && observed.eliteChance === 0.18
    && observed.enemySpawnRateSec === 0.85;
  report.assertions.denseDrumFollowsWaveTicks = observed.waveAudioCue === 'sfx_horde_drum'
    && observed.waveAudioEveryTicks === 4 && observed.afterTicks - observed.beforeTicks === 5
    && observed.beatEvents.length >= 1
    && observed.beatEvents.every(item => item.audioCue === 'sfx_horde_drum' && (item.tick - 1) % 4 === 0)
    && requests.some(url => url.endsWith('/sfx_horde_drum.mp3'));
  report.assertions.manualStanceStillWorks = observed.stanceControlMode === 'manual'
    && observed.swap?.accepted === true && observed.swap?.stance === 'ranged';
  if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report.assertions));
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_horde_drum_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256, assertions: report.assertions, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
