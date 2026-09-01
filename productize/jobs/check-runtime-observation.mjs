#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RuntimeObservationPort,
  TestHooks
} from "../../minigame_master/core/lib/contracts/index.js";
import GameplayAdapter from "../../minigame_master/core/lib/gameplay/GameplayAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/runtime_observation.schema.json");

function assert(value, message) {
  if (!value) throw new Error(message);
}

function approx(actual, expected, tolerance = 0.02) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
assert(schema.$id, "runtime observation schema must declare $id");

globalThis.window = {};
const hooks = new TestHooks("__TEST_HOOKS__", {
  observationGlobalKey: "__TEST_OBSERVATION__",
  maxTraceEntries: 16
});
assert(window.__TEST_HOOKS__.status === "idle", "legacy hook state remains published");
const api = window.__TEST_OBSERVATION__;
assert(api?.schemaVersion === "loreweaver.runtime-observation.v1", "observation API is published");
assert(api.runtimeAuthority === "LoreWeaverRuntimeKernel", "unique runtime authority is explicit");

const initialCaps = api.capabilities();
assert(initialCaps.snapshot === true && initialCaps.trace === true, "read-only observation is available");
assert(initialCaps.pause === false, "pause is unavailable before a real handler registers");
assert(initialCaps.semanticInput === false, "semantic input is unavailable before a real handler registers");
assert(initialCaps.exactFrameAdvance === false, "exact-frame advance must not be claimed by default");
assert(initialCaps.screenshot === "host_owned", "screenshot remains owned by the browser host");

hooks.update({
  sceneKey: "LevelActiveScene",
  nodeId: 3,
  adapterId: "survivor_horde",
  status: "running",
  hp: 88,
  progress: 0.5,
  score: 42
});
const snapshot = api.snapshot();
assert(snapshot.schemaVersion === "loreweaver.runtime-observation-snapshot.v1", "snapshot contract version missing");
assert(snapshot.state.nodeId === 3 && snapshot.state.status === "running", "snapshot captures authoritative hook state");
assert(snapshot.sourceHooksKey === "__TEST_HOOKS__", "snapshot identifies source hooks");
assert(snapshot.sequence >= 2, "initialization and update must advance observation sequence");

snapshot.state.hp = 1;
assert(api.snapshot().state.hp === 88, "returned snapshots must be immutable deep clones");

const unsupportedPause = api.pause({ reason: "test" });
assert(unsupportedPause.status === "unsupported", "unregistered control fails closed");
assert(unsupportedPause.reason === "control_not_registered:pause", "unsupported reason is explicit");
assert(api.capabilities().pause === false, "unsupported invocation cannot silently enable capability");

let pauseCalls = 0;
hooks.registerControl("pause", (payload) => {
  pauseCalls += 1;
  return { paused: true, payload };
});
assert(api.capabilities().pause === true, "registered real handler enables capability");
const pauseResult = api.pause({ reason: "player_inspection" });
assert(pauseResult.status === "passed", "registered control can execute");
assert(pauseCalls === 1 && pauseResult.result.paused === true, "control result is returned");
assert(api.capabilities().exactFrameAdvance === false, "pause registration cannot imply exact-frame support");
hooks.unregisterControl("pause");

const unsupportedInput = api.input({ action: "move", x: 1, y: 0 });
assert(unsupportedInput.status === "unsupported", "semantic input remains unsupported without handler");
hooks.recordError(new Error("sample-runtime-error"));
assert(api.snapshot().state.errors.includes("sample-runtime-error"), "runtime errors are part of observation state");

for (let index = 0; index < 24; index += 1) hooks.update({ score: index });
const trace = api.trace();
assert(trace.schemaVersion === "loreweaver.runtime-observation-trace.v1", "trace contract version missing");
assert(trace.sessionId === api.snapshot().sessionId, "snapshot and trace must share one session identity");
assert(trace.entryCount === 16, "trace must stay within configured bounded history");
assert(trace.entries.every((entry, index, entries) => index === 0 || entry.sequence > entries[index - 1].sequence), "trace sequence must be monotonic");
assert(trace.entries.at(-1).state.score === 23, "trace ends at latest authoritative state");

