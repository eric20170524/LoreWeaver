# Review Request

- taskId: `LW-001`, `LW-002`, `LW-003`, `LW-004`, `LW-005`
- author: Codex / Antigravity
- status: ready_for_final_review

## Changed Files

- `LoreWeaver/backend/main.py`
- `LoreWeaver/server.ts`
- `LoreWeaver/src/components/WorkspaceSelector.tsx`
- `LoreWeaver/src/game/GameRunner.ts`
- `LoreWeaver/src/store.tsx`
- `LoreWeaver/src/types.ts`
- `LoreWeaver/src/utils/RewardApplier.ts`
- `LoreWeaver/workflow/scripts/check_runtime_feature_pack.mjs`
- `LoreWeaver/workflow/scripts/run_e2e_test.py`
- `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
- `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
- `LoreWeaver/docs_collab/*`
- `LoreWeaver/data/workspaces/20260611-060754-719406/**/*` (git-ignored local deliverable files)

## Diff Summary

- Fixed runtime feature-pack workspace selection, Node 20 JSON imports, and dynamic enemy visual checks.
- Added strict asset pipeline metadata, art manifest, audio provenance, and workbench artifact statuses.
- Added normalized `NodeResult` reward application and runtime bindings for the active Phaser gameplay cards.
- Expanded LoreWeaver E2E to cover app runtime, success/reward/unlock, retreat, save restore, ZIP export shape, and extracted static H5 export runtime.
- Upgraded export packaging to include built assets, workspace `nodes/`, `scenes/`, `js/`, `systems/`, `loreweaver/`, `core/lib/`, embedded manifest, and a README that distinguishes full playable export from fallback preview shell.
- Added static-export mode handling so the exported app does not call backend workspace APIs.
- Added `npm run check:docs-collab` so verified task status must include verification evidence and matching review records.

## Commands Run

- `npm run loreweaver:check` in `LoreWeaver/data/workspaces/20260611-060754-719406`
- `npm run ability:check` in `LoreWeaver/data/workspaces/20260611-060754-719406`
- `npm run manifest:build` in `LoreWeaver/data/workspaces/20260611-060754-719406`
- `npm run manifest:check` in `LoreWeaver/data/workspaces/20260611-060754-719406`
- `venv/bin/python -m py_compile LoreWeaver/workflow/scripts/run_e2e_test.py LoreWeaver/backend/main.py`
- `npm run lint` in `LoreWeaver`
- `npm run build` in `LoreWeaver`
- `npm run check:runtime-feature-pack` in `LoreWeaver`
- `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline` in `LoreWeaver`
- `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver`
- `npm run check:docs-collab` in `LoreWeaver`

## Result Summary

- App E2E passed with zero console errors.
- Static H5 export smoke passed after unzip and local static serving.
- Export smoke opened the embedded app, verified nonblank canvas, completed `survivor_horde`, retreated `rhythm_timing`, and retreated `drag_collect_grid`.
- Lint, build, default runtime feature pack, and strict asset-pipeline runtime feature pack passed.
- Docs collaboration evidence check passed for 5/5 verified tasks.

## Known Risks

- Workspace files under `data/workspaces/20260611-060754-719406` are git-ignored even though they are part of this local deliverable.
- Root build still warns that the main JS bundle is larger than 500 kB.
- Runtime feature pack still recommends fresh `floatingSimulatorPreview` and `simulatorFullscreenPreview`.

## LW-007 Review Request

- agent: Codex
- task: `LW-007`
- status: needs_review
- patchLevel: L3
- changedFiles: `src/game/GameRunner.ts`, `workflow/scripts/run_e2e_test.py`, `data/workspaces/20260611-060754-719406/nodes/node1.js`, `data/workspaces/20260611-060754-719406/js/data.js`, `data/workspaces/20260611-060754-719406/loreweaver/nodes/node-01-dahuang.json`, `data/workspaces/20260611-060754-719406/manifest.json`, `docs_collab/*`, runtime reports
- diffSummary: Added first-node growth state, HUD/test-hook publishing, deterministic E2E pickup assertions, workspace node EXP-to-skill mutation, and planning metadata for `collectionSource -> growthTrigger -> runtimeMutation -> combatImpact`.
- implementationNotes: The app adapter now upgrades `primordial_fist` to Lv.2 after two early beast-essence score pickups and mutates `adapter.config.weapon.bulletDamage`; the reference workspace node mirrors the pattern through early EXP thresholds.
- commandsRun: `npm run lint`; `npm run build`; `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406`; `python3 -m py_compile workflow/scripts/run_e2e_test.py backend/main.py`; `venv/bin/python workflow/scripts/run_e2e_test.py --game loreweaver`
- gates: all listed commands passed; E2E passed for app and static export growth assertions with zero console errors.
- skippedGates: strict asset pipeline runtime implementation gate is outside LW-007 and remains tracked as `LW-006`.
- knownRisks: deterministic adapter pickup injection verifies the resource-to-skill contract, while manual pointer-driven pickup play is still represented by adapter smoke coverage.
- reviewer: Codex

## LW-006 Review Request

- agent: Codex
- task: `LW-006`
- status: needs_review
- patchLevel: L3
- changedFiles: `src/game/GameRunner.ts`, `src/store.tsx`, `backend/main.py`, `workflow/scripts/run_e2e_test.py`, `data/workspaces/20260611-060754-719406/assets/imagegen/*`, `data/workspaces/20260611-060754-719406/utils/RuntimeSprites.js`, `data/workspaces/20260611-060754-719406/nodes/node1.js`, `data/workspaces/20260611-060754-719406/loreweaver/art-asset-manifest.json`, `data/workspaces/20260611-060754-719406/loreweaver/asset-pipeline.json`, `data/workspaces/20260611-060754-719406/manifest.json`, runtime reports
- diffSummary: Added atlas-first static-export texture loading, workspace asset copying into export ZIPs, browser/runtime art status assertions, workspace RuntimeSprites atlas slicing, and split metadata updates.
- implementationNotes: Static export now loads `assets/imagegen/manifest.json` and `atlas.png`, slices frames into Phaser texture keys used by `SurvivorHordeAdapter`, and reports `window.__LOREWEAVER_ART_PIPELINE__`; workspace node1 mirrors atlas-first lookup through `window.__DAHUANG_ART_PIPELINE__`.
- commandsRun: `npm run lint`; `npm run build`; `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`; workspace `npm run manifest:build`; workspace `npm run manifest:check`; workspace `npm run loreweaver:check`; workspace `npm run ability:check`; `venv/bin/python workflow/scripts/run_e2e_test.py --game loreweaver`
- gates: all listed commands passed; E2E confirmed export atlas files, loaded atlas count, and live atlas-backed player/enemy textures with zero console errors.
- skippedGates: none for LW-006.
- knownRisks: current atlas is mechanically wired but visually basic and covers the first-node core set; later node-specific enemies and richer animation clips need a future art pass.
- reviewer: Codex
