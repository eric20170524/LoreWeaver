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
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const state = game.registry.get('playerState');
    game.registry.set('playerState', {
      ...state,
      unlockedAbilities: [...new Set([...(state.unlockedAbilities || []), 'white_ape_overdrive'])]
    });
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 12);
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
  const before = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
    const contract = { cardId: scene.node.gameplay.cardId, durationSec: scene.node.gameplay.knobs.durationSec,
      bossId: scene.node.gameplay.knobs.bossId, cues: {
        melee: scene.node.gameplay.knobs.meleeAudioCue,
        ranged: scene.node.gameplay.knobs.rangedAudioCue,
        overdrive: scene.node.gameplay.knobs.overdriveAudioCue
      }, bgmKey: scene.node.gameplay.knobs.bgmKey, bgmSource: scene.audioResolver.getReport().bgmSource };
    stance.performMeleeSweep(adapter.createRuntimeContext());
    return contract;
  });
  await page.waitForTimeout(40);
  const bladeShot = path.join(reports, 'candidate_node12_black_blade_390x844.png');
  await page.screenshot({ path: bladeShot });
  await page.waitForTimeout(450);
  const swap = await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
    const result = adapter.handleSemanticInput({ action: 'toggle_stance' });
    stance.performRangedBurst(adapter.createRuntimeContext());
    return result;
  });
  await page.waitForTimeout(40);
  const bowShot = path.join(reports, 'candidate_node12_purple_bow_390x844.png');
  await page.screenshot({ path: bowShot });
  const observed = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const overdrive = adapter.modifiers.find(item => item.id === 'overdrive_transformation');
    const activation = adapter.handleSemanticInput({ action: 'overdrive' });
    return { activation, overdriveActive: overdrive.getTestState().active,
      auraArtSource: overdrive._aura?.getData?.('artSource') || null,
      auraArtRole: overdrive._aura?.getData?.('artRole') || null,
      activeSfx: [...scene.audioResolver.activeSfx].map(([audio, cue]) => ({ cue, loop: audio.loop })) };
  });
  await page.waitForTimeout(40);
  const auraShot = path.join(reports, 'candidate_node12_white_ape_390x844.png');
  await page.screenshot({ path: auraShot });
  await page.waitForFunction(() => {
    const names = performance.getEntriesByType('resource').map(entry => entry.name);
    return ['sfx_black_blade.mp3', 'sfx_bow_release.mp3', 'sfx_blood_heartbeat_window.mp3']
      .every(name => names.some(url => url.includes(name)));
  }, null, { timeout: 8000 });
  report.observed = { before, swap, ...observed, requests };
  report.screenshots = [bladeShot, bowShot, auraShot].map(file => ({
    path: path.relative(root, file), sha256: sha256(file)
  }));
  report.assertions.finalNodeContract = before.cardId === 'survivor_horde'
    && before.durationSec === 150 && before.bossId === 'ancient_beast_king'
    && before.bgmKey === 'node12_finale' && before.bgmSource === 'asset';
  report.assertions.threeAuthoredCues = before.cues.melee === 'sfx_black_blade'
    && before.cues.ranged === 'sfx_bow_release'
    && before.cues.overdrive === 'sfx_blood_heartbeat_window';
  report.assertions.actualMeleeAndBowRequests = swap?.accepted === true
    && requests.some(url => url.endsWith('/sfx_black_blade.mp3'))
    && requests.some(url => url.endsWith('/sfx_bow_release.mp3'));
  report.assertions.bloodWindowAndAtlasAura = observed.activation?.accepted === true
    && observed.overdriveActive === true && observed.auraArtSource === 'atlas'
    && observed.auraArtRole === 'vfx_white_ape'
    && requests.some(url => url.endsWith('/sfx_blood_heartbeat_window.mp3'))
    && observed.activeSfx.some(item => item.cue === 'sfx_blood_heartbeat_window' && item.loop === true);
  if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report.assertions));
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_final_triad_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256, assertions: report.assertions, observed: report.observed, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
