// Behavioral unit tests: real adapter, mocked Phaser rendering/clock; not browser evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import CollectDodgeAdapter from '../../minigame_master/core/lib/gameplay/collect_dodge/CollectDodgeAdapter.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';

function fixture(knobs = {}, onEnd) {
  const mock = createMockPhaser();
  mock.scene.input = new EventEmitter(); mock.scene.events = new EventEmitter();
  let paused = false;
  mock.scene.sys = { isActive: () => !paused, isPaused: () => paused,
    pause() { paused = true; }, resume() { paused = false; } };
  const results = [];
  const a = new CollectDodgeAdapter({ Phaser: mock.Phaser, random: () => 0.5,
    onEnd: (r, adapter) => { results.push(r); onEnd?.(r, adapter); } });
  a.init({ nodeId: 'collect-unit', nodeConfig: { gameplay: { cardId: 'drag_collect_grid', knobs } } });
  a.create(mock.scene);
  return { a, mock, results };
}
function item(a, kind = 'gem', x = a.player.x, y = a.player.y - 90, speed = 280) {
  const f = { id: ++a.itemSerial, kind, go: a.scene.add.circle(x, y, 12), r: 12, speed };
  a.fallers.push(f); return f;
}

test('default card can complete by collecting its actual quota without an unannounced Boss', () => {
  const card = JSON.parse(fs.readFileSync(new URL('../../minigame_master/gameplay/cards/drag_collect_grid.json', import.meta.url)));
  const knobs = Object.fromEntries(Object.entries(card.knobs).map(([k,v]) => [k,v.default]));
  const {a,results} = fixture(knobs);
  assert.equal(a.config.skipBoss,true); assert.equal(a.config.duration,40);
  for(let n=0;n<16;n++) {
    a.clearFallers(); item(a); a.update(0,250);
    assert.equal(a.state.score,n+1);
    if(n<15) assert.equal(a.status,'running');
  }
  assert.equal(results.length,1); assert.equal(results[0].reason,'objective_met');
  assert.equal(results[0].success,true); assert.equal(a.state.bossSpawned,false);
});
test('canonical aliases win and public zero hazard rate remains zero',()=>{
  const {a}=fixture({timeLimitSec:25,durationSec:99,needAmount:2,goalValue:9,hazardRate:0,playerHp:35});
  assert.equal(a.config.duration,25); assert.equal(a.config.goalValue,2);
  assert.equal(a.config.hazardRate,0); assert.equal(a.state.hp,35);
  assert.ok(a.fallers.every(f=>f.kind==='gem')); a.destroy();
});
test('numeric bounds match advertised spawn speed and probability ranges',()=>{
  const {a}=fixture({spawnIntervalMs:200,itemSpeed:80,hazardRate:0.9,collectRadius:12});
  assert.equal(a.config.spawnIntervalMs,200); assert.equal(a.config.itemSpeed,80);
  assert.equal(a.config.hazardRate,0.9); assert.equal(a.config.collectRadius,12); a.destroy();
});
test('non-finite knobs are normalized to finite bounded values',()=>{
  const {a}=fixture({timeLimitSec:NaN,needAmount:Infinity,itemSpeed:'bad',damageOnHit:-20,playerHp:NaN,boss:{hp:NaN,speed:0}});
  for(const k of ['duration','goalValue','itemSpeed','damageOnHit','playerHp']) assert.ok(Number.isFinite(a.config[k]),k);
  assert.equal(a.config.damageOnHit,1); assert.equal(a.config.boss.hp,100); assert.equal(a.config.boss.speed,0); a.destroy();
});
test('hover is ignored; mouse/touch drag moves horizontally within bounds',()=>{
  const {a,mock}=fixture(); const original={x:a.player.x,y:a.player.y};
  mock.scene.input.emit('pointermove',{x:20,isDown:false}); assert.equal(a.player.x,original.x);
  mock.scene.input.emit('pointermove',{x:-50,isDown:true}); assert.equal(a.player.x,36);
  mock.scene.input.emit('pointerdown',{x:900,isDown:true}); assert.equal(a.player.x,684);
  mock.scene.input.emit('pointermove',{x:NaN,isDown:true}); assert.equal(a.player.x,684);
  assert.equal(a.player.y,original.y); a.destroy();
});
test('one collectible and one hazard are consumed exactly once',()=>{
  const {a}=fixture({needAmount:20}); a.clearFallers(); const gem=item(a), red=item(a,'hazard');
  a.collectGem(gem); a.collectGem(gem); a.hitHazard(red); a.hitHazard(red);
  assert.equal(a.state.score,1); assert.equal(a.state.hp,85); assert.equal(a.state.hazardsHit,1); a.destroy();
});
test('long-frame swept movement does not tunnel through the player or auto-collect distant items',()=>{
  const {a}=fixture(); a.clearFallers(); item(a,'gem',a.player.x,150,800); item(a,'gem',36,150,800);
  a.update(0,2000); assert.equal(a.state.score,1); assert.equal(a.fallers.length,0); a.destroy();
});
test('zero and invalid frame deltas cannot move or collect',()=>{
  const {a}=fixture(); const before=a.getTestState();
  for(const dt of [0,-1,NaN,Infinity,undefined]) a.update(0,dt);
  assert.deepEqual(a.getTestState(),before); a.destroy();
});
test('paused movement, collection, damage, spawning and clock remain frozen',()=>{
  const {a,mock}=fixture(); a.clearFallers(); const f=item(a); a.pause(); const before=a.getTestState();
  mock.scene.input.emit('pointermove',{x:30,isDown:true}); a.collectGem(f); a.damagePlayer(100);
  a.spawnFallingItem(); a.spawnSwordDrop(); a.onSecondTick(); a.update(0,2000);
  assert.deepEqual(a.getTestState(),before); a.resume(); a.update(0,250); assert.equal(a.state.score,1); a.destroy();
});
test('real objective is required; host score shortcut cannot manufacture a victory',()=>{
  const {a,results}=fixture(); assert.equal(a.finish(true,'objective_met'),null);
  assert.equal(a.status,'running'); assert.equal(results.length,0); a.destroy();
});
test('time expires as failure with no rewards; repeated end is idempotent',()=>{
  const {a,results}=fixture({timeLimitSec:5}); for(let i=0;i<8;i++) a.onSecondTick();
  a.retreat(); a.finish(true); assert.equal(results.length,1);
  assert.equal(results[0].reason,'timer_expired'); assert.deepEqual(results[0].rewards,{});
});
test('a lethal real collision supports synchronous host disposal',()=>{
  const {a,results}=fixture({playerHp:15},(_r,a)=>a.destroy()); a.clearFallers(); item(a,'hazard');
  assert.doesNotThrow(()=>a.update(0,250)); assert.equal(results.length,1);
  assert.equal(results[0].reason,'hp_zero'); assert.equal(a.state.hp,0); assert.equal(a.player,null);
});
test('explicit legacy Boss phase remains available and final projectile does not touch destroyed UI',()=>{
  const {a,results}=fixture({skipBoss:false,needAmount:16,boss:{hp:12,speed:0}},(_r,a)=>a.destroy());
  for(let i=0;i<8;i++){ a.clearFallers(); a.collectGem(item(a)); }
  assert.equal(a.state.bossSpawned,true); assert.equal(a.status,'running');
  a.shootFlyingSword(a.boss.x,a.boss.y+80);
  assert.doesNotThrow(()=>a.update(0,300)); assert.equal(results.length,1);
  assert.equal(results[0].reason,'boss_defeated'); assert.equal(a.boss,null);
});
test('spawn count is bounded and offscreen side projectiles are reclaimed',()=>{
  const {a}=fixture({maxActiveItems:4}); for(let i=0;i<100;i++) a.spawnFallingItem();
  assert.equal(a.fallers.length,4); a.clearFallers();
  const f=item(a,'hazard',10,100); f._vx=-500; f._vy=0;
  a.update(0,200); assert.equal(a.fallers.length,0); a.destroy();
});
test('retreat/shutdown removes owned input, timers and floating feedback only',()=>{
  const {a,mock,results}=fixture(); let host=0; const hostHandler=()=>host++;
  mock.scene.input.on('pointermove',hostHandler); a.collectGem(item(a));
  assert.equal(a.feedback.size,1); const texts=[...a.feedback].map(f=>f.text);
  a.retreat(); a.destroy(); mock.scene.input.emit('pointermove',{x:1,isDown:true});
  assert.equal(host,1); assert.equal(mock.scene.input.listenerCount('pointermove'),1);
  assert.equal(a.feedback.size,0); assert.ok(texts.every(t=>!t.active));
  assert.ok(mock.timers.every(t=>t.removed)); assert.equal(results.length,1);
});
test('reinitialization resets elapsed time and player state without sharing defaults',()=>{
  const {a}=fixture({timeLimitSec:8}); a.onSecondTick(); a.retreat(); a.destroy();
  a.init({nodeConfig:{gameplay:{knobs:{}}}});
  assert.equal(a.state.elapsedSeconds,0); assert.equal(a.state.timeRemaining,40);
  assert.equal(a.state.score,0); assert.equal(a.result,null); assert.equal(a.state.hazardsHit,0);
});
