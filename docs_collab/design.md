# LoreWeaver Path-Standard Delivery Design

> Maintained by Codex for the local Codex / Antigravity workflow. This file records current repo facts, scoped tasks, patch levels, and validation gates for moving LoreWeaver toward the Path_to_Immortality delivery standard.

## Current Facts

- `LoreWeaver` already has a workbench shell, workspace persistence, manifest editing, Phaser emulator, gameplay cards, and runtime gates.
- The active reference workspace for this goal is `LoreWeaver/data/workspaces/20260611-060754-719406`.
- That workspace has 12 nodes, runtime feature catalogs, split `loreweaver/*.json` artifacts, and playable node/runtime source files.
- Root `npm run check:runtime-feature-pack` now selects the latest valid workspace when no explicit workspace is supplied.
- Strict `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline` passes with asset pipeline metadata present.
- `npm run loreweaver:check` inside the reference workspace accepts dynamically generated `ENEMY_VISUAL_DESIGN`.
- `npm run ability:check` inside the reference workspace runs on Node 20 after JSON import attributes were added.
- `python3 workflow/scripts/run_e2e_test.py --game loreweaver` now covers the app runtime matrix and an extracted static H5 export smoke.

## Delivery Definition

The LoreWeaver version of the Path standard means:

- A generated/imported workspace has a complete mainline with 12-17 playable nodes.
- Every node declares `gameplay.cardId`, modifiers or knobs, story hooks, rewards, and next unlock behavior.
- Playable nodes return normalized results that can flow back into store progression.
- Gates cover build, lint, runtime feature pack, workspace-specific runtime checks, and smoke E2E.
- Mature workspaces include an asset pipeline contract covering ability VFX/voice, generated art, audio manifests, provenance, and browser verification.
- Export produces a complete static H5 playable bundle with embedded manifest, built assets, workspace source directories, and a static-server smoke.

## Recommended Slices

### Slice A: Gate Reliability Baseline

- Owning role: Gate Runner
- Patch level: L2 for docs and gate behavior; L3 if runtime script loading changes affect app execution.
- Target artifacts:
  - `docs_collab/*`
  - `workflow/scripts/check_runtime_feature_pack.mjs`
  - `data/workspaces/20260611-060754-719406/js/data.js`
  - `data/workspaces/20260611-060754-719406/scripts/check-loreweaver-runtime.mjs`
- Expected invalidation: `gate:runtime-feature-pack`, `gate:workspace-runtime`, `gate:ability-progression`, `gate:build`
- Required gates:
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run check:runtime-feature-pack`
  - `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`
  - `npm run lint`
  - `npm run build`

### Slice B: Asset Pipeline Contract Closure

- Owning role: Asset Pipeline Producer
- Patch level: L2 metadata; L3 only if runtime loaders are changed.
- Target artifacts:
  - `data/workspaces/20260611-060754-719406/loreweaver/asset-pipeline.json`
  - `data/workspaces/20260611-060754-719406/loreweaver/workbench.json`
  - optional generated manifest or credits files when real assets exist
- Required gate:
  - `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`

### Slice C: Node Runtime Matrix

- Owning role: Gameplay Librarian and Core Shell Engineer
- Patch level: L2 for gameplay card assignment and modifiers; L3 for adapter/container work.
- Target artifacts:
  - `src/game/GameRunner.ts`
  - `src/utils/gameplayManifest.ts`
  - `docs/gameplay_cards/*`
  - workspace `manifest.json`
- Required gates:
  - `npm run lint`
  - `npm run build`
  - `python3 workflow/scripts/run_e2e_test.py --game loreweaver`

### Slice D: Playable Export

- Owning role: Core Shell Engineer and Compliance Reviewer
- Patch level: L3/L4
- Target artifacts:
  - `backend/main.py`
  - export templates or generated workspace source files
  - export smoke tests
- Required gates:
  - build gate
  - unzip/static-server smoke test
  - content safety scan

## Validation Notes

- Visual audit failures must be treated carefully. A `1x1` screenshot or `hasMeaningfulPixels=false` means the capture path failed before any visual judgment is meaningful.
- Do not weaken gate criteria to pass this goal. Fix false negatives and missing production artifacts separately.
- Do not reintroduce protected IP text or specific fanwork expression into public export surfaces without explicit human approval and compliance review.
- Remaining warnings after completion are `floatingSimulatorPreview`, `simulatorFullscreenPreview`, and the root build's large bundle warning.
