#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  SURVIVOR_HORDE_SUPPORTED_MODIFIERS,
  createSurvivorHordeModifier
} from '../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/registry.js';
import {
  normalizePlayabilityKnobs
} from '../../minigame_master/core/lib/contracts/PlayabilityContract.js';

assert.ok(
  SURVIVOR_HORDE_SUPPORTED_MODIFIERS.includes('weapon_stance_cycle'),
  'weapon_stance_cycle must be registered'
);
assert.ok(
  SURVIVOR_HORDE_SUPPORTED_MODIFIERS.includes('run_growth_milestones'),
  'run_growth_milestones must be registered'
);
assert.ok(
  SURVIVOR_HORDE_SUPPORTED_MODIFIERS.includes('overdrive_transformation'),
  'overdrive_transformation must be registered'
);

const modifier = createSurvivorHordeModifier({
  id: 'weapon_stance_cycle',
  knobs: {
    meleeDurationSec: 4,
    rangedDurationSec: 5,
    meleeDamage: 5,
    rangedBurstCount: 2
  }
});

assert.equal(modifier.id, 'weapon_stance_cycle');
assert.equal(modifier.resolveStance(0), 'melee');
assert.equal(modifier.resolveStance(3.99), 'melee');
assert.equal(modifier.resolveStance(4), 'ranged');
assert.equal(modifier.resolveStance(8.99), 'ranged');
assert.equal(modifier.resolveStance(9), 'melee');
assert.equal(modifier.config.meleeDamage, 5);
assert.equal(modifier.config.rangedBurstCount, 2);

const normalized = normalizePlayabilityKnobs('survivor_horde', {
  durationSec: 75,
  enemySpawnRateSec: 1.25
});
assert.equal(normalized.durationSec, 75);
assert.equal(normalized.enemies?.spawnIntervalMs, 1250);

let hudText = '';
const legacyGrowth = { enabled: true };
const adapter = {
  status: 'running',
  state: { elapsedSeconds: 0, score: 0 },
  config: { weapon: { bulletDamage: 2 } },
  modifiers: [modifier],
  isRunning: () => true,
  fireAtNearestEnemy: () => {}
};
const context = {
  adapter,
  state: adapter.state,
  scene: {
    runGrowthState: legacyGrowth,
    growthHUD: {
      setText: (value) => { hudText = String(value); },
      setVisible: () => {}
    },
    scale: { width: 1280, height: 720 }
  },
  groups: {},
  player: null,
  events: { emit: () => {} }
};

modifier.install(context);
assert.equal(legacyGrowth.enabled, false, 'legacy IP-specific first-node growth must be disabled');
assert.match(hudText, /架势熟练/);
assert.equal(modifier.toggleStance(context).accepted, false, 'timed mode ignores player toggle');

const manual = createSurvivorHordeModifier({
  id: 'weapon_stance_cycle',
  knobs: { controlMode: 'manual', initialStance: 'melee', runGrowth: false }
});
assert.equal(manual.resolveStance(0), 'melee');
assert.equal(manual.resolveStance(99), 'melee', 'manual mode must not follow the timer');
manual.install({
  ...context,
  adapter: { ...adapter, fireAtNearestEnemy: () => {}, semanticActions: () => [], handleSemanticInput: () => ({}) },
  scene: { ...context.scene, runGrowthState: { enabled: false }, add: {}, input: {} }
});
const toggled = manual.toggleStance(context);
assert.equal(toggled.accepted, true);
assert.equal(toggled.stance, 'ranged');
assert.equal(manual.resolveStance(0), 'ranged');

const growthOnly = createSurvivorHordeModifier({
  id: 'weapon_stance_cycle',
  knobs: { meleeDamage: 4, runGrowth: true }
});
growthOnly.install({
  adapter: {
    status: 'running',
    state: { elapsedSeconds: 0, score: 0 },
    config: { weapon: { bulletDamage: 2 } },
    modifiers: [growthOnly],
    isRunning: () => true,
    fireAtNearestEnemy: () => {},
    semanticActions: () => [],
    handleSemanticInput: () => ({})
  },
  state: { elapsedSeconds: 0, score: 0 },
  scene: { scale: { width: 1280, height: 720 }, add: {}, input: {} },
  groups: {},
  player: null,
  events: { emit: () => {} }
});
assert.ok(growthOnly.getTestState().runGrowth, 'run growth must install without a legacy GameRunner loop');

adapter.state.score = 4;
modifier.update(context, 0, 16);
assert.equal(modifier.config.meleeDamage, 6, 'melee milestone should raise melee damage by 20%');
assert.ok(modifier.config.meleeRadius > 92, 'melee milestone should raise sweep radius');

adapter.state.score = 8;
modifier.update(context, 16, 16);
assert.equal(modifier.config.rangedBurstCount, 3, 'ranged milestone should add one projectile to the burst');
const testState = modifier.getTestState();
assert.deepEqual(testState.runGrowth.reached, ['melee_mastery', 'ranged_mastery']);
assert.equal(testState.runGrowth.effects.length, 3);

modifier.uninstall(context);

const overdrive = createSurvivorHordeModifier({
  id: 'overdrive_transformation',
  knobs: { requiresPassive: 'white_ape_overdrive_passive', durationSec: 4 }
});
const odAdapter = {
  status: 'running',
  state: { elapsedSeconds: 1, hp: 40 },
  config: { player: { speed: 100 }, weapon: { bulletDamage: 2 } },
  payload: { inventory: { unlockedPassives: [] } },
  modifiers: [],
  isRunning: () => true,
  damageEnemy: (_enemy, damage) => damage,
  damagePlayer: (amount) => amount,
  semanticActions: () => [],
  handleSemanticInput: () => ({})
};
const odContext = { adapter: odAdapter, scene: { add: {}, input: {} }, player: { x: 0, y: 0 }, events: { emit: () => {} } };
overdrive.install(odContext);
assert.equal(overdrive.tryActivate(odContext).reason, 'unarmed');
odAdapter.payload.inventory.unlockedPassives = ['white_ape_overdrive_passive'];
assert.equal(overdrive.tryActivate(odContext).accepted, true);
assert.equal(overdrive.getTestState().active, true);
assert.equal(odAdapter.config.player.speed, 125);
assert.equal(odAdapter.damageEnemy({}, 10), 15.5);
overdrive.uninstall(odContext);

const abilityGate = createSurvivorHordeModifier({
  id: 'overdrive_transformation',
  knobs: { requiresAbility: 'white_ape_overdrive', durationSec: 4, damageMultiplier: 1.55 }
});
const abilityAdapter = {
  ...odAdapter,
  state: { elapsedSeconds: 1, hp: 40 },
  config: { player: { speed: 100 }, weapon: { bulletDamage: 2 } },
  payload: { inventory: { unlockedPassives: [], unlockedAbilities: [] } },
  damageEnemy: (_enemy, damage) => damage,
  damagePlayer: (amount) => amount
};
const abilityContext = { adapter: abilityAdapter, scene: { add: {}, input: {} }, player: { x: 0, y: 0 }, events: { emit: () => {} } };
abilityGate.install(abilityContext);
assert.equal(abilityGate.tryActivate(abilityContext).reason, 'unarmed');
abilityAdapter.payload.inventory.unlockedAbilities = ['white_ape_overdrive'];
assert.equal(abilityGate.tryActivate(abilityContext).accepted, true);
abilityGate.uninstall(abilityContext);

console.log('PASS weapon stance + manifest growth migration + survivor knob normalization smoke check');
