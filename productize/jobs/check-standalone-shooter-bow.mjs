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

const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256, assertions: {}, errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 5);
    game.scene.start('LevelActiveScene', { node });
  });
  for (let i = 0; i < 8; i += 1) {
    const ready = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running');
    if (ready) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.audioResolver?.getReport?.()?.bgmPlaying === true, null, { timeout: 8000 });
  const bowRequest = page.waitForRequest(request => request.url().endsWith('/assets/audio/procedural/sfx/sfx_bow_release.mp3'), { timeout: 5000 });
  const shot = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    adapter.tryFire();
    const bullet = adapter.bullets.at(-1);
    return {
      playerArtRole: adapter.player?.getData?.('artRole'),
      playerTextureKey: adapter.player?.texture?.key,
      playerDisplayWidth: adapter.player?.displayWidth,
      bossDisplayWidth: adapter.boss?.displayWidth,
      bulletArtSource: bullet?.getData?.('artSource'),
      bulletArtRole: bullet?.getData?.('artRole'),
      bulletDisplayWidth: bullet?.displayWidth,
      bulletCount: adapter.bullets.length,
      timeLimitSec: adapter.config.timeLimitSec,
      playerHp: adapter.config.playerHp,
      bossHp: adapter.config.bossHp
    };
  });
  await bowRequest;
  report.assertions.purpleAtlasProjectile = shot.bulletArtSource === 'atlas'
    && shot.bulletArtRole === 'vfx_purple_bolt' && shot.bulletDisplayWidth >= 48;
  report.assertions.bowCharacterFromAtlas = shot.playerArtRole === 'player_bow'
    && String(shot.playerTextureKey).includes('player_bow');
  report.assertions.bowSoundRequested = true;
  report.assertions.actorsReadableOnPhone = shot.playerDisplayWidth >= 168 && shot.bossDisplayWidth >= 192;
  report.assertions.authoredCombatValuesUnchanged = shot.timeLimitSec === 75 && shot.playerHp === 120 && shot.bossHp === 420;
  report.observed = shot;
  await page.waitForFunction(() => {
    const key = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.player?.texture?.key || '';
    return key.includes('player_bow_idle');
  }, null, { timeout: 3000 });
  const bowFrames = await page.evaluate(async () => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    adapter.state.fireReadyAt = 0;
    adapter.tryFire();
    const keys = [];
    for (let index = 0; index < 36; index += 1) {
      const key = adapter.player?.texture?.key || '';
      if (keys.at(-1) !== key) keys.push(key);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return keys;
  });
  report.observed.bowFrameSequence = bowFrames;
  report.assertions.fullBowActionPlayed = [0, 1, 2, 3].every(index => bowFrames.some(key => key.endsWith(`player_bow_attack_${index}`)))
    && bowFrames.at(-1)?.includes('player_bow_idle');
  if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report.assertions));
  await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    adapter.state.fireReadyAt = 0;
    adapter.tryFire();
  });
  await page.waitForTimeout(280);
  report.observed.screenshotFrameKey = await page.evaluate(() =>
    window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.player?.texture?.key || '');
  const screenshot = path.join(reports, 'candidate_node5_bow_390x844.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  report.screenshot = path.relative(root, screenshot);
  report.screenshotSha256 = sha256(screenshot);
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_shooter_bow_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
