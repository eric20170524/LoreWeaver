#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';

const CARD_ID = 'side_scrolling_brawler';
const suite = await createLabSuite(CARD_ID);
const { read, point, begin, run, close } = suite;

async function moveToNextWave(page, cleared) {
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(expected => {
      const s = window.__CARD_LAB__.snapshot();
      return Boolean(s.result) || (s.state?.status === 'running' && s.state?.locked && s.state?.wavesCleared === expected);
    }, cleared, { timeout: 9000 });
  } finally {
    await page.keyboard.up('d');
  }
  const snapshot = await read(page);
  assert.equal(snapshot.result, null, `wave ${cleared + 1} should start before settlement`);
  assert.equal(snapshot.state.locked, true);
  return snapshot;
}

async function clearCurrentWave(page, clearedTarget) {
  await page.keyboard.down('d');
  try {
    for (let i = 0; i < 50; i += 1) {
      const snapshot = await read(page);
      if (snapshot.result || Number(snapshot.state?.wavesCleared || 0) >= clearedTarget) break;
      await page.keyboard.press(i % 3 === 0 ? 'k' : 'j');
      await page.waitForTimeout(i % 3 === 0 ? 470 : 310);
    }
  } finally {
    await page.keyboard.up('d');
  }
  await page.waitForFunction(target => {
    const s = window.__CARD_LAB__.snapshot();
    return Boolean(s.result) || Number(s.state?.wavesCleared || 0) >= target;
  }, clearedTarget, { timeout: 7000 });
  return read(page);
}

await run('default-all-clear-victory', async (page, row) => {
  const initial = await begin(page);
  assert.equal(initial.state.totalWaves, 3);
  assert.equal(initial.state.wavesCleared, 0);
  assert.equal(initial.state.kills, 0);
  assert.equal(initial.result, null);
  row.assertions.push('default card launches the real three-wave belt-scroll runtime');

  for (let wave = 0; wave < 3; wave += 1) {
    await moveToNextWave(page, wave);
    const after = await clearCurrentWave(page, wave + 1);
    row.actions.push({ wave: wave + 1, kills: after.state?.kills, score: after.state?.score, hp: after.state?.hp });
    if (wave < 2) {
      assert.equal(after.result, null, 'clearing an intermediate wave must not settle the node');
      assert.equal(after.state.wavesCleared, wave + 1);
    }
  }

  await page.waitForFunction(() => Boolean(window.__CARD_LAB__.snapshot().result), null, { timeout: 5000 });
  const done = await read(page);
  assert.equal(done.result.success, true);
  assert.equal(done.result.reason, 'completed');
  assert.equal(done.state.wavesCleared, 3);
  assert.equal(done.state.kills, 8);
  assert.equal(done.result.telemetry.wavesCleared, 3);
  assert.equal(done.result.telemetry.totalWaves, 3);
  assert.equal(done.result.telemetry.kills, 8);
  row.assertions.push('victory requires clearing all three authored waves including the boss');
  row.assertions.push('NodeResult keeps the brawler-owned completed reason and telemetry');
});

await run('pause-freezes-and-restart-remounts', async (page, row) => {
  const initial = await begin(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  await page.keyboard.up('d');
  const beforePause = await read(page);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.status === 'paused');
  const paused = await read(page);
  await page.waitForTimeout(1000);
  const frozen = await read(page);
  assert.deepEqual(frozen.playerPosition, paused.playerPosition);
  assert.equal(frozen.state.hp, paused.state.hp);
  assert.equal(frozen.state.wavesCleared, paused.state.wavesCleared);
  row.assertions.push('visible pause freezes player position and combat state');

  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.status === 'running');
  const generation = (await read(page)).generation;
  await page.locator('#start').click();
  await page.waitForFunction(g => {
    const s = window.__CARD_LAB__.snapshot();
    return s.generation === g + 1 && !s.starting && s.state?.status === 'running';
  }, generation, { timeout: 20000 });
  const restarted = await read(page);
  assert.equal(restarted.state.hp, Number(restarted.config.playerHp));
  assert.equal(restarted.state.score, 0);
  assert.equal(restarted.state.kills, 0);
  assert.equal(restarted.state.wavesCleared, 0);
  assert.equal(restarted.state.locked, false);
  assert.equal(await page.locator('canvas').count(), 1);
  assert.ok(restarted.playerPosition.x < 120);
  row.actions.push({ initialGeneration: initial.generation, restartedGeneration: restarted.generation });
  row.assertions.push('restart remounts one fresh adapter generation with reset HP, score, kills and waves');
});

await run('natural-life-stock-failure', async (page, row) => {
  await page.locator('#hp').fill('1');
  await begin(page);
  await moveToNextWave(page, 0);
  await page.waitForFunction(() => Boolean(window.__CARD_LAB__.snapshot().result), null, { timeout: 22000 });
  const failed = await read(page);
  assert.equal(failed.result.success, false);
  assert.equal(failed.result.reason, 'hp_zero');
  assert.deepEqual(failed.result.rewards, {});
  assert.equal(failed.state.hp, 0);
  assert.equal(failed.state.lives, 0);
  assert.ok(failed.state.credits > 0, 'continue credits remain available but unspent when the player declines continue');
  row.actions.push({ lives: failed.state.lives, credits: failed.state.credits, damageTaken: failed.result.telemetry.damageTaken });
  row.assertions.push('real enemy contact exhausts life stock and declining continue settles hp_zero');
});

await run('mobile-touch-move-and-attack', async (page, row) => {
  const initial = await begin(page);
  const p0 = initial.playerPosition;
  const destination = point(page, 610, 520);
  await page.touchscreen.tap(destination.x, destination.y);
  await page.waitForTimeout(1400);
  const moved = await read(page);
  assert.ok(moved.playerPosition.x > p0.x + 100, `touch tap should move player right: ${p0.x} -> ${moved.playerPosition.x}`);
  row.assertions.push('real touchscreen tap in movement zone advances the player');

  const next = point(page, 670, 520);
  await page.touchscreen.tap(next.x, next.y);
  await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.locked === true, null, { timeout: 6000 });
  const locked = await read(page);
  assert.equal(locked.state.wavesCleared, 0);

  const attack = point(page, 360, 1120);
  for (let i = 0; i < 14; i += 1) {
    await page.touchscreen.tap(attack.x, attack.y);
    await page.waitForTimeout(330);
    const state = await read(page);
    if (state.state.kills > 0) break;
  }
  const afterAttack = await read(page);
  assert.ok(afterAttack.state.kills > 0, 'real bottom-zone touch attacks should kill at least one enemy');
  assert.equal(afterAttack.result, null);
  row.actions.push({ xBefore: p0.x, xAfter: moved.playerPosition.x, kills: afterAttack.state.kills });
  row.assertions.push('real touchscreen bottom-zone taps perform combat without synthetic state edits');
}, { mobile: true });

await run('offline-launch-and-retreat', async (page, row) => {
  await begin(page);
  await page.locator('#quit').click();
  await page.waitForFunction(() => Boolean(window.__CARD_LAB__.snapshot().result));
  const snapshot = await read(page);
  assert.equal(snapshot.result.success, false);
  assert.equal(snapshot.result.reason, 'retreated');
  row.assertions.push('file:// bundle launches the sixth card and emits a real retreat NodeResult');
}, { offline: true });

await close(5);