trace.entries.at(-1).state.score = -1;
assert(api.trace().entries.at(-1).state.score === 23, "returned trace must be immutable");
const ended = hooks.endObservation("scene_shutdown");
assert(ended.ended === true && ended.endReason === "scene_shutdown", "observation session can end explicitly");

const standalone = new RuntimeObservationPort({ globalKey: "__SECOND_OBSERVATION__" });
const blocked = standalone.invoke("unknownControl");
assert(blocked.status === "blocked", "unknown controls are blocked rather than guessed");
assert(standalone.capabilities().exactFrameAdvance === false, "standalone port also fails closed");

// Shared adapter controls: prove pause/resume/semantic input are backed by an
// immediate Phaser Systems surface rather than the queued ScenePlugin API.
const adapterHooks = new TestHooks("__ADAPTER_TEST_HOOKS__", {
  observationGlobalKey: "__ADAPTER_OBSERVATION__",
  maxTraceEntries: 32
});
const adapterApi = window.__ADAPTER_OBSERVATION__;
let scenePaused = false;
let scenePauseCalls = 0;
let sceneResumeCalls = 0;
let adapterEndResult = null;
const fakeSystems = {
  settings: { key: "SyntheticAdapterScene" },
  pause(payload) {
    assert(payload?.reason === "inspect" || payload?.reason === undefined, "pause payload remains explicit");
    scenePaused = true;
    scenePauseCalls += 1;
  },
  resume(payload) {
    assert(payload?.reason === "continue" || payload?.reason === undefined, "resume payload remains explicit");
    scenePaused = false;
    sceneResumeCalls += 1;
  }
};
const fakeScene = { sys: fakeSystems };
const adapter = new GameplayAdapter({
  testHooks: adapterHooks,
  onEnd: (result) => { adapterEndResult = result; }
});
adapter.targetPoint = { x: 0, y: 0 };
adapter.init({
  nodeId: "node_semantic_control",
  nodeConfig: {
    duration: 30,
    goalValue: 1,
    gameplay: { cardId: "survivor_horde", knobs: { allowQuit: true } }
  }
});
adapter.readPlayabilityKnobs(adapter.payload, "survivor_horde");
assert(adapterApi.capabilities().pause === false, "adapter controls are unavailable before create");
adapter.create(fakeScene);
const adapterCaps = adapterApi.capabilities();
assert(adapterCaps.pause === true && adapterCaps.resume === true, "adapter create registers real Systems pause/resume controls");
assert(adapterCaps.semanticInput === true, "adapter create registers semantic input when a real action surface exists");
assert(adapterCaps.exactFrameAdvance === false, "adapter without Phaser TimeStep cannot claim exact-frame advance");
assert(adapterApi.snapshot().state === null || adapterApi.snapshot().sessionId, "adapter observation session remains valid");

const semanticMove = adapterApi.input({ action: "move", x: 125, y: 250 });
assert(semanticMove.status === "passed", "semantic move executes through the adapter contract");
assert(adapter.targetPoint.x === 125 && adapter.targetPoint.y === 250, "semantic move mutates the real adapter target point");
assert(adapterApi.snapshot().state.semanticAction.action === "move", "semantic action is captured in the same observation session");

const invalidMove = adapterApi.input({ action: "move", x: "bad", y: 1 });
assert(invalidMove.status === "failed" && invalidMove.error.includes("finite_x_y"), "invalid semantic move fails closed");
const unsupportedPrimary = adapterApi.input({ action: "primary" });
assert(unsupportedPrimary.status === "failed" && unsupportedPrimary.error.includes("semantic_action_unsupported"), "undeclared semantic actions fail closed");

const adapterPause = adapterApi.pause({ reason: "inspect" });
assert(adapterPause.status === "passed" && scenePaused === true, "pause executes the immediate owning Systems surface");
assert(adapter.status === "paused" && scenePauseCalls === 1, "adapter status follows paused scene");
assert(adapterApi.snapshot().state.status === "paused", "pause state is observable in the same session");
const adapterResume = adapterApi.resume({ reason: "continue" });
assert(adapterResume.status === "passed" && scenePaused === false, "resume executes the immediate owning Systems surface");
assert(adapter.status === "running" && sceneResumeCalls === 1, "adapter status returns to running");
assert(adapterApi.snapshot().state.status === "running", "resume state is observable in the same session");

