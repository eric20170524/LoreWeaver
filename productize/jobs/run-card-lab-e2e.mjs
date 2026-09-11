#!/usr/bin/env node
// Real browser input only. Snapshot reads are diagnostic; no phase/HP/score edits,
// direct adapter actions, clock acceleration or forced-success calls are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ROOT, OUT, buildCardLab } from './build-card-lab.mjs';

const reports = path.join(ROOT, 'workflow/reports/card-lab');
fs.mkdirSync(reports, { recursive: true });
const report = { schemaVersion: 'loreweaver.card-lab-browser.v1', status: 'failed',
  synthetic: true, releaseEligible: false, cardId: 'dodge_counter_boss',
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
  const url = `http://127.0.0.1:${server.address().port}/preview/`;
  const read = page => page.evaluate(() => window.__CARD_LAB__.snapshot());
  async function point(page, x, y) {
    const box = await page.locator('canvas').boundingBox();
    assert.ok(box, 'canvas has bounds');
    return { x: box.x + x / 720 * box.width, y: box.y + y / 1280 * box.height };
  }
  async function drag(page, x, y) {
    const s = await read(page);
    const from = await point(page, s.state.playerPosition.x, s.state.playerPosition.y);
    const to = await point(page, x, y);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up();
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
    assert.equal(after.state.counters, 0); assert.equal(after.state.gauge, 0);
    return after;
  }
  async function waitCounter(page) {
    await page.waitForFunction(() => {
      const s = window.__CARD_LAB__.snapshot().state;
      return s?.status === 'running' && s.phase === 'counter' && !s.counterUsed;
    }, null, { timeout: 10000, polling: 16 });
  }
  async function clickBoss(page) {
    const s = await read(page); assert.ok(s.bossPosition, 'boss is alive');
    const p = await point(page, s.bossPosition.x, s.bossPosition.y); await page.mouse.click(p.x, p.y);
  }
  async function run(id, action, mobile = false) {
    const context = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    const row = { id, passed: false, errors: [], assertions: [], viewport: mobile ? '390x844 touch' : '1440x1050 pointer' };
    report.cases.push(row);
    page.on('pageerror', error => row.errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') row.errors.push(msg.text()); });
    page.on('requestfailed', req => row.errors.push(`request: ${req.url()} ${req.failure()?.errorText}`));
    page.on('response', res => { if (res.status() >= 400) row.errors.push(`HTTP ${res.status()}: ${res.url()}`); });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.__CARD_LAB__, null, { timeout: 10000 });
      await action(page, row);
      await page.waitForTimeout(200);
      assert.deepEqual(row.errors, [], 'no browser, request or console errors');
      row.passed = true;
      row.final = await read(page);
      await page.screenshot({ path: path.join(reports, `${id}.png`), fullPage: true });
    } catch (error) {
      row.errors.push(error.stack || String(error));
      row.final = await read(page).catch(() => null);
      await page.screenshot({ path: path.join(reports, `${id}-failed.png`), fullPage: true }).catch(() => {});
    } finally {
      await context.tracing.stop({ ...(row.passed ? {} : { path: path.join(reports, `${id}-trace.zip`) }) });
      await context.close();
      console.log(`${row.passed ? 'PASS' : 'FAIL'} ${id}`);
    }
  }
  await run('default-victory', async (page, row) => {
    const initial = await begin(page);
    assert.equal(initial.config.playerHp, 100); assert.equal(initial.config.bossHp, 300);
    assert.equal(initial.config.durationSec, 90);
    await drag(page, 22, 1140);
    await page.keyboard.press('Space'); // outside the opening must do nothing
    assert.equal((await read(page)).state.counters, 0);
    for (let count = 1; count <= 6; count++) {
      await waitCounter(page);
      if (count % 2) await clickBoss(page); else await page.keyboard.press('Space');
      await page.waitForFunction(n => window.__CARD_LAB__.snapshot().state?.counters === n, count, { timeout: 1200 });
      if (count === 1) {
        await clickBoss(page); await page.keyboard.press('Space');
        assert.equal((await read(page)).state.counters, 1, 'one counter per opening');
        await page.screenshot({ path: path.join(reports, 'default-playing.png'), fullPage: true });
      }
      if (count === 5) {
        const s = await read(page); assert.equal(s.state.gauge, 90);
        assert.equal(s.state.status, 'running', 'not prematurely won at five counters');
      }
    }
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().result?.success === true);
    const final = await read(page);
    assert.equal(final.result.reason, 'boss_defeated'); assert.equal(final.state.gauge, 100);
    assert.ok(final.saves.some(s => s.completedNodeIds.includes(1)), 'host completion callback records success');
    row.assertions.push('default unmodified configuration wins with six real pointer/keyboard openings', 'outside-window and duplicate input rejected', 'host save callback, not disk persistence');
  });
  await run('damage-failure', async (page, row) => {
    await begin(page);
    for (let hit = 1; hit <= 6; hit++) {
      await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.phase === 'warning', null, { timeout: 10000, polling: 16 });
      const zone = (await read(page)).state.attackZone;
      await drag(page, zone.x, zone.y);
      await page.waitForFunction(previous => window.__CARD_LAB__.snapshot().state?.hp < previous, 100 - (hit - 1) * 18, { timeout: 3000 });
      if (hit < 6) await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.phase === 'idle', null, { timeout: 4000 });
    }
    await page.waitForFunction(() => !!window.__CARD_LAB__.snapshot().result);
    const s = await read(page);
    assert.equal(s.result.success, false); assert.equal(s.result.reason, 'hp_zero');
    assert.equal(s.state.hp, 0); assert.deepEqual(s.result.rewards, {});
    row.assertions.push('six real drags into telegraphed attacks deplete default HP', 'failure grants no adapter rewards');
  });
  await run('configured-timeout', async (page, row) => {
    await page.locator('#duration').fill('10'); await begin(page); await drag(page, 22, 1140);
    await page.waitForFunction(() => !!window.__CARD_LAB__.snapshot().result, null, { timeout: 15000 });
    const s = await read(page);
    assert.equal(s.result.success, false); assert.equal(s.result.reason, 'timer_expired');
    assert.equal(s.state.timer, 0); assert.equal(s.state.hp, 100);
    row.assertions.push('public ten-second configuration expires in real time, no accelerated clock');
  });
  await run('pause-retreat-restart', async (page, row) => {
    await begin(page); await drag(page, 22, 1140); await waitCounter(page);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.status === 'paused');
    const before = (await read(page)).state;
    await page.keyboard.press('Space'); await clickBoss(page); await drag(page, 360, 980);
    await page.waitForTimeout(700);
    const frozen = (await read(page)).state;
    for (const key of ['timer', 'phaseLeft', 'hp', 'bossHp', 'counters']) assert.equal(frozen[key], before[key], `paused ${key}`);
    assert.deepEqual(frozen.playerPosition, before.playerPosition);
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForTimeout(120); assert.ok((await read(page)).state.timer < frozen.timer);
    await page.getByRole('button', { name: '退出', exact: true }).click();
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().result?.reason === 'retreated');
    assert.equal((await read(page)).result.success, false);
    for (let i = 0; i < 3; i++) { const s = await begin(page); assert.equal(s.state.hp, 100); }
    await waitCounter(page); await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.counters === 1);
    await page.keyboard.press('Space'); assert.equal((await read(page)).state.counters, 1);
    row.assertions.push('pause freezes combat, countdown and real input', 'resume advances', 'retreat returns failure', 'three fresh runs have one canvas, clean counters and no duplicate input');
    assert.equal(await page.locator('canvas').count(), 1);
  });
  await run('mobile-touch', async (page, row) => {
    await begin(page);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const s = await read(page);
    const from = await point(page, s.state.playerPosition.x, s.state.playerPosition.y);
    const to = await point(page, 22, 1140);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    assert.ok((await read(page)).state.playerPosition.x < 50, 'touch moved player');
    await waitCounter(page);
    const b = (await read(page)).bossPosition; const p = await point(page, b.x, b.y);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.counters === 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
    row.assertions.push('Chromium mobile emulation: real touch drag and Boss tap', 'no horizontal overflow; not a physical iOS/Android certification');
  }, true);
  report.status = report.cases.every(row => row.passed) ? 'passed' : 'failed';
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
