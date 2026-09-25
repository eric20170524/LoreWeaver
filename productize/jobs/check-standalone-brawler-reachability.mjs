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
    res.writeHead(404); res.end('not found'); return;
  }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const report = {
  status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256,
  method: 'virtual 100ms steps call authored movement, enemy pursuit, wave triggers and heavy attack; no direct position, HP or success mutation',
  limitations: 'an idealized scripted combat route, not a human touch playtest or frame-rate measurement',
  route: null, backgrounds: null, errors: []
};
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.LW_CHROMIUM_PATH ? {
      executablePath: process.env.LW_CHROMIUM_PATH,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    } : {})
  });
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
  report.backgrounds = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    return scene.children.list
      .filter(child => child.texture?.key?.startsWith('lw_landscape_bg_4_'))
      .map(child => ({ key: child.texture.key, left: child.x - child.displayWidth / 2,
        right: child.x + child.displayWidth / 2, displayHeight: child.displayHeight }))
      .sort((a, b) => a.left - b.left);
  });
  const expectedBackgroundKeys = ['lw_landscape_bg_4_0', 'lw_landscape_bg_4_1', 'lw_landscape_bg_4_2'];
  if (report.backgrounds.length !== 3
    || report.backgrounds.some((bg, index) => bg.key !== expectedBackgroundKeys[index])
    || Math.abs(report.backgrounds[0].left) > 1
    || Math.abs(report.backgrounds[0].right - report.backgrounds[1].left) > 1
    || Math.abs(report.backgrounds[1].right - report.backgrounds[2].left) > 1
    || Math.abs(report.backgrounds[2].right - 3600) > 1
    || report.backgrounds.some(bg => bg.displayHeight < 540)) {
    throw new Error(`three landscape backgrounds not mounted across stage: ${JSON.stringify(report.backgrounds)}`);
  }
  report.route = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const start = scene.time.now;
    const steps = [];
    let lastWave = -1;
    let ticks = 0;
    for (let tick = 0; tick < 1200 && adapter.status === 'running' && adapter.state.waveIndex < 3; tick += 1) {
      ticks = tick + 1;
      const now = start + tick * 100;
      scene.time.now = now;
      const live = adapter.enemies.filter(enemy => enemy.alive);
      const nearest = live.sort((a, b) => Math.abs(a.sprite.x - adapter.player.x) - Math.abs(b.sprite.x - adapter.player.x))[0];
      const dx = nearest ? nearest.sprite.x - adapter.player.x : Infinity;
      adapter.touchInput.right = !nearest || dx > 73;
      adapter.touchInput.left = Boolean(nearest && dx < 47 && adapter.player.x > (adapter.cameraLock?.left || 0) + 30);
      adapter.handleMovement(100);
      // Phaser normally advances camera follow in the render pass. Do that
      // here too because the accelerated route runs inside one browser task.
      scene.cameras.main.preRender();
      adapter.touchInput.right = false;
      adapter.touchInput.left = false;
      if (nearest?.alive) {
        const attackDx = nearest.sprite.x - adapter.player.x;
        const attackDistance = Math.hypot(attackDx, nearest.sprite.y - adapter.player.y);
        if (attackDistance <= adapter.config.player.attackRange * 1.25 + nearest.radius && attackDx >= 0) {
          adapter.touchInput.right = true;
          adapter.handleMovement(0);
          adapter.touchInput.right = false;
          adapter.tryAttack(true, now);
        }
      }
      adapter.updateEnemies(100);
      adapter.checkWaveTriggers();
      if (adapter.state.waveIndex !== lastWave) {
        steps.push({ tick, elapsedSec: tick / 10, waveIndex: adapter.state.waveIndex,
          hp: adapter.state.hp, lives: adapter.state.lives, kills: adapter.state.kills, x: adapter.player.x });
        lastWave = adapter.state.waveIndex;
      }
    }
    adapter.touchInput.right = false;
    adapter.touchInput.left = false;
    return {
      steps, final: { status: adapter.status, waveIndex: adapter.state.waveIndex,
        wavesCleared: adapter.state.wavesCleared, kills: adapter.state.kills,
        hp: adapter.state.hp, lives: adapter.state.lives,
        enemiesAlive: adapter.enemies.filter(enemy => enemy.alive).length,
        routeEvents: adapter.state.routeEventsCleared,
        result: adapter.result ? { success: adapter.result.success, reason: adapter.result.reason } : null },
      elapsedSec: ticks / 10,
      authoredWaves: adapter.config.waveList.map(wave => ({ id: wave.id, enemies: wave.enemies.length }))
    };
  });
  await page.waitForTimeout(800);
  report.route.afterSettlement = await page.evaluate(() => ({
    currentScene: window.__LOREWEAVER_GAME__.scene.isActive('MainScene') ? 'MainScene' : 'LevelActiveScene',
    result: window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene?.adapter?.result
      ? { success: window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.result.success,
          reason: window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.result.reason }
      : null
  }));
  if (report.route.final.wavesCleared !== 3 || report.route.final.kills !== 9
    || report.route.final.enemiesAlive !== 0 || report.route.final.hp <= 0
    || report.route.final.result?.success !== true || report.route.final.result?.reason !== 'all_clear'
    || report.errors.length) {
    throw new Error(`three-wave combat route failed: ${JSON.stringify(report.route.final)}`);
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_brawler_reachability_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
