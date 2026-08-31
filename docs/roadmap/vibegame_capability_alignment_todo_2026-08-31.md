# LoreWeaver × VibeGame Capability Alignment TODO

> Plan: `docs/roadmap/vibegame_capability_alignment_plan_2026-08-31.md`  
> Branch: `feat/vertical-slice-compiler-convergence`  
> Rule: import production contracts and verified reusable capability semantics; never introduce a second runtime authority.

## G0 — Alignment decisions

- [x] G0.1 Review VibeGame orchestrator, role ownership, task lifecycle, runtime verification, reusable modules/skeletons/contracts, asset workflow, release and self-evolve implementation.
- [x] G0.2 Map VibeGame concepts onto LoreWeaver primitives: TaskContract, VerticalSliceBlueprint, CapabilityModule Descriptor, ProductionContract, CapabilityPromotion, RuntimeObservationPort and AssetRecipe.
- [x] G0.3 Record hard divergences: no VibeGame SceneTree runtime, no `node` terminology collision, no tmux/provider coupling, no arbitrary L3/L4 automation, no silent global self-evolve.
- [x] G0.4 Record license boundary: first phase is independent contract/policy implementation; any later direct Apache-2.0 source reuse must retain applicable notices and third-party attribution.

## G1 — TaskContract

- [ ] G1.1 Add `loreweaver.task-contract.v1` JSON schema.
- [ ] G1.2 Implement provider-neutral task state machine and append-only HandoffRounds.
- [ ] G1.3 Enforce role ownership: Auditor cannot claim runtime evidence; Player cannot claim static review; Reviewer cannot approve before both stages pass.
- [ ] G1.4 Bind tasks to `sourceSpecHash`, product intent, acceptance criteria, role-specific context and Runtime State Contract.
- [ ] G1.5 Enforce automatic patch authority <= L2; L3/L4 transitions become explicit escalation.
- [ ] G1.6 Add positive flow and adversarial ordering/authority/evidence tests.

## G2 — VerticalSliceBlueprint

- [ ] G2.1 Add `loreweaver.vertical-slice-blueprint.v1` schema.
- [ ] G2.2 Implement Blueprint validator: unique stages, current linear shape, Card/Modifier existence and compatibility, declared/missing capabilities, maturity claims.
- [ ] G2.3 Implement Blueprint compiler to existing RecipeGraph + NodeSpec; no executable script payload.
- [ ] G2.4 Convert `survivor_vertical_slice_3` into the first runtime-supported Blueprint fixture.
- [ ] G2.5 Add Alignment Candidate catalog for VibeGame-style boss fight, deckbuilder, dungeon shooter, swipe slice and bounce parkour; candidates must list missing LoreWeaver capabilities and remain non-compilable.
- [ ] G2.6 Add round-trip/compile/composition/fail-closed tests.

## G3 — CapabilityModule Descriptor

- [ ] G3.1 Add normalized descriptor schema for existing Gameplay Card, Modifier, RuntimeFeaturePack and Presentation capability.
- [ ] G3.2 Implement Card/Modifier → CapabilityModule Descriptor adapter.
- [ ] G3.3 Reject arbitrary JS/script paths as Blueprint runtime entries.
- [ ] G3.4 Surface public config/knobs, required systems, patch authority, checks, provenance, fit, risk and maturity.
- [ ] G3.5 Add descriptor validation tests against `survivor_horde` and one Modifier.

## G4 — CapabilityPromotion

- [ ] G4.1 Add `loreweaver.capability-promotion.v1` schema.
- [ ] G4.2 Implement pure promotion policy for blueprint/module/production-contract/asset-recipe.
- [ ] G4.3 Require real source Workspace/revision, real non-stale evidence, explicit approval, license metadata and conflict-free destination.
- [ ] G4.4 Require Blueprint/Module runtime evidence; Module also requires externalized tunables, public interface and static check.
- [ ] G4.5 Reject fixture/synthetic/stale evidence, private paths, project-specific leakage, missing approval and automatic L3/L4 promotion.
- [ ] G4.6 Keep Phase A dry-run only: policy emits decision/blockers/actions but performs no file copy.
- [ ] G4.7 Add adversarial promotion tests.

