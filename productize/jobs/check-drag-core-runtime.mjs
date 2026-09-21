#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import DragToCoreAdapter from '../../minigame_master/core/lib/gameplay/drag_to_core/DragToCoreAdapter.js';
import {createMockPhaser} from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
function fixture(knobs={},onEnd){
 const mock=createMockPhaser(),scene=mock.scene;scene.input=new EventEmitter();scene.events=new EventEmitter();let paused=false;
 scene.sys={isActive:()=>!paused,isPaused:()=>paused,pause(){paused=true;},resume(){paused=false;}};
 const results=[];const a=new DragToCoreAdapter({Phaser:mock.Phaser,random:()=>0.1,onEnd:(r,a)=>{results.push(r);onEnd?.(r,a);}});
 a.init({nodeId:'drag-unit',nodeConfig:{goalValue:1,gameplay:{cardId:'drag_to_core',knobs}}});a.create(scene);
 function down(frag){const p={x:frag.sprite.x,y:frag.sprite.y,isDown:true};for(const fn of frag.sprite._listeners.pointerdown||[])fn(p);scene.input.emit('pointerdown',p);}
 function drop(frag,x=a.core.x,y=a.core.y){down(frag);scene.input.emit('pointermove',{x,y,isDown:true});scene.input.emit('pointerup');}
 return {a,scene,results,down,drop};
}
test('deposit advances canonical progress once and custom count completes once',()=>{
 const f=fixture({fragCount:3,hazardCount:0},(_r,a)=>a.destroy());f.drop(f.a.frags[0]);assert.equal(f.a.state.deposited,1);assert.equal(f.a.getTestState().score,f.a.state.progress);assert.equal(f.a.getTestState().goalValue,100);
 f.scene.input.emit('pointerup');assert.equal(f.a.state.deposited,1);f.drop(f.a.frags.find(x=>x.alive));assert.equal(f.results.length,0);f.drop(f.a.frags.find(x=>x.alive));assert.equal(f.results.length,1);assert.equal(f.results[0].success,true);
});
test('pause rejects dragging and freezes hazards',()=>{
 const f=fixture();const frag=f.a.frags[0],x=frag.sprite.x,y=frag.sprite.y;f.a.pause();f.drop(frag);f.a.update(0,5000);assert.equal(frag.sprite.x,x);assert.equal(frag.sprite.y,y);assert.equal(f.a.state.deposited,0);f.a.resume();f.a.destroy();
});
test('hover and pointerupoutside cannot continue a released drag',()=>{
 const f=fixture({hazardCount:0});const frag=f.a.frags[0];f.down(frag);f.scene.input.emit('pointerupoutside');f.scene.input.emit('pointermove',{x:f.a.core.x,y:f.a.core.y,isDown:false});f.scene.input.emit('pointerup');assert.equal(f.a.state.deposited,0);assert.equal(f.a.dragging,null);f.a.destroy();
});
test('hazard drop costs progress and leaves fragment available for retry',()=>{
 const f=fixture({fragCount:4,hazardCount:1,hazardSpeed:0});f.drop(f.a.frags[0]);const before=f.a.state.progress,frag=f.a.frags[1],h=f.a.hazards[0];
 f.drop(frag,h.x,h.y);assert.equal(f.a.state.fails,1);assert.equal(frag.alive,true);assert.equal(f.a.state.progress,Math.max(0,before-12));assert.equal(f.a.getTestState().score,f.a.state.progress);f.drop(frag);assert.equal(f.a.state.deposited,2);f.a.destroy();
});
test('retreat removes owned input and destroyed references',()=>{
 const f=fixture();let other=0;f.scene.input.on('pointermove',()=>other++);f.down(f.a.frags[0]);f.a.retreat();assert.equal(f.scene.input.listenerCount('pointermove'),1);f.scene.input.emit('pointermove',{x:1,y:1,isDown:true});assert.equal(other,1);assert.equal(f.a.dragging,null);assert.equal(f.a.core,null);assert.deepEqual(f.a.frags,[]);assert.deepEqual(f.a.ui,{});
});
test('knobs are finite bounded integers and disabled controls are honored',()=>{
 const f=fixture({fragCount:Infinity,hazardCount:-1,hazardSpeed:NaN,hazardPenalty:-2,allowQuit:false,allowPause:false});assert.equal(f.a.config.fragCount,14);assert.equal(f.a.config.hazardCount,0);assert.equal(f.a.config.hazardSpeed,70);assert.equal(f.a.config.hazardPenalty,0);f.a.pause();f.a.retreat();assert.equal(f.a.status,'running');f.a.destroy();
});
