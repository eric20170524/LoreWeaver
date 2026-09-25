#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import TurnBasedSkillBattleAdapter from '../../minigame_master/core/lib/gameplay/turn_based_skill_battle/TurnBasedSkillBattleAdapter.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
import { normalizePlayabilityKnobs } from '../../minigame_master/core/lib/contracts/PlayabilityContract.js';

function fixture(knobs = {}, onEnd) {
  const mock = createMockPhaser();
  mock.scene.events = new EventEmitter();
  let paused = false;
  mock.scene.sys = {
    settings: { active: true, key: 'TurnBasedUnit' },
    isActive: () => !paused,
    isPaused: () => paused,
    pause() { paused = true; },
    resume() { paused = false; }
  };
  const results = [];
  const adapter = new TurnBasedSkillBattleAdapter({
    Phaser: mock.Phaser,
    onEnd(result) {
      results.push(result);
      onEnd?.(result, adapter);
    }
  });
  adapter.init({
    nodeId: 'turn-based-unit',
    nodeConfig: {
      durationLimit: 45,
      gameplay: {
        cardId: 'turn_based_skill_battle',
        knobs: { ...knobs }
      }
    }
  });
  adapter.create(mock.scene);
  const skill = id => adapter.config.skillDeck.find(item => item.id === id);
  const enemyResponse = () => mock.tick(650);
  return { adapter, mock, results, skill, enemyResponse };
}

test('canonical defaults are playable and match the fifth card contract', () => {
  const { adapter } = fixture();
  assert.equal(adapter.config.playerHp, 100);
  assert.equal(adapter.config.enemyHp, 180);
  assert.equal(adapter.config.enemyAtk, 18);
  assert.equal(adapter.config.timeLimitSec, 45);
  assert.equal(adapter.getTestState().timer, 45);
  assert.equal(adapter.state.turn, 'player');
  adapter.destroy();
});

test('accepted player action switches once to enemy and one enemy response switches back', () => {
  const { adapter, skill, enemyResponse } = fixture({ enemyHp: 500, enemyAtk: 18 });
  assert.equal(adapter.onSkillClick(skill('strike')), true);
  assert.equal(adapter.state.turn, 'enemy');
  assert.equal(adapter.state.skillsUsed, 1);
  const afterPlayer = adapter.state.enemyHp;
  assert.equal(adapter.onSkillClick(skill('strike')), false, 'input is rejected during enemy turn');
  assert.equal(adapter.state.skillsUsed, 1);
  enemyResponse();
  assert.equal(adapter.state.turn, 'player');
  assert.equal(adapter.state.playerHp, 82);
  assert.equal(adapter.state.turnsElapsed, 1);
  assert.equal(adapter.state.enemyHp, afterPlayer);
  adapter.resolveEnemyTurn();
  assert.equal(adapter.state.playerHp, 82, 'second enemy callback is inert after turn returns to player');
  assert.equal(adapter.state.turnsElapsed, 1);
  adapter.destroy();
});

test('authored cooldown N blocks the next N complete player turns', () => {
  const { adapter, skill, enemyResponse } = fixture({ enemyHp: 999, enemyAtk: 0 });
  assert.equal(adapter.onSkillClick(skill('heavy')), true);
  enemyResponse();
  assert.equal(adapter.state.cooldowns.heavy, 2);
  const used = adapter.state.skillsUsed;
  assert.equal(adapter.onSkillClick(skill('heavy')), false);
  assert.equal(adapter.state.skillsUsed, used, 'rejected cooldown input consumes no action');

  assert.equal(adapter.onSkillClick(skill('strike')), true);
  enemyResponse();
  assert.equal(adapter.state.cooldowns.heavy, 1);
  assert.equal(adapter.onSkillClick(skill('heavy')), false);

  assert.equal(adapter.onSkillClick(skill('strike')), true);
  enemyResponse();
  assert.equal(adapter.state.cooldowns.heavy, 0);
  assert.equal(adapter.onSkillClick(skill('heavy')), true, 'heavy is available only after two intervening player turns');
  adapter.destroy();
});

test('heal consumes one accepted action, clamps to max HP and then yields to the enemy', () => {
  const { adapter, skill, enemyResponse } = fixture({ enemyHp: 999, enemyAtk: 20 });
  assert.equal(adapter.onSkillClick(skill('strike')), true);
  enemyResponse();
  assert.equal(adapter.state.playerHp, 80);
  assert.equal(adapter.onSkillClick(skill('heal')), true);
  assert.equal(adapter.state.playerHp, 100);
  assert.equal(adapter.state.turn, 'enemy');
  assert.equal(adapter.state.skillsUsed, 2);
  enemyResponse();
  assert.equal(adapter.state.playerHp, 80);
  assert.equal(adapter.state.cooldowns.heal, 3);
  adapter.destroy();
});

