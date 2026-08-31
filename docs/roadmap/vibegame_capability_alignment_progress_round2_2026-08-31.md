# LoreWeaver × VibeGame Capability Alignment — Round 2 Progress

Date: 2026-08-31  
Branch: `feat/vertical-slice-compiler-convergence`  
PR: #3 (keep Draft until current-browser exact-frame proof and release evidence are green)

## Product boundary

LoreWeaver continues to absorb VibeGame production semantics without importing a second runtime authority:

```text
Product Intent
  -> TaskContract
  -> bounded role handoffs
  -> VerticalSliceBlueprint / CapabilityModule
  -> RuntimeSpec
  -> LoreWeaverRuntimeKernel
  -> RuntimeObservation / Scenario replay
  -> EvidenceBundle
  -> explicit CapabilityPromotion / certified release
```

Hard constraints remain:

- one runtime authority: `LoreWeaverRuntimeKernel`;
- production `architecture` Department is implementation work, not Task Architect authority;
- automatic patch authority <= L2;
- L3/L4 requires human review;
- Department confirmation cannot self-certify Player, Reviewer or final acceptance;
- fixture/synthetic/stale evidence cannot promote or certify a capability;
- VibeGame-aligned concepts retain Apache-2.0 provenance where applicable; native LoreWeaver implementation remains under the repository license.

## Completed in Round 2

### 1. Confirmed Department -> TaskContract sync

Implemented:

- `backend/department_task_sync.py`
- `productize/sync-department-task.py`
- `server/departmentTaskSyncRoutes.ts`
- UI confirmation hook in `src/utils/departmentPrep.ts`
- adversarial checks for bridge ordering and confirmation aggregation.

Rules:

- Task Architect must complete before production Departments can create a Programmer handoff;
- all mapped implementation Departments must be human-confirmed before one implementation bundle is appended;
- QA/compliance confirmation alone cannot create Auditor proof: trusted static reports must also pass;
- duplicate confirmation after the Task advances is a no-op;
- Player / Reviewer / Orchestrator remain independent.

A key divergence was resolved explicitly: production `architecture` runs inside the production dependency graph and therefore maps to Programmer implementation evidence; it must never impersonate the task-level Architect.

### 2. Repair Loop -> bounded Task rework

Implemented:

- `backend/task_repair_bridge.py`
- `productize/jobs/check-task-repair-bridge.py`

Repair is no longer permitted to be a hidden side channel.

Success route:

```text
Task blocked (resumeRole=programmer)
  -> bounded Repair Loop
  -> targeted validators
  -> caller-owned transactional authoring commit
  -> repair evidence with before/after spec hashes
  -> Programmer rework handoff
  -> fresh Auditor
  -> fresh Player
  -> fresh Reviewer
  -> Orchestrator acceptance
```

If Task optimistic concurrency changes after candidate authoring commit but before the Task handoff, the caller must roll back authoring. Failed or escalated repair never commits the candidate. L3/L4 repair is rejected before execution.

### 3. Runtime semantic controls

`GameplayAdapter` now exposes controls only when a real runtime surface exists:

- immediate Phaser Systems pause;
- immediate Phaser Systems resume;
- semantic move when the adapter exposes a target point;
- semantic retreat through the existing adapter result path;
- optional semantic primary only when an adapter implements it.

Controls unregister with the owning adapter. A configuration flag cannot make an unsupported control appear available.

### 4. Replayable RuntimeScenario contract

Implemented:

- `minigame_master/contracts/runtime_scenario.schema.json`
- `minigame_master/core/lib/contracts/RuntimeScenarioRunner.js`
- runtime-scenario adversarial checks.

A Scenario is declarative and executable only through `RuntimeObservationPort`; it contains no shell or provider command. Replays bind the same scenario identity to a new runtime session, and assertions are evaluated against same-session snapshots/traces.

A scenario that requires a runtime capability that is not genuinely exposed is blocked before execution.

### 5. AssetRecipe executable operation layer

Implemented:

