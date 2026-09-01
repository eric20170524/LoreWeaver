# LoreWeaver × VibeGame Capability Alignment TODO

> Branch: `feat/vertical-slice-compiler-convergence`  
> Rule: import production contracts and verified reusable capability semantics; never introduce a second runtime authority.  
> Status source: implementation + CI, not aspirational docs.

## G0 — Alignment decisions

- [x] Review VibeGame orchestrator, role ownership, task lifecycle, runtime verification, reusable modules/skeletons/contracts, asset workflow, release and self-evolve implementation.
- [x] Map VibeGame concepts onto LoreWeaver primitives: TaskContract, VerticalSliceBlueprint, CapabilityModule, ProductionContract, CapabilityPromotion, RuntimeObservationPort and AssetRecipe.
- [x] Keep hard divergences: no VibeGame SceneTree runtime, no `Node` terminology collision, no tmux/provider coupling, no arbitrary L3/L4 automation, no silent global self-evolve.
- [x] Record Apache-2.0 attribution boundary for any future direct source reuse.

## G1 — TaskContract

- [x] Add `loreweaver.task-contract.v1` schema.
- [x] Implement provider-neutral state machine, append-only hash-chained HandoffRounds and Workspace repository.
- [x] Enforce Architect → Programmer → Auditor → Player → Reviewer → Orchestrator evidence ownership.
- [x] Bind product intent, acceptance criteria, sourceSpecHash, role context and Runtime State Contract.
- [x] Enforce automatic patch authority <= L2; L3/L4 immediately escalate.
- [x] Add atomic persistence, history journal, optimistic concurrency and failed-transition zero-write tests.
- [x] Add Gateway API + Expert Task audit view.

## G2 — VerticalSliceBlueprint

- [x] Add schema and fail-closed validator/compiler.
- [x] Compile declarative Blueprint to existing RecipeGraph/NodeSpec without executable payload.
- [x] Convert `survivor_vertical_slice_3` into the first runtime-verified Blueprint.
- [x] Add non-compilable alignment candidates for boss fight, deckbuilder, dungeon shooter, swipe slice and bounce parkour with explicit missing capabilities.
- [x] Add composition/round-trip/missing-capability/adversarial checks.
- [ ] Implement and empirically verify the missing Gameplay Cards/Modifiers for those five genre candidates before changing their support status.

## G3 — CapabilityModule

- [x] Add normalized descriptor contract for existing Card/Modifier/runtime/presentation surfaces.
- [x] Preserve `LoreWeaverRuntimeKernel` as the only runtime authority.
- [x] Surface public interface, knobs, compatibility, required systems, patch authority, checks, provenance, fit, risk and maturity.
- [x] Reject arbitrary executable source and second-runtime declarations.
- [x] Keep L3/L4 human-review only.

## G4 — CapabilityPromotion

- [x] Add evidence-gated promotion policy for Blueprint/Module/ProductionContract/AssetRecipe.
- [x] Reject fixture/synthetic/stale evidence, private paths, project-specific leakage, destination conflicts and automatic L3/L4 promotion.
- [x] Require explicit approval metadata, license, real usage and kind-specific evidence.
- [x] Add explicit two-phase write transaction: preview diff → candidate validation → approval token → re-check conflict → atomic create-only write.
- [x] Bind approval token to candidate hash, destination, source revision and approval identity; candidate changes invalidate approval.
- [x] Add CLI `productize/promote-capability.mjs` for preview/commit.
- [x] Add Expert Mode approval UI/Gateway surface; preview and commit are separate user actions and the approval token is never auto-submitted.
- [ ] Add real repository usage examples that reach `promoted` only after empirical evidence closure.

## G5 — ProductionContract

- [x] Define ProductionContract schema/conventions.
- [x] Project exact-Candidate certification into verified `candidate-certification` contract.
- [x] Keep planned runtime/art/HUD/boss/prototype-to-polish contracts visibly planned until validators exist.
- [x] Require referenced implementation/validator files to exist and preserve role/evidence separation.

## G6 — Department / Expert Mode integration

- [x] Add read-only Capability Library for Blueprints/Modules/Contracts/candidates and provenance.
- [x] Add Task view for Product Intent, criteria coverage, role context, HandoffRounds, evidence and blockers.
- [x] Add Department → Task bridge with strict role/evidence boundaries.
- [x] Add confirmed Department bundle sync: mapped production departments become one Programmer handoff only after required human confirmations; QA/compliance can become Auditor only with trusted static reports.
- [x] Integrate bounded Repair Loop as Programmer rework followed by fresh Auditor/Player/Reviewer/Orchestrator stages.
- [x] Keep Player, Reviewer and final acceptance independent from Department confirmation.
- [ ] Remove remaining legacy department UI/path assumptions only where they duplicate the TaskContract source of truth; do not create a second workflow model.

