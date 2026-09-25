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
const artifact = path.join(root, anchor.artifact);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (anchor.status !== 'passed' || sha256(artifact) !== anchor.artifactSha256) {
  throw new Error('verified candidate anchor missing or changed');
}
const stage = artifact.slice(0, -4);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(stage, `.${url === '/' ? '/index.html' : url}`);
  if (!file.startsWith(`${stage}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const report = {
  status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256,
  method: 'advance authored brawler movement, pursuit, wave triggers and heavy attacks in 100ms virtual steps; capture each active wave after real browser render',
  limitations: 'idealized scripted route in Chromium mobile viewport, not a human playtest or device performance measurement',
  waves: [], errors: []
};
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 4);
    game.scene.start('LevelActiveScene', { node });
  });
  for (let i = 0; i < 8; i += 1) {
    if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    window.__LW_NODE4_VISUAL_ROUTE__ = { start: scene.time.now, tick: 0 };
  });

  for (let target = 0; target < 3; target += 1) {
    const wave = await page.evaluate(targetWave => {
      const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
      const adapter = scene.adapter;
      const route = window.__LW_NODE4_VISUAL_ROUTE__;
      for (; route.tick < 1200 && adapter.status === 'running'; route.tick += 1) {
        const now = route.start + route.tick * 100;
        scene.time.now = now;
        const live = adapter.enemies.filter(enemy => enemy.alive);
        const nearest = live.sort((a, b) => Math.abs(a.sprite.x - adapter.player.x) - Math.abs(b.sprite.x - adapter.player.x))[0];
        const dx = nearest ? nearest.sprite.x - adapter.player.x : Infinity;
        adapter.touchInput.right = !nearest || dx > 73;
        adapter.touchInput.left = Boolean(nearest && dx < 47 && adapter.player.x > (adapter.cameraLock?.left || 0) + 30);
        adapter.handleMovement(100);
        scene.cameras.main.preRender();
        adapter.touchInput.right = false;
        adapter.touchInput.left = false;
        if (nearest?.alive) {
          const attackDx = nearest.sprite.x - adapter.player.x;
          const distance = Math.hypot(attackDx, nearest.sprite.y - adapter.player.y);
          if (distance <= adapter.config.player.attackRange * 1.25 + nearest.radius && attackDx >= 0) {
            adapter.touchInput.right = true;
            adapter.handleMovement(0);
            adapter.touchInput.right = false;
            adapter.tryAttack(true, now);
          }
        }
        adapter.updateEnemies(100);
        adapter.checkWaveTriggers();
        if (adapter.state.waveIndex === targetWave && adapter.state.locked && adapter.cameraLock) {
          route.tick += 1;
          return {
            index: targetWave, id: adapter.config.waveList[targetWave].id,
            tick: route.tick, x: adapter.player.x, hp: adapter.state.hp,
            playerDisplay: { width: adapter.player.displayWidth, height: adapter.player.displayHeight },
            enemyDisplays: adapter.enemies.filter(enemy => enemy.alive).map(enemy => ({
              id: enemy.sprite.getData?.('enemyId'), boss: enemy.isBoss,
              width: enemy.sprite.displayWidth, height: enemy.sprite.displayHeight
            })),
            cameraLeft: adapter.cameraLock.left, cameraRight: adapter.cameraLock.right,
            enemiesAlive: adapter.enemies.filter(enemy => enemy.alive).length
          };
        }
      }
      return null;
    }, target);
    if (!wave || wave.enemiesAlive === 0) throw new Error(`wave ${target + 1} not active in visual route`);
    const captureState = await page.evaluate(() => {
      const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
      const adapter = scene.adapter;
      const route = window.__LW_NODE4_VISUAL_ROUTE__;
      for (let i = 0; i < 12 && adapter.player.x < adapter.cameraLock.left + 110; i += 1) {
        scene.time.now = route.start + route.tick * 100;
        adapter.touchInput.right = true;
        adapter.handleMovement(100);
        adapter.touchInput.right = false;
        adapter.updateEnemies(100);
        scene.cameras.main.preRender();
        route.tick += 1;
      }
      return { x: adapter.player.x, hp: adapter.state.hp, scrollX: scene.cameras.main.scrollX };
    });
    await page.waitForTimeout(120);
    const screenshot = path.join(reports, `node4_live_wave_${target + 1}_844x390.png`);
    await page.screenshot({ path: screenshot, timeout: 10000 });
    report.waves.push({ ...wave, captureState, screenshot: path.relative(root, screenshot), screenshotSha256: sha256(screenshot) });
  }
  if (report.waves.length !== 3 || report.waves.some((wave, index) => wave.index !== index)
    || report.waves[0].cameraLeft >= report.waves[1].cameraLeft
    || report.waves[1].cameraLeft >= report.waves[2].cameraLeft
    || report.waves.some(wave => wave.enemyDisplays.some(enemy => enemy.width < wave.playerDisplay.width * (enemy.boss ? 1.2 : 0.85)))
    || new Set(report.waves.map(wave => wave.screenshotSha256)).size !== 3
    || report.errors.length) {
    throw new Error(`wave visual progression failed: ${JSON.stringify(report.waves)}`);
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_brawler_live_waves_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
