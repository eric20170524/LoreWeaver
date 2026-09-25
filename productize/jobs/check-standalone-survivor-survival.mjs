#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reports = path.join(root, 'data/workspaces/xuanjie-shimu-local/reports');
const anchorReport = process.env.LW_SURVIVOR_CANDIDATE_REPORT
  || path.join(reports, 'standalone_browser_report.json');
const anchor = JSON.parse(fs.readFileSync(anchorReport, 'utf8'));
const routeExperiment = Boolean(process.env.LW_SURVIVOR_ROUTE);
const routeConfig = routeExperiment
  ? JSON.parse(process.env.LW_SURVIVOR_ROUTE)
  : { mode: 'perimeter', periodSec: 20, holdSec: 2 };
const balanceConfig = process.env.LW_SURVIVOR_BALANCE ? JSON.parse(process.env.LW_SURVIVOR_BALANCE) : null;
const seedSalt = Number(process.env.LW_SURVIVOR_SEED_SALT || 0);
if (!Number.isSafeInteger(seedSalt) || seedSalt < 0) throw new Error('invalid LW_SURVIVOR_SEED_SALT');
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
  method: 'seeded exact-package node-3/6/11 survival route; perimeter motion with authored player speed, real spawn, melee, movement, collisions, second ticks, boss and debuff modifiers; node-3 hazard strikes use authored warning delay and real strike/damage callback',
  limitations: 'idealized 50ms pointer steering and timer scheduling; animation and cosmetic cleanup timers are not advanced; no device frame-rate or human-control claim',
  routeConfig,
  balanceConfig,
  seedSalt,
  routes: [], errors: []
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
  for (const nodeId of [3, 6, 11]) {
    await page.evaluate(({ nodeId, balanceConfig, seedSalt }) => {
      let seed = (nodeId * 2654435761 + seedSalt * 1013904223) >>> 0;
      Math.random = () => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let value = seed;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
      const game = window.__LOREWEAVER_GAME__;
      const earned = nodeId === 3 ? ['fengchi_blade'] : nodeId === 6
        ? ['fengchi_blade', 'black_blade_flame']
        : ['fengchi_blade', 'black_blade_flame', 'swallow_moon', 'white_ape_overdrive'];
      const state = game.registry.get('playerState');
      game.registry.set('playerState', { ...state, unlockedAbilities: earned,
        unlockedPassives: nodeId === 3 ? [] : ['blade_speed_1', 'bow_burst_1'] });
      const node = structuredClone(window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === nodeId));
      const balance = balanceConfig?.[nodeId];
      if (balance?.attackMs) {
        node.gameplay.knobs.weapon = { ...(node.gameplay.knobs.weapon || {}), fireIntervalMs: balance.attackMs };
      }
      if (balance?.playerHp) {
        node.gameplay.knobs.player = { ...(node.gameplay.knobs.player || {}), hp: balance.playerHp };
      }
      if (balance?.spawnMs) node.gameplay.knobs.enemySpawnRateSec = balance.spawnMs / 1000;
      if (balance?.hordeMultiplier) {
        const horde = node.gameplay.modifiers.find(item => item.id === 'horde_intensity');
        if (horde) horde.knobs.spawnMultiplier = balance.hordeMultiplier;
      }
      game.scene.stop('LevelActiveScene');
      game.scene.start('LevelActiveScene', { node });
    }, { nodeId, balanceConfig, seedSalt });
    for (let i = 0; i < 8; i += 1) {
      if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
    const route = await page.evaluate(({ nodeId, routeConfig }) => {
      const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
      const scene = adapter.scene;
      const stepMs = 50;
      const duration = adapter.config.duration;
      const spawnMs = adapter.config.enemies.spawnIntervalMs;
      // The repeating attack timer is created before debuff_zone can mutate
      // config.weapon.fireIntervalMs; use the timer's installed base cadence.
      const attackMs = adapter.modifiers.find(item => item.id === 'debuff_zone')?._baseFire
        || adapter.config.weapon.fireIntervalMs;
      const startMs = scene.time.now;
      const hazard = adapter.modifiers.find(item => item.id === 'hazard_telegraph');
      const debuff = adapter.modifiers.find(item => item.id === 'debuff_zone');
      const overdrive = adapter.modifiers.find(item => item.id === 'overdrive_transformation');
      let nextSpawn = spawnMs;
      let nextAttack = attackMs;
      let nextSecond = 1000;
      let nextHazard = hazard?.config.intervalMs ?? Infinity;
      let nextDebuffMove = debuff?.config.moveIntervalMs ?? Infinity;
      let nextOverdrive = overdrive?.isArmed(adapter) ? 0 : Infinity;
      const pendingHazards = [];
      let spawned = 0;
      let swings = 0;
      let hazardStrikes = 0;
      let overdriveActivations = 0;
      const samples = [];
      for (let elapsed = 0; elapsed <= duration * 1000 && adapter.isRunning(); elapsed += stepMs) {
        scene.time.now = startMs + elapsed;
        while (elapsed >= nextSpawn && adapter.isRunning()) {
          const before = adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e)).length;
          adapter.spawnWave();
          spawned += adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e)).length - before;
          nextSpawn += spawnMs;
        }
        while (elapsed >= nextAttack && adapter.isRunning()) {
          adapter.fireAtNearestEnemy(); swings += 1; nextAttack += attackMs;
        }
        while (elapsed >= nextSecond && adapter.isRunning()) {
          adapter.onSecondTick(); nextSecond += 1000;
        }
        if (!adapter.isRunning()) break;
        while (elapsed >= nextHazard && adapter.isRunning()) {
          pendingHazards.push({ at: nextHazard + hazard.config.warningDelayMs,
            point: hazard.pickPoint(adapter.createRuntimeContext()) });
          nextHazard += hazard.config.intervalMs;
        }
        while (pendingHazards.length && pendingHazards[0].at <= elapsed && adapter.isRunning()) {
          const { point } = pendingHazards.shift();
          hazard.strike(adapter.createRuntimeContext(), point);
          hazardStrikes += 1;
          for (const object of hazard.activeObjects) object.destroy?.();
          hazard.activeObjects.clear();
        }
        while (elapsed >= nextDebuffMove && adapter.isRunning()) {
          debuff.moveTimer?.callback?.();
          nextDebuffMove += debuff.config.moveIntervalMs;
        }
        while (elapsed >= nextOverdrive && adapter.isRunning()) {
          const result = adapter.handleSemanticInput({ action: 'overdrive' });
          if (result?.accepted) overdriveActivations += 1;
          nextOverdrive += 25000;
        }
        if (routeConfig?.mode === 'evasion') {
          const enemies = adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e));
          const speed = Number(adapter.config.player.speed) || 150;
          const horizon = routeConfig.horizonSec || 0.7;
          let best = { score: -Infinity, x: adapter.player.x, y: adapter.player.y };
          for (let i = 0; i < 16; i += 1) {
            const angle = i * Math.PI / 8;
            const x = Math.max(20, Math.min(adapter.world.width - 20,
              adapter.player.x + Math.cos(angle) * speed * horizon));
            const y = Math.max(20, Math.min(adapter.world.height - 20,
              adapter.player.y + Math.sin(angle) * speed * horizon));
            let nearest = 500;
            let pressure = 0;
            for (const enemy of enemies) {
              const dx = adapter.player.x - enemy.x;
              const dy = adapter.player.y - enemy.y;
              const distance = Math.hypot(dx, dy) || 1;
              const enemySpeed = Number(enemy.getData('speed')) || 80;
              const predict = Math.min(distance, enemySpeed * horizon);
              const ex = enemy.x + dx / distance * predict;
              const ey = enemy.y + dy / distance * predict;
              const d = Math.hypot(x - ex, y - ey);
              nearest = Math.min(nearest, d);
              if (d < 190) pressure += 1 / Math.max(12, d - 10);
            }
            const edgeDistance = Math.min(x, adapter.world.width - x, y, adapter.world.height - y);
            const score = nearest - pressure * 140
              + Math.min(60, edgeDistance) * 0.1
              + (Math.cos(angle) * (routeConfig?.biasX || 0) + Math.sin(angle) * (routeConfig?.biasY || 0));
            if (score > best.score) best = { score, x, y };
          }
          adapter.targetPoint.x = best.x;
          adapter.targetPoint.y = best.y;
        } else if (routeConfig?.mode === 'perimeter') {
          const w = adapter.world.width;
          const h = adapter.world.height;
          const corners = [[w - 20, h / 2], [w - 20, h - 20], [20, h - 20],
            [20, 20], [w - 20, 20], [w - 20, h / 2]];
          const lengths = corners.slice(1).map((point, index) =>
            Math.hypot(point[0] - corners[index][0], point[1] - corners[index][1]));
          const circumference = lengths.reduce((sum, length) => sum + length, 0);
          const periodSec = routeConfig.periodSec || 20;
          let distance = Math.max(0, elapsed / 1000 - (routeConfig.holdSec || 0))
            * circumference / periodSec % circumference;
          let segment = 0;
          while (distance > lengths[segment] && segment < lengths.length - 1) {
            distance -= lengths[segment]; segment += 1;
          }
          const ratio = distance / lengths[segment];
          adapter.targetPoint.x = corners[segment][0] + (corners[segment + 1][0] - corners[segment][0]) * ratio;
          adapter.targetPoint.y = corners[segment][1] + (corners[segment + 1][1] - corners[segment][1]) * ratio;
        } else {
          const periodSec = routeConfig?.periodSec || 18;
          const phase = (elapsed / 1000) * (Math.PI * 2 / periodSec);
          adapter.targetPoint.x = adapter.world.width / 2 + (routeConfig?.radiusX || 155) * Math.cos(phase);
          adapter.targetPoint.y = adapter.world.height / 2 + (routeConfig?.radiusY || 310) * Math.sin(phase);
        }
        adapter.update(scene.time.now, stepMs);
        scene.physics.world.update(scene.time.now, stepMs);
        scene.physics.world.postUpdate();
        adapter.groups.enemies.getChildren().filter(e => e.getData('defeated')).forEach(e => e.destroy());
        if (elapsed % 10000 === 0) samples.push({ second: elapsed / 1000, hp: adapter.state.hp,
          kills: adapter.state.kills,
          activeEnemies: adapter.groups.enemies.getChildren().filter(e => adapter.isEnemyTargetable(e)).length,
          x: Number(adapter.player.x.toFixed(1)), y: Number(adapter.player.y.toFixed(1)) });
      }
      return { nodeId, success: adapter.result?.success ?? null,
        reason: adapter.result?.reason ?? null,
        elapsedSeconds: adapter.state.elapsedSeconds, duration,
        hp: adapter.state.hp, kills: adapter.state.kills, spawned, swings,
        hazardStrikes, overdriveActivations, samples,
        authored: { spawnMs, attackMs, playerHp: adapter.config.player.hp,
          hordeMultiplier: adapter.modifiers.find(item => item.id === 'horde_intensity')?.config.spawnMultiplier ?? null,
          debuffZoneRadius: debuff?.config.zoneRadius ?? null,
          bossId: adapter.config.boss?.id ?? null } };
    }, { nodeId, routeConfig });
    report.routes.push(route);
  }
  const byNode = Object.fromEntries(report.routes.map(route => [route.nodeId, route]));
  if (report.errors.length || report.routes.length !== 3
    || byNode[3]?.success !== true || byNode[3]?.hazardStrikes < 1
    || byNode[3]?.authored?.spawnMs !== 1000 || byNode[3]?.authored?.attackMs !== 800
    || byNode[3]?.authored?.bossId !== 'human_genius'
    || byNode[6]?.success !== true || byNode[6]?.reason !== 'timer_expired'
    || byNode[6]?.elapsedSeconds !== 100 || byNode[6]?.hp <= 0
    || byNode[6]?.authored?.spawnMs !== (balanceConfig?.[6]?.spawnMs || 850)
    || byNode[6]?.authored?.attackMs !== (balanceConfig?.[6]?.attackMs || 350)
    || byNode[6]?.authored?.playerHp !== (balanceConfig?.[6]?.playerHp || 140)
    || byNode[6]?.authored?.hordeMultiplier !== (balanceConfig?.[6]?.hordeMultiplier || 3)
    || byNode[6]?.authored?.debuffZoneRadius !== 90
    || byNode[11]?.success !== true || !['timer_expired', 'boss_defeated'].includes(byNode[11]?.reason)
    || byNode[11]?.elapsedSeconds > 125 || byNode[11]?.hp <= 0
    || byNode[11]?.authored?.spawnMs !== (balanceConfig?.[11]?.spawnMs || 550)
    || byNode[11]?.authored?.attackMs !== (balanceConfig?.[11]?.attackMs || 500)
    || byNode[11]?.authored?.playerHp !== (balanceConfig?.[11]?.playerHp || 210)
    || byNode[11]?.authored?.hordeMultiplier !== (balanceConfig?.[11]?.hordeMultiplier || 4)
    || byNode[11]?.authored?.bossId !== 'qiongqi_cub'
    || byNode[11]?.overdriveActivations < 1) {
    throw new Error(`survivor survival route failed: ${JSON.stringify(report.routes)}`);
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, routeExperiment || balanceConfig || seedSalt ? 'standalone_survivor_survival_experiment.json' : 'standalone_survivor_survival_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256,
  routes: report.routes.map(({ nodeId, success, reason, elapsedSeconds, duration, hp, kills, spawned, swings, hazardStrikes, overdriveActivations }) =>
    ({ nodeId, success, reason, elapsedSeconds, duration, hp, kills, spawned, swings, hazardStrikes, overdriveActivations })),
  errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
