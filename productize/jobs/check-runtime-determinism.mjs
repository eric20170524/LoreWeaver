#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateRuntimeDeterminismDeclaration,
  evaluateRuntimeDeterminismReadiness,
  createCrossBuildDeterminismEvidence
} from "../../minigame_master/core/lib/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/runtime_determinism.schema.json");

function assert(value, message) {
  if (!value) throw new Error(message);
}
function hash(char) {
  return char.repeat(64);
}

const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
assert(schema.$id, "runtime determinism schema must declare $id");

const scenario = {
  schemaVersion: "loreweaver.runtime-scenario.v1",
  id: "deterministic-survivor-probe",
  title: "Deterministic survivor probe",
  requiredCapabilities: ["semanticInput", "pause", "resume", "exactFrameAdvance"],
  steps: [
    { id: "move", type: "input", payload: { action: "move", x: 100, y: 200 } },
    { id: "pause", type: "pause" },
    { id: "frames", type: "advance_frames", frames: 2 },
    { id: "resume", type: "resume" },
    { id: "assert", type: "assert", assertions: [{ path: "score", operator: "gte", value: 0 }] }
  ]
};
const capabilities = {
  semanticInput: true,
  pause: true,
  resume: true,
  exactFrameAdvance: true
};

const currentGoldenLike = {
  schemaVersion: "loreweaver.runtime-determinism.v1",
  scope: "adapter_state_trace",
  runtimeAuthority: "LoreWeaverRuntimeKernel",
  random: { controlled: false, source: "uncontrolled", seed: null, scope: "none" },
  time: { controlled: true, mode: "exact_frame", hostWallClockSettleAllowed: false },
  input: { controlled: true, mode: "semantic" },
  stateProjection: { id: "survivor-core-state-v1", paths: ["hp", "score", "timer"] },
  presentation: { controlled: false, randomSource: "Phaser.Math/host", screenshotTimingControlled: false }
};
assert(validateRuntimeDeterminismDeclaration(currentGoldenLike).valid, "uncontrolled declarations must be structurally valid so readiness can explain blockers");
const currentReadiness = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: currentGoldenLike,
  capabilities
});
assert(currentReadiness.status === "blocked", "current-like unseeded runtime must not claim deterministic replay");
assert(currentReadiness.blockers.includes("random_source_uncontrolled"), JSON.stringify(currentReadiness));
assert(currentReadiness.blockers.some((item) => item.startsWith("random_source_not_seeded_prng")), JSON.stringify(currentReadiness));

const controlledAdapterState = {
  ...currentGoldenLike,
  random: { controlled: true, source: "seeded_prng", seed: "golden-seed-001", scope: "adapter" }
};
const adapterReadiness = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: controlledAdapterState,
  capabilities
});
assert(adapterReadiness.status === "ready" && adapterReadiness.crossBuildDeterministicClaimAllowed === true, JSON.stringify(adapterReadiness));
assert(adapterReadiness.warnings.includes("presentation_not_deterministic_but_excluded_from_adapter_state_scope"), "adapter state scope must not silently imply visual determinism");

const wallClockScenario = {
  ...scenario,
  id: "wall-clock-scenario",
  steps: [{ id: "wait", type: "assert", settleMs: 10, assertions: [] }]
};
const wallClockReadiness = evaluateRuntimeDeterminismReadiness({
  scenario: wallClockScenario,
  declaration: controlledAdapterState,
  capabilities
});
assert(wallClockReadiness.status === "blocked" && wallClockReadiness.blockers.includes("scenario_uses_host_wall_clock_settle"), "host settle must block cross-build determinism");

