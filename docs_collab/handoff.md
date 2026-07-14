# Handoff

## Current Handoff

- agent: Antigravity
- requirementId: REQ-20260711-001
- iteration: 1
- task: `LW-020: Readable Enemy Archetype State Machines`
- status: in_progress
- patchLevel: L3
- owner: Antigravity
- reviewer: Codex
- implementationModel: `gpt-5.6-terra/Anscombe`
- dependsOn: `LW-019` verified in `review.md#lw-019`

## Objective

Create learnable threats and counterplay by replacing uniform homing behaviors with distinct enemy archetypes driven by a readable state machine.

## Current Failure Inventory

- Enemies only blindly move towards the player using simple physics homing.
- No windup, active, or recovery states exist, making damage inevitable and unreadable.

## Required Design

- Implement chase/melee, charge, ranged pressure, support/guard, and zone-control archetypes with explicit windup, active, recovery, interrupt, and cooldown states.
- Ensure attacks use move-specific VFX telegraphs and do not deal damage before their designated active frame.
- Node1 must utilize at least three of these distinct archetypes with clear silhouettes and predictable counterplay.
- Runtime state must report the enemy's current move, phase timing, target, interruptibility, and coverage gaps.

## Required Evidence

- Forced enemy-move scenarios verifying state transitions.
- Telegraph timing assertions.
- Damage and cancel (interrupt) tests ensuring correct execution flow.

## Required Gates

- `npm run check:docs-collab`.
- `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`.

## Guardrails

- Only update enemy runtime logic; do not refactor unrelated subsystems.
- Maintain existing bounds and integration with `NodeCombatHud` and `PlayerActionController`.

## Next Action

LW-020 has been completed and verified. Codex or another agent can now claim and start work on LW-021.
