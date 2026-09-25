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
  method: '30ms virtual steps with authored keyboard movement, bow firing, projectile collision and enemy fire; aim leads the patrolling boss by one bullet flight time',
  limitations: 'idealized aim and accelerated clock; no human aiming, touch latency or frame-rate measurement',
  route: null, errors: []
};
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 5);
    game.scene.start('LevelActiveScene', { node });
  });
  for (let i = 0; i < 8; i += 1) {
    if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  report.route = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const dtMs = 30;
    const start = scene.time.now;
    let nextEnemyFire = start + adapter.config.enemyFireIntervalMs;
    let ticks = 0;
    let shotsFired = 0;
    let enemyShotsFired = 0;
    const samples = [];
    const predictedBossX = seconds => {
      const min = 50;
      const max = scene.scale.width - 50;
      const span = max - min;
      const raw = adapter.boss.x + adapter.bossVx * seconds - min;
      const period = 2 * span;
      const wrapped = ((raw % period) + period) % period;
      return min + (wrapped <= span ? wrapped : period - wrapped);
    };
    for (let tick = 0; tick < 2600 && adapter.status === 'running'; tick += 1) {
      ticks = tick + 1;
      const now = start + tick * dtMs;
      scene.time.now = now;
      while (nextEnemyFire <= now) {
        adapter.enemyFire();
        enemyShotsFired += 1;
        nextEnemyFire += adapter.config.enemyFireIntervalMs;
      }
      const flightSec = Math.max(0, (adapter.player.y - 18 - adapter.boss.y) / adapter.config.bulletSpeed);
      const targetX = predictedBossX(flightSec);
      adapter.keys.left.isDown = adapter.player.x > targetX + 14;
      adapter.keys.right.isDown = adapter.player.x < targetX - 14;
      adapter.keys.fire.isDown = true;
      const beforeShots = adapter.bullets.length;
      adapter.update(now, dtMs);
      if (adapter.bullets.length > beforeShots) shotsFired += 1;
      if (tick % 167 === 0 || adapter.status !== 'running') {
        samples.push({ sec: Number((tick * dtMs / 1000).toFixed(2)),
          playerHp: adapter.state.playerHp, bossHp: adapter.state.bossHp,
          playerX: Number(adapter.player?.x?.toFixed(1)), bossX: Number(adapter.boss?.x?.toFixed(1)) });
      }
    }
    if (adapter.keys) {
      adapter.keys.left.isDown = false;
      adapter.keys.right.isDown = false;
      adapter.keys.fire.isDown = false;
    }
    return {
      elapsedSec: Number((ticks * dtMs / 1000).toFixed(2)), shotsFired, enemyShotsFired, samples,
      final: { status: adapter.status, playerHp: adapter.state.playerHp,
        bossHp: adapter.state.bossHp, timeLimitSec: adapter.config.timeLimitSec,
        result: adapter.result ? { success: adapter.result.success, reason: adapter.result.reason } : null }
    };
  });
  if (report.route.final.result?.success !== true || report.route.final.result?.reason !== 'boss_defeated'
    || report.route.final.playerHp <= 0 || report.route.elapsedSec >= report.route.final.timeLimitSec
    || report.errors.length) throw new Error(`bow duel route failed: ${JSON.stringify(report.route.final)}`);
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_shooter_reachability_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
