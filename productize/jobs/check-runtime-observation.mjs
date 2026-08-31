#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RuntimeObservationPort,
  TestHooks
} from "../../minigame_master/core/lib/contracts/index.js";

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

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-observation-check.v1",
  status: "passed",
  sessionId: api.snapshot().sessionId,
  traceEntries: api.trace().entryCount,
  capabilities: api.capabilities(),
  checks: [
    "legacy_test_hook_compatibility",
    "immutable_snapshot_and_trace",
    "same_session_state_trace_identity",
    "bounded_monotonic_trace",
    "unsupported_controls_fail_closed",
    "control_capability_only_after_real_registration",
    "exact_frame_advance_not_falsely_claimed",
    "runtime_authority_remains_LoreWeaverRuntimeKernel"
  ]
}, null, 2));
