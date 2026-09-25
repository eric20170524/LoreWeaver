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

const report = {
  status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256,
  method: '10ms virtual frames through the packaged rhythm adapter; one primary input at each authored beat target',
  limitations: 'exact automated timing without human reaction or touch latency; no frame-rate measurement',
  visual: null, visualScreenshot: null, route: null, errors: []
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
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 7);
    game.scene.start('LevelActiveScene', { node });
  });
  for (let i = 0; i < 8; i += 1) {
    if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
  report.visual = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const target = scene.adapter.rhythmUI?.target;
    const moon = scene.adapter.rhythmUI?.moon;
    return { nodeId: Number(scene.node?.id), cardId: scene.node?.gameplay?.cardId,
      envKey: scene.node?.gameplay?.knobs?.envKey,
      targetFillColor: target?.fillColor, targetFillAlpha: target?.fillAlpha,
      targetStrokeColor: target?.strokeColor, moonArtSource: moon?.getData?.('artSource') };
  });
  const visualScreenshot = path.join(reports, 'candidate_node7_moon_silver_390x844.png');
  await page.screenshot({ path: visualScreenshot });
  report.visualScreenshot = path.relative(root, visualScreenshot);
  report.visualScreenshotSha256 = sha256(visualScreenshot);
  if (report.visual.nodeId !== 7 || report.visual.cardId !== 'rhythm_timing'
    || report.visual.envKey !== 'env_bg_tournament'
    || report.visual.targetFillColor !== 0xcbd5e1
    || Math.abs(report.visual.targetFillAlpha - 0.14) > 0.01
    || report.visual.targetStrokeColor !== 0xf8fafc
    || report.visual.moonArtSource !== 'atlas') {
    throw new Error(`moon-silver visual contract failed: ${JSON.stringify(report.visual)}`);
  }
  report.route = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    const adapter = scene.adapter;
    const round = adapter.rhythmRound;
    const start = scene.time.now;
    const judgments = [];
    let ticks = 0;
    let simulatedMs = 0;
    for (let tick = 0; tick < 6000 && adapter.status === 'running'; tick += 1) {
      ticks = tick + 1;
      // The browser can run a partial frame during entry. End the one frame
      // before a beat exactly on its target, then resume 10ms frames.
      const remaining = round.targetMs - round.state.elapsedMs;
      const delta = !round.state.resolved && remaining > 0 ? Math.min(10, remaining) : 10;
      simulatedMs += delta;
      const now = start + simulatedMs;
      scene.time.now = now;
      adapter.update(now, delta);
      if (adapter.status === 'running' && !round.state.resolved && Math.abs(round.state.elapsedMs - round.targetMs) < 0.001) {
        const judgment = adapter.primaryAction();
        judgments.push({ accepted: judgment.accepted, kind: judgment.kind,
          offsetMs: judgment.offsetMs, beatIndex: judgment.beatIndex,
          score: round.state.score, bestCombo: round.state.bestCombo });
      }
    }
    return {
      elapsedSec: Number((round.state.elapsedMs / 1000).toFixed(2)),
      virtualFrames: ticks,
      authored: { beatIntervalMs: round.config.beatIntervalMs,
        perfectWindowMs: round.config.perfectWindowMs, goodWindowMs: round.config.goodWindowMs,
        targetProgress: round.config.targetProgress, requiredBestCombo: round.config.requiredBestCombo,
        durationSec: round.config.durationSec },
      judgments,
      final: { status: adapter.status, score: round.state.score, bestCombo: round.state.bestCombo,
        perfectHits: round.state.perfectHits, goodHits: round.state.goodHits,
        misses: round.state.misses, hp: round.state.hp,
        result: adapter.result ? { success: adapter.result.success, reason: adapter.result.reason } : null }
    };
  });
  if (report.route.final.result?.success !== true || report.route.final.result?.reason !== 'objective_met'
    || report.route.final.score < report.route.authored.targetProgress
    || report.route.final.bestCombo < report.route.authored.requiredBestCombo
    || report.route.final.misses !== 0 || report.route.elapsedSec >= report.route.authored.durationSec
    || report.route.judgments.some(j => !j.accepted || j.kind !== 'perfect' || j.offsetMs !== 0)
    || report.errors.length) throw new Error(`rhythm route failed: ${JSON.stringify(report.route.final)}`);
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_rhythm_reachability_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
