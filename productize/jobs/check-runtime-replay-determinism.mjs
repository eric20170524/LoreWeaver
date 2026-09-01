#!/usr/bin/env node
import {
  buildRuntimeReplayProjection,
  compareRuntimeReplayProjections
} from '../../minigame_master/core/lib/contracts/RuntimeReplayDeterminism.js';

function assert(value, message) {
  if (!value) throw new Error(message);
}

function result(state, overrides = {}) {
  return {
    schemaVersion: 'loreweaver.runtime-scenario-result.v1',
    status: 'passed',
    passed: true,
    scenarioId: 'survivor_exact_frame_probe',
    scenarioHash: 'fnv1a32:12345678',
    runtimeAuthority: 'LoreWeaverRuntimeKernel',
    finalSnapshot: {
      state
    },
    ...overrides
  };
}

const paths = [
  'status',
  'hp',
  'score',
  { path: 'timer', tolerance: 0.001 },
  'growth.activeSkills[0].level'
];

const baseState = {
  status: 'paused',
  hp: 100,
  score: 0,
  timer: 89.966666,
  growth: { activeSkills: [{ id: 'primordial_fist', level: 1 }] }
};

const a = buildRuntimeReplayProjection(result(baseState), paths);
const b = buildRuntimeReplayProjection(result({ ...baseState, timer: 89.9669 }), paths);
assert(a.fingerprint !== b.fingerprint, 'raw projection fingerprints should still record exact projected values');
const tolerant = compareRuntimeReplayProjections(a, b);
assert(tolerant.deterministic === true, 'numeric tolerance should allow bounded clock float drift');

const changed = buildRuntimeReplayProjection(result({ ...baseState, hp: 99 }), paths);
const mismatch = compareRuntimeReplayProjections(a, changed);
assert(mismatch.deterministic === false, 'meaningful state drift must fail determinism');
assert(mismatch.mismatches.includes('value_mismatch:hp'), 'hp mismatch must be explicit');

const otherScenario = buildRuntimeReplayProjection(
  result(baseState, { scenarioHash: 'fnv1a32:87654321' }),
  paths
);
const wrongScenario = compareRuntimeReplayProjections(a, otherScenario);
assert(wrongScenario.deterministic === false, 'different scenario identity must fail');
assert(wrongScenario.mismatches.includes('scenario_hash_mismatch'), 'scenario hash mismatch must be explicit');

let missingPathBlocked = false;
try {
  buildRuntimeReplayProjection(result({ status: 'paused' }), paths);
} catch (error) {
  missingPathBlocked = String(error?.message || error).includes('deterministic_path_missing:hp');
}
assert(missingPathBlocked, 'missing declared deterministic path must fail closed');

console.log(JSON.stringify({
  schemaVersion: 'loreweaver.runtime-replay-determinism-check.v1',
  status: 'passed',
  checks: [
    'projection_is_explicit_path_only',
    'numeric_tolerance_is_bounded',
    'meaningful_state_drift_fails',
    'scenario_identity_mismatch_fails',
    'missing_deterministic_path_fails_closed'
  ]
}, null, 2));
