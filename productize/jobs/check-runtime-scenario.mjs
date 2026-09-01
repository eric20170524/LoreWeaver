#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TestHooks,
  runRuntimeScenario,
  validateRuntimeScenario
} from "../../minigame_master/core/lib/contracts/index.js";
import GameplayAdapter from "../../minigame_master/core/lib/gameplay/GameplayAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/runtime_scenario.schema.json");

function assert(value, message) {
  if (!value) throw new Error(message);
}

globalThis.window = {};
const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
assert(schema.$id, "runtime scenario schema must declare $id");

function createHarness(suffix) {
  const hooks = new TestHooks(`__SCENARIO_HOOKS_${suffix}__`, {
    observationGlobalKey: `__SCENARIO_OBSERVATION_${suffix}__`,
    maxTraceEntries: 64
  });
  let paused = false;
  let ended = null;
  const systems = {
    settings: { key: `ScenarioScene${suffix}` },
    pause() { paused = true; },
    resume() { paused = false; }
  };
  const scene = { sys: systems };
  const adapter = new GameplayAdapter({
    testHooks: hooks,
    onEnd: (result) => { ended = result; }
  });
  adapter.targetPoint = { x: 0, y: 0 };
  adapter.init({
    nodeId: `scenario-node-${suffix}`,
    nodeConfig: {
      duration: 30,
      goalValue: 1,
      gameplay: { cardId: "survivor_horde", knobs: { allowQuit: true } }
    }
  });
  adapter.readPlayabilityKnobs(adapter.payload, "survivor_horde");
  adapter.create(scene);
  return {
    hooks,
    api: window[`__SCENARIO_OBSERVATION_${suffix}__`],
    adapter,
    get paused() { return paused; },
    get ended() { return ended; }
  };
}

const scenario = {
  schemaVersion: "loreweaver.runtime-scenario.v1",
  id: "semantic-move-pause-retreat",
  title: "Semantic move, pause/resume, and retreat",
  description: "Replayable semantic flow without claiming exact-frame control.",
  requiredCapabilities: ["semanticInput", "pause", "resume"],
  steps: [
    {
      id: "move",
      type: "input",
      payload: { action: "move", x: 144, y: 288 },
      assertions: [
        { path: "semanticAction.action", operator: "eq", value: "move" },
        { path: "status", operator: "eq", value: "running" }
      ]
    },
    {
      id: "pause",
      type: "pause",
      assertions: [{ path: "status", operator: "eq", value: "paused" }]
    },
    {
      id: "resume",
      type: "resume",
      assertions: [{ path: "status", operator: "eq", value: "running" }]
    },
    {
      id: "retreat",
      type: "input",
      payload: { action: "retreat" },
      assertions: [
        { path: "status", operator: "eq", value: "ended" },
        { path: "lastResult.reason", operator: "eq", value: "retreated" }
      ]
    }
  ],
  metadata: { owner: "qa", purpose: "runtime-scenario-contract" }
};

const validation = validateRuntimeScenario(scenario);
assert(validation.valid, JSON.stringify(validation));

const first = createHarness("A");
assert(first.api.capabilities().pause === true && first.api.capabilities().resume === true, "scenario harness must expose immediate Systems pause/resume");
assert(first.api.capabilities().exactFrameAdvance === false, "scenario harness has no TimeStep and cannot claim exact frames");
const firstResult = await runRuntimeScenario({ scenario, observation: first.api });
assert(firstResult.status === "passed", JSON.stringify(firstResult));
assert(firstResult.runtimeAuthority === "LoreWeaverRuntimeKernel", "scenario never creates a second runtime authority");
assert(firstResult.timingMode === "semantic_event", "scenario without waits or frame advance is semantic-event replay");
assert(firstResult.sessionId === first.api.snapshot().sessionId, "scenario result binds one observation session");
assert(firstResult.traceRange.endSequence >= firstResult.traceRange.startSequence, "scenario binds a monotonic trace range");
assert(first.adapter.targetPoint.x === 144 && first.adapter.targetPoint.y === 288, "semantic move reached adapter target point");
assert(first.ended?.reason === "retreated", "semantic retreat reached host result path");
assert(firstResult.steps.every((step) => step.passed), "all semantic scenario steps pass assertions");

