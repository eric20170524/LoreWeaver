# LoreWeaver Path-Standard Tasks

## LW-001: Repair Gate Reliability Baseline

- status: verified
- owner: Codex
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `workflow/scripts/check_runtime_feature_pack.mjs`, `data/workspaces/20260611-060754-719406/js/data.js`, `data/workspaces/20260611-060754-719406/scripts/check-loreweaver-runtime.mjs`
- invalidates: `gate:runtime-feature-pack`, `gate:workspace-runtime`, `gate:ability-progression`, `gate:build`
- requiredGate: `npm run loreweaver:check`, `npm run ability:check`, `npm run check:runtime-feature-pack`, `npm run lint`, `npm run build`
- doneCriteria:
  - Root `npm run check:runtime-feature-pack` resolves to the latest valid workspace when no explicit workspace is supplied.
  - Workspace `npm run loreweaver:check` accepts dynamically generated `ENEMY_VISUAL_DESIGN` records backed by `enemy-design-catalog.json`.
  - Workspace `npm run ability:check` runs on Node 20 without JSON import assertion failure.
  - Baseline false negatives are fixed without weakening the later strict asset pipeline gate.
- verificationEvidence:
  - gate: `npm run loreweaver:check` in `LoreWeaver/data/workspaces/20260611-060754-719406`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: runtime contract check passed for the reference workspace.
  - gate: `npm run ability:check` in `LoreWeaver/data/workspaces/20260611-060754-719406`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: Node 20 import attributes no longer block the ability progression check.
  - gate: `npm run check:runtime-feature-pack` in `LoreWeaver`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: root gate selected `data/workspaces/20260611-060754-719406`.
  - gate: `npm run lint`, `npm run build` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: TypeScript check and production build passed; build keeps the known large-bundle warning.
- residualRisk:
  - Runtime feature pack still recommends fresh `floatingSimulatorPreview` and `simulatorFullscreenPreview`.

## LW-002: Add Strict Asset Pipeline Metadata For Reference Workspace

- status: verified
- owner: Codex
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `data/workspaces/20260611-060754-719406/loreweaver/asset-pipeline.json`, `data/workspaces/20260611-060754-719406/loreweaver/workbench.json`
- invalidates: `gate:runtime-feature-pack`, `gate:asset-pipeline`
- requiredGate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`
- doneCriteria:
  - `asset-pipeline.json` contains ability VFX/voice, art asset, audio asset, provenance, runtime hook, and verification metadata.
  - Related `workbench.artifactStatus` pipeline keys are `fresh`, `approved`, or `validated`.
  - Strict runtime feature pack gate passes for the reference workspace.
- verificationEvidence:
  - gate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: strict asset pipeline mode passed with asset metadata present.
  - gate: JSON parse check for `asset-pipeline.json` and `art-asset-manifest.json`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: added metadata artifacts parse cleanly.
- residualRisk:
  - Asset metadata records current procedural/WebAudio/visual fallback bindings; production bitmap atlases, external BGM, and voice assets remain future work.

## LW-003: Define Node Runtime Matrix And Story/Reward Binding

- status: verified
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: reference workspace `manifest.json`, `loreweaver/nodes/*`, `src/utils/gameplayManifest.ts`
- invalidates: `gate:runtime-feature-pack`, `gate:e2e`
- requiredGate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406`, `npm run lint`, `npm run build`
- doneCriteria:
  - Every node has card id, knobs/modifiers, story beat, reward, and next unlock metadata.
  - Nodes do not all collapse to `survivor_horde`; at least iframe, rhythm, drag/grid, sequence, and turn-based cards have an explicit runtime or bridge plan.
  - Reward metadata can be mapped into a normalized `NodeResult`.
- verificationEvidence:
  - gate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: node catalogs, gameplay card assignments, and feature pack records validated.
  - gate: `npm run lint`, `npm run build` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: normalized reward types and runtime bindings compile.
- residualRisk:
  - Browser smoke verification targets the runtime-ready Phaser cards; sequence, turn-based, and iframe entries remain bridge-plan coverage.

## LW-004: Add Multi-Node Smoke E2E Matrix

- status: verified
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `workflow/scripts/run_e2e_test.py`, runtime test hooks, reports
- invalidates: `gate:e2e`, `gate:visual-audit`
- requiredGate: `python3 workflow/scripts/run_e2e_test.py --game loreweaver`
- doneCriteria:
  - Smoke flow covers main screen, node entry, success, retreat/failure, reward return, next unlock, and save restore.
  - Each `runtime_ready` gameplay card has at least one 5-10 second smoke.
  - Screenshots are nonblank and meaningful before visual audit is trusted.
- verificationEvidence:
  - gate: `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
    runAt: 2026-06-28
    note: app runtime smoke covered nonblank canvas, `survivor_horde` success/reward/unlock/save restore, `rhythm_timing` retreat, and `drag_collect_grid` retreat.
  - gate: `venv/bin/python -m py_compile LoreWeaver/workflow/scripts/run_e2e_test.py LoreWeaver/backend/main.py`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: E2E and export backend Python syntax passed.
- residualRisk:
  - E2E uses runtime hooks for deterministic smoke coverage rather than manually clicking every node card.

## LW-005: Add Full Static H5 Playable Export

- status: verified
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: `backend/main.py`, export templates, generated workspace source tree
- invalidates: `gate:export`, `gate:e2e`, `gate:content-safety`
- requiredGate: build gate plus unzip/static-server export smoke
- doneCriteria:
  - Export contains a runnable `index.html`, `scenes/`, `nodes/`, `js/`, `systems/`, `loreweaver/`, assets, and manifest.
  - Export smoke can open the main screen, enter at least three nodes, complete or retreat, and verify reward return.
  - Export README clearly distinguishes preview shell exports from full playable exports.
- verificationEvidence:
  - gate: `npm run build` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: production assets were rebuilt before export smoke; build keeps the known large-bundle warning.
  - gate: `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
    runAt: 2026-06-28
    note: export ZIP shape and extracted static-server runtime smoke passed with zero console errors.
- residualRisk:
  - Export smoke verifies the three runtime-ready cards, not all 12 narrative nodes.
