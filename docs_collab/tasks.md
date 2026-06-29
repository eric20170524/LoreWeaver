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

## LW-006: Implement Runtime AssetPipeline Beyond Metadata

- status: verified
- scopeCorrection: 2026-06-28 audit found this task verified runtime wiring, not high-quality generated art production. Going forward, generated bitmap art and runtime pipeline wiring are separate mandatory tasks: `LW-008` then `LW-009`.
- owner: Codex
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `data/workspaces/20260611-060754-719406/assets/imagegen/*`, `data/workspaces/20260611-060754-719406/loreweaver/art-asset-manifest.json`, `data/workspaces/20260611-060754-719406/loreweaver/asset-pipeline.json`, runtime asset loader / resolver paths, gameplay nodes, export template asset copy paths
- invalidates: `gate:asset-pipeline`, `gate:runtime-feature-pack`, `gate:e2e`, `gate:export`, `gate:build`
- requiredGate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`, `npm run build`, `python3 workflow/scripts/run_e2e_test.py --game loreweaver`, export static smoke if export paths change
- doneCriteria:
  - Checked-in generated bitmap atlas or spritesheet assets exist for first-class player, enemies, pickups/projectiles, VFX cues, and at least one setpiece/decoration group.
  - `art-asset-manifest.json` points to real runtime-loadable manifest files and no longer reports `generatedAtlasStatus: not_present` unless the task is explicitly blocked and documented.
  - Runtime rendering uses atlas-first lookup for player, enemies, pickups/projectiles, VFX previews, and Workbench/gameplay previews, with simple procedural fallback last.
  - Runtime exposes expected/loaded counts, manifest load errors, important group keys, and sprite clip coverage for review.
  - Browser evidence proves generated assets appear in actual combat and exported H5, not only in catalog metadata or preview thumbnails.
  - Stale generated/procedural fallback references are removed or documented as intentional fallback policy.
- verificationEvidence:
  - gate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: strict asset-pipeline mode passed with atlas manifest, script manifest, art metadata, and runtime verification records present.
  - gate: `npm run build` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: production build passed after adding export atlas loading and static-export manifest normalization; the existing large-bundle warning remains.
  - gate: `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
    runAt: 2026-06-28
    note: export ZIP included `assets/imagegen/atlas.png`, JSON/script manifests, loaded atlas count, and live survivor_horde player/enemy atlas texture usage with zero console errors.
  - gate: workspace manifest and runtime checks
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: `npm run manifest:build`, `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, and `node --experimental-default-type=module -e "import('./utils/RuntimeSprites.js')"` passed in the reference workspace.
- residualRisk:
  - Atlas art quality and animation richness require `LW-008`; this is now mandatory, not optional polish.
  - Current atlas covers first-node player/enemy/projectile/pickup/VFX keys; later node-specific enemies and richer animation clips still fall back to documented procedural placeholders.

## LW-007: Restore First Node Energy-To-Skill Growth Loop

- status: verified
- owner: Codex
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `src/game/GameRunner.ts`, `data/workspaces/20260611-060754-719406/nodes/node1.js`, `data/workspaces/20260611-060754-719406/js/data.js`, `data/workspaces/20260611-060754-719406/loreweaver/nodes/node-01-dahuang.json`, `data/workspaces/20260611-060754-719406/manifest.json`, `workflow/scripts/run_e2e_test.py`
- invalidates: `gate:e2e`, `gate:runtime-feature-pack`, `gate:first-node-skill-loop`, `gate:gameplay-balance`
- requiredGate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406`, `npm run build`, `python3 workflow/scripts/run_e2e_test.py --game loreweaver`
- doneCriteria:
  - First node has a documented `collectionSource -> growthTrigger -> runtimeMutation -> combatImpact` chain for energy/experience/pickups.
  - Collecting the intended early resource reliably causes at least one visible runtime skill unlock or level increase before failure pressure makes the node unwinnable.
  - Skill growth mutates real combat state such as `activeSkills[].level`, active skill count, cooldown, damage, radius, heal, shield, or equivalent runtime fields.
  - HUD, floating text, VFX, and SFX make the skill change visible; the player is not left with only resource-count feedback.
  - E2E records skill state before and after the growth trigger and asserts that the first node can reach a non-stuck success or controlled retreat path.
  - Balance is tuned so first-node failure is not caused by missing skill growth; remaining failures must be attributable to player action or explicit fail conditions.
