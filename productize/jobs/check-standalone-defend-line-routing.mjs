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
  method: 'deterministic left-side ring draw through packaged spawnEnemy; check field-side reroute, wall targeting and physical march to breach',
  observed: null, errors: []
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
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 9);
    game.scene.start('LevelActiveScene', { node });
  });
  for (let i = 0; i < 8; i += 1) {
    if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  report.observed = await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    const defend = adapter.modifiers.find(modifier => modifier.id === 'defend_line');
    const savedRandom = adapter.random;
    const draws = [0.5, 0.5, 0.1]; // old ring angle PI; new lane stays clear of the player
    adapter.random = () => draws.shift() ?? 0.1;
    const enemy = adapter.spawnEnemy({ id: 'defend_route_probe', hp: 1000, speed: 20, damage: 1 });
    adapter.random = savedRandom;
    const spawn = { x: enemy.x, y: enemy.y };
    const target = adapter.selectEnemyTarget(enemy);
    const wallHpBefore = defend.wallHp;
    defend.update(adapter.createRuntimeContext());
    const wallHpAfterSpawn = defend.wallHp;
    let travelSteps = 0;
    const travelSamples = [];
    const startMs = adapter.scene.time.now;
    while (enemy.active && travelSteps < 900 && adapter.isRunning()) {
      adapter.scene.time.now = startMs + travelSteps * (1000 / 30);
      adapter.updateEnemies();
      if (travelSteps % 10 === 0) travelSamples.push({ step: travelSteps, x: enemy.x,
        velocityX: enemy.body?.velocity?.x, speed: enemy.getData('speed') });
      // World.update performs body.preUpdate; step alone would accumulate stale
      // previous positions and falsely accelerate the probe.
      adapter.scene.physics.world.update(adapter.scene.time.now, 1000 / 30);
      adapter.scene.physics.world.postUpdate();
      defend.update(adapter.createRuntimeContext());
      travelSteps += 1;
    }
    return { wallX: defend.wallX, worldWidth: adapter.world.width,
      spawn, target: { x: target.x, y: target.y }, wallHpBefore,
      wallHpAfterSpawn,
      wallHpAfterTravel: defend.wallHp, enemyActiveAfterTravel: enemy.active,
      travelSeconds: Number((travelSteps / 30).toFixed(2)), travelSamples,
      wallHpAuthored: defend.config.wallHp, breachDamageAuthored: defend.config.breachDamage };
  });
  const x = report.observed;
  if (!(x.spawn.x > x.wallX + 8 && x.target.x <= x.wallX + 8
    && x.wallHpAfterSpawn === x.wallHpBefore
    && x.wallHpAfterTravel === x.wallHpBefore - x.breachDamageAuthored
    && !x.enemyActiveAfterTravel && x.travelSeconds > 0
    && x.wallHpAuthored === 160 && x.breachDamageAuthored === 8)
    || report.errors.length) throw new Error(`defend line route failed: ${JSON.stringify(x)}`);
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_defend_line_routing_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
