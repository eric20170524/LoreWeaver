#!/usr/bin/env node
// Synthetic browser regression through the same RuntimeKernel as the workbench.
// Direct node entry deliberately bypasses progression; this is NOT a human playtest
// or a Candidate export/certification test, and it does not consume model API keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-xuanjie-play-'));
const reports = path.join(root, 'workflow/reports');
fs.mkdirSync(reports, { recursive: true });
const output = path.join(reports, 'xuanjie_local_play_browser.json');
const report = { status: 'failed', synthetic: true, releaseEligible: false,
  scope: 'RuntimeKernel + cultivation UI + authored node 2 direct-entry regression', assertions: [], errors: [] };
let browser, server;
try {
  await build({
    stdin: { resolveDir: root, loader: 'ts', contents: `
      import { startLoreWeaverRuntime } from './src/runtime/LoreWeaverRuntimeKernel';
      import { INITIAL_PLAYER_STATE } from './src/runtime/playerState';
      import preset from './data/presets/xuanjiezhimen_fangame_preset.json';
      const saves = [], logs = [];
      const runtime = startLoreWeaverRuntime(preset, {
        container: document.getElementById('game'), hostKind: 'test',
        initialPlayerState: structuredClone(INITIAL_PLAYER_STATE),
        saveState: state => saves.push(structuredClone(state)), logger: text => logs.push(text)
      });
      window.harness = { runtime, game: runtime.game, spec: runtime.resolvedSpec.gameSpec, saves, logs };
    ` },
    bundle: true, format: 'iife', platform: 'browser', outfile: path.join(temp, 'game.js'),
    define: { 'process.env.NODE_ENV': '"test"' }, logLevel: 'warning'
  });
  fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#020617}#game{width:720px;height:1280px}</style><div id="game"></div><script src="/game.js"></script>');
  server = http.createServer((req, res) => {
    const name = req.url === '/game.js' ? 'game.js' : req.url === '/' ? 'index.html' : null;
    if (!name) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(fs.readFileSync(path.join(temp, name)));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 760, height: 1320 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) report.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.harness?.game.scene.isActive('MainScene'), null, { timeout: 20000 });
  const text = () => page.evaluate(() => {
    const scene = window.harness.game.scene.keys.MainScene;
    const collect = objects => objects.flatMap(object => [typeof object.text === 'string' ? object.text : '', ...(object.list ? collect(object.list) : [])]);
    return collect(scene.children.list).join('\n');
  });
  const mainText = await text();
  assert.match(mainText, /真气/);
  assert.doesNotMatch(mainText, /开启洞天|参悟骨文|太古宝术|狻猊骨文|至尊骨纹|蕴能/);
  report.assertions.push('main HUD uses current manifest, no legacy IP labels');
  await page.screenshot({ path: path.join(reports, 'xuanjie_cultivation.png') });
  const clickPoint = async point => {
    const box = await page.locator('canvas').boundingBox();
    assert.ok(box, 'canvas bounds');
    const scale = await page.evaluate(() => ({ w: window.harness.game.scale.width, h: window.harness.game.scale.height }));
    await page.mouse.click(box.x + point.x / scale.w * box.width, box.y + point.y / scale.h * box.height);
  };
  const perkPoint = await page.evaluate(() => window.harness.game.scene.keys.MainScene.activeUIPlugin.perkBtn.getCenter());
  await clickPoint(perkPoint);
  await page.waitForTimeout(100);
  const perkText = await text();
  assert.match(perkText, /疾风刀势/);
  assert.match(perkText, /规划中/);
  assert.doesNotMatch(perkText, /太古骨文|狻猊骨文/);
  report.assertions.push('passive modal displays authored skills as planned, not purchasable combat upgrades');

  await page.evaluate(() => {
    const h = window.harness;
    h.game.scene.start('LevelActiveScene', { node: h.spec.nodes.find(node => node.id === 2) });
  });
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => window.harness.game.scene.keys.LevelActiveScene?.adapter?.status === 'running')) break;
    const size = await page.evaluate(() => ({ x: window.harness.game.scale.width / 2, y: window.harness.game.scale.height / 2 }));
    await clickPoint(size);
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => window.harness.game.scene.keys.LevelActiveScene?.adapter?.status === 'running', null, { timeout: 5000 });
  const nodeState = await page.evaluate(() => {
    const h = window.harness;
    h.adapter = h.game.scene.keys.LevelActiveScene.adapter;
    return h.adapter.getTestState();
  });
  assert.equal(nodeState.adapterId, 'dodge_counter_boss');
  assert.ok(nodeState.timer > 60 && nodeState.timer <= 70);
  report.assertions.push('authored node 2 starts with its 70-second countdown');
  // Real pointer drag into the safe lower-left lane; no health/phase edits.
  const bounds = await page.locator('canvas').boundingBox();
  const scale = await page.evaluate(() => ({ w: window.harness.game.scale.width, h: window.harness.game.scale.height }));
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 20 / scale.w * bounds.width, bounds.y + (scale.h - 120) / scale.h * bounds.height, { steps: 8 });
  await page.mouse.up();
  for (let count = 1; count <= 6; count++) {
    await page.waitForFunction(() => {
      const a = window.harness.adapter;
      return a.status === 'running' && a.state.phase === 'counter' && !a.state.counterUsed;
    }, null, { timeout: 10000, polling: 20 });
    const point = await page.evaluate(() => ({ x: window.harness.adapter.boss.x, y: window.harness.adapter.boss.y }));
    await clickPoint(point);
    if (count === 1) await clickPoint(point); // double-click must remain one counter
    await page.waitForFunction(expected => window.harness.adapter.state.counters === expected, count, { timeout: 1000 });
    const snapshot = await page.evaluate(() => window.harness.adapter.getTestState());
    if (count === 5) {
      assert.equal(snapshot.status, 'running');
      assert.equal(snapshot.gauge, 90);
      assert.equal(snapshot.score, 90);
    }
    if (count === 1) await page.screenshot({ path: path.join(reports, 'xuanjie_node2_counter.png') });
  }
  await page.waitForFunction(() => window.harness.saves.some(state => state.completedNodeIds.includes(2)), null, { timeout: 10000 });
  const outcome = await page.evaluate(() => ({ state: window.harness.adapter.getTestState(), saves: window.harness.saves.slice(-2), logs: window.harness.logs.slice(-12) }));
  assert.equal(outcome.state.lastResult.success, true);
  assert.equal(outcome.state.counters, 6);
  assert.equal(outcome.state.gauge, 100);
  report.outcome = outcome;
  report.assertions.push('six separate counter windows settle victory and persist node 2 completion without a disposed-HUD exception');
  await page.waitForTimeout(1800);
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
