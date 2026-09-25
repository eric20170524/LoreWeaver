#!/usr/bin/env node
// Compare exact ZIPs under the same synthetic node-9 atlas draw load.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reports = path.join(root, 'data/workspaces/xuanjie-shimu-local/reports');
const evidence = path.join(root, 'docs/fangame/evidence');
const previous = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(evidence,
  'standalone_browser_desktop_20260924210010.json.gz'))));
const current = JSON.parse(fs.readFileSync(path.join(reports, 'standalone_browser_report.json'), 'utf8'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const cpuRate = Number(process.env.LW_PERF_CPU_RATE || 1);
if (!Number.isFinite(cpuRate) || cpuRate < 1 || cpuRate > 8) throw new Error('invalid LW_PERF_CPU_RATE');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };

function identity(report) {
  const artifact = path.join(root, report.artifact);
  const stage = artifact.slice(0, -4);
  if (report.status !== 'passed' || digest(fs.readFileSync(artifact)) !== report.artifactSha256
    || !fs.statSync(stage).isDirectory()) throw new Error('exact candidate unavailable');
  return { artifact, stage, sha256: report.artifactSha256 };
}

async function sample(browser, candidate) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.resolve(candidate.stage, `.${url === '/' ? '/index.html' : url}`);
    if (!file.startsWith(`${candidate.stage}${path.sep}`) || !fs.existsSync(file)
      || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  const errors = [];
  let page;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    });
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    if (cpuRate > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'));
    await page.evaluate(() => {
      const game = window.__LOREWEAVER_GAME__;
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 9);
      game.scene.keys.MainScene.scene.start('LevelActiveScene', { node });
    });
    for (let i = 0; i < 8; i += 1) {
      if (await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running')) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === 'running');
    const setup = await page.evaluate(() => {
      const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
      adapter.groups.enemies.getChildren().forEach(enemy => enemy.destroy());
      adapter.player.setPosition(70, adapter.world.height / 2);
      adapter.targetPoint = { x: 70, y: adapter.world.height / 2 };
      adapter.state.hp = 1000000;
      const ids = ['bandit_cultivator', 'human_genius', 'genius_beast'];
      for (let i = 0; i < 80; i += 1) {
        const enemy = adapter.spawnEnemy({ id: ids[i % ids.length], hp: 999999, speed: 0.001, damage: 0 });
        enemy.setPosition(160 + (i % 10) * 34, 240 + Math.floor(i / 10) * 65);
        enemy.body?.reset?.(enemy.x, enemy.y);
        enemy.setData('speed', 0.001);
      }
      window.__LW_PERF__ = { samples: [], frames: 0, last: performance.now(), stopped: false };
      const tick = now => {
        const meter = window.__LW_PERF__;
        if (!meter || meter.stopped) return;
        meter.frames += 1;
        const span = now - meter.last;
        if (span >= 1000) {
          meter.samples.push(Number((meter.frames * 1000 / span).toFixed(1)));
          meter.frames = 0;
          meter.last = now;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return { nodeId: Number(adapter.scene.node.id),
        multiplier: adapter.config.enemyVisualMultiplier || 1,
        activeEnemies: adapter.groups.enemies.getChildren().filter(enemy => enemy.active).length };
    });
    await page.waitForTimeout(8500);
    const measurement = await page.evaluate(() => {
      window.__LW_PERF__.stopped = true;
      const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
      return { samples: window.__LW_PERF__.samples.slice(1), status: adapter.status,
        playerHp: adapter.state.hp,
        activeEnemies: adapter.groups.enemies.getChildren().filter(enemy => enemy.active).length,
        gameFps: Number(window.__LOREWEAVER_GAME__.loop.actualFps.toFixed(1)) };
    });
    return { artifactSha256: candidate.sha256, setup, ...measurement, errors };
  } finally {
    await page?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

const browser = await chromium.launch({ headless: true });
const report = { status: 'failed', scope: 'headless Chromium synthetic 80-enemy draw comparison; not physical-device FPS',
  method: 'same 390x844 browser and 80 atlas enemies at fixed positions, sequential previous/current/current/previous samples',
  cpuThrottlingRate: cpuRate,
  runs: [], errors: [] };
try {
  const oldCandidate = identity(previous);
  const newCandidate = identity(current);
  for (const candidate of [oldCandidate, newCandidate, newCandidate, oldCandidate]) {
    report.runs.push(await sample(browser, candidate));
  }
  if (report.runs.some(run => run.errors.length || run.setup.nodeId !== 9
    || run.setup.activeEnemies !== 80 || run.activeEnemies < 75 || run.samples.length < 5)) {
    throw new Error('performance sample incomplete or browser error');
  }
  const summarize = sha256 => {
    const values = report.runs.filter(run => run.artifactSha256 === sha256)
      .flatMap(run => run.samples).sort((a, b) => a - b);
    return { samples: values.length, medianFps: values[Math.floor(values.length / 2)],
      minFps: values[0], maxFps: values.at(-1) };
  };
  report.previous = { artifactSha256: oldCandidate.sha256, ...summarize(oldCandidate.sha256) };
  report.current = { artifactSha256: newCandidate.sha256, ...summarize(newCandidate.sha256) };
  report.currentVsPreviousMedianRatio = Number((report.current.medianFps
    / report.previous.medianFps).toFixed(3));
  report.status = 'measured';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser.close();
  const suffix = cpuRate > 1 ? `_cpu${cpuRate}x` : '';
  const target = path.join(evidence, `enemy_visual_performance_20260924211606${suffix}.json`);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, previous: report.previous,
    current: report.current, ratio: report.currentVsPreviousMedianRatio, errors: report.errors }));
}
if (report.status !== 'measured') process.exitCode = 2;
