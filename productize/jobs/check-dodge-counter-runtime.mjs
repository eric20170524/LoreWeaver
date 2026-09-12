import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import DodgeCounterBossAdapter from '../../minigame_master/core/lib/gameplay/dodge_counter_boss/DodgeCounterBossAdapter.js';

function object(x = 0, y = 0) {
  const o = Object.assign(new EventEmitter(), { x, y, active: true, text: '' });
  for (const method of ['setOrigin', 'setInteractive', 'setStrokeStyle', 'setFillStyle', 'setRadius', 'setAlpha', 'setColor', 'fillStyle', 'fillRoundedRect', 'clear']) {
    o[method] = () => { assert.equal(o.active, true, `${method} after object.destroy()`); return o; };
  }
  o.setText = (text) => { assert.equal(o.active, true); o.text = text; return o; };
  o.setPosition = (px, py) => { o.x = px; o.y = py; return o; };
  o.destroy = () => { o.active = false; o.removeAllListeners(); };
  return o;
}
function fixture(knobs = {}, onEnd) {
  const timers = [], results = [];
  const scene = {
    scale: { width: 720, height: 1280 },
    add: { circle: (x, y) => object(x, y), text: (x, y) => object(x, y), graphics: () => object() },
    input: Object.assign(new EventEmitter(), { keyboard: new EventEmitter() }),
    events: new EventEmitter(), cameras: { main: { shake() {} } },
    time: { now: 0, delayedCall(ms, callback) { const timer = { ms, callback, removed: false, remove() { this.removed = true; } }; timers.push(timer); return timer; } }
  };
  const adapter = new DodgeCounterBossAdapter({ Phaser: {}, random: () => 0.5,
    onEnd(result) { results.push(result); onEnd?.(result, adapter); } });
  adapter.init({ nodeId: 'node_2', nodeConfig: { durationLimit: 70, gameplay: { cardId: 'dodge_counter_boss', knobs: { bossHp: 360, playerHp: 120, ...knobs } } } });
  adapter.create(scene);
  const step = (ms) => { scene.time.now += ms; adapter.update(scene.time.now, ms); };
  const counterWindow = () => {
    adapter.movePlayer(20, 1160);
    for (let i = 0; i < 500 && adapter.isRunning() && (adapter.state.phase !== 'counter' || adapter.state.counterUsed); i++) step(20);
    assert.equal(adapter.state.phase, 'counter');
    assert.equal(adapter.state.counterUsed, false);
  };
  return { adapter, scene, timers, results, step, counterWindow };
}

test('payload duration is honored and timeout is a single failure, not a win', () => {
  const f = fixture();
  assert.equal(f.adapter.getTestState().timer, 70);
  f.step(70001);
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].success, false);
  assert.equal(f.results[0].reason, 'timer_expired');
  f.step(5000);
  assert.equal(f.results.length, 1);
});
test('one opening accepts only one counter across pointer and semantic input', () => {
  const f = fixture();
  f.counterWindow();
  f.adapter.boss.emit('pointerdown');
  assert.equal(f.adapter.primaryAction().accepted, false);
  assert.equal(f.adapter.state.counters, 1);
  assert.equal(f.adapter.state.bossHp, 325);
  assert.equal(f.adapter.state.score, 18);
});
test('host progress agrees with break gauge; five counters must not prematurely win', () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) { f.counterWindow(); f.adapter.tryCounter(); }
  assert.equal(f.adapter.state.score, 90);
  assert.equal(f.adapter.getTestState().goalValue, 100);
  assert.equal(f.adapter.status, 'running');
  assert.equal(f.results.length, 0);
});
test('sixth counter finishes once without accessing destroyed HUD, even when host destroys synchronously', () => {
  const f = fixture({}, (_result, adapter) => adapter.destroy());
  for (let i = 0; i < 6; i++) { f.counterWindow(); assert.doesNotThrow(() => f.adapter.tryCounter()); }
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].success, true);
  assert.equal(f.adapter.status, 'destroyed');
  assert.equal(f.adapter.tryCounter(), false);
  assert.equal(f.scene.input.listenerCount('pointermove'), 0);
  assert.equal(f.scene.input.keyboard.listenerCount('keydown-SPACE'), 0);
});
test('HP victory also returns before touching disposed graphics', () => {
  const f = fixture({ bossHp: 30 });
  f.counterWindow();
  assert.doesNotThrow(() => f.adapter.tryCounter());
  assert.equal(f.results[0].success, true);
});
test('one active attack cannot hit twice when the iframe expires', () => {
  const f = fixture();
  f.adapter.beginAttack();
  f.step(710);
  const z = f.adapter.state.attackZone;
  f.adapter.movePlayer(z.x, z.y);
  f.step(1); f.step(360);
  assert.equal(f.adapter.state.playerHp, 102);
});
test('retreat/shutdown remove only owned listeners and cancel delayed feedback', () => {
  const f = fixture();
  const external = () => {};
  f.scene.input.on('pointermove', external);
  f.counterWindow(); f.adapter.tryCounter();
  f.adapter.retreat(); f.adapter.retreat();
  assert.equal(f.results.length, 1);
  assert.equal(f.scene.input.listenerCount('pointermove'), 1);
  assert.equal(f.timers.every(timer => timer.removed), true);
  assert.doesNotThrow(() => f.timers.forEach(timer => timer.callback()));
  assert.doesNotThrow(() => f.scene.input.emit('pointermove', { isDown: true, x: 30, y: 900 }));
  f.scene.events.emit('shutdown');
  f.adapter.destroy();
});
test('hover does not move the player; drag does; pause freezes combat and countdown', () => {
  const f = fixture();
  const initial = f.adapter.player.x;
  f.scene.input.emit('pointermove', { isDown: false, x: 30, y: 900 });
  assert.equal(f.adapter.player.x, initial);
  f.scene.input.emit('pointermove', { isDown: true, x: 30, y: 900 });
  assert.equal(f.adapter.player.x, 30);
  f.counterWindow();
  const before = structuredClone(f.adapter.state);
  f.adapter.pause(); f.step(10000);
  assert.equal(f.adapter.tryCounter(), false);
  assert.deepEqual(f.adapter.state, before);
  f.adapter.resume();
  assert.equal(f.adapter.tryCounter(), true);
});
test('scene shutdown directly disposes the adapter without a reward', () => {
  const f = fixture();
  f.scene.events.emit('shutdown');
  assert.equal(f.adapter.status, 'destroyed');
  assert.equal(f.scene.input.listenerCount('pointermove'), 0);
  assert.equal(f.results.length, 0);
});