## G7 — RuntimeObservationPort

- [x] Define semantic observation contract over TestHooks/RuntimeKernel.
- [x] Provide immutable snapshot, bounded trace, session identity and fail-closed capability declaration.
- [x] Add real pause/resume controls using Phaser Systems lifecycle when the Adapter surface exists.
- [x] Add semantic `move`/`retreat` and optional `primary` only when the Adapter actually implements them.
- [x] Add exact-frame advance over the real Phaser TimeStep + Scene Systems; no `waitForTimeout()` substitution.
- [x] Add declarative RuntimeScenario/replay runner with same-session assertions.
- [x] Bind Golden Candidate browser state/trace/screenshot evidence to the same runtime session.
- [x] Keep screenshot/console/network explicitly host-owned rather than falsely claimed as RuntimeKernel controls.
- [x] Keep unsupported `activate` unadvertised.
- [x] Close real-browser exact-frame readiness: generic Candidate verifier waits boundedly for Phaser TimeStep cooldown=0 while the Adapter remains fail-closed during cooldown; latest Golden Candidate E2E is green in real Chromium.
- [ ] Add cross-build deterministic replay evidence only after seed/time/input sources are fully controlled.

## G8 — AssetRecipe / art pipeline

- [x] Add AssetRecipe schema with prompt/reference/provider/model/raw hashes/operations/final manifest keys/evidence/provenance.
- [x] Add deterministic operation executor and registered PNG ports for analyze/label/remove-background/cut/decompose/cleanup/upscale/concatenate/build-atlas/convert.
- [x] Reject executable commands/script paths and workspace escapes from Recipe operations.
- [x] Bind execution outputs and verification to exact hashes.
- [x] Add conservative legacy asset migration: historical assets become candidate, never silently verified/promoted.
- [x] Migrate legacy `atlas_verify` to execute a real registered `asset.convert` operation, emit execution evidence and rebind the migration candidate to the actual output hash.
- [x] Add deterministic PCM16 WAV normalize/trim/mix operation ports and migrate `audio_verify` to real `asset.normalize_audio` execution for WAV sources; MP3/OGG remain explicit unsupported/pending inputs.
- [ ] Register real `asset.vlm` only when an actual VLM provider is present; do not create a synthetic implementation.
- [ ] Promote AssetRecipes only after real runtime-usage + visual/VLM + integrity/license evidence closes.

## G9 — CI / release safety

- [x] Add dedicated `VibeGame Alignment Core` workflow.
- [x] Gate TaskContract, Task API, Department sync, bounded repair, Blueprint, Module, Promotion, ProductionContract, RuntimeObservation, RuntimeScenario and AssetRecipe checks.
- [x] Add explicit promotion transaction/Gateway/Expert-UI adversarial checks.
- [x] Add legacy atlas and PCM-WAV asset-job operation-migration checks.
- [x] Keep Convergence Core and TypeScript checks green through the alignment work.
- [x] Require latest Golden Candidate E2E green before this branch is considered merge-ready at the engineering/browser layer.
- [ ] Require real VLM + human playtest + physical-device evidence for strict Certified release; CI cannot synthesize these.

## Current execution order

1. [ ] Add fail-closed cross-build determinism readiness/evidence contract; do not claim deterministic replay while RNG/time/presentation sources remain uncontrolled.
2. [ ] Remove only the remaining Department UI/path duplication that conflicts with TaskContract source of truth.
3. [ ] Register real `asset.vlm` only with an actual provider session.
4. [ ] Collect real VLM / human / device evidence for a no-waiver Certified golden slice.
5. [ ] Add one real evidence-backed Promotion example after empirical closure.
6. [ ] Only then implement one of the five alignment-candidate genres end-to-end; do not expand all five horizontally.

## Explicitly prohibited

- Importing VibeGame `SceneTree`, `Node`, `VisualFactory`, `ColliderFactory` or a second Phaser runtime.
- Copying tmux/Claude/Codex process management into the product data model.
- Copying VibeGame Skeleton JS into LoreWeaver RuntimeKernel.
- Automatically creating L3 adapters or modifying L4 runtime core.
- Automatically promoting candidates into the global catalog without an explicit second-phase approval action.
- Treating `alignment_candidate` as runtime support.
- Faking VLM, human, device, semantic-input, exact-frame or cross-build deterministic evidence.