## G5 — ProductionContract library

- [ ] G5.1 Define `ProductionContract` document/schema conventions.
- [ ] G5.2 Add first contract: `candidate-certification` by projecting the already shipped exact-Candidate release pipeline.
- [ ] G5.3 Add planned contracts for runtime observation, asset atlas, sprite/collider alignment, HUD readability, boss encounter and prototype-to-polish.
- [ ] G5.4 Prohibit a contract from claiming validators/capabilities that do not exist; planned responsibilities remain visibly planned.

## G6 — Expert Mode integration

- [ ] G6.1 Add read-only Capability Library panel for Blueprints/Modules/Contracts and support/missing-capability status.
- [ ] G6.2 Add Task view showing Product Intent, Plan, role context, HandoffRounds, static/runtime evidence and blockers.
- [ ] G6.3 Route existing Department Agent output into TaskContract rounds; retain Simple Mode five-step flow.
- [ ] G6.4 Integrate Repair Loop as bounded rework round rather than an independent hidden process.
- [ ] G6.5 Add UI/type checks and user-visible source/provenance attribution.

## G7 — RuntimeObservationPort

- [ ] G7.1 Define semantic runtime observation contract over `LoreWeaverRuntimeKernel` / TestHooks.
- [ ] G7.2 Support activate/pause/exact-frame advance/semantic input/snapshot/screenshot/console/network.
- [ ] G7.3 Produce one-session trace + result + visual evidence bundle.
- [ ] G7.4 Migrate Golden Candidate E2E to consume the observation contract without changing RuntimeKernel authority.
- [ ] G7.5 Add replayable bot/scenario contract and fail-closed evidence freshness.

## G8 — AssetRecipe and art pipeline

- [ ] G8.1 Add AssetRecipe schema: raw prompt/reference, provider/model, raw hash, operations, final manifest keys, checks and provenance.
- [ ] G8.2 Record only assets actually selected by runtime manifests.
- [ ] G8.3 Add tool-neutral analyze/decompose/cut/concat/cleanup/label/VLM operation ports.
- [ ] G8.4 Bind Atlas/asset verification Evidence to exact output hashes.
- [ ] G8.5 Promote only empirically verified AssetRecipes with explicit approval.

## G9 — CI and release safety

- [ ] G9.1 Add `check:task-contract`.
- [ ] G9.2 Add `check:vertical-slice-blueprint`.
- [ ] G9.3 Add `check:capability-module`.
- [ ] G9.4 Add `check:capability-promotion`.
- [ ] G9.5 Add all Phase A checks to `check:convergence-core`.
- [ ] G9.6 Re-run Convergence Core + TypeScript + Golden Candidate E2E.
- [ ] G9.7 Confirm no RuntimeKernel/Adapter production path was duplicated.

## Current execution order

1. [ ] G1 TaskContract foundation.
2. [ ] G2 Blueprint schema/compiler and survivor fixture.
3. [ ] G3 CapabilityModule descriptor.
4. [ ] G4 Promotion policy.
5. [ ] G9 Phase A CI.
6. [ ] G5/G6 Product and workflow UI.
7. [ ] G7 RuntimeObservationPort.
8. [ ] G8 AssetRecipe.

## Explicitly out of scope for Phase A

- Importing VibeGame `SceneTree`, `Node`, `VisualFactory`, `ColliderFactory` or its Phaser engine.
- Copying VibeGame tmux/Claude/Codex team process manager.
- Copying its Skeleton JS into LoreWeaver RuntimeKernel.
- Automatically creating L3 adapters or modifying L4 runtime core.
- Automatically promoting candidates into the global catalog.
- Claiming VibeGame-supported genres are already LoreWeaver-supported.
- Copying VibeGame implementation source without Apache-2.0 attribution review.