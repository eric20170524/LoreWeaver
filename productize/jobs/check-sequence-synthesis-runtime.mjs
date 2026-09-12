#!/usr/bin/env node
// Real adapter methods; Phaser drawing/input/clock doubles, not browser proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import SequenceSynthesisAdapter from '../../minigame_master/core/lib/gameplay/sequence_synthesis/SequenceSynthesisAdapter.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
import { normalizePlayabilityKnobs } from '../../minigame_master/core/lib/contracts/PlayabilityContract.js';

function fixture(knobs = {}, onEnd, extra = {}) {
  const mock = createMockPhaser();
  mock.scene.input = new EventEmitter(); mock.scene.input.keyboard = new EventEmitter();
  mock.scene.events = new EventEmitter();
  let paused = false;
  mock.scene.sys = { isActive: () => !paused, isPaused: () => paused,
    pause() { paused = true; }, resume() { paused = false; } };
  const objects = [];
  for (const name of ['rectangle', 'graphics', 'text']) {
    const make = mock.scene.add[name].bind(mock.scene.add);
    mock.scene.add[name] = (...args) => {
      const object = make(...args), emitter = new EventEmitter(); objects.push(object);
      object.on = (...args) => { emitter.on(...args); return object; };
      object.off = (...args) => { emitter.off(...args); return object; };
      object.emit = (...args) => emitter.emit(...args);
      object.listenerCount = name => emitter.listenerCount(name);
      for (const method of ['setText', 'clear']) {
        if (!object[method]) continue;
        const original = object[method].bind(object);
        object[method] = (...args) => { assert.ok(object.active, `${method} after destruction`); return original(...args); };
      }
      return object;
    };
  }
  const results = [];
  const a = new SequenceSynthesisAdapter({ Phaser: mock.Phaser, ...extra,
    onEnd: (r, adapter) => { results.push(r); onEnd?.(r, adapter); } });
  a.init({nodeId: 'sequence-unit', nodeConfig: {gameplay: {cardId:'sequence_synthesis', knobs}}});
  a.create(mock.scene);
  return {a, mock, results, objects};
}
const next = a => a.state.pool.find(m => m.id === a.state.recipe[a.state.stepIndex]);
const wrong = a => a.state.pool.find(m => m.id !== a.state.recipe[a.state.stepIndex]);
function complete(a) {
  for (let guard=0; a.isRunning() && guard<25; guard++) a.onMaterialClick(next(a));
}

