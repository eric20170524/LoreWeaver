#!/usr/bin/env node
// Inputs go through the browser; snapshots only locate visible entities.
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';

const lab = await createLabSuite('survivor_horde');
const { read, point, begin, run } = lab;
async function finish(page, timeout = 18000) {
  await page.waitForFunction(() => Boolean(window.__CARD_LAB__.snapshot().result), null, { timeout });
  return read(page);
}
try {
  await run('configured-survival-victory', async (page, row) => {
    await page.locator('#duration').fill('10');
    const initial = await begin(page);
    assert.equal(initial.state.timer, 10);
    const final = await finish(page);
    assert.equal(final.result.success, true);
    assert.equal(final.result.reason, 'timer_expired');
    assert.equal(final.state.timer, 0);
    row.assertions.push('public ten-second duration ends in natural survival victory');
  });
  await run('pointer-movement-and-retreat', async (page, row) => {
    const initial = await begin(page);
    assert.equal(initial.config.durationSec, 120);
    const target = point(page, 580, 950);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(600);
    const moved = await read(page);
    assert.ok(moved.playerPosition.x > initial.playerPosition.x + 20);
    await page.locator('#quit').click();
    const final = await finish(page);
    assert.equal(final.result.reason, 'retreated');
    row.actions.push({ kind: 'pointer', target: { x: 580, y: 950 } });
  });
  await run('natural-collision-failure', async (page, row) => {
    await page.locator('#hp').fill('1');
    const initial = await begin(page);
    assert.equal(initial.state.hp, 1);
    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      const state = await read(page);
      if (state.result) break;
      const enemy = state.enemies[0];
      if (enemy) {
        const target = point(page, Math.max(30, Math.min(690, enemy.x)), Math.max(140, Math.min(1100, enemy.y)));
        await page.mouse.click(target.x, target.y);
      }
      await page.waitForTimeout(200);
    }
    const final = await read(page);
    assert.equal(final.result?.success, false);
    assert.ok(final.state.hp <= 0);
    row.assertions.push('real movement into an enemy exhausts the configured one HP');
  });
  await run('pause-resume-and-restart', async (page, row) => {
    await page.locator('#duration').fill('10');
    await begin(page);
    await page.locator('#pause').click();
    const paused = await read(page);
    assert.equal(paused.state.status, 'paused');
    await page.waitForTimeout(1200);
    const still = await read(page);
    assert.equal(still.state.timer, paused.state.timer);
    assert.deepEqual(still.playerPosition, paused.playerPosition);
    await page.locator('#pause').click();
    assert.equal((await read(page)).state.status, 'running');
    const restarted = await begin(page);
    assert.equal(restarted.state.timer, 10);
    assert.equal(restarted.state.kills, 0);
    assert.equal((await finish(page)).result.success, true);
    row.assertions.push('pause freezes runtime and restart owns fresh timers');
  });
  await run('mobile-touch-survival', async (page, row) => {
    await page.locator('#duration').fill('10');
    const initial = await begin(page);
    const target = point(page, 580, 950);
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForTimeout(600);
    assert.ok((await read(page)).playerPosition.x > initial.playerPosition.x + 20);
    assert.equal((await finish(page)).result.success, true);
    row.actions.push({ kind: 'touch', target: { x: 580, y: 950 } });
  }, { mobile: true });
  await run('offline-launch-and-retreat', async page => {
    await begin(page);
    await page.locator('#quit').click();
    assert.equal((await finish(page)).result.reason, 'retreated');
  }, { offline: true });
} finally {
  await lab.close(6);
}
