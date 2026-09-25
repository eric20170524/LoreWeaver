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
const sha = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
if (anchor.status !== 'passed' || sha !== anchor.artifactSha256) throw new Error('verified candidate missing');
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
const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: sha, screenshot: null, observed: null, errors: [] };
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
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 9);
    game.scene.start('LevelActiveScene', { node });
  });
  for (let i = 0; i < 8; i += 1) {
    if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => {
    const adapter = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter;
    if (adapter?.status !== 'running') return false;
    const defend = adapter.modifiers.find(item => item.id === 'defend_line');
    return adapter.groups.enemies.getChildren().some(enemy => enemy.active
      && enemy.x > defend.wallX + 80 && enemy.x < adapter.world.width * 0.7);
  }, null, { timeout: 35000 });
  report.observed = await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    const defend = adapter.modifiers.find(item => item.id === 'defend_line');
    const enemies = adapter.groups.enemies.getChildren().filter(enemy => enemy.active);
    return { cardId: adapter.config.id, wallX: defend.wallX, worldWidth: adapter.world.width,
      enemyVisualMultiplier: adapter.config.enemyVisualMultiplier,
      playerDisplayWidth: Number(adapter.player.displayWidth.toFixed(2)),
      enemyCount: enemies.length, enemyX: enemies.map(enemy => Math.round(enemy.x)),
      enemySizes: enemies.map(enemy => ({ id: enemy.getData('id'), radius: enemy.getData('radius'),
        displayWidth: Number(enemy.displayWidth.toFixed(2)), bodyWidth: Number(enemy.body.width.toFixed(2)),
        sourceWidth: enemy.frame.width })),
      visibleEnemyCount: enemies.filter(enemy => enemy.x > defend.wallX + 80 && enemy.x < adapter.world.width * 0.7).length,
      wallHp: defend.wallHp, wallHpAuthored: defend.config.wallHp };
  });
  const screenshot = path.join(reports, 'candidate_node9_field_direction_390x844.png');
  await page.screenshot({ path: screenshot });
  report.screenshot = { path: path.relative(root, screenshot).split(path.sep).join('/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex') };
  const x = report.observed;
  const readableSizes = x.enemySizes.every(enemy => enemy.displayWidth >= x.playerDisplayWidth * 0.65);
  const unchangedCollision = x.enemySizes.every(enemy =>
    Math.abs(enemy.bodyWidth - enemy.displayWidth / x.enemyVisualMultiplier / 2) < 0.6);
  if (x.wallHpAuthored !== 160 || x.visibleEnemyCount < 1
    || x.enemyX.filter(value => value > x.wallX + 8).length < 1
    || !readableSizes || !unchangedCollision || report.errors.length) {
    throw new Error(`field direction capture failed: ${JSON.stringify(x)}`);
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack : String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_defend_line_visual_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}