test('default recipe completes through individual material inputs, exactly once',()=>{
  const {a,results}=fixture(); const recipe=a.state.recipe.slice();
  assert.equal(a.config.durationSec,45); assert.equal(a.state.pool.length,6);
  for(let i=0;i<recipe.length;i++) {
    assert.equal(a.onMaterialClick(next(a)),true); assert.equal(a.state.stepIndex,i+1);
    if(i<recipe.length-1)assert.equal(a.status,'running');
  }
  assert.equal(results.length,1);assert.equal(results[0].success,true);
  assert.equal(results[0].reason,'objective_met');assert.equal(a.state.progress,100);
  assert.equal(a.onMaterialClick({id:recipe.at(-1)}),false); a.retreat();
  assert.equal(results.length,1);
});
test('percentage penalty rewinds actual prefix, and undone steps must be replayed',()=>{
  const {a,results}=fixture({recipeLength:4,wrongInputProgressPenalty:30});
  for(let i=0;i<3;i++)a.onMaterialClick(next(a));
  a.onMaterialClick(wrong(a));assert.equal(a.state.stepIndex,1);assert.equal(a.state.progress,25);
  a.onMaterialClick(next(a));assert.equal(a.state.stepIndex,2);assert.equal(results.length,0);
  complete(a);assert.equal(results[0].success,true);assert.equal(results[0].telemetry.mistakes,1);
});
test('zero penalty remains zero; consecutive mistakes reset progress without ending',()=>{
  const {a,results}=fixture({wrongInputProgressPenalty:0});a.onMaterialClick(next(a));
  a.onMaterialClick(wrong(a));assert.equal(a.state.stepIndex,1);
  a.onMaterialClick(wrong(a));assert.equal(a.state.stepIndex,0);assert.equal(a.state.resets,1);
  assert.equal(a.state.mistakes,2);assert.equal(a.state.consecutiveMistakes,0);assert.equal(results.length,0);
  complete(a);assert.equal(results[0].success,true);
});
test('correct input breaks the consecutive mistake streak',()=>{
  const {a}=fixture({wrongInputProgressPenalty:0,explodeFails:true});
  a.onMaterialClick(wrong(a));a.onMaterialClick(next(a));a.onMaterialClick(wrong(a));
  assert.equal(a.state.consecutiveMistakes,1);assert.equal(a.state.mistakes,2);assert.equal(a.status,'running');a.destroy();
});
test('configured overheat failure returns once without touching released UI',()=>{
  const {a,results,objects}=fixture({explodeFails:true},(_r,a)=>a.destroy());
  a.onMaterialClick(wrong(a));assert.doesNotThrow(()=>a.onMaterialClick(wrong(a)));
  assert.equal(results.length,1);assert.equal(results[0].success,false);assert.deepEqual(results[0].rewards,{});
  assert.equal(a.status,'destroyed');assert.ok(objects.every(o=>!o.active));
});
test('success supports synchronous host scene destruction',()=>{
  const {a,results,objects}=fixture({recipeLength:1},(_r,a)=>a.destroy());
  assert.doesNotThrow(()=>a.onMaterialClick(next(a)));assert.equal(results.length,1);
  assert.equal(a.status,'destroyed');assert.ok(objects.every(o=>!o.active));
});
test('timeout is an actual countdown failure, never an idle win',()=>{
  const {a,results}=fixture({timeLimitSec:5,durationSec:80});a.update(0,4999);
  assert.equal(results.length,0);assert.ok(a.getTestState().timer>0);
  a.update(0,1);a.update(0,5000);assert.equal(results.length,1);
  assert.equal(results[0].reason,'timer_expired');assert.equal(results[0].success,false);
  assert.equal(a.getTestState().timer,0);assert.deepEqual(results[0].rewards,{});
});
test('pause freezes timer, material pointer input and keyboard input',()=>{
  const {a,mock}=fixture();a.pause();const snapshot=a.getTestState();
  a.update(0,5000);a.onMaterialClick(next(a));
  a.materialButtons[0].bg.emit('pointerdown');mock.scene.input.keyboard.emit('keydown',{key:'1'});
  assert.deepEqual(a.getTestState(),snapshot);a.resume();a.update(0,1000);
  assert.equal(a.state.timeRemaining,44);a.destroy();
});
test('number keys use visible material ordering; held key repeats are ignored',()=>{
  const {a,mock}=fixture({recipeLength:8});const index=a.state.pool.findIndex(m=>m.id===next(a).id);
  mock.scene.input.keyboard.emit('keydown',{key:String(index+1),repeat:true});assert.equal(a.state.stepIndex,0);
  mock.scene.input.keyboard.emit('keydown',{key:String(index+1),ctrlKey:true});assert.equal(a.state.stepIndex,0);
  mock.scene.input.keyboard.emit('keydown',{key:String(index+1)});assert.equal(a.state.stepIndex,1);a.destroy();
});
test('seed zero is reproducible and does not consult wall time or Math.random',()=>{
  const date=Date.now,random=Math.random;
  Date.now=()=>{throw new Error('wall clock RNG');};Math.random=()=>{throw new Error('global RNG');};
  try {
    const a=new SequenceSynthesisAdapter(),b=new SequenceSynthesisAdapter();
    a.init({runSeed:0,nodeConfig:{gameplay:{knobs:{runSeed:9}}}});
    b.init({nodeConfig:{gameplay:{knobs:{runSeed:0}}}});
    assert.deepEqual(a.state.recipe,b.state.recipe);assert.deepEqual(a.state.pool,b.state.pool);
    assert.equal(a.config.runSeed,0);
  } finally {Date.now=date;Math.random=random;}
});
test('different seeds select different ordered pools or recipes',()=>{
  const {a}=fixture({runSeed:0}),{a:b}=fixture({runSeed:1});
  assert.notDeepEqual([a.state.pool,a.state.recipe],[b.state.pool,b.state.recipe]);a.destroy();b.destroy();
});
test('non-finite, fractional and excessive dimensions stay bounded',()=>{
  const {a}=fixture({recipeLength:Infinity,materialPoolSize:9999,durationSec:NaN,runSeed:'bad',playerHp:NaN});
  assert.equal(a.state.recipe.length,4);assert.equal(a.state.pool.length,8);
  assert.equal(a.config.durationSec,45);assert.equal(a.state.hp,100);a.destroy();
  const {a:b}=fixture({recipeLength:20.9,materialPoolSize:2.9,wrongInputProgressPenalty:-1});
  assert.equal(b.state.recipe.length,20);assert.equal(b.state.pool.length,2);
  assert.equal(b.config.wrongInputProgressPenalty,0);b.destroy();
});
test('unknown materials and invalid deltas cannot corrupt progress or health',()=>{
  const {a}=fixture();const before=a.getTestState();
  for(const mat of [null,{},'wood',{id:'unknown'}])assert.equal(a.onMaterialClick(mat),false);
  for(const dt of [-1,NaN,Infinity,'1000'])a.update(0,dt);
  for(const n of [-1,NaN,Infinity,'10'])assert.equal(a.damagePlayer(n),false);
  assert.deepEqual(a.getTestState(),before);a.destroy();
});
test('premature host success and non-opted-in force helper cannot complete a recipe',()=>{
  const {a,results}=fixture({goalValue:1});a.onMaterialClick(next(a));
  assert.equal(a.getTestState().goalValue,100);a.finish(true,'objective_met');a.forceComplete();
  assert.equal(a.status,'running');assert.equal(results.length,0);assert.equal(a.state.stepIndex,1);a.destroy();
});
test('retreat and shutdown clear only owned keyboard and button listeners',()=>{
  const {a,mock,objects,results}=fixture();let count=0;mock.scene.input.keyboard.on('keydown',()=>count++);
  const buttons=a.materialButtons.map(b=>b.bg);a.retreat();mock.scene.events.emit('shutdown');
  mock.scene.input.keyboard.emit('keydown',{key:'1'});assert.equal(count,1);
  assert.equal(mock.scene.input.keyboard.listenerCount('keydown'),1);
  assert.ok(buttons.every(b=>b.listenerCount('pointerdown')===0));assert.ok(objects.every(o=>!o.active));
  assert.equal(results.length,1);assert.equal(results[0].reason,'retreated');
});
test('destroy without result emits no completion and later inputs do nothing',()=>{
  const {a,results}=fixture();a.destroy();a.destroy();
  assert.equal(a.onMaterialClick({id:'wood'}),false);a.update(0,50000);assert.equal(results.length,0);
});
test('re-init resets results, time, errors and recipe progress',()=>{
  const {a,mock}=fixture({recipeLength:1});complete(a);a.destroy();
  a.init({nodeConfig:{gameplay:{knobs:{runSeed:0}}}});a.create(mock.scene);
  assert.equal(a.result,null);assert.equal(a.state.progress,0);assert.equal(a.state.mistakes,0);
  assert.equal(a.state.elapsedSeconds,0);assert.equal(a.state.timeRemaining,45);assert.equal(a.materialButtons.length,6);a.destroy();
});
test('presentation callback cannot recursively supply an extra ingredient',()=>{
  const {a}=fixture();a.context.spawnParticles=()=>a.onMaterialClick(next(a));
  a.onMaterialClick(next(a));assert.equal(a.state.stepIndex,1);a.destroy();
});
test('pause and retreat honor explicit opt-out flags',()=>{
  const {a}=fixture({allowPause:false,allowQuit:false});a.pause();assert.equal(a.status,'running');
  assert.equal(a.retreat(),null);assert.equal(a.status,'running');a.destroy();
});
test('theme labels are rendered without injecting another IP catalog',()=>{
  const {a}=fixture({themeContentPack:{defaultLocale:'zh-CN',copyKeys:{material_wood:{'zh-CN':'木灵材'}}},materialPoolSize:8});
  assert.equal(a.state.pool.find(m=>m.id==='wood').label,'木灵材');a.destroy();
});
test('card defaults survive shared host normalization and both init paths agree',()=>{
  const card=JSON.parse(fs.readFileSync(new URL('../../minigame_master/gameplay/cards/sequence_synthesis.json',import.meta.url)));
  const raw=Object.fromEntries(Object.entries(card.knobs).map(([k,v])=>[k,v.default]));
  const normalized=normalizePlayabilityKnobs(card.id,raw,{goalValue:100,durationLimit:45});
  const {a}=fixture(raw),{a:b}=fixture(normalized);
  assert.deepEqual(a.state,b.state);assert.equal(a.state.timeRemaining,45);assert.equal(a.config.materialPoolSize,6);
  assert.equal(card.knobs.materialPoolSize.max,8);a.destroy();b.destroy();
});
