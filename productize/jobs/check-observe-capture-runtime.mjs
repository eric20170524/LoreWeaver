#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import ObserveCaptureAdapter from '../../minigame_master/core/lib/gameplay/observe_capture/ObserveCaptureAdapter.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
function fixture(knobs = {}, onEnd) {
  const mock = createMockPhaser(), scene = mock.scene;
  scene.input = new EventEmitter(); scene.events = new EventEmitter();
  let paused = false;
  scene.sys = {isActive:()=>!paused,isPaused:()=>paused,pause(){paused=true;},resume(){paused=false;}};
  const results=[];
  const a=new ObserveCaptureAdapter({Phaser:mock.Phaser,random:()=>0.5,onEnd:(r,a)=>{results.push(r);onEnd?.(r,a);}});
  a.init({nodeId:'observe-unit',nodeConfig:{goalValue:1,gameplay:{cardId:'observe_capture',knobs}}});a.create(scene);
  const open=()=>{for(let i=0;i<500&&!a.state.paused;i++)a.update(0,10);assert.equal(a.state.paused,true);};
  // Match Phaser's object pointerdown followed by the scene pointerdown dispatch.
  const click=()=>{const p={x:a.target.x,y:a.target.y};for(const fn of a.target._listeners.pointerdown||[])fn(p);scene.input.emit('pointerdown',p);};
  return {a,scene,mock,results,open,click};
}
test('one physical click captures once without also applying a miss',()=>{
  const f=fixture();f.open();f.click();assert.equal(f.a.state.captures,1);assert.equal(f.a.state.misses,0);assert.equal(f.a.state.progress,22);f.a.destroy();
});
test('unattended windows never advance the capture objective',()=>{
  const f=fixture();for(let i=0;i<8000;i++)f.a.update(0,10);assert.equal(f.a.state.progress,0);assert.equal(f.results.length,0);f.a.destroy();
});
test('moving click applies one configured penalty and canonical score follows progress',()=>{
  const f=fixture();f.open();f.click();f.scene.input.emit('pointerdown',{x:60,y:500});
  assert.equal(f.a.state.misses,1);assert.equal(f.a.state.progress,10);assert.equal(f.a.getTestState().score,10);assert.equal(f.a.getTestState().goalValue,100);f.a.destroy();
});
test('pause freezes movement and capture window and rejects input',()=>{
  const f=fixture();f.open();f.a.pause();const old=f.a.getTestState();f.click();f.a.missClick();f.a.update(0,10000);
  assert.deepEqual(f.a.getTestState(),old);f.a.resume();f.click();assert.equal(f.a.state.captures,1);f.a.destroy();
});
test('configured objective settles once even when host destroys synchronously',()=>{
  const f=fixture({targetProgress:30,captureGain:15},(_r,a)=>a.destroy());
  f.open();f.click();assert.equal(f.results.length,0);f.open();assert.doesNotThrow(f.click);assert.equal(f.results.length,1);assert.equal(f.results[0].success,true);
  f.a.retreat();f.a.missClick();assert.equal(f.results.length,1);assert.equal(f.a.state.misses,0);
});
test('retreat removes owned listeners, feedback timer and display references',()=>{
  const f=fixture();let unrelated=0;f.scene.input.on('pointerdown',()=>unrelated++);f.a.missClick();f.a.retreat();
  assert.equal(f.scene.input.listenerCount('pointerdown'),1);f.scene.input.emit('pointerdown',{x:50,y:50});assert.equal(unrelated,1);
  assert.equal(f.a.target,null);assert.deepEqual(f.a.ui,{});assert.ok(f.mock.timers.every(t=>t.removed));
});
test('invalid knobs and zero random direction normalize to finite playable values',()=>{
  const f=fixture({targetProgress:0,captureGain:NaN,pauseWindowSec:Infinity,pauseIntervalMinSec:4,pauseIntervalMaxSec:1});
  assert.ok(f.a.config.targetProgress>=1);assert.equal(f.a.config.captureGain,22);assert.equal(f.a.config.pauseWindowSec,0.7);assert.equal(f.a.config.pauseIntervalMaxSec,4);
  f.open();f.a.update(0,1000);assert.ok(Math.hypot(f.a.state.vx,f.a.state.vy)>0);f.a.destroy();
});
test('disabled pause and retreat preserve the running session',()=>{
  const f=fixture({allowPause:false,allowQuit:false});f.a.pause();f.a.retreat();assert.equal(f.a.status,'running');assert.equal(f.results.length,0);f.a.destroy();
});
