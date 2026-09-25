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
const experiment = process.env.LW_DEFEND_EXPERIMENT ? JSON.parse(process.env.LW_DEFEND_EXPERIMENT) : null;
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
  method: 'seeded 120-second node-9 ideal defender: actual packaged spawn, attack, ballista, movement, collision and modifier logic; explicit authored timers at 50ms simulation steps; hold x=200 and track the most advanced attacker vertically with player speed',
  experiment,
  limitations: 'automated target selection and perfect 50ms timing; Phaser animations and scene timers are not advanced, only combat callbacks are; not a human playtest or frame-rate test',
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
    let seed = 918273645;
    Math.random = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let value = seed;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
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
  report.observed = await page.evaluate(experiment => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    const defend = adapter.modifiers.find(modifier => modifier.id === 'defend_line');
    if (experiment?.spawnMs) adapter.config.enemies.spawnIntervalMs = experiment.spawnMs;
    if (experiment?.attackMs) adapter.config.weapon.fireIntervalMs = experiment.attackMs;
    if (experiment?.spawnScalingAdd != null) adapter.config.enemies.spawnScaling.add = experiment.spawnScalingAdd;
    if (experiment?.laneFraction) {
      const originalSpawn = adapter.spawnEnemy.bind(adapter);
      adapter.spawnEnemy = (patch = {}) => {
        const enemy = originalSpawn(patch);
        const y = adapter.world.height / 2 + (enemy.y - adapter.world.height / 2) * experiment.laneFraction;
        enemy.setPosition(enemy.x, y);
        enemy.body?.reset?.(enemy.x, y);
        enemy.setData('defendLaneY', y);
        return enemy;
      };
    }
    const scene = adapter.scene;
    const startMs = scene.time.now;
    const stepMs = 50;
    const spawnMs = adapter.config.enemies.spawnIntervalMs;
    const attackMs = adapter.config.weapon.fireIntervalMs;
    const ballistaMs = defend.config.ballistaCooldownMs;
    let nextSpawn = spawnMs;
    let nextAttack = attackMs;
    let nextBallista = ballistaMs;
    let nextSecond = 1000;
    let spawned = 0;
    let attacks = 0;
    let wallBreaches = 0;
    let previousWallHp = defend.wallHp;
    const samples = [];
    for (let elapsed = 0; elapsed <= 120000 && adapter.isRunning(); elapsed += stepMs) {
      scene.time.now = startMs + elapsed;
      while (elapsed >= nextSpawn && adapter.isRunning()) {
        const before = adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e)).length;
        adapter.spawnWave();
        spawned += adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e)).length - before;
        nextSpawn += spawnMs;
      }
      while (elapsed >= nextAttack && adapter.isRunning()) {
        adapter.fireAtNearestEnemy(); attacks += 1; nextAttack += attackMs;
      }
      while (elapsed >= nextBallista && adapter.isRunning()) {
        if (experiment?.ballistaTargets) {
          adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e))
            .sort((a, b) => a.x - b.x).slice(0, experiment.ballistaTargets)
            .forEach(e => adapter.damageEnemy(e, defend.config.ballistaDamage));
        } else {
          defend.fireBallista(adapter.createRuntimeContext());
        }
        nextBallista += ballistaMs;
      }
      while (elapsed >= nextSecond && adapter.isRunning()) {
        adapter.onSecondTick(); nextSecond += 1000;
      }
      if (!adapter.isRunning()) break;
      const enemies = adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e));
      const nearestWall = enemies.filter(e => e.x <= adapter.world.width)
        .sort((a, b) => a.x - b.x)[0];
      adapter.targetPoint.x = experiment?.defenderX ?? 200;
      adapter.targetPoint.y = nearestWall?.y || adapter.world.height / 2;
      adapter.update(scene.time.now, stepMs);
      scene.physics.world.update(scene.time.now, stepMs);
      scene.physics.world.postUpdate();
      defend.update(adapter.createRuntimeContext());
      if (defend.wallHp < previousWallHp) wallBreaches += (previousWallHp - defend.wallHp) / defend.config.breachDamage;
      previousWallHp = defend.wallHp;
      // The normal scene timer destroys defeated sprites after their death clip.
      adapter.groups.enemies.getChildren().filter(e => e.getData('defeated')).forEach(e => e.destroy());
      if (elapsed % 10000 === 0) samples.push({ second: elapsed / 1000, wallHp: defend.wallHp,
        playerHp: adapter.state.hp, kills: adapter.state.kills,
        activeEnemies: enemies.length, playerX: Number(adapter.player.x.toFixed(1)),
        playerY: Number(adapter.player.y.toFixed(1)) });
    }
    return { success: adapter.result?.success ?? null, reason: adapter.result?.reason ?? null,
      elapsedSeconds: adapter.state.elapsedSeconds, wallHp: defend.wallHp,
      playerHp: adapter.state.hp, kills: adapter.state.kills, spawned, attacks, wallBreaches,
      authored: { duration: adapter.config.duration, spawnMs, attackMs, ballistaMs,
        wallHp: defend.config.wallHp, breachDamage: defend.config.breachDamage,
        laneWidthRatio: defend.config.laneWidthRatio,
        hordeMultiplier: adapter.modifiers.find(modifier => modifier.id === 'horde_intensity')?.config.spawnMultiplier },
      samples };
  }, experiment);
  if (report.observed?.success !== true || report.observed?.reason !== 'timer_expired'
    || report.observed?.elapsedSeconds !== 120 || report.observed?.wallHp <= 0
    || report.observed?.authored?.spawnMs !== 700 || report.observed?.authored?.attackMs !== 500
    || report.observed?.authored?.laneWidthRatio !== 0.34
    || report.observed?.authored?.hordeMultiplier !== 3 || report.errors.length) {
    throw new Error(`node 9 survival route failed: ${JSON.stringify(report.observed)}`);
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, experiment ? 'standalone_defend_line_survival_experiment.json' : 'standalone_defend_line_survival_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256,
  observed: report.observed, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
