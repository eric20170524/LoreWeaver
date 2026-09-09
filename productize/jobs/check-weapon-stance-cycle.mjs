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

console.log('PASS weapon stance + manifest growth migration + survivor knob normalization smoke check');
