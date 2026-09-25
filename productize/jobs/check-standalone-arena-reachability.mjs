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
  method: 'prior mandatory clear rewards and purchasable blade_speed_1/bow_burst_1 equipped for late arenas; player intercepts to 80% of melee radius while enemies pursue at authored speed; real melee attacks, damage, drops and growth; cosmetic death cleanup; authored attack and wave intervals',
  limitations: 'idealized route with no collision or hazard damage, obstacle pathing, missed attacks, reaction delay or frame-rate sampling; this is a combat reachability lower bound, not a human playtest or balance sign-off',
  routes: [], firstWaveScreenshots: [], errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });

  for (const nodeId of [1, 8, 12]) {
    await page.evaluate(nodeId => {
      const game = window.__LOREWEAVER_GAME__;
      let seed = (nodeId * 2654435761) >>> 0;
      Math.random = () => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let value = seed;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
      const earned = nodeId === 1 ? [] : nodeId === 8
        ? ['fengchi_blade', 'black_blade_flame', 'swallow_moon']
        : ['fengchi_blade', 'black_blade_flame', 'swallow_moon', 'white_ape_overdrive'];
      const state = game.registry.get('playerState');
      game.registry.set('playerState', { ...state, unlockedAbilities: earned,
        unlockedPassives: nodeId === 1 ? [] : ['blade_speed_1', 'bow_burst_1'] });
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === nodeId);
      game.scene.stop('LevelActiveScene');
      game.scene.start('LevelActiveScene', { node });
    }, nodeId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
    await page.waitForTimeout(250);
    const screenshot = path.join(reports, `candidate_arena_first_wave_node${nodeId}_390x844.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    report.firstWaveScreenshots.push({ nodeId, path: path.relative(root, screenshot), sha256: sha256(screenshot) });
    const route = await page.evaluate(nodeId => {
      const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
      const arena = adapter.modifiers.find(item => item.id === 'arena_wave_boss');
      const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
      const limitSec = adapter.config.duration;
      const attackMs = adapter.config.weapon.fireIntervalMs;
      const speed = adapter.config.player.speed;
      const strategy = 'intercept_to_melee_radius';
      const playerStart = { x: adapter.player.x, y: adapter.player.y };
      const firstWavePositions = adapter.groups.enemies.getChildren().filter(enemy => enemy.active)
        .map(enemy => ({ id: enemy.getData('id'), x: Number(enemy.x.toFixed(1)),
          y: Number(enemy.y.toFixed(1)),
          distance: Number(Math.hypot(enemy.x - adapter.player.x, enemy.y - adapter.player.y).toFixed(1)),
          insideWorld: enemy.x >= 0 && enemy.x <= adapter.world.width
            && enemy.y >= 0 && enemy.y <= adapter.world.height }));
      let simulatedMs = 0;
      let nextSecondMs = 1000;
      let swings = 0;
      let travelMs = 0;
      const waveRecords = [];
      const advance = ms => {
        adapter.groups.enemies.getChildren().filter(enemy => adapter.isEnemyTargetable(enemy))
          .forEach(enemy => {
            const dx = adapter.player.x - enemy.x;
            const dy = adapter.player.y - enemy.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= 0) return;
            const move = Math.min(distance, (Number(enemy.getData('speed')) || 0) * ms / 1000);
            enemy.setPosition(enemy.x + dx / distance * move, enemy.y + dy / distance * move);
          });
        simulatedMs += ms;
        while (nextSecondMs <= simulatedMs && adapter.status === 'running') {
          adapter.onSecondTick();
          nextSecondMs += 1000;
        }
      };
      while (adapter.status === 'running' && arena.wave <= arena.config.totalWaves && swings < 1500) {
        const currentWave = arena.wave;
        const startMs = simulatedMs;
        const startKills = adapter.state.kills;
        while (adapter.status === 'running') {
          const targets = adapter.groups.enemies.getChildren().filter(enemy => adapter.isEnemyTargetable(enemy));
          if (!targets.length) break;
          const target = targets.reduce((best, enemy) =>
            Math.hypot(enemy.x - adapter.player.x, enemy.y - adapter.player.y)
              < Math.hypot(best.x - adapter.player.x, best.y - adapter.player.y) ? enemy : best);
          const dx = target.x - adapter.player.x;
          const dy = target.y - adapter.player.y;
          const distance = Math.hypot(dx, dy);
          const desiredRange = (Number(stance.config.meleeRadius) || 0) * 0.8;
          const walkMs = Math.max(0, distance - desiredRange)
            / (speed + (Number(target.getData('speed')) || 0)) * 1000;
          const nextPlayerX = adapter.player.x + (distance ? dx / distance * speed * walkMs / 1000 : 0);
          const nextPlayerY = adapter.player.y + (distance ? dy / distance * speed * walkMs / 1000 : 0);
          advance(walkMs);
          travelMs += walkMs;
          if (adapter.status === 'running') adapter.player.setPosition(nextPlayerX, nextPlayerY);
          if (adapter.status !== 'running') break;
          adapter.fireAtNearestEnemy();
          swings += 1;
          advance(attackMs);
          // In the browser the defeated sprite is destroyed after its 120 ms death clip.
          // Clear only already defeated sprites before checking wave completion.
          adapter.groups.enemies.getChildren()
            .filter(enemy => enemy.getData('defeated'))
            .forEach(enemy => enemy.destroy());
          if (adapter.state.score < 8) {
            const collectible = adapter.groups.collectibles.getChildren().find(item => item.active);
            if (collectible) {
              const pickupMs = Math.hypot(collectible.x - adapter.player.x, collectible.y - adapter.player.y)
                / speed * 1000;
              advance(pickupMs);
              travelMs += pickupMs;
              if (adapter.status === 'running') {
                adapter.player.setPosition(collectible.x, collectible.y);
                adapter.handleCollectibleOverlap(adapter.player, collectible);
              }
            }
          }
          stance.update(adapter.createRuntimeContext());
        }
        waveRecords.push({ wave: currentWave, elapsedMs: Math.round(simulatedMs - startMs),
          kills: adapter.state.kills - startKills,
          meleeDamage: Number(stance.config.meleeDamage),
          reachedGrowth: [...(stance._runGrowth?.reached || [])] });
        if (adapter.status !== 'running') break;
        arena.update(adapter.createRuntimeContext());
        advance(arena.config.interWaveDelayMs);
        if (adapter.status === 'running') arena.startNextWave(adapter.createRuntimeContext());
      }
      return { nodeId, strategy, world: { width: adapter.world.width, height: adapter.world.height },
        playerStart, firstWavePositions,
        equippedAbilities: adapter.payload?.inventory?.unlockedAbilities || [],
        equippedPassives: adapter.payload?.inventory?.unlockedPassives || [],
        limitSec, attackMs, speed, elapsedSec: Number((simulatedMs / 1000).toFixed(2)),
        travelSec: Number((travelMs / 1000).toFixed(2)), swings, kills: adapter.state.kills,
        score: adapter.state.score,
        stance: stance.getTestState().currentStance, waves: waveRecords,
        status: adapter.status, success: adapter.result?.success, reason: adapter.result?.reason };
    }, nodeId);
    report.routes.push(route);
  }
  const expectedKills = { 1: 27, 8: 30, 12: 39 };
  if (report.errors.length || report.routes.some(route => route.status !== 'ended'
    || route.success !== true || route.reason !== 'objective_met'
    || route.elapsedSec >= route.limitSec || route.waves.length === 0
    || route.swings === 0 || route.kills !== expectedKills[route.nodeId]
    || route.firstWavePositions.length === 0 || !route.firstWavePositions.every(enemy => enemy.insideWorld)
    || route.score < 8 || !route.waves.some(wave => wave.reachedGrowth.includes('melee_mastery')))) {
    throw new Error('one or more ideal combat routes missed the authored clear limit');
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_arena_reachability_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256,
  routes: report.routes.map(({ nodeId, elapsedSec, limitSec, swings, kills, success, reason }) =>
    ({ nodeId, elapsedSec, limitSec, swings, kills, success, reason })), errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