const frameAdvance = adapterApi.advanceFrames({ frames: 1 });
assert(frameAdvance.status === "unsupported", "advanceFrames stays unsupported without a Phaser TimeStep surface");
assert(adapterApi.capabilities().exactFrameAdvance === false, "unsupported frame advance never changes capability truth");

const retreat = adapterApi.input({ action: "retreat" });
assert(retreat.status === "passed", "semantic retreat uses the existing adapter retreat contract");
assert(adapterEndResult?.reason === "retreated", "semantic retreat reaches the host result path");
assert(adapter.status === "ended", "semantic retreat ends the adapter");

adapter.destroy();
const afterDestroyCaps = adapterApi.capabilities();
assert(afterDestroyCaps.pause === false && afterDestroyCaps.resume === false && afterDestroyCaps.semanticInput === false, "destroy unregisters adapter-owned controls");
assert(afterDestroyCaps.exactFrameAdvance === false, "destroy does not alter exact-frame policy");
const adapterTrace = adapterApi.trace();
assert(adapterTrace.sessionId === adapterApi.snapshot().sessionId, "semantic controls remain in one observation session");
assert(adapterTrace.entries.some((entry) => entry.type === "control_passed"), "control results are retained in the observation trace");

// Exact-frame harness: model the canonical Phaser TimeStep -> Game.step -> scene
// update chain and prove the adapter receives exactly N fixed-delta updates while
// the RAF loop is sleeping and the target scene returns to paused afterwards.
class CountingAdapter extends GameplayAdapter {
  constructor(context) {
    super(context);
    this.updateDeltas = [];
    this.updateTimes = [];
  }
  update(time, delta) {
    if (this.status !== "running") return;
    this.updateTimes.push(time);
    this.updateDeltas.push(delta);
  }
}

const exactHooks = new TestHooks("__EXACT_TEST_HOOKS__", {
  observationGlobalKey: "__EXACT_OBSERVATION__",
  maxTraceEntries: 64
});
const exactApi = window.__EXACT_OBSERVATION__;
let exactAdapter = null;
const exactSystems = {
  settings: { key: "ExactFrameScene" },
  active: true,
  pause() { this.active = false; },
  resume() { this.active = true; },
  game: null
};
const exactLoop = {
  running: true,
  targetFps: 60,
  hasFpsLimit: false,
  fpsLimit: 0,
  smoothStep: true,
  _coolDown: 0,
  frame: 10,
  time: 1000,
  now: 1000,
  lastTime: 1000,
  delta: 1000 / 60,
  rawDelta: 1000 / 60,
  callback(time, delta) {
    if (exactSystems.active) exactAdapter?.update(time, delta);
  },
  sleep() { this.running = false; },
  wake() { this.running = true; },
  step(time) {
    this.now = time;
    const delta = Math.max(0, time - this.lastTime);
    this.rawDelta = delta;
    this.time += delta;
    this.delta = delta;
    this.callback(time, delta);
    this.lastTime = time;
    this.frame += 1;
  }
};
exactSystems.game = { isPaused: false, loop: exactLoop };
const exactScene = { sys: exactSystems, game: exactSystems.game };
exactAdapter = new CountingAdapter({ testHooks: exactHooks });
exactAdapter.targetPoint = { x: 0, y: 0 };
exactAdapter.init({
  nodeId: "node_exact_frame",
  nodeConfig: {
    duration: 30,
    goalValue: 1,
    gameplay: { cardId: "survivor_horde", knobs: { allowQuit: true } }
  }
});
exactAdapter.readPlayabilityKnobs(exactAdapter.payload, "survivor_horde");
exactAdapter.create(exactScene);
assert(exactApi.capabilities().exactFrameAdvance === true, "real TimeStep-compatible surface enables exact-frame capability");
const exactPause = exactApi.pause({ reason: "exact_frame_probe" });
assert(exactPause.status === "passed" && exactAdapter.status === "paused" && exactSystems.active === false, "exact-frame contract starts from an immediate paused scene");
const beforeExact = exactApi.snapshot();
const beforeFrame = exactLoop.frame;
const beforeLoopTime = exactLoop.time;
const exactAdvance = exactApi.advanceFrames({ frames: 3 });
assert(exactAdvance.status === "passed", JSON.stringify(exactAdvance));
assert(exactAdvance.result.frames === 3, "exact-frame result reports requested frame count");
assert(exactAdvance.result.finalFrame === beforeFrame + 3, "Phaser TimeStep frame counter advances exactly N frames");
assert(approx(exactAdvance.result.simulatedDeltaMs, 50), "three 60fps frames equal 50ms simulated delta");
assert(approx(exactLoop.time - beforeLoopTime, 50), "TimeStep internal time advances by exactly N fixed deltas");
assert(exactAdapter.updateDeltas.length === 3, "target scene update runs exactly N times");
assert(exactAdapter.updateDeltas.every((delta) => approx(delta, 1000 / 60)), "each exact frame receives the configured fixed delta");
assert(exactAdapter.status === "paused" && exactSystems.active === false, "target scene is re-paused before RAF loop restoration");
assert(exactLoop.running === true && exactAdvance.result.loopRestored === true, "RAF running state is restored after exact stepping");
const afterExact = exactApi.snapshot();
assert(afterExact.sessionId === beforeExact.sessionId && afterExact.sequence > beforeExact.sequence, "exact-frame evidence stays in one monotonic observation session");
assert(afterExact.state.exactFrameAdvance.frames === 3, "same-session snapshot records exact frame evidence");
assert(afterExact.capabilities.exactFrameAdvance === true, "exact-frame capability remains truthful after execution");