const baselineResult = {
  status: "passed",
  passed: true,
  scenarioId: scenario.id,
  scenarioHash: "fnv1a32:1234abcd",
  runtimeAuthority: "LoreWeaverRuntimeKernel",
  sessionId: "runtime-baseline",
  finalSnapshot: { state: { hp: 100, score: 2, timer: 88, visualNoise: 0.123 } }
};
const candidateResult = {
  status: "passed",
  passed: true,
  scenarioId: scenario.id,
  scenarioHash: baselineResult.scenarioHash,
  runtimeAuthority: "LoreWeaverRuntimeKernel",
  sessionId: "runtime-candidate",
  finalSnapshot: { state: { hp: 100, score: 2, timer: 88, visualNoise: 0.999 } }
};
const baselineBuild = { id: "build-a", payloadHash: hash("a") };
const candidateBuild = { id: "build-b", payloadHash: hash("b") };
const adapterEvidence = createCrossBuildDeterminismEvidence({
  readiness: adapterReadiness,
  baselineResult,
  candidateResult,
  baselineBuild,
  candidateBuild
});
assert(adapterEvidence.status === "passed" && adapterEvidence.deterministic === true, JSON.stringify(adapterEvidence));
assert(adapterEvidence.comparison.stateMatches === true, "declared adapter projection must match exactly");
assert(adapterEvidence.comparison.visualMatches === null, "adapter scope must not claim visual equality");

const mismatchedResult = {
  ...candidateResult,
  finalSnapshot: { state: { hp: 100, score: 3, timer: 88 } }
};
const mismatchEvidence = createCrossBuildDeterminismEvidence({
  readiness: adapterReadiness,
  baselineResult,
  candidateResult: mismatchedResult,
  baselineBuild,
  candidateBuild
});
assert(mismatchEvidence.status === "failed" && mismatchEvidence.blockers.includes("projected_runtime_state_mismatch"), "state drift must fail evidence");

const fullVisualDeclaration = {
  ...controlledAdapterState,
  scope: "full_visual_frame",
  random: { controlled: true, source: "seeded_prng", seed: "golden-seed-001", scope: "runtime" },
  presentation: { controlled: true, randomSource: "runtime-seeded-prng", screenshotTimingControlled: true }
};
const visualReadiness = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: fullVisualDeclaration,
  capabilities
});
assert(visualReadiness.status === "ready", JSON.stringify(visualReadiness));
const visualEvidence = createCrossBuildDeterminismEvidence({
  readiness: visualReadiness,
  baselineResult,
  candidateResult,
  baselineBuild: { ...baselineBuild, screenshotSha256: hash("c") },
  candidateBuild: { ...candidateBuild, screenshotSha256: hash("c") }
});
assert(visualEvidence.status === "passed" && visualEvidence.comparison.visualMatches === true, JSON.stringify(visualEvidence));
const visualMismatch = createCrossBuildDeterminismEvidence({
  readiness: visualReadiness,
  baselineResult,
  candidateResult,
  baselineBuild: { ...baselineBuild, screenshotSha256: hash("c") },
  candidateBuild: { ...candidateBuild, screenshotSha256: hash("d") }
});
assert(visualMismatch.status === "failed" && visualMismatch.blockers.includes("visual_frame_hash_mismatch"), "visual scope must fail different screenshot hashes");

const insufficientVisual = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: { ...fullVisualDeclaration, presentation: { controlled: false, randomSource: "Phaser.Math", screenshotTimingControlled: false } },
  capabilities
});
assert(insufficientVisual.status === "blocked", "full visual scope requires controlled presentation");
assert(insufficientVisual.blockers.includes("presentation_randomness_uncontrolled"), JSON.stringify(insufficientVisual));
assert(insufficientVisual.blockers.includes("screenshot_timing_uncontrolled"), JSON.stringify(insufficientVisual));

const evidenceFromBlockedReadiness = createCrossBuildDeterminismEvidence({
  readiness: currentReadiness,
  baselineResult,
  candidateResult,
  baselineBuild,
  candidateBuild
});
assert(evidenceFromBlockedReadiness.status === "failed" && evidenceFromBlockedReadiness.blockers.includes("determinism_readiness_not_satisfied"), "evidence cannot bypass readiness blockers");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-determinism-check.v1",
  status: "passed",
  checks: [
    "unseeded_current_runtime_is_explicitly_blocked",
    "seeded_adapter_state_scope_can_be_ready_without_claiming_visual_determinism",
    "host_wall_clock_settle_blocks_cross_build_claim",
    "cross_build_evidence_requires_two_passed_runs_and_same_scenario_identity",
    "projected_state_drift_fails_evidence",
    "full_visual_scope_requires_runtime_wide_random_and_controlled_screenshot_timing",
    "visual_hash_drift_fails_full_visual_evidence",
    "blocked_readiness_cannot_be_upgraded_into_deterministic_evidence"
  ],
  currentRuntimeBlockers: currentReadiness.blockers
}, null, 2));