- `productize/lib/asset-operation-executor.mjs`
- `productize/lib/png-asset-operations.mjs`
- executor and PNG operation tests.

The executor accepts only registered logical ports. Recipes cannot embed executable paths or commands.

Deterministic image ports now include:

- analyze;
- label;
- explicit color-key background removal;
- cut/decompose frames;
- alpha/edge cleanup;
- nearest-neighbor upscale;
- concatenate;
- atlas build;
- PNG conversion.

Source files are SHA-256 checked before execution. Downstream operations bind exact prior output hashes. Strict replay can require the final declared hash and byte length to match exactly. Output path escape is rejected.

`asset.vlm` intentionally remains unregistered unless a real visual-model provider is supplied; deterministic local processing must not masquerade as VLM evidence.

### 6. Provenance visibility

Capability Library now surfaces:

- origin;
- license;
- source reference / URL when available;
- adaptation boundary;
- missing capabilities.

VibeGame-derived alignment candidates remain concept-only candidates rather than support claims.

## Exact-frame status — implemented but NOT yet closed

The runtime exact-frame path is based on Phaser 4.1.0's canonical engine step chain rather than `waitForTimeout`:

```text
Phaser.TimeStep.step
  -> Phaser.Game.step
  -> SceneManager.step
  -> Systems PRE_UPDATE / UPDATE / POST_UPDATE
  -> timers / tweens / physics / animation / adapter update
```

The current implementation:

1. requires an immediate-paused target adapter;
2. requires a real Phaser TimeStep surface;
3. sleeps the normal RAF driver;
4. advances fixed engine deltas through `TimeStep.step`;
5. re-pauses the target scene before restoring normal RAF;
6. records frame count, fixed delta, TimeStep internal time and same-session observation evidence;
7. refuses exact-frame while Phaser TimeStep is in cooldown.

A Golden Candidate browser probe was added for `survivor_horde`:

```text
pause -> snapshot -> advance 2 frames -> snapshot/trace -> resume
```

The probe requires exact frame-count equality and same-session evidence. The first current-browser run exposed a Phaser TimeStep lifecycle mismatch around sleep/wake restoration. This is intentionally kept as a red gate rather than weakened to a warning. The following issue must be closed before G7 exact-frame is marked complete:

- preserve and restore the real Phaser `sleeping` and `running` states correctly; do not treat `sleep()` as equivalent to `running=false`;
- rerun the real Golden Candidate browser probe after the lifecycle fix;
- only then mark exact-frame and deterministic frame replay verified.

## CI status policy

At the earlier stable alignment head, all three core lanes were green:

- VibeGame Alignment Core;
- Convergence Core;
- Golden Candidate E2E.

The subsequent exact-frame browser integration intentionally introduced a stricter real-browser gate and exposed the lifecycle issue above. PR #3 therefore remains Draft. Do not merge by reverting or weakening the exact-frame assertion; either fix the Phaser lifecycle correctly or keep the capability unavailable/fail-closed.

## Remaining work after the exact-frame fix

1. bind exact-frame replay into the Golden Candidate RuntimeScenario evidence path after the real browser probe is green;
2. migrate more legacy asset jobs onto registered AssetRecipe operation ports;
3. add real external VLM AssetRecipe port/evidence only when an actual provider session is available;
4. implement the explicit CapabilityPromotion write transaction (`diff -> validate -> user approval -> conflict check -> atomic write`) without silent global mutation;
5. close real human first-time playtest and physical-device evidence for certified release;
6. keep VibeGame genre candidates non-compilable until the missing Gameplay Cards/Modifiers are separately implemented and empirically verified.

## Merge rule

PR #3 stays Draft until:

- Alignment Core is green at the current head;
- Convergence Core is green at the current head;
- Golden Candidate E2E is green at the current head;
- exact-frame, if advertised, has real browser evidence rather than only a unit harness;
- no new runtime authority, hidden executable AssetRecipe port, L3/L4 auto-promotion, or evidence waiver is introduced.