const exactInvalid = exactApi.advanceFrames({ frames: 0 });
assert(exactInvalid.status === "failed" && exactInvalid.error.includes("exact_frame_count_invalid"), "invalid exact frame count fails closed");
exactLoop._coolDown = 1;
const exactCooldown = exactApi.advanceFrames({ frames: 1 });
assert(exactCooldown.status === "failed" && exactCooldown.error.includes("timestep_cooldown_active"), "TimeStep cooldown cannot be mislabeled exact");
exactLoop._coolDown = 0;
const exactResume = exactApi.resume({ reason: "exact_frame_probe_complete" });
assert(exactResume.status === "passed" && exactAdapter.status === "running" && exactSystems.active === true, "normal runtime can resume after exact stepping");
exactAdapter.destroy();
assert(exactApi.capabilities().exactFrameAdvance === false, "destroy unregisters exact-frame authority with the owning adapter");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-observation-check.v3",
  status: "passed",
  sessionId: api.snapshot().sessionId,
  traceEntries: api.trace().entryCount,
  capabilities: api.capabilities(),
  adapterSessionId: adapterApi.snapshot().sessionId,
  adapterTraceEntries: adapterTrace.entryCount,
  adapterCapabilitiesAfterDestroy: afterDestroyCaps,
  exactFrameSessionId: afterExact.sessionId,
  exactFrameResult: exactAdvance.result,
  checks: [
    "legacy_test_hook_compatibility",
    "immutable_snapshot_and_trace",
    "same_session_state_trace_identity",
    "bounded_monotonic_trace",
    "unsupported_controls_fail_closed",
    "control_capability_only_after_real_registration",
    "immediate_phaser_systems_pause_resume_controls",
    "shared_adapter_semantic_move_and_retreat",
    "invalid_or_undeclared_semantic_actions_fail_closed",
    "exact_frame_capability_requires_real_timestep_surface",
    "exact_frame_runs_exactly_n_fixed_delta_scene_updates",
    "exact_frame_advances_timestep_internal_time_and_frame_counter",
    "exact_frame_repauses_scene_before_raf_restore",
    "exact_frame_timestep_cooldown_fails_closed",
    "adapter_controls_unregister_on_destroy",
    "runtime_authority_remains_LoreWeaverRuntimeKernel"
  ]
}, null, 2));
