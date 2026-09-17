import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import RhythmTimingRound, { normalizeRhythmConfig } from '../../minigame_master/core/lib/gameplay/tap_reaction/RhythmTimingRound.js';
import TapReactionAdapter from '../../minigame_master/core/lib/gameplay/tap_reaction/TapReactionAdapter.js';

// Pure rules tests do not claim browser input, rendering or physical-device coverage.
test('default round wins by ten timed Perfect inputs, not arbitrary clicks', () => {
  const round = new RhythmTimingRound();
  for (let i = 0; i < 10; i++) { round.advance(1500); assert.equal(round.hit().kind, 'perfect'); }
  assert.equal(round.state.score, 100); assert.equal(round.state.bestCombo, 10);
  assert.deepEqual(round.state.outcome, { success: true, reason: 'objective_met' });
  assert.equal(round.state.hp, 100);
});
for (const [offset, kind] of [[-161,'miss'],[-160,'good'],[-81,'good'],[-80,'perfect'],[0,'perfect'],[80,'perfect'],[81,'good'],[160,'good']]) {
  test(`inclusive timing boundary ${offset}ms is ${kind}`, () => {
    const r = new RhythmTimingRound(); r.advance(1500 + offset);
    assert.equal(r.hit().kind, kind); assert.equal(r.state.lastJudgment.offsetMs, offset);
  });
}
test('Good hits award five, and can finish the default preset within its deadline', () => {
  const r = new RhythmTimingRound();
  r.advance(1380); r.hit();
  for (let i=1; i<20; i++) { r.advance(1500); assert.equal(r.hit().kind, 'good'); }
  assert.equal(r.state.score,100); assert.equal(r.state.goodHits,20);
  assert.equal(r.state.outcome.success,true);
});
test('an early miss and repeated inputs consume one beat and damage once', () => {
  const r = new RhythmTimingRound(); r.hit();
  for (let i=0;i<200;i++) assert.equal(r.hit().accepted,false);
  assert.equal(r.state.hp,90); assert.equal(r.state.misses,1);
  r.advance(1661); assert.equal(r.state.misses,1);
});
test('frame catch-up counts every expired beat, stops on death and stays bounded', () => {
  const r = new RhythmTimingRound(); r.advance(600000);
  assert.equal(r.state.misses,10); assert.equal(r.state.hp,0);
  assert.equal(r.state.outcome.reason,'hp_zero');
  const frozen=r.snapshot(); r.advance(600000); r.hit(); assert.deepEqual(r.snapshot(),frozen);
});
test('progress cannot bypass the combo condition', () => {
  const r=new RhythmTimingRound({targetProgress:1,requiredBestCombo:3});
  for(let i=0;i<2;i++){r.advance(1500);r.hit();assert.equal(r.state.outcome,null);}
  r.advance(1500);r.hit();assert.equal(r.state.outcome.success,true);
});
test('miss resets current combo but retains the actual best combo', () => {
  const r=new RhythmTimingRound();r.advance(1500);r.hit();r.advance(1500);r.hit();r.advance(1661);
  assert.equal(r.state.combo,0);assert.equal(r.state.bestCombo,2);assert.equal(r.state.misses,1);
});
test('zero combo requirement is honored and impossible objectives time out rather than auto-win', () => {
  const r=new RhythmTimingRound({targetProgress:1,requiredBestCombo:0});r.advance(1500);r.hit();assert.ok(r.state.outcome.success);
  const timed=new RhythmTimingRound({durationSec:1,damageOnMiss:0});timed.advance(1000);
  assert.deepEqual(timed.state.outcome,{success:false,reason:'timer_expired'});
});
test('aliases are deterministic; invalid numbers and overlapping windows are bounded', () => {
  const c=normalizeRhythmConfig({spawnIntervalMs:600,beatIntervalMs:300,goalValue:11,targetProgress:12,perfectWindowMs:900,goodWindowMs:9999,playerHp:NaN,durationSec:Infinity});
  assert.equal(c.beatIntervalMs,300);assert.equal(c.targetProgress,12);
  assert.equal(c.goodWindowMs,149);assert.equal(c.perfectWindowMs,149);assert.equal(c.playerHp,100);assert.equal(c.durationSec,45);
  assert.ok(normalizeRhythmConfig({beatIntervalMs:300}).goodWindowMs<150);
});
test('invalid delta is ignored and diagnostic snapshots cannot mutate the round', () => {
  const r=new RhythmTimingRound();for(const d of [-1,NaN,Infinity,'2'])r.advance(d);assert.equal(r.state.elapsedMs,0);
  r.advance(1500);r.hit();const s=r.snapshot();s.lastJudgment.kind='fake';s.score=999;assert.equal(r.state.lastJudgment.kind,'perfect');assert.equal(r.state.score,10);
});

