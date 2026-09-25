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

const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256, assertions: {}, observed: {}, errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/audio/')) requests.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });

  const startNode = async (nodeId, armed = false) => {
    await page.evaluate(({ nodeId, armed }) => {
      const game = window.__LOREWEAVER_GAME__;
      const state = game.registry.get('playerState');
      game.registry.set('playerState', {
        ...state,
        unlockedPassives: armed ? ['white_ape_overdrive_passive'] : [],
        unlockedAbilities: []
      });
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === nodeId);
      game.scene.stop('LevelActiveScene');
      game.scene.start('LevelActiveScene', { node });
    }, { nodeId, armed });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ready = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running');
      if (ready) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  };

  await startNode(1, false);
  const beforeUnarmedRequests = requests.length;
  const unarmed = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const modifier = adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    const activation = adapter.handleSemanticInput({ action: 'overdrive' });
    return { activation, hasAura: Boolean(modifier._aura), active: modifier.getTestState().active,
      durationSec: modifier.config.durationSec, requiresPassive: modifier.config.requiresPassive,
      bgmKey: scene.node.gameplay.knobs.bgmKey };
  });
  await page.waitForTimeout(200);
  const unarmedRequests = requests.slice(beforeUnarmedRequests);

  const beforeArmedStageRequests = requests.length;
  await startNode(1, true);
  await page.waitForFunction(() => {
    const adapter = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter;
    return adapter?.runtimeEventHistory?.some(item => item.kind === 'arena-wave-started');
  }, null, { timeout: 8000 });
  const startWaveRequests = requests.slice(beforeArmedStageRequests);
  const beforeArmedRequests = requests.length;
  const armed = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
    const modifier = adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    const initialEnemies = adapter.groups.enemies.getChildren().filter(item => item.active);
    const firstPack = { count: initialEnemies.length,
      eliteCount: initialEnemies.filter(item => item.getData('id') === 'arena_elite_1').length,
      bossCount: initialEnemies.filter(item => item.getData('id') === 'arena_boss_1').length };
    const hitEnemy = initialEnemies[0];
    const beforeHitHp = hitEnemy.getData('hp');
    hitEnemy.setPosition(adapter.player.x + 40, adapter.player.y);
    hitEnemy.body?.reset?.(hitEnemy.x, hitEnemy.y);
    const startEvent = adapter.runtimeEventHistory.findLast(item => item.kind === 'arena-wave-started') || null;
    const beforeChildren = new Set(scene.children.list);
    stance.performMeleeSweep(adapter.createRuntimeContext());
    const boneHit = { beforeHp: beforeHitHp, afterHp: hitEnemy.getData('hp'),
      cue: scene.node.gameplay.knobs.meleeHitAudioCue };
    const coldSlash = scene.children.list.find(item => !beforeChildren.has(item)
      && item.getData?.('artRole') === 'vfx_black_blade');
    const swap = adapter.handleSemanticInput({ action: 'toggle_stance' });
    stance.performRangedBurst(adapter.createRuntimeContext());
    const activation = adapter.handleSemanticInput({ action: 'overdrive' });
    const aura = modifier._aura;
    return { activation, swap, active: modifier.getTestState().active, firstPack, startEvent, boneHit,
      coldSlash: coldSlash ? { source: coldSlash.getData?.('artSource'), role: coldSlash.getData?.('artRole'),
        tint: coldSlash.tintTopLeft, tintMode: coldSlash.tintMode, alpha: coldSlash.alpha } : null,
      aura: aura ? { role: aura.getData?.('artRole'), source: aura.getData?.('artSource'), tint: aura.tintTopLeft, alpha: aura.alpha, width: aura.displayWidth } : null,
      cue: scene.node.gameplay.knobs.overdriveAudioCue, bgmKey: scene.node.gameplay.knobs.bgmKey,
      durationSec: modifier.config.durationSec, timerSec: adapter.config.duration,
      waveTimeoutIsFailure: adapter.config.arenaWaveTimeoutIsFailure, meleeDamage: stance.config.meleeDamage,
      activeSfx: [...scene.audioResolver.activeSfx].map(([audio, cue]) => ({ cue, loop: audio.loop })) };
  });
  const coldBladeScreenshot = path.join(reports, 'candidate_node1_cold_blade_390x844.png');
  await page.screenshot({ path: coldBladeScreenshot, fullPage: true });
  report.coldBladeScreenshot = path.relative(root, coldBladeScreenshot);
  report.coldBladeScreenshotSha256 = sha256(coldBladeScreenshot);
  await page.waitForFunction(() => {
    const names = performance.getEntriesByType('resource').map(entry => entry.name);
    return ['sfx_blade_sweep.mp3', 'sfx_arena_counter_open.mp3', 'sfx_bow_release.mp3', 'sfx_latent_heartbeat_window.mp3']
      .every(name => names.some(url => url.includes(name)));
  }, null, { timeout: 8000 });
  const armedRequests = requests.slice(beforeArmedRequests);
  await page.waitForTimeout(500);
  const screenshot = path.join(reports, 'candidate_node1_latent_blood_390x844.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  report.screenshot = path.relative(root, screenshot);
  report.screenshotSha256 = sha256(screenshot);
  const ended = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const modifier = adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    adapter.state.elapsedSeconds = modifier._until;
    modifier.update(adapter.createRuntimeContext());
    return { active: modifier.getTestState().active, activeSfx: [...scene.audioResolver.activeSfx.values()] };
  });
  const beforeWaveRequests = requests.length;
  const waveClear = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const wave = adapter.modifiers.find(item => item.id === 'arena_wave_boss');
    adapter.groups.enemies.getChildren().forEach(enemy => enemy.destroy());
    wave.update(adapter.createRuntimeContext());
    return { wave: wave.wave, totalWaves: wave.config.totalWaves,
      waiting: wave.waiting, interWaveDelayMs: wave.config.interWaveDelayMs,
      event: adapter.runtimeEventHistory.findLast(item => item.kind === 'arena-wave-cleared') || null };
  });
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('sfx_wave_clear.mp3')), null, { timeout: 8000 });
  const waveRequests = requests.slice(beforeWaveRequests);
  const laterPacks = await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    const wave = adapter.modifiers.find(item => item.id === 'arena_wave_boss');
    const counts = [];
    for (let index = 0; index < 2; index += 1) {
      adapter.groups.enemies.getChildren().forEach(enemy => enemy.destroy());
      wave.startNextWave(adapter.createRuntimeContext());
      counts.push({ wave: wave.wave, count: adapter.groups.enemies.getChildren().filter(enemy => enemy.active).length });
    }
    return counts;
  });
  const timeout = await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    adapter.state.elapsedSeconds = adapter.config.duration - 1;
    adapter.onSecondTick();
    return { status: adapter.status, success: adapter.result?.success,
      reason: adapter.result?.reason, timeRemaining: adapter.state.timeRemaining };
  });
  const laterArenaClocks = [];
  for (const nodeId of [8, 12]) {
    await startNode(nodeId);
    laterArenaClocks.push(await page.evaluate((nodeId) => {
      const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
      const before = { nodeId, duration: adapter.config.duration,
        waveTimeoutIsFailure: adapter.config.arenaWaveTimeoutIsFailure,
        wave: adapter.modifiers.find(item => item.id === 'arena_wave_boss')?.wave };
      adapter.state.elapsedSeconds = adapter.config.duration - 1;
      adapter.onSecondTick();
      return { ...before, status: adapter.status, success: adapter.result?.success,
        reason: adapter.result?.reason, timeRemaining: adapter.state.timeRemaining };
    }, nodeId));
  }
  report.observed = { unarmed, unarmedRequests, armed, startWaveRequests, armedRequests, ended, waveClear, waveRequests, laterPacks, timeout, laterArenaClocks };
  report.assertions.unarmedRemainsSilent = unarmed.activation?.accepted === false
    && unarmed.activation?.reason === 'unarmed' && unarmed.active === false && unarmed.hasAura === false
    && !unarmedRequests.some(url => url.includes('heartbeat'));
  report.assertions.armedUsesLatentAtlasPulse = armed.activation?.accepted === true && armed.active === true
    && armed.aura?.source === 'atlas' && armed.aura?.role === 'vfx_hazard_mark'
    && armed.aura?.tint === 0xb83a2d && armed.aura?.width === 92
    && armed.aura?.alpha > 0 && armed.aura?.alpha <= 0.42
    && armed.durationSec === 6 && armed.cue === 'sfx_latent_heartbeat_window';
  report.assertions.node1ShortBladeAndBow = armed.swap?.accepted === true && armed.bgmKey === 'node1_battle'
    && armedRequests.some(url => url.endsWith('/sfx_blade_sweep.mp3'))
    && armedRequests.some(url => url.endsWith('/sfx_bow_release.mp3'))
    && !armedRequests.some(url => url.endsWith('/sfx_fire_slash.mp3'));
  report.assertions.node1BoneCrackOnMeleeHit = armed.boneHit?.beforeHp > armed.boneHit?.afterHp
    && armed.boneHit?.cue === 'sfx_arena_counter_open'
    && armedRequests.some(url => url.endsWith('/sfx_arena_counter_open.mp3'))
    && !unarmedRequests.some(url => url.endsWith('/sfx_arena_counter_open.mp3'));
  report.assertions.unforgedBladeUsesColdAtlasTint = armed.coldSlash?.source === 'atlas'
    && armed.coldSlash?.role === 'vfx_black_blade' && armed.coldSlash?.tint === 0x596c7b
    && armed.coldSlash?.tintMode === 1 && armed.coldSlash?.alpha === 0.78;
  report.assertions.latentHeartbeatStopsAtWindowEnd = armedRequests.some(url => url.endsWith('/sfx_latent_heartbeat_window.mp3'))
    && armed.activeSfx.some(item => item.cue === 'sfx_latent_heartbeat_window' && item.loop === true)
    && ended.active === false && !ended.activeSfx.includes('sfx_latent_heartbeat_window');
  report.assertions.waveOneClearTriggersCue = waveClear.wave === 1 && waveClear.totalWaves === 3
    && waveClear.waiting === true && waveClear.interWaveDelayMs === 1800
    && waveClear.event?.audioCue === 'sfx_wave_clear'
    && waveRequests.some(url => url.endsWith('/sfx_wave_clear.mp3'));
  report.assertions.waveStartDensityDrum = armed.startEvent?.wave === 1
    && armed.startEvent?.packCount === 7
    && armed.startEvent?.audioCue === 'sfx_horde_drum'
    && startWaveRequests.some(url => url.endsWith('/sfx_horde_drum.mp3'));
  report.assertions.node1HordeDensityAppliesToArenaPack = armed.firstPack?.count === 7
    && armed.firstPack?.eliteCount === 6 && armed.firstPack?.bossCount === 1
    && laterPacks[0]?.wave === 2 && laterPacks[0]?.count === 9
    && laterPacks[1]?.wave === 3 && laterPacks[1]?.count === 11;
  report.assertions.authoredClockFailsWhenWavesRemain = armed.timerSec === 75
    && armed.waveTimeoutIsFailure === true && timeout.status === 'ended'
    && timeout.success === false && timeout.reason === 'timer_expired'
    && timeout.timeRemaining === 0;
  report.assertions.laterArenasKeepAuthoredLossClocks = laterArenaClocks.length === 2
    && laterArenaClocks[0]?.nodeId === 8 && laterArenaClocks[0]?.duration === 110
    && laterArenaClocks[1]?.nodeId === 12 && laterArenaClocks[1]?.duration === 150
    && laterArenaClocks.every(item => item.waveTimeoutIsFailure === true && item.wave === 1
      && item.status === 'ended' && item.success === false
      && item.reason === 'timer_expired' && item.timeRemaining === 0);
  if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report.assertions));
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_latent_blood_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256, assertions: report.assertions, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
