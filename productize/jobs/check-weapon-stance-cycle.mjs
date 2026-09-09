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

const modifier = createSurvivorHordeModifier({
  id: 'weapon_stance_cycle',
  knobs: {
    meleeDurationSec: 4,
    rangedDurationSec: 5,
    meleeDamage: 5,
    rangedBurstCount: 2
  }
});

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

console.log('PASS weapon_stance_cycle registry + survivor knob normalization smoke check');
