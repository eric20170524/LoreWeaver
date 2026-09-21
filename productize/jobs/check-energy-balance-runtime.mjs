#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import EnergyBalanceAdapter from '../../minigame_master/core/lib/gameplay/energy_balance/EnergyBalanceAdapter.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
function fixture(knobs = {}, onEnd) {
  const mock = createMockPhaser(); const scene = mock.scene;
  scene.input = new EventEmitter(); scene.events = new EventEmitter();
  let paused = false;
  scene.sys = { isActive: () => !paused, isPaused: () => paused,
    pause() { paused = true; }, resume() { paused = false; } };
  const results = [];
  const a = new EnergyBalanceAdapter({ Phaser: mock.Phaser, random: () => 0.1,
    onEnd: (r, adapter) => { results.push(r); onEnd?.(r, adapter); } });
  a.init({ nodeId: 'energy-unit', nodeConfig: { goalValue: 1, gameplay: { cardId: 'energy_balance', knobs } } });
  a.create(scene);
  function drag(orb, x = a.ui.core.x, y = a.ui.core.y) {
    scene.input.emit('pointerdown', { x: orb.sprite.x, y: orb.sprite.y, isDown: true });
    scene.input.emit('pointermove', { x, y, isDown: true });
    scene.input.emit('pointerup');
  }
  return { a, scene, mock, results, drag };
}
test('default equilibrium drifts without input and cannot win by idling', () => {
  const f = fixture();
  for (let i=0; i<700 && f.a.isRunning(); i++) f.a.tickBalance(0.1);
  assert.equal(f.results.length, 1); assert.equal(f.results[0].success, false);
  assert.ok(f.a.state.stableSec < 20);
});
test('real drag into the core applies one bias and destroys sprite plus label', () => {
  const f = fixture({ pointerDrift: 0 }); f.a.spawnOrb();
  const orb=f.a.orbs[0]; const expected=0.5+orb.type.bias*0.08;
  f.drag(orb); f.scene.input.emit('pointerup');
  assert.equal(f.a.state.balance, expected); assert.equal(f.a.orbs.length, 0);
  assert.equal(orb.sprite.active, false); assert.equal(orb.label.active, false);
  f.a.destroy();
});
test('hover, paused dragging and release outside the canvas cannot deposit', () => {
  const f=fixture(); f.a.spawnOrb(); const orb=f.a.orbs[0];
  f.scene.input.emit('pointermove',{x:360,y:666,isDown:false});
  assert.equal(f.a.state.balance,0.5);
  f.a.pause(); f.drag(orb); f.a.tickBalance(10);
  assert.equal(f.a.state.balance,0.5); assert.equal(f.a.state.elapsedSec,0);
  f.a.resume();
  f.scene.input.emit('pointerdown',{x:orb.sprite.x,y:orb.sprite.y,isDown:true});
  f.scene.input.emit('pointermove',{x:f.a.ui.core.x,y:f.a.ui.core.y,isDown:true});
  f.scene.input.emit('pointerupoutside');
  f.scene.input.emit('pointerup'); assert.equal(f.a.state.balance,0.5);
  f.a.destroy();
});
test('stable-time goal is distinct from orb consumption and arbitrary host score', () => {
  const f=fixture({targetStableSec:5,pointerDrift:0});
  assert.equal(f.a.getTestState().goalValue,5);
  for(let i=0;i<49;i++)f.a.tickBalance(0.1);
  assert.equal(f.results.length,0);
  for(let i=0;i<2;i++)f.a.tickBalance(0.1);
  assert.equal(f.results.length,1); assert.equal(f.results[0].success,true);
});
test('outside-warning exposure consumes configured violations and settles once', () => {
  const f=fixture({failOverWarn:1,failViolationLimit:1,pointerDrift:0});
  // Three real wood drops move the balance below the warning range.
  for(let i=0;i<3;i++){f.a.spawnOrb();f.drag(f.a.orbs[0]);}
  for(let i=0;i<11;i++)f.a.tickBalance(0.1);
  assert.equal(f.results.length,1); assert.equal(f.results[0].success,false);
  f.a.tickBalance(10);f.a.retreat();assert.equal(f.results.length,1);
});
test('retreat removes owned input listeners and all orb labels', () => {
  const f=fixture({},(_r,a)=>a.destroy()); let unrelated=0;
  f.scene.input.on('pointerdown',()=>unrelated++);
  f.a.spawnOrb(); const labels=f.a.orbs.map(o=>o.label);
  f.a.retreat();
  f.scene.input.emit('pointerdown',{x:1,y:1,isDown:true});
  assert.equal(unrelated,1);assert.equal(f.scene.input.listenerCount('pointerdown'),1);
  assert.ok(labels.every(l=>l.active===false)); assert.equal(f.a.dragging,null);
});
test('spawn count remains bounded and evicted labels are destroyed', () => {
  const f=fixture(); const labels=[];
  for(let i=0;i<30;i++){f.a.spawnOrb();labels.push(f.a.orbs.at(-1).label);}
  assert.ok(f.a.orbs.length<=12);
  assert.ok(labels.filter(l=>l.active).length<=12);
  f.a.destroy();
});
test('invalid numerical knobs normalize to finite ordered intervals', () => {
  const f=fixture({targetStableSec:NaN,safeZoneWidth:0.6,warnZoneWidth:0.2,orbSpawnMinSec:5,orbSpawnMaxSec:0,pointerDrift:Infinity});
  assert.equal(f.a.config.targetStableSec,20);
  assert.ok(f.a.config.warnZoneWidth>=f.a.config.safeZoneWidth);
  assert.equal(f.a.config.orbSpawnMaxSec,5);assert.ok(Number.isFinite(f.a.config.pointerDrift));
  f.a.destroy();
});
