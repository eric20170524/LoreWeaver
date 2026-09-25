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
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 9);
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
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('sfx_war_horn.mp3')), null, { timeout: 8000 });
  const initial = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const defend = scene.adapter.modifiers.find(item => item.id === 'defend_line');
    const node = scene.node;
    const horn = window.__LOREWEAVER_EMBEDDED_SPEC__.audioCueCatalog.find(item => item.id === 'sfx_war_horn');
    const breach = window.__LOREWEAVER_EMBEDDED_SPEC__.audioCueCatalog.find(item => item.id === 'sfx_wall_breach');
    return { cardId: node.gameplay.cardId, durationSec: node.gameplay.knobs.durationSec,
      bgmKey: node.gameplay.knobs.bgmKey, wallHp: defend.wallHp, breachDamage: defend.config.breachDamage,
      startAudioCue: defend.config.startAudioCue, breachAudioCue: defend.config.breachAudioCue,
      hornAssetPath: horn?.assetPath, breachAssetPath: breach?.assetPath,
      bgmSource: scene.audioResolver.getReport().bgmSource };
  });
  const beforeCombat = requests.length;
  const combat = await page.evaluate(() => {
    const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
    const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
    stance.performMeleeSweep(adapter.createRuntimeContext());
    const swap = adapter.handleSemanticInput({ action: 'toggle_stance' });
    stance.performRangedBurst(adapter.createRuntimeContext());
    return { swap, rangedArtRole: adapter.playerArtRole,
      events: adapter.runtimeEventHistory.filter(item => item.type === 'weapon-stance-attack')
        .map(item => item.stance).slice(-2) };
  });
  await page.waitForFunction(() => {
    const names = performance.getEntriesByType('resource').map(entry => entry.name);
    return ['sfx_blade_sweep.mp3', 'sfx_stance_ranged.mp3', 'sfx_bow_release.mp3']
      .every(name => names.some(url => url.includes(name)));
  }, null, { timeout: 8000 });
  const combatRequests = requests.slice(beforeCombat);
  const beforeBreach = requests.length;
  const firstBreach = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const defend = adapter.modifiers.find(item => item.id === 'defend_line');
    const enemy = adapter.spawnEnemy({ hp: 9999, speed: 0, damage: 0 });
    enemy.setPosition(defend.wallX, adapter.world.height / 2);
    defend.update(adapter.createRuntimeContext());
    return { wallHp: defend.wallHp, enemyActive: enemy.active,
      recentEvents: adapter.runtimeEventHistory.filter(item => item.kind === 'defend-line-breach').length };
  });
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('sfx_wall_breach.mp3')), null, { timeout: 8000 });
  const breachRequests = requests.slice(beforeBreach);
  report.observed = { initial, combat, combatRequests, firstBreach, requests, breachRequests };
  report.assertions.node9Contract = initial.cardId === 'survivor_horde' && initial.durationSec === 120
    && initial.bgmKey === 'node9_escort' && initial.bgmSource === 'asset'
    && initial.wallHp === 160 && initial.breachDamage === 8;
  report.assertions.cuesArePackaged = initial.startAudioCue === 'sfx_war_horn' && initial.breachAudioCue === 'sfx_wall_breach'
    && initial.hornAssetPath?.endsWith('/sfx_war_horn.mp3') && initial.breachAssetPath?.endsWith('/sfx_wall_breach.mp3');
  report.assertions.startHornRequested = requests.some(item => item.endsWith('/sfx_war_horn.mp3'));
  report.assertions.stanceAndLineSlashRequested = combat.swap?.accepted === true
    && combat.swap.stance === 'ranged' && combat.rangedArtRole === 'player_bow'
    && combat.events.includes('melee') && combat.events.includes('ranged')
    && ['sfx_blade_sweep.mp3', 'sfx_stance_ranged.mp3', 'sfx_bow_release.mp3']
      .every(name => combatRequests.some(item => item.endsWith(`/${name}`)));
  report.assertions.actualBreachRequested = firstBreach.wallHp === 152 && firstBreach.enemyActive === false
    && firstBreach.recentEvents >= 1 && breachRequests.some(item => item.endsWith('/sfx_wall_breach.mp3'));
  if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(report.assertions));
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_defend_line_audio_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256, assertions: report.assertions, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
