#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import ReactionPickAdapter from '../../minigame_master/core/lib/gameplay/reaction_pick/ReactionPickAdapter.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';

function fixture(knobs = {}, onEnd) {
  const mock = createMockPhaser();
  const { scene } = mock;
  scene.events = new EventEmitter();
  let paused = false;
  scene.sys = { isActive: () => !paused, isPaused: () => paused,
    pause() { paused = true; }, resume() { paused = false; } };
  const timers = [];
  scene.time.now = 0;
  scene.time.delayedCall = (delay, callback) => {
    const timer = { delay, due: scene.time.now + delay, callback, removed: false,
      remove() { this.removed = true; },
      getRemainingSeconds() { return Math.max(0, this.due - scene.time.now) / 1000; } };
    timers.push(timer); return timer;
  };
  function tick(ms) {
    if (paused) return;
    const end = scene.time.now + ms;
    for (let guard = 0; guard < 1000; guard++) {
      const next = timers.filter(t => !t.removed && t.due <= end).sort((a,b) => a.due-b.due)[0];
      if (!next) break;
      scene.time.now = next.due; next.removed = true; next.callback();
    }
    scene.time.now = end;
  }
  const results = [];
  const a = new ReactionPickAdapter({ Phaser: mock.Phaser, random: () => 0.25,
    onEnd: (r, adapter) => { results.push(r); onEnd?.(r, adapter); } });
  a.init({ nodeId: 'reaction-test', nodeConfig: { goalValue: 1, gameplay: { cardId: 'reaction_pick', knobs } } });
  a.create(scene);
  const target = () => a.options.find(o => o.item.id === a.state.targetId).item;
  const wrong = () => a.options.find(o => o.item.id !== a.state.targetId).item;
  return { a, scene, timers, tick, results, target, wrong };
}

test('an answered round cannot time out during the next round', () => {
  const f = fixture({ showLifeMinSec: 2, showLifeMaxSec: 2 });
  f.tick(100); f.a.pick(f.target()); f.tick(500);
  assert.equal(f.a.state.round, 2);
  f.tick(1400); // previous round deadline, 600 ms before the new deadline
  assert.equal(f.a.state.lives, 3);
  assert.equal(f.a.state.waiting, true);
  f.a.destroy();
});
test('each visible round accepts one answer and all six rounds are required', () => {
  const f = fixture();
  for (let round = 0; round < 6; round++) {
    const item = f.target();
    f.a.pick(item); f.a.pick(item);
    assert.equal(f.a.state.correct, round + 1);
    assert.equal(f.a.getTestState().goalValue, 60);
    if (round < 5) { assert.equal(f.results.length, 0); f.tick(500); }
  }
  f.tick(400);
  assert.equal(f.results.length, 1); assert.equal(f.results[0].success, true);
  assert.equal(f.results[0].telemetry.correct, 6);
  f.a.retreat(); f.tick(5000); assert.equal(f.results.length, 1);
});
test('wrong answers and timeout each consume one life, without duplicate settlement', () => {
  const f = fixture({ lives: 2, showLifeMinSec: 1, showLifeMaxSec: 1 });
  f.a.pick(f.wrong()); f.a.miss('duplicate');
  assert.equal(f.a.state.lives, 1);
  f.tick(600); f.tick(1000); f.tick(400);
  assert.equal(f.results.length, 1); assert.equal(f.results[0].success, false);
  assert.equal(f.results[0].telemetry.livesLeft, 0);
});
test('paused input and time do not change the round; resume preserves remaining time', () => {
  const f = fixture({ showLifeMinSec: 2, showLifeMaxSec: 2 });
  f.tick(500); f.a.pause();
  const before = f.a.getTestState();
  f.a.pick(f.target()); f.a.miss('paused'); f.tick(4000);
  assert.equal(f.a.state.correct, 0); assert.equal(f.a.state.lives, 3);
  assert.equal(f.a.getTestState().timer, before.timer);
  f.a.resume(); f.tick(1499); assert.equal(f.a.state.lives, 3);
  f.tick(1); assert.equal(f.a.state.lives, 2); f.a.destroy();
});
test('a stale or fabricated option cannot answer another round', () => {
  const f = fixture(); const old = f.target();
  f.a.pick({ id: old.id }); assert.equal(f.a.state.correct, 0);
  f.a.pick(old); f.tick(500);
  f.a.pick(old); assert.equal(f.a.state.correct, 1); f.a.destroy();
});
test('retreat cancels feedback timers and allows synchronous scene destruction', () => {
  const f = fixture({}, (_r, a) => a.destroy());
  f.a.pick(f.target());
  f.a.retreat(); f.tick(5000);
  assert.equal(f.results.length, 1); assert.equal(f.results[0].reason, 'retreated');
  assert.equal(f.a.status, 'destroyed'); assert.equal(f.a.options.length, 0);
  assert.equal(f.timers.filter(t => !t.removed).length, 0);
});
test('numeric configuration is finite, bounded and ordered', () => {
  const f = fixture({ targetRounds: Infinity, lives: -3, showLifeMinSec: 7, showLifeMaxSec: 1, fakeCountMin: 8, fakeCountMax: -1 });
  assert.equal(f.a.config.targetRounds, 6); assert.equal(f.a.state.lives, 1);
  assert.equal(f.a.config.showLifeMaxSec, 7);
  assert.ok(f.a.options.length >= 2 && f.a.options.length <= 6);
  f.a.destroy();
});
test('disabled pause/quit knobs are honored without changing gameplay', () => {
  const f = fixture({ allowPause: false, allowQuit: false });
  f.a.pause(); assert.equal(f.a.status, 'running');
  assert.equal(f.a.retreat(), null); assert.equal(f.results.length, 0);
  f.a.destroy(); assert.equal(f.a.getTestState().waiting, false);
});
test('a timeout callback queued before cancellation cannot affect a later round', () => {
  const f = fixture(); const previous = f.a.roundTimer;
  f.a.pick(f.target()); f.tick(500);
  previous.callback();
  assert.equal(f.a.state.lives, 3); assert.equal(f.a.state.waiting, true);
  f.a.destroy();
});
