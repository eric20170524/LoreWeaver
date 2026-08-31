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

// Shared adapter controls: prove pause/resume/semantic input are backed by a
// real adapter/scene surface rather than enabled by configuration alone.
const adapterHooks = new TestHooks("__ADAPTER_TEST_HOOKS__", {
  observationGlobalKey: "__ADAPTER_OBSERVATION__",
  maxTraceEntries: 32
});
const adapterApi = window.__ADAPTER_OBSERVATION__;
let scenePaused = false;
let scenePauseCalls = 0;
let sceneResumeCalls = 0;
let adapterEndResult = null;
const fakeScene = {
  sys: { settings: { key: "SyntheticAdapterScene" } },
  scene: {
    pause(key) {
      assert(key === "SyntheticAdapterScene", "pause targets the owning scene");
      scenePaused = true;
      scenePauseCalls += 1;
    },
    resume(key) {
      assert(key === "SyntheticAdapterScene", "resume targets the owning scene");
      scenePaused = false;
      sceneResumeCalls += 1;
    }
  }
};
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
assert(adapterCaps.pause === true && adapterCaps.resume === true, "adapter create registers real scene pause/resume controls");
assert(adapterCaps.semanticInput === true, "adapter create registers semantic input when a real action surface exists");
assert(adapterCaps.exactFrameAdvance === false, "shared adapter controls do not fake exact-frame advance");
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
assert(adapterPause.status === "passed" && scenePaused === true, "pause executes the owning scene pause surface");
assert(adapter.status === "paused" && scenePauseCalls === 1, "adapter status follows paused scene");
assert(adapterApi.snapshot().state.status === "paused", "pause state is observable in the same session");
const adapterResume = adapterApi.resume({ reason: "continue" });
assert(adapterResume.status === "passed" && scenePaused === false, "resume executes the owning scene resume surface");
assert(adapter.status === "running" && sceneResumeCalls === 1, "adapter status returns to running");
assert(adapterApi.snapshot().state.status === "running", "resume state is observable in the same session");

const frameAdvance = adapterApi.advanceFrames({ frames: 1 });
assert(frameAdvance.status === "unsupported", "advanceFrames stays unsupported without a deterministic runtime clock");
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

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-observation-check.v2",
  status: "passed",
  sessionId: api.snapshot().sessionId,
  traceEntries: api.trace().entryCount,
  capabilities: api.capabilities(),
  adapterSessionId: adapterApi.snapshot().sessionId,
  adapterTraceEntries: adapterTrace.entryCount,
  adapterCapabilitiesAfterDestroy: afterDestroyCaps,
  checks: [
    "legacy_test_hook_compatibility",
    "immutable_snapshot_and_trace",
    "same_session_state_trace_identity",
    "bounded_monotonic_trace",
    "unsupported_controls_fail_closed",
    "control_capability_only_after_real_registration",
    "shared_adapter_pause_resume_controls",
    "shared_adapter_semantic_move_and_retreat",
    "invalid_or_undeclared_semantic_actions_fail_closed",
    "adapter_controls_unregister_on_destroy",
    "exact_frame_advance_not_falsely_claimed",
    "runtime_authority_remains_LoreWeaverRuntimeKernel"
  ]
}, null, 2));
