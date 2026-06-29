# LoreWeaver Collaboration State

- activeGoal: `LoreWeaver/docs_collab/tasklist_goal.md`
- activeWorkspace: `LoreWeaver/data/workspaces/20260611-060754-719406`
- currentTask: `none`
- currentOwner: none
- lastUpdated: 2026-06-29

## Current Findings

- Root runtime feature pack gate checks `LoreWeaver/` by default and fails on missing root artifacts (fixed in LW-001).
- Reference workspace runtime check false-fails on dynamic `ENEMY_VISUAL_DESIGN` (fixed in LW-001).
- Reference workspace ability progression check still fails under Node 20 because `js/data.js` imports JSON without an import attribute (fixed in LW-001).
- Strict asset pipeline mode correctly fails because the reference workspace has no `loreweaver/asset-pipeline.json` or pipeline artifact status keys (fixed in LW-002).
- Node gameplay mapping completed, featuring dynamic Phase Phaser modes and iframe wrappers for decoupled HTML5 execution (fixed in LW-003).
- E2E smoke tests successfully cover Phaser adapters (`survivor_horde`, `rhythm_timing`, `drag_collect_grid`) and confirm state progression, resource rewards, next unlock, and save/restore flows (fixed in LW-004).
- Standalone H5 export verification succeeds after unzip/static-server launch; the export contains `index.html`, `assets/`, `nodes/`, `scenes/`, `js/`, `systems/`, `loreweaver/`, `core/lib/`, and `manifest.json`, and the exported app can enter three runtime cards (fixed in LW-005).
- Collaboration status drift is guarded by `npm run check:docs-collab`, which requires verified tasks to include `verificationEvidence`, run dates, report fields, and matching review sections.
- Runtime bitmap atlas wiring is present for export and workspace runtimes: the static H5 package carries `assets/imagegen/*`, reports atlas loaded counts, and survivor_horde uses atlas-backed player/enemy textures (fixed in LW-006).
- First-node energy collection now mutates runtime skill state and combat damage in the app adapter and reference workspace node; E2E asserts the growth loop in app and static export smoke (fixed in LW-007).
- Generated bitmap art is now a separate mandatory step before pipeline wiring: the reference workspace includes built-in imagegen source art, chroma-keyed RGBA source, runtime atlas, and `assets/imagegen/provenance.json` (fixed in LW-008).
- Workbench live runtime and static export art wiring now report generation status and provenance; E2E asserts app-side atlas load, live survivor_horde atlas-backed player/enemy textures, exported source/provenance files, and static runtime `generated_with_builtin_imagegen` status (fixed in LW-009).
- Remaining non-blocking warnings: root build bundle size over 500 kB; runtime feature pack recommends fresh `floatingSimulatorPreview` and `simulatorFullscreenPreview`.

## Next Recommended Action

All tracked `LW-001` through `LW-009` tasks are verified. Next optional polish is bundle splitting, broader per-node generated art coverage, full action animation sheets, and simulator preview status.
