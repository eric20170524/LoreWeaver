#!/usr/bin/env node
// Read visible target/options; every answer comes from browser pointer input.
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';
const lab = await createLabSuite('reaction_pick');
const { read, begin, run } = lab;

async function clickOption(page, row, correct = true, touch = false) {
  const before = (await read(page)).state;
  assert.equal(before.waiting, true);
  const option = before.options.find(item => (item.id === before.targetId) === correct);
  assert.ok(option, 'visible matching option');
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  const x = box.x + option.x / 720 * box.width, y = box.y + option.y / 1280 * box.height;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForFunction(() => !window.__CARD_LAB__.snapshot().state.waiting);
  const after = (await read(page)).state;
  assert.equal(after.correct, before.correct + (correct ? 1 : 0));
  assert.equal(after.lives, before.lives - (correct ? 0 : 1));
  row.actions.push({ kind: touch ? 'touch' : 'pointer', round: before.round, target: before.targetId, selected: option.id });
  return after;
}
async function nextRound(page, afterRound) {
  await page.waitForFunction(round => {
    const s = window.__CARD_LAB__.snapshot();
    return !s.result && s.state.waiting && s.state.round > round;
  }, afterRound, { timeout: 3000 });
}
async function finish(page) {
  await page.waitForFunction(() => Boolean(window.__CARD_LAB__.snapshot().result), null, { timeout: 4000 });
  return read(page);
}
async function complete(page, row, touch = false) {
  for (let guard = 0; guard < 50; guard++) {
    const snapshot = await read(page);
    if (snapshot.result || snapshot.state.correct >= snapshot.state.targetRounds) break;
    const after = await clickOption(page, row, true, touch);
    if (after.correct < after.targetRounds) {
      assert.equal((await read(page)).result, null, 'no premature host score victory');
      await nextRound(page, after.round);
    }
  }
  const final = await finish(page);
  assert.equal(final.result.success, true);
  assert.equal(final.result.reason, 'objective_met');
  assert.equal(final.result.telemetry.correct, final.config.targetRounds);
  return final;
}

try {
  await run('default-six-round-victory', async (page, row) => {
    const initial = await begin(page);
    assert.equal(initial.config.targetRounds, 6); assert.equal(initial.state.lives, 3);
    assert.equal((await complete(page, row)).state.correct, 6);
  });
  await run('previous-round-timeout-is-cancelled', async (page, row) => {
    await page.locator('#knob-targetRounds').fill('2');
    await page.locator('#knob-showLifeMinSec').fill('3');
    await page.locator('#knob-showLifeMaxSec').fill('3');
    await begin(page);
    const answered = await clickOption(page, row);
    await nextRound(page, answered.round);
    await page.waitForTimeout(2600);
    const second = (await read(page)).state;
    assert.equal(second.round, 2); assert.equal(second.waiting, true); assert.equal(second.lives, 3);
    await complete(page, row);
    row.assertions.push('old round deadline passed while current round remains answerable');
  });
  await run('wrong-option-failure', async (page, row) => {
    await page.locator('#knob-lives').fill('1');
    await begin(page); await clickOption(page, row, false);
    const final = await finish(page);
    assert.equal(final.result.success, false); assert.equal(final.result.telemetry.livesLeft, 0);
    assert.equal(final.state.correct, 0);
  });
  await run('natural-timeout-failure', async (page, row) => {
    await page.locator('#knob-lives').fill('1');
    await page.locator('#knob-showLifeMinSec').fill('0.6');
    await page.locator('#knob-showLifeMaxSec').fill('0.6');
    await begin(page);
    const final = await finish(page);
    assert.equal(final.result.success, false); assert.equal(final.result.telemetry.livesLeft, 0);
    row.assertions.push('no input: real clock timeout consumes the only life');
  });
  await run('pause-resume-and-restart', async (page, row) => {
    await page.locator('#knob-targetRounds').fill('2');
    await begin(page); await page.locator('#pause').click();
    const frozen = (await read(page)).state;
    assert.equal(frozen.status, 'paused');
    await page.waitForTimeout(3500);
    const still = (await read(page)).state;
    assert.equal(still.timer, frozen.timer); assert.equal(still.lives, 3);
    await page.locator('#pause').click();
    await complete(page, row);
    for (let i = 0; i < 3; i++) {
      const initial = await begin(page);
      assert.equal(initial.state.correct, 0); assert.equal(initial.state.round, 1);
      await page.locator('#quit').click();
      assert.equal((await finish(page)).result.reason, 'retreated');
    }
  });
  await run('invalid-time-range-does-not-start', async (page, row) => {
    await page.locator('#knob-showLifeMinSec').fill('5');
    await page.locator('#knob-showLifeMaxSec').fill('1');
    await page.locator('#start').click();
    assert.equal((await read(page)).generation, 0);
    await page.locator('#knob-showLifeMaxSec').fill('5');
    await page.locator('#knob-targetRounds').fill('1');
    await begin(page); await complete(page, row);
  });
  await run('mobile-touch-six-round-victory', async (page, row) => {
    await begin(page); await complete(page, row, true);
  }, { mobile: true });
  await run('offline-six-round-victory', async (page, row) => {
    await begin(page); await complete(page, row);
  }, { offline: true });
} finally {
  await lab.close(8);
}
