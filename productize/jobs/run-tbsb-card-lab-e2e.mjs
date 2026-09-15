#!/usr/bin/env node
// Real browser input only. Snapshot reads are diagnostic; no adapter methods,
// state edits, forced settlement or accelerated clocks are used.
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';

const CARD_ID = 'turn_based_skill_battle';
const lab = await createLabSuite(CARD_ID);
const { read, point, begin, run } = lab;
const SKILLS = {
  strike: { x: 162, y: 1222 },
  heavy: { x: 294, y: 1222 },
  heal: { x: 426, y: 1222 },
  burst: { x: 558, y: 1222 }
};

async function pressSkill(page, id, kind = 'pointer') {
  const target = SKILLS[id];
  assert.ok(target, `known skill ${id}`);
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const p = point(page, target.x, target.y);
  if (kind === 'touch') await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

async function acceptedSkill(page, row, id, kind = 'pointer') {
  const before = await read(page);
  assert.equal(before.state.turn, 'player', `${id} starts on player turn`);
  await pressSkill(page, id, kind);
  await page.waitForFunction(
    used => {
      const snap = window.__CARD_LAB__.snapshot();
      return snap.result || snap.state?.skillsUsed === used + 1;
    },
    before.state.skillsUsed,
    { timeout: 2000, polling: 16 }
  );
  const after = await read(page);
  row.actions.push({
    kind,
    skill: id,
    skillsBefore: before.state.skillsUsed,
    skillsAfter: after.state.skillsUsed,
    turnAfter: after.state.turn,
    hpAfter: after.state.hp,
    enemyHpAfter: after.state.enemyHp
  });
  return { before, after };
}

async function waitPlayerTurn(page, timeout = 2500) {
  await page.waitForFunction(
    () => {
      const snap = window.__CARD_LAB__.snapshot();
      return Boolean(snap.result) || (snap.state?.status === 'running' && snap.state?.turn === 'player');
    },
    null,
    { timeout, polling: 16 }
  );
  return read(page);
}

try {
  await run('default-victory', async (page, row) => {
    const initial = await begin(page);
    assert.equal(initial.config.playerHp, 100);
    assert.equal(initial.config.enemyHp, 180);
    assert.equal(initial.config.enemyAtk, 18);
    assert.equal(initial.config.timeLimitSec, 45);
    assert.ok(initial.state.timer <= 45 && initial.state.timer > 44);

    await acceptedSkill(page, row, 'burst');
    let state = await waitPlayerTurn(page);
    assert.equal(Math.round(state.state.enemyHp), 85);
    assert.equal(state.state.hp, 82);

    await acceptedSkill(page, row, 'heavy');
    state = await waitPlayerTurn(page);
    assert.equal(Math.round(state.state.enemyHp), 25);
    assert.equal(state.state.hp, 64);

    await acceptedSkill(page, row, 'strike');
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().result?.success === true, null, { timeout: 2500 });
    const final = await read(page);
    assert.equal(final.result.reason, 'boss_defeated');
    assert.equal(final.state.enemyHp, 0);
    assert.equal(final.state.skillsUsed, 3);
    assert.ok(final.saves.some(save => save.completedNodeIds.includes(1)), 'host callback records completion');
    row.assertions.push(
      'default 180/18 configuration wins through three real skill clicks',
      'each non-lethal player action receives exactly one enemy response',
      'victory reaches the host save callback'
    );
  });

  await run('cooldown-and-enemy-turn', async (page, row) => {
    await page.locator('#enemy-hp').fill('999');
    await page.locator('#enemy-atk').fill('10');
    await begin(page);

    const heavy = await acceptedSkill(page, row, 'heavy');
    assert.equal(heavy.after.state.turn, 'enemy');
    let state = await waitPlayerTurn(page);
    assert.equal(state.state.hp, 90);
    assert.equal(state.state.cooldowns.heavy, 2);

    const usedBeforeBlocked = state.state.skillsUsed;
    await pressSkill(page, 'heavy');
    await page.waitForTimeout(220);
    state = await read(page);
    assert.equal(state.state.skillsUsed, usedBeforeBlocked, 'cooldown click consumes no action');
    assert.equal(state.state.turn, 'player');
    assert.equal(state.state.hp, 90, 'blocked skill causes no enemy action');

    await acceptedSkill(page, row, 'strike');
    state = await waitPlayerTurn(page);
    assert.equal(state.state.hp, 80);
    assert.equal(state.state.cooldowns.heavy, 1);

    await acceptedSkill(page, row, 'strike');
    state = await waitPlayerTurn(page);
    assert.equal(state.state.hp, 70);
    assert.equal(state.state.cooldowns.heavy, 0);

    await acceptedSkill(page, row, 'heavy');
    state = await waitPlayerTurn(page);
    assert.equal(state.state.hp, 60);
    assert.equal(state.state.skillsUsed, 4);
    row.assertions.push(
      'Heavy CD=2 rejects reuse for two complete player turns',
      'rejected input does not consume a turn or trigger enemy damage',
      'each accepted action causes exactly one 10-damage enemy response'
    );
  });

  await run('natural-hp-zero-failure', async (page, row) => {
    await page.locator('#enemy-hp').fill('999');
    await page.locator('#enemy-atk').fill('60');
    await begin(page);

    await acceptedSkill(page, row, 'heal');
    let state = await waitPlayerTurn(page);
    assert.equal(state.state.hp, 40);
    assert.equal(state.result, null);

    await acceptedSkill(page, row, 'strike');
    await page.waitForFunction(() => !!window.__CARD_LAB__.snapshot().result, null, { timeout: 2500 });
    state = await read(page);
    assert.equal(state.result.success, false);
    assert.equal(state.result.reason, 'hp_zero');
    assert.equal(state.state.hp, 0);
    assert.equal(state.state.skillsUsed, 2);
    assert.deepEqual(state.result.rewards, {});
    row.assertions.push('two real accepted actions allow the configured enemy to reduce HP to zero', 'natural hp_zero is one failed NodeResult with no rewards');
  });

  await run('configured-timeout', async (page, row) => {
    await page.locator('#duration').fill('5');
    await page.locator('#enemy-hp').fill('999');
    await page.locator('#enemy-atk').fill('0');
    const initial = await begin(page);
    assert.ok(initial.state.timer <= 5 && initial.state.timer > 4);
    await page.waitForFunction(() => !!window.__CARD_LAB__.snapshot().result, null, { timeout: 8500 });
    const final = await read(page);
    assert.equal(final.result.success, false);
    assert.equal(final.result.reason, 'timer_expired');
    assert.equal(final.state.timer, 0);
    assert.equal(final.state.hp, 100);
    row.assertions.push('public five-second total countdown expires in real time without accelerated clocks');
  });

  await run('pause-enemy-turn-and-restart', async (page, row) => {
    await page.locator('#duration').fill('20');
    await page.locator('#enemy-hp').fill('999');
    await page.locator('#enemy-atk').fill('25');
    await begin(page);

    const action = await acceptedSkill(page, row, 'heavy');
    assert.equal(action.after.state.turn, 'enemy');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().state?.status === 'paused');
    const paused = (await read(page)).state;
    assert.equal(paused.turn, 'enemy');
    await page.waitForTimeout(1000);
    const frozen = (await read(page)).state;
    assert.equal(frozen.hp, paused.hp);
    assert.equal(frozen.turn, 'enemy');
    assert.equal(frozen.skillsUsed, paused.skillsUsed);
    assert.ok(Math.abs(frozen.timer - paused.timer) < 0.05, 'countdown frozen while paused');

    await page.getByRole('button', { name: '继续', exact: true }).click();
    const resumed = await waitPlayerTurn(page, 3000);
    assert.equal(resumed.state.hp, 75);
    assert.ok(resumed.state.timer < frozen.timer - 0.1);

    const beforeRestartGeneration = resumed.generation;
    const restarted = await begin(page);
    assert.equal(restarted.generation, beforeRestartGeneration + 1);
    assert.equal(restarted.state.hp, 100);
    assert.equal(restarted.state.enemyHp, 999);
    assert.equal(restarted.state.turn, 'player');
    assert.equal(restarted.state.skillsUsed, 0);
    assert.ok(Object.values(restarted.state.cooldowns).every(value => value === 0));
    assert.ok(restarted.state.timer <= 20 && restarted.state.timer > 19);
    assert.equal(await page.locator('canvas').count(), 1);
    row.assertions.push(
      'pause during the pending enemy turn freezes both response and countdown',
      'resume produces exactly one enemy response',
      'visible restart creates one fresh canvas and resets HP, turn, cooldowns, skills and timer'
    );
  });

  await run('result-restart', async (page, row) => {
    await page.locator('#enemy-hp').fill('30');
    await page.locator('#enemy-atk').fill('999');
    await begin(page);
    await acceptedSkill(page, row, 'strike');
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().result?.success === true);
    const won = await read(page);
    assert.equal(won.result.reason, 'boss_defeated');

    await page.locator('#enemy-hp').fill('180');
    await page.locator('#enemy-atk').fill('18');
    const restarted = await begin(page);
    assert.equal(restarted.result, null);
    assert.equal(restarted.state.hp, 100);
    assert.equal(restarted.state.enemyHp, 180);
    assert.equal(restarted.state.skillsUsed, 0);
    assert.equal(restarted.state.turn, 'player');
    assert.ok(restarted.state.timer > 44);
    row.assertions.push('start/restart from a completed result clears the old settlement and mounts a fresh battle');
  });

  await run('mobile-touch-victory', async (page, row) => {
    await begin(page);
    await acceptedSkill(page, row, 'burst', 'touch');
    await waitPlayerTurn(page);
    await acceptedSkill(page, row, 'heavy', 'touch');
    await waitPlayerTurn(page);
    await acceptedSkill(page, row, 'strike', 'touch');
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().result?.success === true);
    const final = await read(page);
    assert.equal(final.result.reason, 'boss_defeated');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    row.assertions.push('390px Chromium touch taps real skill buttons to victory', 'no horizontal overflow; emulation is not physical-device certification');
  }, { mobile: true });

  await run('offline-file-launch', async (page, row) => {
    await begin(page);
    await page.getByRole('button', { name: '退出', exact: true }).click();
    await page.waitForFunction(() => window.__CARD_LAB__.snapshot().result?.reason === 'retreated');
    const final = await read(page);
    assert.equal(final.result.success, false);
    row.assertions.push('the same five-card static bundle starts and retreats from file:// without a server or API key');
  }, { offline: true });
} finally {
  await lab.close(8);
}
