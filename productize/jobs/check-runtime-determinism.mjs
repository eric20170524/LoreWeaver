#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateRuntimeDeterminismDeclaration,
  evaluateRuntimeDeterminismReadiness,
  createCrossBuildDeterminismEvidence,
  evaluateCrossBuildDeterminismReadiness
} from "../../minigame_master/core/lib/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DECLARATION_SCHEMA = path.join(ROOT, "minigame_master/contracts/runtime_determinism.schema.json");
const READINESS_SCHEMA = path.join(ROOT, "minigame_master/contracts/cross_build_determinism_readiness.schema.json");

function assert(value, message) {
  if (!value) throw new Error(message);
}
function hash(char) {
  return char.repeat(64);
}
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

const declarationSchema = JSON.parse(fs.readFileSync(DECLARATION_SCHEMA, "utf8"));
const readinessSchema = JSON.parse(fs.readFileSync(READINESS_SCHEMA, "utf8"));
assert(declarationSchema.$id, "runtime determinism schema must declare $id");
assert(readinessSchema.$id, "cross-build readiness schema must declare $id");

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
  random: {
    controlled: false,
    source: "uncontrolled",
    seed: null,
    scope: "none",
    algorithm: null,
    stateHandoff: "none"
  },
  time: { controlled: true, mode: "exact_frame", hostWallClockSettleAllowed: false },
  input: { controlled: true, mode: "semantic" },
  stateProjection: { id: "survivor-core-state-v1", paths: ["hp", "score", "timer"] },
  presentation: { controlled: false, randomSource: "Phaser.Math/host", screenshotTimingControlled: false }
};
assert(
  validateRuntimeDeterminismDeclaration(currentGoldenLike).valid,
  "uncontrolled declarations must remain structurally valid so readiness can explain blockers"
);
const currentReadiness = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: currentGoldenLike,
  capabilities
});
assert(currentReadiness.status === "blocked", "current-like unseeded runtime must not run deterministic evidence");
assert(currentReadiness.crossBuildDeterministicClaimAllowed === false, "declaration-only readiness must never grant a cross-build claim");
assert(currentReadiness.blockers.includes("random_source_uncontrolled"), JSON.stringify(currentReadiness));
assert(
  currentReadiness.blockers.some((item) => item.startsWith("random_source_not_seeded_prng")),
  JSON.stringify(currentReadiness)
);

const controlledAdapterState = {
  ...currentGoldenLike,
  random: {
    controlled: true,
    source: "seeded_prng",
    seed: "golden-seed-001",
    scope: "adapter",
    algorithm: "fnv1a32+mulberry32-v1",
    stateHandoff: "seed_replay"
  },
  engine: { name: "Phaser", version: "4.1.0", renderer: "webgl-or-canvas" },
  physics: {
    engine: "phaser-arcade",
    deterministic: true,
    fixedStep: true,
    stepMs: 1000 / 60,
    settingsHash: hash("e")
  },
  host: { mode: "static_candidate", version: "v1" }
};
const adapterControlReadiness = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: controlledAdapterState,
  capabilities
});
assert(adapterControlReadiness.status === "ready" && adapterControlReadiness.evidenceRunAllowed === true, JSON.stringify(adapterControlReadiness));
assert(
  adapterControlReadiness.crossBuildDeterministicClaimAllowed === false,
  "controlled inputs only authorize evidence collection, not a deterministic claim"
);
assert(
  adapterControlReadiness.warnings.includes("presentation_not_deterministic_but_excluded_from_adapter_state_scope"),
  "adapter-state scope must not silently imply visual determinism"
);

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
assert(
  wallClockReadiness.status === "blocked" && wallClockReadiness.blockers.includes("scenario_uses_host_wall_clock_settle"),
  "host settle must block cross-build evidence collection"
);

