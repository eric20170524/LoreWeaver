#!/usr/bin/env node
import DodgeCounterBossAdapter from '../../minigame_master/core/lib/gameplay/dodge_counter_boss/DeterministicDodgeCounterBossAdapter.js';

function assert(value, message) {
  if (!value) throw new Error(message);
}

function fakeTelegraph() {
  return {
    setPosition() { return this; },
    setRadius() { return this; },
    setStrokeStyle() { return this; },
    setFillStyle() { return this; },
    setAlpha() { return this; }
  };
}

function attackZoneFor(seed) {
  globalThis.__LOREWEAVER_DETERMINISM__ = {
    mode: 'verification',
    seed,
    scope: 'adapter_state_trace'
  };
  const adapter = new DodgeCounterBossAdapter({});
  adapter.scene = { scale: { width: 720, height: 1280 } };
  adapter.telegraph = fakeTelegraph();
  adapter.beginAttack();
  return {
    zone: { ...adapter.state.attackZone },
    random: adapter.getTestState().determinism.random
  };
}

const first = attackZoneFor('action-boss-seed-a');
const second = attackZoneFor('action-boss-seed-a');
const third = attackZoneFor('action-boss-seed-b');
assert(JSON.stringify(first.zone) === JSON.stringify(second.zone), 'same verification seed must reproduce boss attack zone');
assert(JSON.stringify(first.zone) !== JSON.stringify(third.zone), 'different verification seed should produce a different boss attack zone');
assert(first.random.controlled === true && first.random.source === 'seeded_prng', 'verification random source must be explicit seeded PRNG');
assert(first.random.calls === 3, 'boss attack zone must consume exactly three random values');

delete globalThis.__LOREWEAVER_DETERMINISM__;
const normal = new DodgeCounterBossAdapter({});
assert(normal.verificationDeterminism.enabled === false, 'normal runtime must not silently enable deterministic verification mode');
assert(normal.verificationDeterminism.random.source === 'Math.random', 'normal runtime keeps natural random source');

const semantic = new DodgeCounterBossAdapter({});
semantic.status = 'running';
semantic.scene = { scale: { width: 720, height: 1280 } };
semantic.player = { x: 360, y: 900 };
semantic.lifecycle = { transitionLocked: false };
assert(semantic.semanticActions().includes('move'), 'action boss must advertise semantic move');
assert(semantic.semanticActions().includes('primary'), 'action boss must advertise semantic primary/counter');
assert(semantic.semanticActions().includes('retreat'), 'action boss retains semantic retreat');
const moved = semantic.handleSemanticInput({ action: 'move', x: 100, y: 800 });
assert(moved.x === 100 && moved.y === 800, 'semantic move must mutate the real player runtime position');
const earlyPrimary = semantic.handleSemanticInput({ action: 'primary' });
assert(earlyPrimary.accepted === false && earlyPrimary.before.phase === 'idle', 'primary outside counter window must be rejected by the real state machine');

console.log(JSON.stringify({
  schemaVersion: 'loreweaver.action-boss-alignment-runtime-check.v1',
  status: 'passed',
  checks: [
    'verification_seed_replays_attack_pattern',
    'normal_runtime_keeps_natural_randomness',
    'semantic_move_mutates_real_player_position',
    'semantic_primary_obeys_counter_window',
    'semantic_retreat_remains_available'
  ]
}, null, 2));
