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

const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256,
  method: 'exact-ZIP static host; directly advance the authored finite arena to wave 5 for visual capture',
  limitations: 'synthetic wave selection; no player route, combat survival, or real-time density claim',
  observation: null, screenshot: null, errors: [] };
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
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 8);
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
  report.observation = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const arena = adapter.modifiers.find(item => item.id === 'arena_wave_boss');
    const waves = [];
    const recordWave = () => {
      const enemies = adapter.groups.enemies.getChildren().filter(enemy => enemy.active);
      waves.push({ wave: arena.wave, enemies: enemies.length,
        atlasEnemies: enemies.filter(enemy => enemy.getData('artSource') === 'atlas').length,
        enemyIds: [...new Set(enemies.map(enemy => enemy.getData('id')))].sort() });
    };
    recordWave();
    for (let wave = arena.wave; wave < arena.config.totalWaves; wave += 1) {
      adapter.groups.enemies.getChildren().forEach(enemy => enemy.destroy());
      arena.startNextWave(adapter.createRuntimeContext());
      recordWave();
    }
    const enemies = adapter.groups.enemies.getChildren().filter(enemy => enemy.active);
    return { nodeId: Number(scene.node.id), cardId: scene.node.gameplay.cardId,
      envKey: scene.node.gameplay.knobs.envKey, artAtlasFirst: scene.node.gameplay.knobs.artAtlasFirst,
      modifierIds: scene.node.gameplay.modifiers.map(item => item.id),
      wave: arena.wave, totalWaves: arena.config.totalWaves,
      waves,
      durationSec: adapter.config.duration, enemyVisualMultiplier: adapter.config.enemyVisualMultiplier,
      player: { x: adapter.player.x, y: adapter.player.y, displayWidth: adapter.player.displayWidth },
      enemies: enemies.map(enemy => ({ id: enemy.getData('id'), artSource: enemy.getData('artSource'),
        x: Number(enemy.x.toFixed(2)), y: Number(enemy.y.toFixed(2)), active: enemy.active,
        radius: enemy.getData('radius'), displayWidth: Number(enemy.displayWidth.toFixed(2)),
        bodyWidth: Number(enemy.body.width.toFixed(2)),
        sourceWidth: enemy.frame.width })) };
  });
  await page.waitForTimeout(100);
  const screenshot = path.join(reports, 'candidate_node8_siege_wave5_390x844.png');
  await page.screenshot({ path: screenshot });
  report.screenshot = path.relative(root, screenshot);
  report.screenshotSha256 = sha256(screenshot);
  const o = report.observation;
  const bosses = o.enemies.filter(enemy => enemy.id === 'arena_boss_5');
  const elites = o.enemies.filter(enemy => enemy.id === 'arena_elite_5');
  const left = o.enemies.some(enemy => enemy.x < o.player.x - 20);
  const right = o.enemies.some(enemy => enemy.x > o.player.x + 20);
  const above = o.enemies.some(enemy => enemy.y < o.player.y - 20);
  const below = o.enemies.some(enemy => enemy.y > o.player.y + 20);
  const allWavesCovered = o.waves.length === 5 && o.waves.every((wave, index) =>
    wave.wave === index + 1 && wave.enemies === index + 4
    && wave.atlasEnemies === wave.enemies
    && JSON.stringify(wave.enemyIds) === JSON.stringify([
      `arena_boss_${index + 1}`, `arena_elite_${index + 1}`]));
  const readableSizes = elites.every(enemy => enemy.displayWidth >= o.player.displayWidth * 0.85)
    && bosses.every(enemy => enemy.displayWidth >= o.player.displayWidth * 1.5);
  const unchangedCollision = o.enemies.every(enemy =>
    Math.abs(enemy.bodyWidth - enemy.displayWidth / o.enemyVisualMultiplier / 2) < 0.6);
  if (report.errors.length || o.nodeId !== 8 || o.cardId !== 'survivor_horde'
    || o.envKey !== 'env_bg_ruins' || o.artAtlasFirst !== true
    || o.durationSec !== 110 || o.wave !== 5 || o.totalWaves !== 5
    || o.enemies.length !== 8 || bosses.length !== 1 || elites.length !== 7
    || !o.enemies.every(enemy => enemy.artSource === 'atlas') || !allWavesCovered
    || !left || !right || !above || !below || !readableSizes || !unchangedCollision
    || JSON.stringify(o.modifierIds) !== JSON.stringify(['weapon_stance_cycle', 'hazard_telegraph', 'arena_wave_boss'])) {
    throw new Error(`node 8 siege contract failed: ${JSON.stringify(o)}`);
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_node8_siege_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256,
  observation: report.observation && { wave: report.observation.wave, enemies: report.observation.enemies.length },
  errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