function fixture(knobs={}, destroyOnEnd=false) {
  const results=[], objects=[];
  const object=(x,y)=>{
    const o=Object.assign(new EventEmitter(),{x,y,active:true});objects.push(o);
    for(const key of ['setOrigin','setInteractive','setStrokeStyle','setRadius','setAlpha','setText']) {
      o[key]=()=>{assert.equal(o.active,true,`${key} after destroy`);return o;};
    }
    o.destroy=()=>{o.active=false;o.removeAllListeners();};return o;
  };
  let paused=false;
  const scene={scale:{width:720,height:1280},events:new EventEmitter(),
    input:{keyboard:new EventEmitter()},add:{text:object,circle:object},
    sys:{isActive:()=>!paused,isPaused:()=>paused,pause:()=>{paused=true;},resume:()=>{paused=false;}},
    time:{now:0},cameras:{main:{shake(){}}}};
  const a=new TapReactionAdapter({Phaser:{},onEnd:r=>{results.push(r);if(destroyOnEnd)a.destroy();}});
  a.init({nodeId:'rhythm',nodeConfig:{gameplay:{cardId:'rhythm_timing',knobs}},playerStats:{hp:100}});a.create(scene);
  const step=ms=>{scene.time.now+=ms;a.update(scene.time.now,ms);};
  return{a,scene,objects,results,step};
}
test('the real adapter routes pointer/keyboard into the same one-beat judge',()=>{
  const f=fixture();f.step(1500);f.a.rhythmUI.pad.emit('pointerdown');f.scene.input.keyboard.emit('keydown-SPACE',{});
  assert.equal(f.a.state.score,10);assert.equal(f.a.getTestState().perfectHits,1);
  assert.equal(f.a.finish(true, 'objective_met'),null, 'host shortcut cannot bypass the timing objective');
  assert.equal(f.a.status,'running');
});
test('pause freezes input and active-play time; resume continues the same beat',()=>{
  const f=fixture();f.step(1400);f.a.pause();const before=f.a.getTestState();
  f.a.rhythmUI.pad.emit('pointerdown');f.scene.input.keyboard.emit('keydown-SPACE',{});f.step(30000);
  assert.deepEqual(f.a.getTestState(),before);f.a.resume();f.step(100);assert.equal(f.a.primaryAction().kind,'perfect');
});
test('key repeat is ignored; shutdown removes only owned listeners and all UI',()=>{
  const f=fixture();const host=()=>{};f.scene.input.keyboard.on('keydown-SPACE',host);f.step(1500);
  f.scene.input.keyboard.emit('keydown-SPACE',{repeat:true});assert.equal(f.a.state.score,0);
  f.scene.events.emit('shutdown');assert.equal(f.a.status,'destroyed');
  assert.equal(f.scene.input.keyboard.listenerCount('keydown-SPACE'),1);assert.ok(f.objects.every(o=>!o.active));assert.equal(f.results.length,0);
});
test('victory is settled once before synchronous host destruction; no disposed UI update',()=>{
  const f=fixture({targetProgress:10,requiredBestCombo:1,rewardTable:{score:7}},true);f.step(1500);
  assert.doesNotThrow(()=>f.a.primaryAction());f.a.primaryAction();f.a.retreat();
  assert.equal(f.results.length,1);assert.equal(f.results[0].success,true);assert.equal(f.results[0].rewards.score,7);
  assert.equal(f.results[0].telemetry.perfectHits,1);assert.equal(f.a.status,'destroyed');
});
test('miss death, timeout, and repeat retreat settle a single rewardless failure',()=>{
  for(const mode of ['death','timeout','retreat']) {
    const f=fixture(mode==='death'?{playerHp:10}:mode==='timeout'?{durationSec:1}:{});
    if(mode==='death') f.a.primaryAction();else if(mode==='timeout')f.step(1001);else f.a.retreat();
    f.a.retreat();f.step(5000);assert.equal(f.results.length,1);assert.equal(f.results[0].success,false);assert.deepEqual(f.results[0].rewards,{});
  }
});
test('default adapter is judged; explicitly selected legacy Boss mode stays available',()=>{
  const a=new TapReactionAdapter({Phaser:{}});a.init({nodeConfig:{gameplay:{knobs:{skipBoss:false}}}});
  assert.equal(a.rhythmRound,null);assert.equal(a.config.skipBoss,false);
});
