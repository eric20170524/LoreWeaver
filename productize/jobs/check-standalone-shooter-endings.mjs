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

const cases = [
  { name: 'victory', cue: 'victory_sting' },
  { name: 'timeout', cue: 'defeat_timeout' },
  { name: 'death', cue: 'defeat_death' },
  { name: 'fallback', cue: 'defeat_sting' }
];
const report = {
  status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256,
  assertions: {}, cases: [], errors: []
};
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  for (const branch of cases) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/assets/audio/')) requests.push(new URL(request.url()).pathname);
    });
    page.on('pageerror', error => report.errors.push(`${branch.name}: ${error.message}`));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
      await page.evaluate(() => {
        const game = window.__LOREWEAVER_GAME__;
        const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 5);
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
        const catalog = window.__LOREWEAVER_EMBEDDED_SPEC__.audioCueCatalog;
        return {
          cardId: scene.node.gameplay.cardId,
          bgmKey: scene.node.gameplay.knobs.bgmKey,
          timeLimitSec: scene.adapter.config.timeLimitSec,
          playerHp: scene.adapter.config.playerHp,
          bossHp: scene.adapter.config.bossHp,
          bgmSource: scene.audioResolver.getReport().bgmSource,
          cuePaths: Object.fromEntries(catalog.filter(cue => ['node5_defense', 'victory_sting', 'defeat_sting', 'defeat_timeout', 'defeat_death'].includes(cue.id))
            .map(cue => [cue.id, cue.assetPath || null]))
        };
      });
      const expectedRequest = `/assets/audio/procedural/sfx/${branch.cue}.mp3`;
      const cueRequest = page.waitForRequest(request => new URL(request.url()).pathname === expectedRequest, { timeout: 8000 });
      const after = await page.evaluate(name => {
        const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
        const adapter = scene.adapter;
        if (name === 'victory') adapter.state.bossHp = 0;
        else if (name === 'timeout') adapter.state.elapsed = adapter.config.timeLimitSec;
        else if (name === 'death') adapter.state.playerHp = 0;
        if (name === 'fallback') scene.handleAdapterEnd({ success: false, reason: 'other' });
        else adapter.update(0, 16);
        return { adapterStatus: adapter.status, reason: adapter.result?.reason || null };
      }, branch.name);
      await cueRequest;
      const caseReport = { branch: branch.name, expectedCue: branch.cue, before, after, audioRequests: requests };
      report.cases.push(caseReport);
      report.assertions[`${branch.name}CueRequested`] = requests.includes(expectedRequest);
      report.assertions[`${branch.name}Node5Contract`] = before.cardId === 'shooter_duel'
        && before.bgmKey === 'node5_defense' && before.bgmSource === 'asset'
        && before.timeLimitSec === 75 && before.playerHp === 120 && before.bossHp === 420
        && Object.values(before.cuePaths).length === 5 && Object.values(before.cuePaths).every(Boolean);
      if (branch.name !== 'fallback') {
        const expectedReason = branch.name === 'victory' ? 'boss_defeated' : branch.name === 'timeout' ? 'timer_expired' : 'hp_zero';
        report.assertions[`${branch.name}OutcomeReason`] = after.reason === expectedReason;
      }
      if (Object.values(report.assertions).some(value => value !== true)) throw new Error(JSON.stringify(caseReport));
    } finally {
      await page.close();
    }
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_shooter_endings_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256, assertions: report.assertions, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