const baselineResult = {
  status: "passed",
  passed: true,
  scenarioId: scenario.id,
  scenarioHash: "sha256:1234abcd",
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
const adapterComparison = createCrossBuildDeterminismEvidence({
  readiness: adapterControlReadiness,
  baselineResult,
  candidateResult,
  baselineBuild,
  candidateBuild
});
assert(adapterComparison.status === "passed" && adapterComparison.deterministic === true, JSON.stringify(adapterComparison));
assert(adapterComparison.comparison.stateMatches === true, "declared adapter projection must match exactly");
assert(adapterComparison.comparison.visualMatches === null, "adapter scope must not claim visual equality");

const sameSession = createCrossBuildDeterminismEvidence({
  readiness: adapterControlReadiness,
  baselineResult,
  candidateResult: { ...candidateResult, sessionId: baselineResult.sessionId },
  baselineBuild,
  candidateBuild
});
assert(
  sameSession.status === "failed" && sameSession.blockers.includes("same_session_comparison_not_cross_build_evidence"),
  "same-session replay cannot be promoted to cross-build evidence"
);

const mismatchedResult = {
  ...candidateResult,
  finalSnapshot: { state: { hp: 100, score: 3, timer: 88 } }
};
const mismatchComparison = createCrossBuildDeterminismEvidence({
  readiness: adapterControlReadiness,
  baselineResult,
  candidateResult: mismatchedResult,
  baselineBuild,
  candidateBuild
});
assert(
  mismatchComparison.status === "failed" && mismatchComparison.blockers.includes("projected_runtime_state_mismatch"),
  "state drift must fail evidence"
);

const expectedIdentity = {
  specHash: "spec-001",
  runtimeVersion: "runtime-001",
  assetManifestHash: hash("f")
};
const createdAt = "2026-09-01T00:00:00.000Z";
const cells = [
  ["chromium", "build-a", "session-chromium-a", hash("a"), hash("1"), hash("9")],
  ["chromium", "build-b", "session-chromium-b", hash("b"), hash("2"), hash("9")],
  ["firefox", "build-a", "session-firefox-a", hash("a"), hash("1"), hash("9")],
  ["firefox", "build-b", "session-firefox-b", hash("b"), hash("2"), hash("9")]
].map(([browser, buildId, sessionId, payloadHash, artifactSha256, stateFingerprint]) => ({
  browser,
  browserVersion: browser === "chromium" ? "128.0.0" : "129.0",
  engineVersion: browser === "chromium" ? "Blink 128" : "Gecko 129",
  buildId,
  sessionId,
  status: "passed",
  payloadHash,
  artifactSha256,
  stateFingerprint,
  ...expectedIdentity
}));
const validEvidence = {
  schemaVersion: "loreweaver.cross-build-determinism-evidence.v2",
  status: "passed",
  deterministic: true,
  fixture: false,
  synthetic: false,
  stale: false,
  freshness: "fresh",
  headless: true,
  releaseEligible: false,
  createdAt,
  runtimeAuthority: "LoreWeaverRuntimeKernel",
  scope: "adapter_state_trace",
  scenarioId: scenario.id,
  scenarioHash: baselineResult.scenarioHash,
  projectionId: controlledAdapterState.stateProjection.id,
  identity: expectedIdentity,
  waivers: [],
  matrix: {
    requiredBrowsers: ["chromium", "firefox"],
    requiredBuildCount: 2,
    cells
  },
  comparisons: {
    perBrowser: [
      { browser: "chromium", status: "passed", deterministic: true },
      { browser: "firefox", status: "passed", deterministic: true }
    ],
    crossBrowser: [
      { buildId: "build-a", status: "passed", deterministic: true },
      { buildId: "build-b", status: "passed", deterministic: true }
    ]
  }
};

const missingEvidence = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: null,
  expectedIdentity,
  now: createdAt
});
assert(missingEvidence.replayReady === false, "control readiness alone must remain fail-closed");
assert(missingEvidence.blockers.includes("cross_build_determinism_evidence_required"));

const replayReady = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: validEvidence,
  expectedIdentity,
  now: createdAt
});
assert(replayReady.status === "ready" && replayReady.replayReady === true, JSON.stringify(replayReady));
assert(replayReady.claim === "adapter_state_cross_build", JSON.stringify(replayReady));
assert(replayReady.releaseEligible === false, "engineering determinism evidence must not become release certification");
assert(replayReady.warnings.includes("visual_frame_determinism_not_claimed"));
assert(replayReady.warnings.includes("headless_engineering_evidence_not_physical_device_evidence"));

const staleEvidence = deepClone(validEvidence);
staleEvidence.freshness = "stale";
const staleReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: staleEvidence,
  expectedIdentity,
  now: createdAt
});
assert(staleReadiness.replayReady === false && staleReadiness.blockers.includes("stale_determinism_evidence_forbidden"));

const expiredReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: validEvidence,
  expectedIdentity,
  maxAgeMs: 1000,
  now: "2026-09-01T00:00:02.000Z"
});
assert(expiredReadiness.blockers.includes("determinism_evidence_expired"), JSON.stringify(expiredReadiness));

const mismatchedIdentity = deepClone(validEvidence);
mismatchedIdentity.identity.runtimeVersion = "runtime-other";
const identityReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: mismatchedIdentity,
  expectedIdentity,
  now: createdAt
});
assert(identityReadiness.blockers.includes("evidence_identity_mismatch:runtimeVersion"));