// Replay the same declarative scenario against a fresh runtime session. The
// scenario identity stays fixed while the runtime session identity changes.
const second = createHarness("B");
const secondResult = await runRuntimeScenario({ scenario, observation: second.api });
assert(secondResult.status === "passed", JSON.stringify(secondResult));
assert(secondResult.scenarioHash === firstResult.scenarioHash, "replay uses the exact same scenario identity");
assert(secondResult.sessionId !== firstResult.sessionId, "replay is a new runtime session rather than copied evidence");

const exactFrameScenario = {
  schemaVersion: "loreweaver.runtime-scenario.v1",
  id: "requires-exact-frame",
  title: "Exact frame requirement",
  requiredCapabilities: ["exactFrameAdvance"],
  steps: [{ id: "advance", type: "advance_frames", frames: 1 }]
};
const exactFrameResult = await runRuntimeScenario({ scenario: exactFrameScenario, observation: second.api });
assert(exactFrameResult.status === "blocked", "scenario requiring unavailable exact-frame control is blocked");
assert(exactFrameResult.reason === "required_runtime_capability_missing", "missing capability is explicit");
assert(exactFrameResult.missingCapabilities.includes("exactFrameAdvance"), "exact-frame gap is preserved, not emulated with timeout");

const settleScenario = {
  schemaVersion: "loreweaver.runtime-scenario.v1",
  id: "host-settle-required",
  title: "Host settle requirement",
  steps: [
    {
      id: "assert-after-settle",
      type: "assert",
      settleMs: 10,
      assertions: [{ path: "status", operator: "exists" }]
    }
  ]
};
const settleBlocked = await runRuntimeScenario({ scenario: settleScenario, observation: second.api });
assert(settleBlocked.status === "blocked" && settleBlocked.reason === "host_settle_callback_required", "wall-clock settling must be explicitly host-owned");

const invalidScenario = {
  schemaVersion: "loreweaver.runtime-scenario.v1",
  id: "invalid",
  title: "Invalid",
  steps: [{ id: "bad", type: "shell", payload: { command: "rm -rf /" } }]
};
const invalidResult = await runRuntimeScenario({ scenario: invalidScenario, observation: second.api });
assert(invalidResult.status === "blocked" && invalidResult.reason === "scenario_invalid", "unknown executable-like step types are never executed");

const assertionHarness = createHarness("C");
const assertionFailure = await runRuntimeScenario({
  observation: assertionHarness.api,
  scenario: {
    schemaVersion: "loreweaver.runtime-scenario.v1",
    id: "assertion-failure",
    title: "Assertion failure",
    steps: [
      {
        id: "assert-running",
        type: "assert",
        assertions: [{ path: "status", operator: "eq", value: "paused" }]
      }
    ]
  }
});
assert(assertionFailure.status === "failed" && assertionFailure.reason === "scenario_assertion_failed", "failed gameplay assertion is evidence failure, not a passed replay");
assert(assertionFailure.failedAssertions[0].actual === "idle" || assertionFailure.failedAssertions[0].actual === null || assertionFailure.failedAssertions[0].actual === "running", "failed assertion exposes observed state");

first.adapter.destroy();
second.adapter.destroy();
assertionHarness.adapter.destroy();

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-scenario-check.v2",
  status: "passed",
  scenarioId: scenario.id,
  scenarioHash: firstResult.scenarioHash,
  firstSessionId: firstResult.sessionId,
  replaySessionId: secondResult.sessionId,
  checks: [
    "semantic_scenario_runs_only_through_runtime_observation_port",
    "scenario_harness_uses_immediate_phaser_systems_controls",
    "scenario_and_replay_bind_distinct_real_session_ids",
    "scenario_identity_is_stable_across_replay",
    "move_pause_resume_retreat_use_real_adapter_controls",
    "assertions_bind_observed_same_session_state",
    "exact_frame_requirement_blocks_when_timestep_capability_is_missing",
    "host_wall_clock_settle_requires_explicit_host_callback",
    "unknown_step_types_are_rejected_before_execution",
    "failed_assertions_fail_the_scenario"
  ]
}, null, 2));
