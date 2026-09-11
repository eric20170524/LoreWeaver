#!/usr/bin/env node
// Real browser input only. Snapshot reads are diagnostic; no phase/HP/score edits,
// direct adapter actions, clock acceleration or forced-success calls are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ROOT, OUT, buildCardLab } from './build-card-lab.mjs';

const reports = path.join(ROOT, 'workflow/reports/card-lab/rhythm_timing');
fs.mkdirSync(reports, { recursive: true });
const report = { schemaVersion: 'loreweaver.card-lab-browser.v1', status: 'failed',
  synthetic: true, releaseEligible: false, cardId: 'rhythm_timing',
  scope: 'static sample through real RuntimeKernel; no campaign unlock, device-performance or release certification',
  cases: [] };
let browser, server;
try {
  report.build = await buildCardLab();
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    // Support subdirectory deployment and verify relative bundle paths.
    if (!pathname.startsWith('/preview/')) { res.writeHead(404); res.end(); return; }
    const name = pathname.slice('/preview/'.length) || 'index.html';
    const file = path.resolve(OUT, name);
    if (!file.startsWith(OUT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  report.browser = browser.version();
  const url = `http://127.0.0.1:${server.address().port}/preview/?card=rhythm_timing`;
  const read = page => page.evaluate(() => window.__CARD_LAB__.snapshot());
  const pads = new WeakMap();
  const attempts = new WeakMap();
  async function point(page, x, y) {
    const box = await page.locator('canvas').boundingBox();
    assert.ok(box, 'canvas has bounds');
    return { x: box.x + x / 720 * box.width, y: box.y + y / 1280 * box.height };
  }
  async function begin(page) {
    const before = await read(page);
    await page.getByRole('button', { name: '开始 / 重新开始', exact: true }).click();
    await page.waitForFunction(generation => {
      const s = window.__CARD_LAB__?.snapshot();
      return s?.generation === generation + 1 && !s.starting && s.state?.status === 'running';
    }, before.generation, { timeout: 20000, polling: 30 });
    const after = await read(page);
    assert.deepEqual(after.sceneKeys, ['LevelActiveScene'], 'menu is stopped before gameplay');
    assert.equal(after.cardId, 'rhythm_timing'); assert.equal(after.state.score, 0); assert.equal(after.state.perfectHits, 0);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    pads.set(page, await point(page, after.state.padPosition.x, after.state.padPosition.y));
    return after;
  }
  async function run(id, action, mobile = false, targetUrl = url) {
    const context = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    const row = { id, passed: false, errors: [], assertions: [], viewport: mobile ? '390x844 touch' : '1440x1050 pointer' };
    report.cases.push(row);
    row.attempts = []; attempts.set(page, row.attempts);
    page.on('pageerror', error => row.errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') row.errors.push(msg.text()); });
    page.on('requestfailed', req => row.errors.push(`request: ${req.url()} ${req.failure()?.errorText}`));
    page.on('response', res => { if (res.status() >= 400) row.errors.push(`HTTP ${res.status()}: ${res.url()}`); });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    try {
      await page.goto(targetUrl);
      await page.waitForFunction(() => !!window.__CARD_LAB__, null, { timeout: 10000 });
      await action(page, row);
      await page.waitForTimeout(200);
      assert.deepEqual(row.errors, [], 'no browser, request or console errors');
      row.passed = true;
      row.final = await read(page);
      await page.screenshot({ path: path.join(reports, `${id}.png`), fullPage: true });
    } catch (error) {
      row.passed = false;
      row.errors.push(error.stack || String(error));
      row.final = await read(page).catch(() => null);
      await page.screenshot({ path: path.join(reports, `${id}-failed.png`), fullPage: true }).catch(() => {});
    } finally {
      await context.tracing.stop({ ...(row.passed ? {} : { path: path.join(reports, `${id}-trace.zip`) }) });
      await context.close();
      console.log(`${row.passed ? 'PASS' : 'FAIL'} ${id}`);
    }
  }

  async function hit(page, aim = 'perfect', input = 'keyboard', duplicate = false) {
    const p = pads.get(page);
    assert.ok(p, 'input point prepared before the timing-critical window');
    // Anticipate driver round trips; do not freeze the game or move its clock.
    // Intent is not a judgment: only the actual accepted offset determines grade.
    const target = aim === 'good' ? -175 : -60;
    const observed = await page.waitForFunction(target => {
      const s = window.__CARD_LAB__.snapshot().state;
      return s?.status === 'running' && !s.resolved && s.offsetMs >= target && s.offsetMs <= target + 30
        ? { beatIndex: s.beatIndex, offsetMs: s.offsetMs, sequence: s.judgmentSequence } : false;
    }, target, { timeout: 8000, polling: 8 });
    if (input === 'touch') await page.touchscreen.tap(p.x, p.y);
    else if (input === 'pointer') await page.mouse.click(p.x, p.y);
    else await page.keyboard.press('Space');
    if (duplicate) await page.keyboard.press('Space');
    const after = (await read(page)).state;
    const before = await observed.jsonValue(); await observed.dispose();
    const actual = after.lastJudgment;
    assert.ok(actual && actual.sequence > before.sequence, 'real input produces a new judgment');
    assert.equal(actual.beatIndex, before.beatIndex, 'input must reach the observed beat, not a later one');
    assert.ok(Number.isFinite(actual.offsetMs), 'input judgment has an actual timing offset');
    const expected = Math.abs(actual.offsetMs) <= after.perfectWindowMs ? 'perfect'
      : Math.abs(actual.offsetMs) <= after.goodWindowMs ? 'good' : 'miss';
    assert.equal(actual.kind, expected, 'grade must match actual input offset, not intended grade');
    assert.equal(actual.gain, { perfect: 10, good: 5, miss: 0 }[expected]);
    if (duplicate) assert.equal(after.judgmentSequence, before.sequence + 1, 'two inputs consume this beat once');
    attempts.get(page).push({ input, aim, duplicate, observed: before, actual });
    return after;
  }
  async function terminal(page, timeout = 20000) {
    await page.waitForFunction(() => !!window.__CARD_LAB__.snapshot().result, null, { timeout });
    return read(page);
  }

  await run('default-victory', async (page, row) => {
    const initial = await begin(page);
    assert.equal(initial.config.targetProgress, 100); assert.equal(initial.config.requiredBestCombo, 8);
    assert.equal(initial.config.durationSec, 45);
    // The default goal is playable without requiring the automation driver to
    // score ten consecutive Perfects. Good/Miss remain real, recorded outcomes.
    for (let i = 0; i < 24; i++) {
      const state = await hit(page, 'perfect', i % 2 ? 'keyboard' : 'pointer');
      if (state.outcome) break;
    }
    const s = await terminal(page);
    assert.equal(s.result.success, true); assert.equal(s.result.reason, 'objective_met');
    assert.ok(s.state.bestCombo >= 8); assert.ok(s.state.score >= 100); assert.ok(s.state.hp > 0);
    assert.equal(s.state.score, s.state.perfectHits * 10 + s.state.goodHits * 5);
    assert.ok(s.saves.some(x => x.completedNodeIds.includes(1)));
    for (const input of ['pointer', 'keyboard']) {
      assert.ok(row.attempts.some(a => a.input === input && a.actual.kind !== 'miss'), input + ' really scores');
    }
    row.assertions.push('default progress AND combo completed by timed real pointer/keyboard input',
      'all actual input offsets match unchanged Perfect/Good windows', 'host completion callback, not disk persistence');
  });
  await run('timing-judgments', async (page, row) => {
    await begin(page); await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.misses === 1);
    await page.keyboard.press('Space'); assert.equal((await read(page)).state.misses, 1);
    let state;
    // A requested grade is not guaranteed by a remote input driver. Keep the
    // original windows and try distinct later beats, recording every attempt.
    for (let i = 0; i < 5; i++) { state = await hit(page, 'good', 'keyboard', i === 0); if (state.goodHits > 0) break; }
    assert.ok(state.goodHits > 0, 'at least one real Good, not a synthetic grade');
    for (let i = 0; i < 5; i++) { state = await hit(page); if (state.perfectHits > 0) break; }
    assert.ok(state.perfectHits > 0, 'at least one real Perfect');
    assert.equal(state.score, state.perfectHits * 10 + state.goodHits * 5);
    assert.equal(state.hp, 100 - state.misses * 10);
    await page.screenshot({ path: path.join(reports, 'default-playing.png'), fullPage: true });
    await page.waitForFunction(n => window.__CARD_LAB__.snapshot().state?.misses > n, state.misses, { timeout: 4000 });
    assert.equal((await read(page)).state.combo, 0);
    await page.locator('#quit').click(); assert.equal((await terminal(page)).result.reason, 'retreated');
    row.assertions.push('early/expired misses once and reset combo', 'actual Good/Perfect award 5/10, not random progress', 'duplicate input rejected');
  });
  await run('miss-failure', async (page, row) => {
    await begin(page); const s = await terminal(page, 22000);
    assert.equal(s.result.reason, 'hp_zero'); assert.equal(s.result.success, false);
    assert.equal(s.state.misses, 10); assert.equal(s.state.hp, 0); assert.deepEqual(s.result.rewards, {});
    row.assertions.push('default no-input run dies after ten misses without fabricated damage');
  });
  await run('configured-timeout', async (page, row) => {
    await page.locator('#duration').fill('10'); await page.locator('#hp').fill('300'); await begin(page);
    const s = await terminal(page, 16000);
    assert.equal(s.result.reason, 'timer_expired'); assert.equal(s.result.success, false);
    assert.equal(s.state.timer, 0); assert.ok(s.state.hp > 0); assert.deepEqual(s.result.rewards, {});
    row.assertions.push('public initial settings; real-time timeout without clock acceleration');
  });
  await run('combo-requirement', async (page, row) => {
    await page.locator('#target').fill('1'); await page.locator('#combo').fill('3'); await begin(page);
    await hit(page); await page.waitForTimeout(200);
    let s = await read(page);
    assert.ok(s.state.score >= 5); assert.equal(s.state.status, 'running'); assert.equal(s.result, null);
    await hit(page); assert.equal((await read(page)).result, null); await hit(page);
    s = await terminal(page); assert.equal(s.result.success, true); assert.equal(s.state.bestCombo, 3);
    row.assertions.push('real GameRunner cannot bypass combo requirement using score alone');
  });
  await run('pause-restart', async (page, row) => {
    await begin(page); await page.locator('#pause').click();
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.status === 'paused');
    const before = (await read(page)).state;
    await page.keyboard.press('Space'); await page.locator('canvas').scrollIntoViewIfNeeded();
    const p = await point(page, before.padPosition.x, before.padPosition.y);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(1800);
    const after = (await read(page)).state;
    for (const key of ['elapsedMs', 'beatIndex', 'hp', 'score', 'misses', 'combo', 'timer']) assert.equal(after[key], before[key], key);
    await page.locator('#pause').click(); await page.waitForTimeout(100);
    assert.ok((await read(page)).state.elapsedMs > before.elapsedMs);
    await page.locator('#quit').click(); assert.equal((await terminal(page)).result.reason, 'retreated');
    for (let i = 0; i < 3; i++) { await begin(page); assert.equal(await page.locator('canvas').count(), 1); }
    const hitState = await hit(page); assert.equal(hitState.perfectHits + hitState.goodHits, 1);
    await page.locator('#card').selectOption('dodge_counter_boss'); assert.equal((await read(page)).state, null);
    await page.locator('#card').selectOption('rhythm_timing'); await begin(page);
    row.assertions.push('pause freezes active clock/input; resume', 'retreat, three clean restarts and cross-card switch');
  });
  await run('mobile-touch', async (page, row) => {
    await begin(page); const state = await hit(page, 'perfect', 'touch');
    assert.equal(state.perfectHits + state.goodHits, 1, 'touch earns an actual timing hit');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    row.assertions.push('390px Chromium touch emulation and no horizontal overflow, not physical phone');
  }, true);
  await run('offline-file-launch', async (page, row) => {
    await begin(page); await page.locator('#quit').click();
    assert.equal((await terminal(page)).result.reason, 'retreated');
    row.assertions.push('same static bundle starts from file:// without backend or API key');
  }, false, pathToFileURL(path.join(OUT, 'index.html')).href + '?card=rhythm_timing');
  report.status = report.cases.length === 8 && report.cases.every(row => row.passed) ? 'passed' : 'failed';
} catch (error) { report.error = error.stack || String(error); }
finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  report.evidence = fs.readdirSync(reports).filter(file => file.endsWith('.png')).map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(reports, file))).digest('hex') }));
  fs.writeFileSync(path.join(reports, 'browser-latest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({id,passed,errors}) => ({id,passed,errors})), error: report.error }, null, 2));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