const incompleteBrowser = deepClone(validEvidence);
incompleteBrowser.matrix.cells = incompleteBrowser.matrix.cells.filter((cell) => cell.browser === "chromium");
incompleteBrowser.comparisons.perBrowser = incompleteBrowser.comparisons.perBrowser.filter((item) => item.browser === "chromium");
const browserReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: incompleteBrowser,
  expectedIdentity,
  now: createdAt
});
assert(browserReadiness.blockers.includes("determinism_browser_missing:firefox"));

const incompleteBuild = deepClone(validEvidence);
incompleteBuild.matrix.cells = incompleteBuild.matrix.cells.filter((cell) => cell.buildId === "build-a");
incompleteBuild.comparisons.crossBrowser = incompleteBuild.comparisons.crossBrowser.filter((item) => item.buildId === "build-a");
const buildReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: incompleteBuild,
  expectedIdentity,
  now: createdAt
});
assert(buildReadiness.blockers.includes("determinism_build_matrix_incomplete"));

const waivedReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: adapterControlReadiness,
  evidence: validEvidence,
  expectedIdentity,
  now: createdAt,
  waivers: ["skip-firefox"]
});
assert(waivedReadiness.blockers.includes("determinism_evidence_waivers_forbidden"));

const nonFixedControl = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: {
    ...controlledAdapterState,
    physics: { ...controlledAdapterState.physics, fixedStep: false, deterministic: false }
  },
  capabilities
});
const nonFixedReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: nonFixedControl,
  evidence: validEvidence,
  expectedIdentity,
  now: createdAt
});
assert(nonFixedReadiness.blockers.includes("physics_determinism_not_declared"));
assert(nonFixedReadiness.blockers.includes("physics_fixed_step_required"));

const noHandoffControl = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: {
    ...controlledAdapterState,
    random: { ...controlledAdapterState.random, stateHandoff: "none" }
  },
  capabilities
});
const noHandoffReadiness = evaluateCrossBuildDeterminismReadiness({
  controlReadiness: noHandoffControl,
  evidence: validEvidence,
  expectedIdentity,
  now: createdAt
});
assert(noHandoffReadiness.blockers.includes("random_state_handoff_required"));

const fullVisualDeclaration = {
  ...controlledAdapterState,
  scope: "full_visual_frame",
  random: { ...controlledAdapterState.random, scope: "runtime" },
  presentation: { controlled: true, randomSource: "runtime-seeded-prng", screenshotTimingControlled: true }
};
const visualControlReadiness = evaluateRuntimeDeterminismReadiness({
  scenario,
  declaration: fullVisualDeclaration,
  capabilities
});
assert(visualControlReadiness.status === "ready", JSON.stringify(visualControlReadiness));
const visualComparison = createCrossBuildDeterminismEvidence({
  readiness: visualControlReadiness,
  baselineResult,
  candidateResult,
  baselineBuild: { ...baselineBuild, screenshotSha256: hash("c") },
  candidateBuild: { ...candidateBuild, screenshotSha256: hash("c") }
});
assert(visualComparison.status === "passed" && visualComparison.comparison.visualMatches === true, JSON.stringify(visualComparison));
const visualMismatch = createCrossBuildDeterminismEvidence({
  readiness: visualControlReadiness,
  baselineResult,
  candidateResult,
  baselineBuild: { ...baselineBuild, screenshotSha256: hash("c") },
  candidateBuild: { ...candidateBuild, screenshotSha256: hash("d") }
});
assert(
  visualMismatch.status === "failed" && visualMismatch.blockers.includes("visual_frame_hash_mismatch"),
  "visual scope must fail different screenshot hashes"
);

const evidenceFromBlockedControl = createCrossBuildDeterminismEvidence({
  readiness: currentReadiness,
  baselineResult,
  candidateResult,
  baselineBuild,
  candidateBuild
});
assert(
  evidenceFromBlockedControl.status === "failed"
    && evidenceFromBlockedControl.blockers.includes("determinism_control_readiness_not_satisfied"),
  "evidence cannot bypass control blockers"
);

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-determinism-check.v2",
  status: "passed",
  checks: [
    "declaration_only_readiness_never_grants_cross_build_claim",
    "unseeded_runtime_is_explicitly_blocked",
    "same_session_replay_is_not_cross_build_evidence",
    "state_projection_drift_fails_pairwise_evidence",
    "fresh_two_build_two_browser_matrix_can_be_replay_ready",
    "engineering_replay_ready_never_grants_release_certification",
    "stale_or_expired_evidence_is_blocked",
    "runtime_asset_identity_mismatch_is_blocked",
    "incomplete_browser_or_build_matrix_is_blocked",
    "waivers_are_forbidden",
    "non_fixed_physics_is_blocked",
    "rng_state_handoff_is_required",
    "full_visual_scope_requires_equal_visual_hashes"
  ],
  currentRuntimeBlockers: currentReadiness.blockers,
  replayReadyWarnings: replayReady.warnings
}, null, 2));
