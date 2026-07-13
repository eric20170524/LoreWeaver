# Handoff

## Current Handoff

- agent: Antigravity
- requirementId: REQ-20260711-001
- iteration: 1
- task: `LW-016: Backward-Compatible Save V2 And Result Contract`
- status: in_progress
- patchLevel: L4
- owner: Antigravity
- reviewer: Codex
- preferredImplementationModel: `gpt-5.6-terra`
- activeImplementationModel: `gpt-5.6-sol` fallback because Terra hit the current usage limit
- dependsOn: `LW-014` verified
- sourceReview: `LoreWeaver/docs_collab/review.md#lw-015-review-2`
- humanAuthorization: The human repeatedly instructed the established task graph to continue autonomously; this authorizes the planned reversible v1-to-v2 migration, not destructive reset or data deletion.

## Objective

Introduce a backward-compatible save v2 and one trustworthy result-application contract. Preserve every valid v1 progression value while making attempts, first clears, best records, stars, build snapshots, flags, challenges, settings, rewards, unlocks, and completion statistics explicit and idempotent.

## Required Model

- Define and document the v2 schema before mutating runtime integration. Unknown valid legacy fields must survive migration under a lossless legacy/diagnostic path rather than being discarded.
- Before migration, preserve a versioned backup of the raw prior save. Migration must be idempotent, observable, and safe to retry after interruption.
- Fixture coverage must include default v1, realistic progressed v1, maximal resources/perks/abilities/unlocks/results, partially missing fields, unknown extra fields, malformed JSON, wrong scalar/object types, already-v2, and repeated migration.
- Corrupt-save recovery must not silently overwrite the only original bytes. Preserve the corrupt payload or a recovery diagnostic and initialize a safe v2 state separately.
- Add explicit schemas/defaults for `attempts`, `firstClear`, `bestResult`, `stars`, `buildSnapshot`, `flags`, `challengeResults`, and user `settings`.
- Centralize result application. First-clear rewards and unlocks are idempotent; repeat-clear, failure, retreat, and challenge rewards have separate policies. Attempts may increment per completed attempt, while total clears/completion statistics increment only for the correct unique event.
- NodeBridge, Node1 end-game payload, GameOver display/return, and Store persistence must agree on result reason, success, reward, first-clear, retry, and best-result semantics.
- Never add a destructive reset or delete a user's existing save as a migration convenience. If a legacy field cannot be interpreted losslessly, stop and raise one concrete human decision.

## Required Evidence

- Add deterministic migration/result-idempotency tests and `reports/save_migration_latest.json` compatible with the strict maturity evidence validator.
- Prove v1-to-v2 value preservation, backup presence, already-v2 no-op/idempotency, corrupt-save recovery, first-clear double-submit protection, repeat/failure separation, and result replay/idempotency.
- Report summary values must be recomputed from fixture/scenario details. Failed fixtures cannot be hidden by a top-level passed status.

## Required Gates

- Save migration fixtures/report and result idempotency tests.
- `npm run progression:check`, `npm run balance:self-check`, `npm run maturity:self-check`, `npm run maturity:report`.
- `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`.
- Build before fresh `npm run smoke:node1-12`; record any Node12 timing race rather than rerunning silently.
- `npm run check:docs-collab`, `git diff --check`.

## Risks

- Store initialization currently owns the offline timestamp defect. Save migration must not accidentally claim to repair offline income unless it explicitly preserves the prior timestamp before initialization and invalidates balance/progression evidence accordingly.
- Result calls may currently be duplicated between Node scene, NodeBridge, and GameOver paths. Tests must exercise repeated identical payloads and distinct attempts.
- The target workspace is partly ignored. Inspect named files and reports directly; preserve unrelated user/Codex changes.

## Next Action

Antigravity implements fixture-first save v2 migration and the result contract, runs every required gate, records any ambiguous legacy field instead of deleting it, and returns LW-016 to `needs_review`. LW-017 remains unclaimed.
