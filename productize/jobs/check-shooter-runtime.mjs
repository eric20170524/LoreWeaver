#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import Adapter from '../../minigame_master/core/lib/gameplay/shooter_duel/ShooterDuelAdapter.js';
import {createMockPhaser} from '../../minigame_master/core/lib/testing/MockPhaserScene.js';
function fixture(knobs={}, prepare=null){const m=createMockPhaser(),scene=m.scene;scene.input=new EventEmitter();scene.events=new EventEmitter();scene.input.activePointer={isDown:false,x:360};let paused=false;scene.sys={isActive:()=>!paused,isPaused:()=>paused,pause(){paused=true;},resume(){paused=false;}};const results=[],cues=[],a=new Adapter({Phaser:m.Phaser,onEnd:r=>results.push(r),onAudioCue:cue=>cues.push(cue)});const payload={nodeId:'shoot-unit',nodeConfig:{goalValue:1,gameplay:{knobs}}};prepare?.(scene,payload);a.init(payload);a.create(scene);const step=ms=>{m.tick(ms);a.update(0,ms);};return {a,m,scene,results,cues,step};}
test('ranged duel prefers the bow actor and returns to idle after a shot',()=>{const clips=[];const f=fixture({},(scene,payload)=>{scene.textures.addCanvas('tex_bow');scene.textures.addCanvas('tex_sword');payload.runtimeArt={resolve(role){if(role==='player_bow')return 'tex_bow';if(role==='player')return 'tex_sword';return null;},playClip(sprite,role,clip){clips.push(`${role}:${clip}`);sprite.setData('artClip',clip);return `lw_${role}_${clip}`;}};});assert.equal(f.a.player.getData('artRole'),'player_bow');assert.equal(f.a.player.getData('artSource'),'atlas');assert.deepEqual(clips,['player_bow:idle']);f.a.tryFire();assert.equal(clips.at(-1),'player_bow:attack');f.m.tick(180);assert.equal(clips.at(-1),'player_bow:idle');assert.equal(f.a.config.playerHp,100);assert.equal(f.a.config.bossHp,300);assert.equal(f.a.config.timeLimitSec,60);f.a.destroy();});
test('missing bow frame keeps the sword actor',()=>{const f=fixture({},(scene,payload)=>{scene.textures.addCanvas('tex_sword');payload.runtimeArt={resolve(role){return role==='player'?'tex_sword':null;},playClip(){return null;}};});assert.equal(f.a.player.getData('artRole'),'player');assert.equal(f.a.player.radius,undefined);f.a.destroy();});
test('cooldown limits shots and pause rejects fire and movement',()=>{const f=fixture();f.a.tryFire();f.a.tryFire();assert.equal(f.a.bullets.length,1);assert.deepEqual(f.cues,['sfx_bow_release']);f.a.pause();const old=f.a.getTestState();f.a.tryFire();f.a.enemyFire();f.a.update(0,1000);assert.deepEqual(f.a.getTestState(),old);assert.deepEqual(f.cues,['sfx_bow_release']);f.a.destroy();});
test('held pointer fires at configured cadence',()=>{const f=fixture();f.scene.input.activePointer.isDown=true;for(let i=0;i<60;i++)f.step(10);assert.ok(f.a.bullets.length>=2);f.a.destroy();});
test('boss damage cannot trigger a host score goal before the boss dies',()=>{const f=fixture({bossHp:24});f.a.bossVx=0;f.a.tryFire();for(let i=0;i<250&&f.a.state.bossHp===24;i++)f.step(10);assert.equal(f.a.state.bossHp,12);assert.equal(f.a.getTestState().goalValue,0);assert.equal(f.results.length,0);f.a.tryFire();for(let i=0;i<250&&!f.results.length;i++)f.step(10);assert.equal(f.results[0].reason,'boss_defeated');assert.equal(f.results[0].success,true);});
test('stationary player dies from real projectiles and short timer fails',()=>{const f=fixture({playerHp:1});for(let i=0;i<1200&&!f.results.length;i++)f.step(10);assert.equal(f.results[0].reason,'hp_zero');const g=fixture({timeLimitSec:3});for(let i=0;i<310&&!g.results.length;i++)g.step(10);assert.equal(g.results[0].reason,'timer_expired');assert.equal(g.results[0].success,false);});
test('retreat releases listeners, projectiles and display references',()=>{const f=fixture();f.a.tryFire();f.a.enemyFire();let other=0;f.scene.input.on('pointerdown',()=>other++);f.a.retreat();assert.equal(f.scene.input.listenerCount('pointerdown'),1);f.scene.input.emit('pointerdown');assert.equal(other,1);assert.equal(f.a.player,null);assert.equal(f.a.boss,null);assert.deepEqual(f.a.ui,{});assert.ok(f.m.timers.every(t=>t.removed));});
test('invalid parameters normalize and disabled controls are respected',()=>{const f=fixture({bossHp:NaN,playerFireCooldownMs:0,timeLimitSec:Infinity,allowPause:false,allowQuit:false});assert.equal(f.a.state.bossHp,300);assert.ok(f.a.config.playerFireCooldownMs>=80);assert.equal(f.a.config.timeLimitSec,60);f.a.pause();f.a.retreat();assert.equal(f.a.status,'running');f.a.destroy();});
test('shi mu node 5 keeps its 75 second duel and the three endings',()=>{
  const preset=JSON.parse(fs.readFileSync(new URL('../../data/presets/xuanjiezhimen_fangame_preset.json',import.meta.url),'utf8'));
  const node=preset.nodes.find(item=>item.id===5);
  const knobs=node.gameplay.knobs;
  assert.equal(node.gameplay.cardId,'shooter_duel');
  assert.equal(knobs.timeLimitSec,75);
  assert.equal(knobs.playerHp,120);
  assert.equal(knobs.bossHp,420);
  const held=fixture(knobs);
  assert.equal(held.a.config.timeLimitSec,75);
  assert.equal(held.a.config.playerHp,120);
  assert.equal(held.a.state.bossHp,420);
  held.a.bossVx=0;
  for(let i=0;i<80&&!held.results.length;i++){
    held.scene.time.now += held.a.config.playerFireCooldownMs + 1;
    held.a.player.x=40;
    held.a.boss.x=680;
    held.a.tryFire();
    const bullet=held.a.bullets.at(-1);
    if(bullet){bullet.x=held.a.boss.x;bullet.y=held.a.boss.y;}
    held.step(16);
  }
  assert.equal(held.results[0].reason,'boss_defeated');
  assert.equal(held.results[0].success,true);
  const dead=fixture({...knobs,playerHp:1});
  assert.equal(dead.a.config.timeLimitSec,75);
  for(let i=0;i<1200&&!dead.results.length;i++)dead.step(10);
  assert.equal(dead.results[0].reason,'hp_zero');
  assert.equal(dead.results[0].success,false);
  const timed=fixture(knobs);
  for(let i=0;i<7600&&!timed.results.length;i++){
    timed.a.player.x=40;
    timed.a.boss.x=680;
    for(const bullet of timed.a.enemyBullets) bullet.destroy?.();
    timed.a.enemyBullets=[];
    timed.step(10);
  }
  assert.equal(timed.results[0].reason,'timer_expired');
  assert.equal(timed.results[0].success,false);
  assert.equal(timed.a.config.timeLimitSec,75);
});
