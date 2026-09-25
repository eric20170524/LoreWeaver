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
  const audioRequests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/audio/')) audioRequests.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const state = game.registry.get('playerState');
    game.registry.set('playerState', {
      ...state,
      unlockedAbilities: [...new Set([...(state.unlockedAbilities || []), 'white_ape_overdrive'])]
    });
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 11);
    game.scene.keys.MainScene.scene.start('LevelActiveScene', { node });
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ready = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running');
    if (ready) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.audioResolver?.getReport?.()?.bgmPlaying === true, null, { timeout: 8000 });
  const before = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const modifier = scene.adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    const authoredModifier = scene.node.gameplay.modifiers.find(item => item.id === 'overdrive_transformation');
    const cue = window.__LOREWEAVER_EMBEDDED_SPEC__.audioCueCatalog.find(item => item.id === 'sfx_blood_heartbeat_window');
    return {
      cardId: scene.node.gameplay.cardId,
      bgmKey: scene.node.gameplay.knobs.bgmKey,
      bgmSource: scene.audioResolver.getReport().bgmSource,
      overdriveAudioCue: scene.node.gameplay.knobs.overdriveAudioCue,
      authoredDurationSec: authoredModifier?.knobs.durationSec,
      authoredDamageMultiplier: authoredModifier?.knobs.damageMultiplier,
      durationSec: modifier?.config.durationSec,
      hpTriggerRatio: modifier?.config.hpTriggerRatio,
      damageMultiplier: modifier?.config.damageMultiplier,
      requiresAbility: modifier?.config.requiresAbility,
      cueAssetPath: cue?.assetPath,
      node10HasWindowCue: Boolean(window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 10)?.gameplay?.knobs?.overdriveAudioCue)
    };
  });
  const cueRequest = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/sfx_blood_heartbeat_window.mp3'), { timeout: 8000 });
  const activation = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const action = scene.adapter.handleSemanticInput({ action: 'overdrive' });
    const modifier = scene.adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    return { action, modifier: modifier?.getTestState?.(), audio: scene.audioResolver.getReport(),
      activeSfx: [...scene.audioResolver.activeSfx].map(([audio, cue]) => ({ cue, loop: audio.loop })) };
  });
  await cueRequest;
  await page.locator('#mute-button').click();
  const muted = await page.evaluate(() => {
    const resolver = window.__LOREWEAVER_GAME__.registry.get('audioResolver');
    return { report: resolver.getReport(), volumes: [...resolver.activeSfx.keys()].map(audio => audio.volume) };
  });
  await page.locator('#pause-button').click();
  const paused = await page.evaluate(() => window.__LOREWEAVER_GAME__.registry.get('audioResolver').getReport());
  await page.locator('#pause-button').click();
  const resumed = await page.evaluate(() => window.__LOREWEAVER_GAME__.registry.get('audioResolver').getReport());
  await page.locator('#mute-button').click();
  const unmuted = await page.evaluate(() => {
    const resolver = window.__LOREWEAVER_GAME__.registry.get('audioResolver');
    return { report: resolver.getReport(), volumes: [...resolver.activeSfx.keys()].map(audio => audio.volume) };
  });
  const ended = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const modifier = adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    adapter.state.elapsedSeconds = modifier._until;
    modifier.update(adapter.createRuntimeContext());
    return { active: modifier.getTestState().active, audio: scene.audioResolver.getReport(),
      activeSfxKeys: [...scene.audioResolver.activeSfx.values()] };
  });
  report.observed = { before, activation, muted, paused, resumed, unmuted, ended, audioRequests };
  report.assertions.node11WindowContract = before.cardId === 'survivor_horde' && before.bgmKey === 'node11_gauntlet'
    && before.bgmSource === 'asset' && before.overdriveAudioCue === 'sfx_blood_heartbeat_window'
    && before.authoredDurationSec === 6 && before.authoredDamageMultiplier === 1.55
    && before.durationSec === 8 && before.hpTriggerRatio === 0.45 && Math.abs(before.damageMultiplier - 1.86) < 0.001
    && before.requiresAbility === 'white_ape_overdrive' && before.cueAssetPath?.endsWith('/sfx_blood_heartbeat_window.mp3')
    && before.node10HasWindowCue === false;
  report.assertions.acceptedAbilityTriggersFile = activation.action?.accepted === true && activation.modifier?.active === true
    && audioRequests.some(url => url.endsWith('/sfx_blood_heartbeat_window.mp3'))
    && activation.activeSfx.some(item => item.cue === 'sfx_blood_heartbeat_window' && item.loop === true);
  report.assertions.muteSilencesActiveWindow = muted.report.isMuted === true && muted.report.activeSfxCount >= 1
    && muted.volumes.every(volume => volume === 0);
  report.assertions.pauseStopsWindow = paused.isPaused === true && paused.activeSfxCount >= 1 && paused.activeSfxPlaying === 0;
  report.assertions.resumeRestartsWindow = resumed.isPaused === false && resumed.activeSfxPlaying >= 1;
  report.assertions.unmuteRestoresWindow = unmuted.report.isMuted === false && unmuted.volumes.some(volume => volume > 0);
  report.assertions.windowEndStopsCue = ended.active === false
    && !ended.activeSfxKeys.includes('sfx_blood_heartbeat_window');
  if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report.assertions));
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_overdrive_audio_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256, assertions: report.assertions, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