test('total countdown decreases only while running and times out exactly once', () => {
  const { adapter, results } = fixture({ timeLimitSec: 5, enemyHp: 999, enemyAtk: 0 });
  adapter.update(0, 1200);
  assert.ok(adapter.getTestState().timer < 3.81 && adapter.getTestState().timer > 3.79);
  adapter.pause();
  const frozen = adapter.getTestState().timer;
  adapter.update(0, 5000);
  assert.equal(adapter.getTestState().timer, frozen);
  adapter.resume();
  adapter.update(0, 3800);
  assert.equal(adapter.getTestState().timer, 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].success, false);
  assert.equal(results[0].reason, 'timer_expired');
  adapter.update(0, 5000);
  adapter.finish(false, 'timer_expired');
  assert.equal(results.length, 1);
});

test('HP zero from the real enemy response settles one failure with no rewards', () => {
  const { adapter, results, skill, enemyResponse } = fixture({ enemyHp: 999, enemyAtk: 100 });
  assert.equal(adapter.onSkillClick(skill('strike')), true);
  enemyResponse();
  assert.equal(results.length, 1);
  assert.equal(results[0].success, false);
  assert.equal(results[0].reason, 'hp_zero');
  assert.deepEqual(results[0].rewards, {});
  assert.equal(adapter.status, 'ended');
  adapter.resolveEnemyTurn();
  assert.equal(results.length, 1);
});

test('enemy HP zero settles one victory and ignores duplicate settlement calls', () => {
  const { adapter, results, skill } = fixture({ enemyHp: 30, enemyAtk: 999 });
  assert.equal(adapter.onSkillClick(skill('strike')), true);
  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);
  assert.equal(results[0].reason, 'boss_defeated');
  const first = adapter.result;
  assert.equal(adapter.finish(true, 'boss_defeated'), first);
  assert.equal(adapter.finish(false, 'hp_zero'), first);
  assert.equal(results.length, 1);
});

test('settlement clears every action button object and pending timers', () => {
  const { adapter, mock, skill } = fixture({ enemyHp: 30 });
  const owned = adapter.ui.buttons.flatMap(button => [button.bg, button.label, button.cdLabel]);
  adapter.onSkillClick(skill('strike'));
  assert.equal(adapter.ui.buttons.length, 0);
  assert.ok(owned.every(object => object.active === false));
  assert.ok(mock.timers.every(timer => timer.removed), 'all delayed feedback/enemy timers are cancelled');
});

test('synchronous host destruction after result does not create a second result', () => {
  const f = fixture({ enemyHp: 30 }, (_result, adapter) => adapter.destroy());
  assert.doesNotThrow(() => f.adapter.onSkillClick(f.skill('strike')));
  assert.equal(f.results.length, 1);
  assert.equal(f.adapter.status, 'destroyed');
  assert.equal(f.adapter.onSkillClick(f.skill('strike')), false);
});

test('destroy without a result cancels the pending enemy action and emits no completion', () => {
  const { adapter, mock, results, skill } = fixture({ enemyHp: 999 });
  adapter.onSkillClick(skill('strike'));
  assert.equal(adapter.state.turn, 'enemy');
  adapter.destroy();
  mock.tick(2000);
  assert.equal(results.length, 0);
  assert.equal(adapter.status, 'destroyed');
});

test('card defaults survive shared host normalization without reintroducing 1800/120 drift', () => {
  const card = JSON.parse(fs.readFileSync(new URL('../../minigame_master/gameplay/cards/turn_based_skill_battle.json', import.meta.url)));
  const raw = Object.fromEntries(Object.entries(card.knobs).map(([key, value]) => [key, value.default]));
  const normalized = normalizePlayabilityKnobs(card.id, raw, { durationLimit: raw.timeLimitSec, goalValue: raw.enemyHp });
  assert.equal(raw.enemyHp, 180);
  assert.equal(raw.enemyAtk, 18);
  assert.equal(raw.timeLimitSec, 45);
  const { adapter: direct } = fixture(raw);
  const { adapter: viaHost } = fixture(normalized);
  for (const adapter of [direct, viaHost]) {
    assert.equal(adapter.config.enemyHp, 180);
    assert.equal(adapter.config.enemyAtk, 18);
    assert.equal(adapter.config.timeLimitSec, 45);
    assert.equal(adapter.state.timeRemaining, 45);
  }
  direct.destroy();
  viaHost.destroy();
});
