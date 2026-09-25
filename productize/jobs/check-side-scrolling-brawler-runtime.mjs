#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { SideScrollingBrawlerAdapter } from '../../minigame_master/core/lib/gameplay/index.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';

function fixture(knobs = {}, onEnd) {
  const mock = createMockPhaser(960, 540);
  mock.scene.events = new EventEmitter();
  let paused = false;
  mock.scene.sys = {
    settings: { active: true, key: 'BrawlerUnit' },
    isActive: () => !paused,
    isPaused: () => paused,
    pause() { paused = true; },
    resume() { paused = false; }
  };
  const results = [];
  const adapter = new SideScrollingBrawlerAdapter({
    Phaser: mock.Phaser,
    onEnd(result) {
      results.push(result);
      onEnd?.(result, adapter);
    }
  });
  const waveList = knobs.waveList || [{
    id: 'unit_wave',
    name: 'Unit Wave',
    triggerX: 180,
    lockX: 220,
    cameraMax: 620,
    enemies: [{ hp: 20, speed: 0, damage: 5, x: 300, y: 0 }]
  }];
  adapter.init({
    nodeId: 'brawler-unit',
    nodeConfig: {
      goalValue: 10,
      gameplay: {
        cardId: 'side_scrolling_brawler',
        knobs: {
          stageLengthPx: 1200,
          waveList,
          lifeStock: { enabled: false },
          continueCredits: { enabled: false },
          player: { hp: 100, speed: 180, attackDamage: 20, attackCooldownMs: 120, attackRange: 70, radius: 16 },
          ...knobs
        }
      }
    },
    playerStats: { hp: 100 }
  });
  adapter.create(mock.scene);
  return { adapter, mock, results };
}

test('sixth card exports the certified brawler surface', () => {
  const { adapter } = fixture();
  assert.equal(adapter.constructor.name, 'CertifiedSideScrollingBrawlerAdapter');
  assert.equal(adapter.status, 'running');
  assert.equal(adapter.getTestState().hp, 100);
  adapter.destroy();
});

test('generic host objective_met cannot bypass locked-wave all-clear', () => {
  const { adapter, results } = fixture();
  adapter.state.score = 9999;
  const result = adapter.finish(true, 'objective_met');
  assert.equal(result, null);
  assert.equal(adapter.status, 'running');
  assert.equal(results.length, 0);
  adapter.destroy();
});

test('objective_met observed after true all-clear is normalized to all_clear', () => {
  const { adapter, results } = fixture();
  adapter.state.waveIndex = adapter.config.waveList.length;
  adapter.enemies = [];
  const result = adapter.finish(true, 'objective_met');
  assert.equal(result?.success, true);
  assert.equal(result?.reason, 'all_clear');
  assert.equal(results.length, 1);
  assert.equal(results[0].reason, 'all_clear');
  assert.equal(adapter.status, 'ended');
});

test('legacy completed success is normalized to the card-owned all_clear reason', () => {
  const { adapter, results } = fixture();
  const result = adapter.finish(true, 'completed');
  assert.equal(result?.success, true);
  assert.equal(result?.reason, 'all_clear');
  assert.equal(results.length, 1);
});

test('real pointer movement zone drives the player on the belt-scroll lane', () => {
  const { adapter, mock } = fixture();
  const x0 = adapter.player.x;
  const y0 = adapter.player.y;
  mock.scene.input._l.pointerdown({ id: 7, x: 360, y: y0 + 30, worldX: 360, worldY: y0 + 30, isDown: true });
  assert.equal(adapter.getTestState().touchMoving, true);
  adapter.handleMovement(500);
  assert.ok(adapter.player.x > x0 + 40, `player should move right from ${x0}, got ${adapter.player.x}`);
  assert.ok(adapter.player.y > y0, 'touch target also respects lane-depth movement');
  mock.scene.input._l.pointerup({ id: 7, x: 360, y: y0 + 30 });
  assert.equal(adapter.getTestState().touchMoving, false);
  adapter.destroy();
});

test('lower action zone does not become a movement target', () => {
  const { adapter, mock } = fixture();
  const x0 = adapter.player.x;
  mock.scene.input._l.pointerdown({ id: 2, x: 400, y: 500, worldX: 400, worldY: 500, isDown: true });
  assert.equal(adapter.getTestState().touchMoving, false);
  adapter.handleMovement(500);
  assert.equal(adapter.player.x, x0);
  adapter.destroy();
});