- verificationEvidence:
  - gate: `npm run lint` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: TypeScript check passed after adding first-node growth state and E2E assertions.
  - gate: `npm run build` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: production build passed; the existing bundle-size warning remains.
  - gate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: runtime feature pack still passes with first-node growth metadata present; simulator preview warnings remain.
  - gate: `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
    runAt: 2026-06-28
    note: app and static export smoke both asserted first-node growth collection source, skill mutation, combat impact, feedback event, success reward return, and next-node unlock.
  - gate: `python3 -m py_compile workflow/scripts/run_e2e_test.py backend/main.py`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: E2E script and backend Python syntax passed.
- residualRisk:
  - Later nodes may need similar resource-to-skill-loop assertions after the first-node pattern is verified.
  - E2E uses deterministic adapter pickup injection for the growth assertion; manual physics collection remains covered indirectly by adapter smoke rather than a full manual-play path.

## LW-008: Generate Canonical Bitmap Art Assets

- status: verified
- owner: Codex
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `data/workspaces/20260611-060754-719406/assets/imagegen/source/*`, `data/workspaces/20260611-060754-719406/assets/imagegen/atlas.png`, `data/workspaces/20260611-060754-719406/assets/imagegen/provenance.json`, `data/workspaces/20260611-060754-719406/loreweaver/art-asset-manifest.json`, `data/workspaces/20260611-060754-719406/loreweaver/asset-pipeline.json`
- invalidates: `gate:asset-generation`, `gate:asset-pipeline`, `gate:runtime-feature-pack`, `gate:e2e`, `gate:export`, `gate:build`
- requiredGate: generated source images exist with provenance, atlas dimensions and frame keys match manifest, `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`, workspace manifest/runtime checks
- dependsOn: none
- blocks: `LW-009`
- doneCriteria:
  - Generated bitmap art is produced with an explicit generation method and prompt provenance; hand-drawn procedural placeholders do not satisfy this task.
  - Source generated image files are checked into the workspace under `assets/imagegen/source/` or an equivalent tracked project path.
  - `provenance.json` records tool/mode, prompts, generated source paths, final atlas path, frame keys, creation date, and any local post-processing.
  - The final atlas includes first-class player, first-node enemies, boss, pickup, projectile, VFX, and at least one setpiece/decoration frame.
  - `manifest.json` and `manifest.js` frame keys match the generated atlas, and `art-asset-manifest.json` no longer relies on ambiguous `generatedAtlasStatus: present` without source provenance.
  - Existing procedural/canvas art can remain only as documented last-resort fallback and cannot be counted as generated art.
- verificationEvidence:
  - gate: built-in `image_gen` generation plus local atlas slicing
    result: passed
    report: `data/workspaces/20260611-060754-719406/assets/imagegen/provenance.json`
    runAt: 2026-06-28
    note: Generated source sprite sheet was copied into `assets/imagegen/source/`, chroma-keyed to RGBA, sliced into a 4x2 64px-frame runtime atlas, and recorded with prompt, source paths, final atlas path, frame order, dimensions, and SHA-256 hashes.
  - gate: JSON/provenance parse check
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: `provenance.json`, `manifest.json`, `art-asset-manifest.json`, and `asset-pipeline.json` parse as valid JSON.
  - gate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: Strict mode now requires `artAssetGeneration`, `assetPipeline.artAssets.provenancePath`, generated source images, and final atlas provenance.
  - gate: workspace manifest/runtime checks
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, and ES module import of `utils/RuntimeSprites.js` passed in the reference workspace.
- residualRisk:
  - Current generated atlas covers first-node core gameplay art; later node-specific enemies still need broader generated coverage.
  - This pass creates static sprite frames, not full per-action animation sheets.

## LW-009: Wire Generated Art Into Runtime And Export

- status: verified
- owner: Codex
- reviewer: Codex
- patchLevel: L3
- targetArtifact: runtime asset loader / resolver paths, gameplay nodes, Workbench/gameplay previews, export template asset copy paths, E2E browser assertions
- invalidates: `gate:asset-pipeline`, `gate:runtime-feature-pack`, `gate:e2e`, `gate:export`, `gate:build`
- requiredGate: `LW-008` complete, `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`, `npm run build`, `python3 workflow/scripts/run_e2e_test.py --game loreweaver` or documented blocker with targeted browser/runtime smoke
- dependsOn: `LW-008`
- doneCriteria:
  - Runtime rendering uses the generated atlas as the first lookup for player, enemies, boss, pickups/projectiles, VFX, setpieces/decorations, and Workbench/gameplay previews where available.
  - Runtime exposes expected/loaded counts, generated source provenance status, important group keys, manifest errors, and fallback usage.
  - Static export includes generated source provenance and generated atlas/manifest files, not only runtime code.
  - Browser evidence proves generated art appears in actual combat and exported H5; metadata-only or preview-only usage does not satisfy this task.
  - Fallback procedural paths remain last-resort, visibly reported, and are not allowed to mask missing generated assets in strict mode.
- verificationEvidence:
  - gate: `npm run build` in `LoreWeaver`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: Root production build passed with the known large-bundle warning.
  - gate: workspace `npm run build`
    result: passed
    report: n/a
    runAt: 2026-06-28
    note: Workspace Vite build passed after aligning the build target with the existing top-level-await data loader.
  - gate: `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
    runAt: 2026-06-28
    note: E2E verified app and static export smoke, generated atlas loading, generated provenance reporting, exported `assets/imagegen/provenance.json`, exported source image, live atlas-backed survivor_horde player/enemy textures, and first-node growth assertions.
  - gate: `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline`
    result: passed
    report: `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
    runAt: 2026-06-28
    note: Strict asset pipeline gate passed with runtime art provenance requirements enabled.
- residualRisk:
  - Later node-specific enemies may still need broader art coverage after the first-node generated art pass.
  - E2E proves runtime atlas usage for current runtime-ready cards; it still does not automatically play every narrative node.
