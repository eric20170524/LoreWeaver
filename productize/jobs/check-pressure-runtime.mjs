#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import PressureSurvivalAdapter from '../../minigame_master/core/lib/gameplay/pressure_survival/PressureSurvivalAdapter.js';
import {createMockPhaser} from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
function fixture(knobs={},onEnd){
 const mock=createMockPhaser(),scene=mock.scene;scene.input=new EventEmitter();scene.events=new EventEmitter();let paused=false;
 scene.sys={isActive:()=>!paused,isPaused:()=>paused,pause(){paused=true;},resume(){paused=false;}};
 const results=[],a=new PressureSurvivalAdapter({Phaser:mock.Phaser,random:()=>0.5,onEnd:(r,a)=>{results.push(r);onEnd?.(r,a);}});
 a.init({nodeId:'pressure-unit',nodeConfig:{goalValue:1,gameplay:{cardId:'pressure_survival',knobs}}});a.create(scene);
 const click=(x=100,y=500)=>scene.input.emit('pointerdown',{x,y});return {a,scene,mock,results,click};
}
test('click score cannot replace survival time',()=>{const f=fixture();for(let i=0;i<100;i++)f.click();assert.equal(f.a.getTestState().score,0);assert.equal(f.a.getTestState().goalValue,30);assert.equal(f.results.length,0);f.a.destroy();});
test('natural pressure failure and survival success settle exactly once',()=>{
 const fail=fixture();for(let i=0;i<150;i++)fail.a.tick(0.1);assert.equal(fail.results.length,1);assert.equal(fail.results[0].success,false);assert.equal(fail.results[0].reason,'condition_failed');
 const win=fixture({durationSec:5},(_r,a)=>a.destroy());for(let i=0;i<51;i++){win.click();win.a.tick(0.1);}assert.equal(win.results.length,1);assert.equal(win.results[0].success,true);assert.equal(win.results[0].reason,'timer_expired');
});
test('target hits are guarded while paused and consumed only once',()=>{
 const f=fixture();f.a.tick(4);f.a.spawnTarget();const t=f.a.targets[0];f.a.pause();const old=f.a.state.pressure;
 for(const fn of t._listeners.pointerdown||[])fn();f.click(t.x,t.y);assert.equal(f.a.state.pressure,old);assert.equal(t.active,true);
 f.a.resume();f.click(t.x,t.y);assert.equal(f.a.state.targetsHit,1);assert.equal(t.active,false);assert.equal(f.a.state.pressure,old-16);f.a.destroy();
});
test('skill cooldown, active relief and pressure peak survive later relief',()=>{
 const f=fixture();f.a.tick(5);f.a.useSkill();const p=f.a.state.pressure;f.a.useSkill();assert.equal(f.a.state.pressure,p);f.click();assert.equal(f.a.state.pressure,Math.max(0,p-9));f.a.retreat();assert.equal(f.results[0].telemetry.pressurePeak,40);assert.equal(f.results[0].telemetry.skillsUsed,1);
});
test('cleanup removes listeners, timers and display objects',()=>{
 const f=fixture();f.a.spawnTarget();const t=f.a.targets[0];let other=0;f.scene.input.on('pointerdown',()=>other++);f.a.retreat();assert.equal(f.scene.input.listenerCount('pointerdown'),1);assert.equal(t.active,false);assert.deepEqual(f.a.ui,{});assert.ok(f.mock.timers.every(t=>t.removed));f.click();assert.equal(other,1);
});
test('target expiry and bounded configuration do not leak targets',()=>{
 const f=fixture({durationSec:NaN,pressureGrowthPerSec:Infinity,skillCooldownSec:-1});assert.equal(f.a.config.durationSec,30);assert.equal(f.a.config.pressureGrowthPerSec,8);assert.equal(f.a.config.skillCooldownSec,1);f.a.spawnTarget();const t=f.a.targets[0];f.scene.time.now=3000;f.a.tick(0.1);assert.equal(t.active,false);assert.equal(f.a.targets.length,0);f.a.destroy();
});
test('disabled pause and retreat keep running',()=>{const f=fixture({allowPause:false,allowQuit:false});f.a.pause();f.a.retreat();assert.equal(f.a.status,'running');f.a.destroy();});