test('touch direction controls override tap-to-move without losing vertical movement', () => {
  const { adapter, mock } = fixture();
  const y0 = adapter.player.y;
  adapter.ui.touchUp = {};
  adapter.touchInput.up = true;
  mock.scene.input._l.pointerdown({ id: 8, x: 630, y: 388, worldX: 630, worldY: 388, isDown: true }, [adapter.ui.touchUp]);
  assert.equal(adapter.getTestState().touchMoving, false);
  adapter.handleMovement(300);
  assert.ok(adapter.player.y < y0 - 5, `up control should move player from ${y0}, got ${adapter.player.y}`);
  adapter.destroy();
});

test('pause blocks touch movement and resume restores it', () => {
  const { adapter, mock } = fixture();
  const y = adapter.player.y;
  mock.scene.input._l.pointerdown({ id: 3, x: 360, y, worldX: 360, worldY: y, isDown: true });
  const x0 = adapter.player.x;
  adapter.pause();
  adapter.update(100, 500);
  assert.equal(adapter.player.x, x0);
  assert.equal(adapter.status, 'paused');
  adapter.resume();
  adapter.update(600, 500);
  assert.ok(adapter.player.x > x0);
  adapter.destroy();
});

test('single-life HP zero settles exactly one failure with no rewards', () => {
  const { adapter, results } = fixture({ lifeStock: { enabled: false }, continueCredits: { enabled: false } });
  adapter.damagePlayer(100, 'hp_zero');
  assert.equal(results.length, 1);
  assert.equal(results[0].success, false);
  assert.equal(results[0].reason, 'hp_zero');
  assert.deepEqual(results[0].rewards, {});
  adapter.finish(false, 'hp_zero');
  assert.equal(results.length, 1);
});

test('locked screen spans one landscape viewport and keeps each wave theme', () => {
  const { adapter, mock } = fixture({
    stageLengthPx: 3600,
    waveList: [
      { id: 'forge_gate', name: '锻口试刃', triggerX: 280, lockX: 360, cameraMax: 1320, theme: { sky: 2760984, ground: 4863012 }, enemies: [{ hp: 30, x: 620, y: 0 }] },
      { id: 'wind_gallery', name: '风口回廊', triggerX: 1400, lockX: 1480, cameraMax: 2440, theme: { sky: 1454136, ground: 1985076 }, enemies: [{ hp: 30, x: 1760, y: 0 }] },
      { id: 'flame_edge', name: '烈炎开锋', triggerX: 2520, lockX: 2600, cameraMax: 3560, bossIntro: true, theme: { sky: 3807766, ground: 5909020 }, enemies: [{ id: 'human_genius', hp: 40, x: 3120, y: 0, isBoss: true }] }
    ]
  });
  mock.scene.scale.width = 960;
  let bounds = null;
  mock.scene.cameras.main.setBounds = (x, y, w, h) => {
    bounds = { x, y, w, h };
    return mock.scene.cameras.main;
  };
  adapter.player.x = 280;
  adapter.checkWaveTriggers();
  assert.equal(adapter.getTestState().locked, true);
  assert.deepEqual(adapter.getTestState().waveNames, ['锻口试刃', '风口回廊', '烈炎开锋']);
  assert.deepEqual(adapter.getTestState().waveThemes, [2760984, 1454136, 3807766]);
  assert.ok(bounds.w >= 960, `locked view should cover the landscape width, got ${bounds.w}`);
  adapter.destroy();
});

test('normal, fire and wind attacks request matching authored sound cues', () => {
  const { adapter } = fixture();
  const cues = [];
  adapter.context.onAudioCue = cue => cues.push(cue);
  adapter.tryAttack(false, 100);
  adapter._comboResolver = () => ({ element: 'fire', label: '烈炎', damageMult: 1, color: '#f97316' });
  adapter.tryAttack(true, 400);
  adapter._comboResolver = () => ({ element: 'wind', label: '疾风', damageMult: 1, color: '#38bdf8' });
  adapter.tryAttack(false, 800);
  assert.deepEqual(cues, ['sfx_black_blade', 'sfx_fire_slash', 'sfx_wind_slash']);
  adapter.destroy();
});

test('destroy clears active touch ownership without emitting a result', () => {
  const { adapter, mock, results } = fixture();
  const y = adapter.player.y;
  mock.scene.input._l.pointerdown({ id: 4, x: 320, y, worldX: 320, worldY: y, isDown: true });
  assert.equal(adapter.getTestState().touchMoving, true);
  adapter.destroy();
  assert.equal(adapter.touchMoveTarget, null);
  assert.equal(adapter.status, 'destroyed');
  assert.equal(results.length, 0);
});
