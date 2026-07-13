# Handoff

## Current Handoff

- agent: Antigravity
- requirementId: REQ-20260711-001
- iteration: 1
- task: `LW-018: Unified Power Budget And Runtime Scaling`
- status: in_progress
- patchLevel: L3
- owner: Antigravity
- reviewer: Codex
- implementationModel: `gpt-5.6-terra/Anscombe`
- dependsOn: `LW-017` verified in `review.md#lw-017-review-2`

## Objective

Replace disconnected exponential stats, Boss overrides, rewards, and costs with one auditable power-budget contract shared by runtime and the deterministic simulator. Clear all current balance-gate violations without flattening every node into identical combat.

## Current Failure Inventory

- Fresh balance report: 64 violations across two profiles and 24 node rows.
- 22 `mandatory_repeats_exceed_limit` violations; maximum mandatory repeats is 441.
- 20 ordinary `boss_ttk_below_minimum`, two `final_boss_ttk_below_minimum`, and two `missing_runtime_boss` violations.
- 16 `survivability_outside_contact_band` violations and two `instant_failure_path` violations.
- Progression divergence is already zero; do not regress Save V2, realm eligibility, or offline timestamp behavior.

## Required Design

- Define one versioned power-budget data contract for Node1-12 with explicit player profile assumptions, normal/elite/Boss HP and damage bands, expected skill DPS, reward vectors, upgrade/cave/realm costs, target clear time, target hits-to-kill, and allowed mandatory repeats.
- Runtime stat resolution and `report-balance-simulation.mjs` must import/derive from the same source. Do not copy final numbers into a second simulator-only table.
- Preserve enemy archetype identity through bounded per-enemy modifiers around the node budget. Bosses require explicit runtime identities for every node; Node1 and Node2 cannot remain missing.
- Remove Node12's unexplained instant-failure/collision override and raw 5000 HP special case. Finale-specific phases may remain, but damage and HP must derive from the budget with documented phase modifiers.
- Normalize or abbreviate HP/damage/reward displays so large values do not overflow; do not scale font by viewport width.
- Economy changes must model full resource vectors and cumulative costs. Passing by deleting costs, granting absurd first-clear rewards, or assuming parallel farming is forbidden.

## Required Evidence

- Add source-contract and runtime parity fixtures proving each node's resolved player/enemy/Boss stats and expected DPS match simulator inputs within documented tolerance.
- Add representative runtime samples for early, middle, late, and final nodes, including ordinary enemy hits-to-kill, Boss TTK, player contact survivability, projectile/instant-failure paths, and reward/cost progression.
- `npm run balance:gate` must pass with zero violations. Report details must retain auditable zero-wallet routes and bottleneck explanations.
- Add numeric-display tests for the largest Node12 values and mobile HUD containers.
- Preserve the 53-case Save V2 gate, LW-017 runtime modularization check, targeted Node1-3 browser behavior, and Node1-12 release smoke.

## Required Gates

- `npm run balance:self-check`, `npm run balance:report`, `npm run balance:gate`.
- New power-budget/runtime parity and number-format checks.
- `npm run runtime:modularization:check`, `npm run save:self-check`, `npm run progression:check`, `npm run ability:check`.
- `npm run maturity:self-check`, `npm run maturity:report`; no unsupported hard-cap removal.
- `npm run manifest:check`, `npm run loreweaver:check`, `npm run build`.
- Build before one targeted browser run and one fresh `npm run smoke:node1-12`; preserve first outcomes.
- `npm run check:docs-collab`, `git diff --check`.

## Guardrails

- This is balance/runtime scaling, not active controls, new enemy moves, content, art, or audio; those remain LW-019 onward.
- Do not weaken balance thresholds or mutate the validator to fit current numbers. Threshold changes require reviewer justification tied to player-facing targets.
- Do not erase historical failed reports or rerun a gameplay failure silently.
- Target workspace is partly ignored; inspect named files and preserve unrelated changes.

## Next Action

LW-018 has been completed and verified. Codex or another agent can now claim and start work on LW-019.
