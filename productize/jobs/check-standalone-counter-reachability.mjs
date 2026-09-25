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
  method: '20ms virtual steps through authored attack phases; semantic drag to a safe corner and one semantic primary input per counter opening',
  limitations: 'idealized instant pointer position and exact counter timing, not human reaction, touch latency or frame-rate measurement',
  routes: [], errors: []
};
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  for (const nodeId of [2, 10]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.on('pageerror', error => report.errors.push(`node${nodeId}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`node${nodeId}: ${message.text()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });
    await page.evaluate(id => {
      const game = window.__LOREWEAVER_GAME__;
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === id);
      game.scene.start('LevelActiveScene', { node });
    }, nodeId);
    for (let i = 0; i < 8; i += 1) {
      if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 8000 });
    const route = await page.evaluate(id => {
      const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
      const adapter = scene.adapter;
      const start = scene.time.now;
      const counterWindows = [];
      const warningPulseSamples = [];
      let atlasWarningMarkSeen = false;
      let ticks = 0;
      const move = adapter.handleSemanticInput({ action: 'move', x: 20, y: scene.scale.height - 110 });
      for (let tick = 0; tick < 5000 && adapter.status === 'running'; tick += 1) {
        ticks = tick + 1;
        const now = start + tick * 20;
        scene.time.now = now;
        adapter.update(now, 20);
        if (adapter.state.phase === 'warning') {
          if (warningPulseSamples.length < 12) warningPulseSamples.push(Number(adapter.telegraph.alpha.toFixed(3)));
          atlasWarningMarkSeen ||= Boolean(adapter.warningMark?.active
            && adapter.warningMark?.getData?.('artSource') === 'atlas');
        }
        if (adapter.status === 'running' && adapter.state.phase === 'counter' && !adapter.state.counterUsed) {
          const action = adapter.handleSemanticInput({ action: 'primary' });
          counterWindows.push({ elapsedSec: Number((tick * 0.02).toFixed(2)),
            accepted: action.accepted, gauge: adapter.state.gauge,
            bossHp: adapter.state.bossHp, playerHp: adapter.state.playerHp });
        }
      }
      return {
        nodeId: id, moveAccepted: move.accepted,
        elapsedSec: Number((ticks * 0.02).toFixed(2)),
        authored: { durationSec: adapter.config.durationSec, bossHp: adapter.config.bossHp,
          playerHp: adapter.config.playerHp, breakGaugeMax: adapter.config.breakGaugeMax,
          counterGaugeGain: adapter.config.counterGaugeGain },
        counterWindows,
        warningPulseSamples, atlasWarningMarkSeen,
        final: { status: adapter.status, counters: adapter.state.counters, dodges: adapter.state.dodges,
          gauge: adapter.state.gauge, bossHp: adapter.state.bossHp,
          playerHp: adapter.state.playerHp,
          result: adapter.result ? { success: adapter.result.success, reason: adapter.result.reason } : null }
      };
    }, nodeId);
    report.routes.push(route);
    await page.close();
    const requiredCounters = Math.ceil(route.authored.breakGaugeMax / route.authored.counterGaugeGain);
    if (!route.moveAccepted || route.final.result?.success !== true || route.final.result?.reason !== 'boss_defeated'
      || route.final.counters !== requiredCounters || route.final.dodges < requiredCounters
      || route.final.playerHp <= 0 || route.elapsedSec >= route.authored.durationSec
      || route.warningPulseSamples.length < 3
      || Math.max(...route.warningPulseSamples) - Math.min(...route.warningPulseSamples) < 0.1
      || (nodeId === 2 && !route.atlasWarningMarkSeen)
      || route.counterWindows.some(window => !window.accepted)) {
      throw new Error(`node${nodeId} counter route failed: ${JSON.stringify(route)}`);
    }
  }
  if (report.errors.length) throw new Error(`browser errors: ${JSON.stringify(report.errors)}`);
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_counter_reachability_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exit(2);
