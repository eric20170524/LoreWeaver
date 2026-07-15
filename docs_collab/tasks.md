# Tasks

## LW-001: Node1 Mobile Movement And Test State

- status: verified
- requirementId: REQ-20260706-001
- iteration: 1
- iterationGoal: 主路径可用
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js`
- sourceReview: n/a
- invalidates: `gate:workspace-build`, `gate:node-runtime-smoke`
- requiredGate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`, `target workspace Playwright smoke`
- doneCriteria:
  - Keyboard/WASD movement remains working.
  - Touch or pointer drag movement works in 720x1280 mobile viewport without requiring keyboard input.
  - Touch movement has visible feedback or a stable movement mode state suitable for E2E.
  - Movement input does not trigger while LevelUpScene or retreat confirmation is active.
  - A stable runtime test hook exposes current node id, scene key, movement mode, hp, kills, level, active skill ids/levels, rewards, and first-node growth status.
  - Pointer/test state is cleaned or marked inactive when leaving the node.
- verificationEvidence:
  - gate: `npm run manifest:check`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Workspace manifest check reported `manifest.json is up to date`.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: LoreWeaver runtime contract check passed for 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Ability progression check passed for the configured ability chain.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-06
    note: Vite built 37 modules successfully; warning only for deprecated CJS Vite Node API.
  - gate: `target workspace Playwright smoke`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: At `http://127.0.0.1:18081/index.html`, Node1 test hook was present; pointer drag set `movementMode: "touch-drag"`, `touch.active: true`, moved player from `(1080, 1920)` to about `(1287, 1692)`, then returned to idle after release.
- residualRisk:
  - Runtime art and audio remain thin; they move to later iteration tasks.

## LW-002: Node2 Chest Channeling Risk Reward

- status: verified
- requirementId: REQ-20260706-001
- iteration: 1
- iterationGoal: 主路径可用
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node2.js`
- sourceReview: `LW-002 Codex smoke found pureBlood stayed 0 after channel duration; Antigravity fixed interrupt and risk spawn behavior.`
- invalidates: `gate:workspace-build`, `gate:node-runtime-smoke`
- requiredGate: `npm run build`, `target workspace Playwright smoke`
- doneCriteria:
  - Chests require an uninterrupted stay/channel duration before opening.
  - Leaving range or taking damage interrupts or regresses channeling with visible feedback.
  - Opened chest reward is observable in `rewards` and test hook state.
  - Chest area creates risk-reward pressure through enemy spawn or aggro behavior.
  - Mechanic state is included in the Node test hook.
- verificationEvidence:
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-06
    note: Post-fix target workspace build completed; Vite built 37 modules successfully.
  - gate: `target workspace Playwright smoke`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Node2 smoke on `127.0.0.1:18081` started `chestChanneling` with progress `736.71`, finished with `isChanneling: false`, and exposed `rewards.pureBlood = 1` with no page errors.
- residualRisk:
  - Chest reward quantity and enemy pressure tuning still need playtest balancing.

## LW-003: Node3 Rival Pressure And Break Window

- status: verified
- requirementId: REQ-20260706-001
- iteration: 1
- iterationGoal: 主路径可用
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node3.js`
- sourceReview: n/a
- invalidates: `gate:workspace-build`, `gate:node-runtime-smoke`
- requiredGate: `npm run build`, `target workspace Playwright smoke`
- doneCriteria:
  - Node3 has a visible rival-pressure meter or phase state before boss entry.
  - Boss/rival has at least one readable telegraph and one break/weakness window.
  - Failure reason or pressure-overflow reason is visible and included in result/test state.
  - Victory reward/unlock intent remains tied to `dual_pupil`.
  - Mechanic state is included in the Node test hook.
- verificationEvidence:
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-06
    note: Post-fix target workspace build completed; Vite built 37 modules successfully.
  - gate: `target workspace Playwright smoke`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Node3 hook exposed `rivalPressure`; pressure rose from `2` to `8.4`, manual boss spawn exposed `bossState: "normal"`, and manual telegraph exposed `bossState: "telegraphing"` plus `breakWindowActive: true` with no page errors.
- residualRisk:
  - Boss timing, difficulty, and final art identity still need mobile playtest tuning.

## LW-004: Node1-3 Experience QA Gate

- status: verified
- requirementId: REQ-20260706-001
- iteration: 1
- iterationGoal: 主路径可用
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `minigame_master/workflow/scripts/run_e2e_test.py`
- sourceReview: `LW-001`, `LW-002`, `LW-003`
- invalidates: `gate:e2e`
- requiredGate: `target workspace Playwright smoke for nodes 1-3`, `npm run check:docs-collab`
- doneCriteria:
  - Node1 test asserts touch/drag movement changed player position or movement mode.
  - Node1 test asserts early growth skill mutation or active skill state.
  - Node2 test asserts chest channel state and opened reward state.
  - Node3 test asserts rival pressure/phase state and no console errors.
  - Failure logs include scene, node, last action, console errors, and screenshot path if Playwright is used.
- verificationEvidence:
  - gate: `target workspace Playwright smoke for nodes 1-3`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Codex directly verified Node1 touch movement, Node2 channel reward, and Node3 rival pressure/telegraph state against the target workspace dev server.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Docs collaboration evidence check passed: 4/5 tasks verified with evidence.
- residualRisk:
  - `minigame_master/workflow/scripts/run_e2e_test.py` now contains stronger assertions for the tracked source mirror; the ignored target workspace was verified by direct Playwright smoke in this review.

## LW-005: Mobile HUD And Visual QA Pass

- status: verified
- requirementId: REQ-20260706-001
- iteration: 2
- iterationGoal: 完整性与移动端体验
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406`
- sourceReview: `LW-001`, `LW-002`, `LW-003`, `LW-004`
- invalidates: `gate:workspace-build`, `gate:mobile-visual-smoke`
- requiredGate: `npm run build`, `mobile screenshot smoke for Node1-3`
- doneCriteria:
  - 720x1280 mobile screenshots show no incoherent overlap among HUD, retreat controls, virtual joystick, level-up UI, channel bar, and pressure HUD.
  - Node2 chest channel bar remains readable while enemies pressure the player.
  - Node3 pressure HUD and telegraph/break feedback are visible without hiding player or boss state.
  - Any art/audio placeholders discovered in Node1-3 are cataloged into follow-up tasks with target files and priority.
- verificationEvidence:
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-06
    note: Post-LW-005 target workspace build completed; Vite built 37 modules successfully.
  - gate: `mobile screenshot smoke for Node1-3`
    result: passed
    report: `LoreWeaver/docs_collab/screenshots/lw005_node1_mobile.png`, `LoreWeaver/docs_collab/screenshots/lw005_node2_mobile.png`, `LoreWeaver/docs_collab/screenshots/lw005_node3_mobile.png`
    runAt: 2026-07-06
    note: Codex captured 720x1280 Node1 HUD/joystick, Node2 channel bar, and Node3 pressure/telegraph screenshots; no page errors.
  - gate: `Node2 stop/return MainScene smoke`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Antigravity and Codex both verified Node2 scene stop/return no longer throws pageerror, and the flow can continue into Node3 telegraph state.
- residualRisk:
  - This task does not complete full Node4-12 content maturity, asset/audio expansion, or public IP cleanup.

## LW-006: Node1-3 Asset And Audio Coverage Pass

- status: verified
- requirementId: REQ-20260706-001
- iteration: 2
- iterationGoal: 完整性与移动端体验
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/utils/RuntimeSprites.js`, `LoreWeaver/data/workspaces/20260611-060754-719406/utils/AudioManager.js`
- sourceReview: `LW-005`
- invalidates: `gate:workspace-build`, `gate:mobile-visual-smoke`
- requiredGate: `npm run build`, `mobile screenshot smoke for Node1-3`
- doneCriteria:
  - Identify Node1-3 placeholder/procedural visuals and missing audio cues that most reduce perceived maturity.
  - Improve at least one high-impact visual/audio coverage or observability gap without broadening into a full 12-node asset rewrite.
  - Keep generated or added assets documented with file paths, purpose, and license/provenance assumptions.
  - Preserve Node1-3 runtime hooks and previous smoke assertions.
- verificationEvidence:
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-06
    note: Post-LW-006 target workspace build completed; Vite built 37 modules successfully.
  - gate: `browser art/audio hook smoke`
    result: passed
    report: n/a
    runAt: 2026-07-06
    note: Antigravity browser smoke read `window.__DAHUANG_ART_PIPELINE__` and `window.__DAHUANG_AUDIO_PIPELINE__`; atlas loaded, Node1 atlas coverage was 100%, Node2/Node3 missing atlas keys were readable, audio mode was `webaudio_synth`, cue count was 19, and no page or console errors were reported.
- residualRisk:
  - This task exposes and catalogs gaps; actual Node2/Node3 replacement atlas art, BGM, voice, and external SFX are deferred to follow-up work.

## LW-007: Node2-3 Atlas Replacement Slice

- status: verified
- requirementId: REQ-20260706-001
- iteration: 2
- iterationGoal: 完整性与移动端体验
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/assets/imagegen`, `LoreWeaver/data/workspaces/20260611-060754-719406/utils/RuntimeSprites.js`
- sourceReview: `LW-006`
- invalidates: `gate:workspace-build`, `gate:mobile-visual-smoke`
- requiredGate: `npm run build`, `browser art-pipeline smoke`, `mobile screenshot smoke for changed Node2/Node3 state`
- doneCriteria:
  - Replace at least two high-priority Node2/Node3 procedural fallback texture keys with generated or curated atlas-backed bitmap frames.
  - Update manifest/provenance records so new bitmap assets are source-traceable and project-bound.
  - Ensure `window.__DAHUANG_ART_PIPELINE__` shows improved Node2 or Node3 atlas coverage.
  - Capture mobile screenshots showing the changed runtime assets in gameplay.
- verificationEvidence:
  - gate: `Codex draft atlas static check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Target and tracked mirror atlas images are now 256x192; both manifests expose `chest_gold` and `boss_projectile` with 64x64 frames at row 3.
  - gate: `Codex draft atlas coverage static check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Static Node1-3 coverage calculation confirmed `chest_gold` and `boss_projectile` are no longer missing atlas keys; remaining Node2/Node3 missing keys are enemy/boss character sprites.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-07
    note: Codex draft build passed after atlas, manifest, provenance, and runtime texture hookup changes.
  - gate: `npm run manifest:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Manifest build check still reports `manifest.json is up to date`.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: LoreWeaver runtime contract check still passes for 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Ability progression check still passes after the atlas draft.
  - gate: `browser art-pipeline smoke`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Antigravity Playwright smoke read `window.__DAHUANG_ART_PIPELINE__`; `atlasLoaded` was true, Node2 `atlasFrameKeys` included `chest_gold`, Node3 `atlasFrameKeys` included `boss_projectile`, both keys were absent from node and gap missing-atlas lists, `loadedKeys` included both keys after runtime triggers, and `fallbackKeys` excluded both keys. No page errors.
  - gate: `mobile screenshot smoke for changed Node2/Node3 state`
    result: passed
    report: `LoreWeaver/docs_collab/screenshots/lw007_node2_mobile.png`, `LoreWeaver/docs_collab/screenshots/lw007_node3_mobile.png`
    runAt: 2026-07-07
    note: Captured 720x1280 screenshots showing Node2 chest state and Node3 boss projectile/telegraph state.
- residualRisk:
  - This task adopts the atlas replacement for chest and boss projectiles; remaining character sprites for Node2/Node3 enemies are still fallback and deferred to later passes.

## LW-008: Public Share IP And Progression Hardening Plan

- status: verified
- requirementId: REQ-20260706-001
- iteration: 3
- iterationGoal: 验收与公开导出风险收束
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406`, `minigame/perfectworld_dahuang`, `LoreWeaver/workflow/scripts/content_safety_scan.mjs`
- sourceReview: `LW-007`
- invalidates: `gate:content-safety`, `gate:workspace-build`
- requiredGate: `node LoreWeaver/workflow/scripts/content_safety_scan.mjs`, `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`, `npm run check:docs-collab`
- doneCriteria:
  - Scan the target workspace and tracked source mirror for public-share IP risks: concrete names, locations, factions, flavor text, and branded/lore-specific references.
  - Produce a bounded rename/originalization map for high-risk public strings without breaking runtime ids or save/contracts.
  - Apply the safest first cleanup slice to user-facing text only, or explicitly defer code-id/schema changes as L3 follow-up if they would affect contracts.
  - Preserve Node1-3 verified gameplay hooks, atlas coverage evidence, and build/runtime checks.
- verificationEvidence:
  - gate: `content safety scan`
    result: passed
    report: `LoreWeaver/workflow/reports/content_safety_scan_latest.json`
    runAt: 2026-07-07
    note: Final scan returned `passed_with_notes` with 0 warnings and 145 notes; surfaces covered target workspace, tracked mirror, shared export runtime, and generated LoreWeaver app dist.
  - gate: `public text originality spot check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: High-priority public entry, Node1-3, store/passive display, project, and mirror files no longer hit `完美世界|石昊|石毅|安澜|火灵儿|百断山|虚神界|鲲鹏|至尊骨|重瞳|柳神|他化自在|雷帝` in the scoped spot-check command.
  - gate: `npm run manifest:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Target workspace manifest check reported `manifest.json is up to date` after rebuilding from split LoreWeaver files.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: LoreWeaver runtime contract check passed for 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Ability progression check passed for `原始真解 / 青枝赐护 / 雷吼骨术 / 青鳞鹰宝术 / 紫曜瞳 / 潮翼法 / 真凰宝术 / 星骨`.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-07
    note: Vite built 37 modules successfully; warning only for deprecated CJS Vite Node API.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Docs collaboration evidence check passed after LW-008 was set to `needs_review`.
- residualRisk:
  - Node4-12 source node files, Node12 runtime copy, old generated/app dist, archived docs, and audio descriptions still contain note-level legacy terms and need later bounded cleanup.
  - Runtime ids, save keys, asset keys, ability ids, and schema fields still include legacy romanized identifiers such as `shihao`, `kunpeng`, `supreme_bone`, and `he_hua_zizai`; they are deferred to L3 because renaming them can affect persistence/contracts.
  - Full public-release readiness also depends on Node4-12 content depth, progression contract review, and remaining character/boss asset replacement.

## LW-009: Cross-Node Progression Contract Review

- status: verified
- requirementId: REQ-20260706-001
- iteration: 3
- iterationGoal: 验收与公开导出风险收束
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/js/data.js`, `LoreWeaver/data/workspaces/20260611-060754-719406/js/store.js`, `LoreWeaver/data/workspaces/20260611-060754-719406/scenes/GameOverScene.js`, `minigame/perfectworld_dahuang`
- sourceReview: `LW-008`
- invalidates: `gate:workspace-build`, `gate:progression-contract`
- requiredGate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`, `npm run progression:check`, `npm run check:docs-collab`
- doneCriteria:
  - Audit Node1-12 rewards, unlock flags, fail reward policy, first-clear intent, and persisted result fields for contract drift.
  - Identify whether current `unlockNextNode: nodeConfig.id + 1` remains acceptable for this iteration or needs a later L3 registry/flag migration.
  - Add a focused static report or smoke assertion that catches missing reward/unlock/failure fields for all 12 nodes.
  - Keep Node1-3 verified mechanics, mobile hooks, atlas evidence, and public-text originality changes intact.
- verificationEvidence:
  - gate: `progression contract smoke or static report`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
    runAt: 2026-07-07
    note: `npm run progression:check` returned `passed_with_notes`; errors 0, notes 14 across target and tracked mirror. The report covers Node1-12 rewards, failure reward policy fallback, scene files, skill pools, ability unlock intent, GameOver display, Store persistence, and NodeBridge result flow.
  - gate: `npm run manifest:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Target workspace manifest check reported `manifest.json is up to date`.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: LoreWeaver runtime contract check passed for 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Ability progression check passed for `原始真解 / 青枝赐护 / 雷吼骨术 / 青鳞鹰宝术 / 紫曜瞳 / 潮翼法 / 真凰宝术 / 星骨`.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-07
    note: Vite built 37 modules successfully; warning only for deprecated CJS Vite Node API.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Docs collaboration evidence check passed with 8/9 verified tasks after LW-009 was set to `needs_review`.
- residualRisk:
  - Node5, Node7, Node9, Node10, Node11, and Node12 currently have no ability unlock in `planning.rewardUnlocks`; their first-clear intent remains sequential/resource progression only.
  - Target workspace still uses `unlockNextNode` sequential progression for this L2 slice; flag-driven unlocks, first-clear-only reward idempotency, bestResult/star-score schema, and wider target-store support for `unlockNodes/unlocks/flags` remain L3 follow-up.
  - Runtime ids, storage keys, ability ids, enemy ids, node ids, and schema field names were not renamed or migrated.

## LW-010: First-Clear Ability Unlock Completeness Slice

- status: verified
- requirementId: REQ-20260706-001
- iteration: 3
- iterationGoal: 验收与公开导出风险收束
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/js/data.js`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes`, `minigame/perfectworld_dahuang`
- sourceReview: `LW-009`
- invalidates: `gate:progression-contract`, `gate:workspace-build`
- requiredGate: `npm run progression:check`, `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`
- doneCriteria:
  - Resolve or explicitly justify the LW-009 notes for Node5, Node7, Node9, Node10, Node11, and Node12 having no first-clear ability unlock.
  - Add a small, contract-safe rewardUnlocks slice where existing ability ids already support the intended progression, without adding new schema fields or renaming ids.
  - Keep reward/unlock changes synchronized between target workspace and tracked mirror where the data source exists.
  - Ensure the progression contract check reports no error and fewer unaddressed first-clear ability unlock notes, or explains why a note remains intentionally sequential/resource-only.
- verificationEvidence:
  - gate: `progression contract check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
    runAt: 2026-07-07
    note: `npm run progression:check` reports errors 0, notes 0, target notes 0, mirror notes 0; LW-009 baseline was 14 notes.
  - gate: `npm run manifest:check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/manifest.json`
    runAt: 2026-07-07
    note: Target workspace manifest is up to date after split-node planning changes.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: LoreWeaver runtime contract check passed for 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Ability progression check includes `万象化影` after Node12 finale reward wiring.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-07
    note: Vite built 37 modules successfully; warning only for deprecated CJS Vite Node API.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Docs collaboration evidence check passed with 9/10 verified tasks before LW-010 was marked `verified`.
- residualRisk:
  - Node5, Node7, Node9, Node10, and Node11 are explicitly justified as existing-ability reinforcement nodes rather than new runtime unlock nodes.
  - New abilities, flag-driven unlocks, best-result scoring, first-clear-only idempotency, and save-key migrations remain out of scope for this L2 slice.

## LW-011: Public-Share Text Residual Cleanup Slice

- status: verified
- requirementId: REQ-20260706-001
- iteration: 3
- iterationGoal: 验收与公开导出风险收束
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-04-kunpeng-nest.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-05-shidu.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-06-yaodu.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-07-three-thousand-states.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-08-xiangu.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-09-tianshen-academy.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-10-imperial-pass.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-11-foreign-land.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-12-final-battle.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/audio-cue-catalog.json`, `minigame/perfectworld_dahuang`
- sourceReview: `LW-008`, `LW-010`
- invalidates: `gate:content-safety`, `gate:loreweaver-manifest`, `gate:workspace-build`
- requiredGate: `node LoreWeaver/workflow/scripts/content_safety_scan.mjs`, `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`, `npm run check:docs-collab`
- doneCriteria:
  - Originalize remaining live/public-facing Node4-12 titles, taunts, planning notes, and audio-cue descriptions flagged by `content_safety_scan_latest.json`, while preserving runtime ids, save keys, schema fields, and ability ids.
  - Keep target workspace and tracked mirror synchronized for split node JSON, generated manifests, and any generated `js/data.js` or catalog outputs that the existing build scripts own.
  - Leave historical docs, archives, generated app dist, and contract-sensitive runtime identifiers as note-level residual risk unless a safe local source edit is already part of this slice.
  - Keep the content safety scan at zero public-share warnings and reduce the live-surface note count for Node4-12/audio/manifest entries.
- verificationEvidence:
  - gate: `node LoreWeaver/workflow/scripts/content_safety_scan.mjs`
    result: passed_with_notes
    report: `LoreWeaver/workflow/reports/content_safety_scan_latest.json`
    runAt: 2026-07-07
    note: Warnings remain 0; notes dropped from 145 to 89, and latest report has 0 findings for Node4-12 split JSON, target audio cue catalog, target/mirror manifests, Node4/Node12 runtime JS, and target Node8/11/12 iframe HTML titles.
  - gate: `npm run manifest:check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/manifest.json`
    runAt: 2026-07-07
    note: Target manifest is up to date after split-node and audio source changes.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: LoreWeaver runtime contract check passed for 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Ability progression check still passes with unchanged ability ids.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-07
    note: Vite built 37 modules successfully; warning only for deprecated CJS Vite Node API.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-07
    note: Docs collaboration evidence check passed with 10/11 verified tasks while LW-011 remains `needs_review`.
- residualRisk:
  - Runtime ids such as `kunpeng_art`, `supreme_bone`, `dual_pupil`, and `he_hua_zizai` remain contract-sensitive and are explicitly out of scope.
  - Historical docs/archive content, old mirror generated dist, generated `LoreWeaver/dist`, split-script legacy Node2/3 slug mappings, VFX comments, and the shared runtime classifier note remain monitored but non-blocking for this slice.
  - Node4-12 gameplay depth remains a separate design/content follow-up after public text risk is cleaner.

## LW-012: Node1-12 Release Smoke Gate Slice

- status: verified
- requirementId: REQ-20260706-001
- iteration: 3
- iterationGoal: 验收与公开导出风险收束
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/scripts`, `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`, `minigame_master/workflow/scripts/run_e2e_test.py`, `minigame/perfectworld_dahuang`
- sourceReview: `LW-011`; `LW-012 Codex changes_requested (2026-07-11)`
- invalidates: `gate:e2e-smoke`, `gate:workspace-build`, `gate:docs-collab`
- requiredGate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`, `npm run check:docs-collab`, `Node1-12 smoke gate`
- doneCriteria:
  - Add or stabilize a repeatable Node1-12 smoke gate for the target workspace and/or tracked mirror that records machine-readable evidence for each node entering, staying alive/active briefly, and returning to `MainScene` or `GameOverScene` without console/page errors.
  - Prefer a workspace-local script and `npm` script when feasible; if the shared `minigame_master/workflow/scripts/run_e2e_test.py` must change, preserve existing `xianni` and `perfectworld_dahuang --node` behavior.
  - Use existing runtime hooks such as `NodeBridge.launchNode`, `window.__DAHUANG_NODE_TEST_STATE__`, and art/audio pipeline globals; avoid gameplay behavior changes unless the smoke exposes a real bug.
  - Write a latest report under the target workspace `reports/` or the workflow report directory, and record enough per-node detail for Codex review.
  - Do not broaden into Node4-12 gameplay redesign; this slice is QA evidence and stability only.
- verificationEvidence:
  - gate: `npm run smoke:node1-12`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
    runAt: 2026-07-11
    note: Changes-requested rerun passed after identifying `favicon.ico` through console location and adding an embedded local favicon. `12/12` nodes entered their expected Node scene, stayed active for 1800 ms, and returned to `MainScene`; Node12 used the observed `GameOverScene` route. Top-level and per-node console, page, HTTP response, and request-failure counts are all 0.
  - gate: `npm run manifest:check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/manifest.json`
    runAt: 2026-07-11
    note: Regenerated the stale split-manifest output with `npm run manifest:build`, then confirmed it is up to date.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-11
    note: Runtime contract check passed for all 12 nodes.
  - gate: `npm run ability:check`
    result: passed
    report: n/a
    runAt: 2026-07-11
    note: Ability progression check passed for all nine registered abilities.
  - gate: `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-11
    note: Vite built 37 modules successfully; only the existing CJS Vite Node API deprecation warning remained.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-11
    note: Collaboration evidence check passed with LW-012 correctly held for review.
- residualRisk:
  - A smoke gate proves entry/exit stability, not fun, balance, readable boss phases, or replay value.
  - Browser automation may still miss mobile touch ergonomics and visual overlap; manual/mobile screenshot QA remains separate.
  - If a node fails smoke because of a real runtime bug, Antigravity should either make the smallest fix in scope or return `changes_requested` evidence instead of weakening assertions.

---

# REQ-20260711-001: 9/10 Mature Game Program

The dependency order below is mandatory. A later task may be decomposed before claim, but it may not skip an unmet predecessor or weaken an earlier gate. Iteration 1 builds the truthful baseline, runtime foundation, and Node1 vertical slice. Iteration 2 completes replay systems and Node2-12. Iteration 3 hardens art/audio/performance/release and productizes the proven template in LoreWeaver.

## LW-013: Honest Maturity Score Gate

- status: verified
- requirementId: REQ-20260711-001
- iteration: 1
- stage: truth-baseline
- playerValue: Prevents engineering activity from being mistaken for a mature game and keeps every later task tied to a player-visible deficit.
- dependsOn: `LW-012`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: target workspace maturity rubric, report script, package scripts, `reports/maturity_score_latest.json`
- invalidates: `gate:maturity-score`, `gate:workspace-manifest`, `gate:docs-collab`
- requiredGate: `npm run maturity:report`, expected-failing `npm run maturity:gate`, baseline workspace gates, `npm run check:docs-collab`
- doneCriteria:
  - Rubric weights total 100 and match `design.md`; assessment, observed facts, missing evidence, hard caps, and waivers are separate fields.
  - Report derives stable facts where possible: production art/audio counts, node durations, runtime scripts, input/action coverage, result/save fields, smoke report status, and known late-game scale ratios.
  - Baseline reports the current game below 50/100 and activates the documented auto-combat, balance, thin-level, fallback-art, no-BGM, and natural-progression caps when supported by evidence.
  - `maturity:report` succeeds and writes evidence; `maturity:gate` exits nonzero until score >= 90 and no cap is active.
- verificationEvidence:
  - gate: `npm run maturity:report`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
    runAt: 2026-07-11
    note: Report command exited 0 and independently derived a 24/100 baseline after package freshness made the old release smoke stale; nine caps remain active-or-unverified and four blocking evidence gaps remain.
  - gate: `npm run maturity:gate`
    result: expected_failed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
    runAt: 2026-07-11
    note: Exit 1 is required because score 24 is below 90, all nine hard caps remain blocking, four required evidence items are missing, and all dimension minimums fail.
  - gate: `npm run maturity:self-check`
    result: passed
    report: n/a
    runAt: 2026-07-11
    note: Also rejected Node1-only quality tags with generic Node2-12 mechanics, accepted-but-unresolved P1 findings, and runtime fallback use; proved resolved severe history needs evidence and dormant fallback resilience can coexist with a cleared production-art cap.
  - gate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run progression:check`, `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`; build output in `dist/`
    runAt: 2026-07-11
    note: Manifest was fresh, runtime covered 12 nodes, nine abilities passed, progression had zero findings, and Vite built 37 modules.
  - gate: `npm run check:docs-collab`
    result: passed
    report: n/a
    runAt: 2026-07-11
    note: Collaboration evidence check passed with LW-013 held at needs_review.
  - gate: `npm run smoke:node1-12`
    result: blocked_by_sandbox
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json` (stale and intentionally uncredited)
    runAt: 2026-07-11
    note: Reviewer and implementer reruns reached the loopback bind and failed with `PermissionError: Operation not permitted`; the escalated retry was rejected by the current usage limit. The maturity report correctly assigns zero smoke points and keeps `release_integrity` active. Fresh build/manifest/runtime/ability/progression gates plus direct diff review are replacement evidence for the score-gate implementation only, not for release integrity.
- residualRisk:
  - Automated evidence cannot score subjective feel by itself; human playtest remains required at Node1 and final acceptance.
  - Node1-12 release smoke must be rerun in a loopback-capable environment after package/source changes; stale evidence cannot clear release integrity.

## LW-014: Deterministic Balance And Economy Simulator

- status: verified
- requirementId: REQ-20260711-001
- iteration: 1
- stage: truth-baseline
- playerValue: Exposes one-shot bosses, immortal players, grind walls, and reward-cost dead ends before tuning by feel.
- dependsOn: `LW-013`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: target workspace balance script/config and `reports/balance_simulation_latest.json`
- invalidates: `gate:balance`, `gate:progression-contract`
- requiredGate: `npm run balance:report`, expected-failing `npm run balance:gate`, `npm run progression:check`, `npm run build`
- doneCriteria:
  - Simulate Node1-12 effective player HP/ATK, representative skill DPS, enemy/Boss TTK, enemy hits-to-kill, run rewards, cave/realm costs, and estimated clears/time to next node.
  - Flag final Boss TTK below 20 seconds, player hits-to-kill outside defined bands, mandatory grind above defined limits, and any unreachable progression step.
  - Report both fresh-save and fully upgraded profiles and records every formula/input source.
  - Current data fails for the documented late-game collapse and economy defects; no threshold is relaxed to obtain green output.
- verificationEvidence:
  - gate: `npm run balance:self-check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-11
    note: Regenerated the deterministic failed baseline and asserted Store-stat/crit formulas, multi-resource/unreachable bottlenecks, P05/expected/P95 ordering, unlock/realm divergence, erased offline income, and required active violations.
  - gate: `npm run balance:report`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-11
    note: Exit 0 wrote `loreweaver.balance-simulation.v1` with exactly `fresh_save` and `fully_upgraded`, 12 unique Node rows each, recomputed summary values, and 73 explicit current violations.
  - gate: `npm run balance:gate`
    result: expected_failed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-11
    note: Exit 1 is required: final Boss TTK is below 20 seconds, contact survivability exceeds 30 hits in late nodes, Node12 has an instant-fail projectile, repeat costs exceed 3, resources become unreachable, unlock paths diverge, and startup offline income is unobservable.
  - gate: `npm run maturity:self-check`, `npm run maturity:report`, `npm run progression:check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`, `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
    runAt: 2026-07-11
    note: Maturity evidence self-check passed; maturity remains honestly failed at 24/100; progression report has zero findings.
  - gate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/dist/`
    runAt: 2026-07-11
    note: Manifest is current, runtime covers 12 nodes, nine ability contracts pass, and Vite built 37 modules (existing CJS deprecation warning only).
  - gate: `npm run check:docs-collab`, `git diff --check`, strict balance-detail assertion
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-11
    note: Collaboration evidence passed; no whitespace errors; strict assertion proved summary recomputation, unique 12-node profiles, and rejected failed balance output as maturity clearance evidence.
  - gate: `LW-014 Review 1 remediation rerun`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-12
    note: `balance:self-check` and all required gates reran: Node4 farms bone script from Node1 in 20 expected clears while local sustain remains zero; report has no globally unreachable resources, 20 sub-20 runtime Boss rows all have TTK violations, Node1 has missing-runtime-Boss violations, source/config drift is rejected, and result unlock is modeled as premature interactive UI plus launch-blocked divergence and duplicate unlock path.
  - gate: `LW-014 Review 2`
    result: changes_requested
    report: `LoreWeaver/docs_collab/review.md#lw-014-review-2`
    runAt: 2026-07-12
    note: Cross-source farm runs are incorrectly collapsed with `max`, understating required clears and elapsed time; the report needs an auditable sequential route that jointly credits all resource yields.
  - gate: `LW-014 Review 2 remediation rerun`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-12
    note: Expected and P05 routes now expose per-node clear counts, total clears, total elapsed seconds, total yield, remaining deficits, bottleneck explanation, and bounded candidate evaluations. Fresh Node4 requires 20 Node1 plus 65 Node4 clears (85 total, 14,100 seconds), with Node1 blood credited before Node4 clears. Distinct-source and shared-source counterexamples passed; report subprocess completed within the 5-second self-check budget.
  - gate: `LW-014 Review 3`
    result: passed
    report: `LoreWeaver/docs_collab/review.md#lw-014-review-3`
    runAt: 2026-07-12
    note: Codex independently recomputed 36 route aggregates and deficits, confirmed expected-failing balance/maturity gates, and passed all simulator, contract, build, docs, and diff checks.
- residualRisk:
  - Simulator estimates require later calibration against measured runtime DPS, projectile misses, area coverage, and real player behavior.
  - Cross-node farm estimates assume a zero wallet/carryover at each stage; natural-progression telemetry is still required to calibrate persistent-wallet carryover.
  - The route is an explicitly bounded duration-normalized deterministic heuristic, not a proof of globally shortest integer routing; later natural progression telemetry can validate its source selection.
  - Browser/release smoke was not run for this read-only simulator task and is not claimed as evidence.

## LW-015: Visual, Object And Performance Baseline

- status: verified
- requirementId: REQ-20260711-001
- iteration: 1
- stage: truth-baseline
- playerValue: Makes battlefield readability, HUD occupation, object spikes, and lifecycle residue measurable.
- dependsOn: `LW-013`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: target workspace browser QA script, screenshots, `reports/visual_performance_baseline_latest.json`
- invalidates: `gate:visual`, `gate:performance`, `gate:e2e-smoke`
- requiredGate: browser baseline at 390x844, 430x932, 720x1280, and 1280x720; Node1/3/12 samples; Node1-12 smoke; visual self-check; build/manifest/runtime/ability/progression/maturity/docs/diff checks
- doneCriteria:
  - Capture real runtime screenshots for Node1, Node3 Boss state, and Node12; report canvas nonblank pixels, actor/Boss screen size, HUD coverage, text bounds, and touch control bounds.
  - Sample FPS/frame time, active enemies/projectiles/display objects, and post-return residue for quiet, wave, and Boss states.
  - Record console/page/network errors with action and scene context.
  - Baseline may fail visual/performance thresholds; failure evidence must be preserved.
- verificationEvidence:
  - gate: `npm run visual:baseline`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/visual_performance_baseline_latest.json`
    runAt: 2026-07-12
    note: Review 1 remediation measured 20 required endpoint snapshots at four viewports with 20 canvas PNGs, 20 viewport PNGs, 1,200 rAF samples, real Node1 quiet/wave, protected real Node3/Node12 Boss instances, return residue, and zero contextual browser/network errors; quality honestly recomputed to 54 observations.
  - gate: `npm run visual:self-check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/visual_performance_baseline_latest.json`
    runAt: 2026-07-12
    note: Re-read and decoded every canvas PNG, verified canvas/viewport SHA-256/bytes/dimensions, recomputed summary and quality exactly, and detected screenshot replacement, quality erasure, active-scene object drift, blocked evidence, and prior fixtures.
  - gate: `npm run smoke:node1-12`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
    runAt: 2026-07-12
    note: Fresh sandbox-external loopback run passed 12/12 with zero console, page, HTTP, or request failures.
  - gate: build and contracts
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
    runAt: 2026-07-12
    note: `build`, `manifest:check`, `loreweaver:check`, `ability:check`, `progression:check`, `maturity:self-check`, docs collaboration check, and `git diff --check` passed; `maturity:report` ran successfully and remains honestly failed at 29/100 with nine hard caps.
  - gate: `LW-015 Review 1`
    result: addressed_needs_review
    report: `LoreWeaver/docs_collab/review.md#lw-015-review-1`
    runAt: 2026-07-12
    note: Remediation moves all runtime/layout/object facts to one post-rAF endpoint, separates Node/UI from all-active display totals, authenticates/re-decodes PNGs, recomputes quality, and makes blocked default self-check fail.
  - gate: `LW-015 Review 2`
    result: passed
    report: `LoreWeaver/docs_collab/review.md#lw-015-review-2`
    runAt: 2026-07-13
    note: Codex accepted the internally consistent failed visual baseline after independent file/hash/quality/lifecycle review and all required gates.
- residualRisk:
  - Headless desktop Chrome is not a substitute for a physical low-end phone, so final performance needs device confirmation.
  - QA Boss HP/position/attack deferral is capture-local instrumentation recorded per detail; natural Boss survival and low-end-device frame behavior remain unmeasured.
  - Mobile canvas occupancy, HUD coverage, touch-target size, and text overlap fail baseline thresholds and keep `mobile_readability` active.
  - Node12 can auto-complete inside the release-smoke active window, so the observed 11/12 then 12/12 sequence remains a timing-flake risk until late-game balance and smoke semantics are stabilized.

## LW-016: Backward-Compatible Save V2 And Result Contract

- status: verified
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Preserves progress while enabling meaningful first clears, best records, stars, builds, challenges, and reliable retries.
- dependsOn: `LW-014`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: `js/store.js`, core Store integration, `systems/NodeBridge.js`, `nodes/node1.js`, `scenes/GameOverScene.js`, migration tests/report
- invalidates: `gate:save-migration`, `gate:progression-contract`, `gate:e2e-smoke`
- requiredGate: save v1->v2 migration fixtures, corrupted-save recovery, result idempotency tests, progression/build/smoke gates
- doneCriteria:
  - Preserve a versioned backup of the prior save and migrate without deleting valid resources, perks, abilities, unlocked nodes, or results.
  - Add `attempts`, `firstClear`, `bestResult`, `stars`, `buildSnapshot`, `flags`, `challengeResults`, and user settings with explicit schemas.
  - First-clear rewards and unlocks are idempotent; repeat/failure rewards follow separate policies; total completion statistics do not increment incorrectly on every replay.
  - Unlock routing is registry/flag driven and UI distinguishes unlocked from realm-ineligible nodes with an actionable reason.
- verificationEvidence:
  - gate: `npm run save:report && npm run save:self-check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/save_migration_latest.json`
    runAt: 2026-07-13
    note: Codex Review 5 independently passed 53/53 with zero derived data-loss cases. All prior 47 remain green; six exported-API fixtures prove no-options empty/partial/corrupt/scalar/null/direct migrations are safe and schema-valid, with exact raw recovery and minimum < caller defaults < legacy precedence.
  - gate: `npm run progression:check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
    runAt: 2026-07-13
    note: Target and tracked mirror both report zero errors/notes; target static flow recognizes the centralized Save V2/result contract and its additional identity/result fields.
  - gate: `npm run balance:self-check`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
    runAt: 2026-07-13
    note: Source contract proves startup elapsed is observable and realm-ineligible UI is actionable. Fresh report remains honestly failed with 64 real violations; obsolete offline and realm-interaction violations are removed, while duplicate unlock remains an idempotent non-violation audit fact.
  - gate: `npm run maturity:self-check && npm run maturity:report`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
    runAt: 2026-07-13
    note: Validator self-check passed; refreshed maturity remains honestly failed at 29/100 with nine active hard caps and validates both final save migration and release smoke evidence.
  - gate: `npm run manifest:check && npm run loreweaver:check && npm run ability:check && npm run build`
    result: passed
    report: n/a
    runAt: 2026-07-13
    note: Manifest current, runtime contract passed 12 nodes, ability contract passed nine abilities, and Vite built 40 modules.
  - gate: `npm run smoke:node1-12`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
    runAt: 2026-07-13
    note: Codex Review 5 performed one sandbox-external run after the final build because the implementation attempt was environment-blocked; final smoke passed 12/12 with zero console/page/HTTP/request errors.
- residualRisk:
  - Unknown incompatible legacy values are preserved in both the raw versioned backup and `saveVersion2.migration.legacyFields`; no encountered fixture required a lossy human decision.
  - Manual reset is now backup-first and reversible at storage level, but the product still has no in-game backup browser/restore UI.
  - Codex Reviews 1-5 confirm strict reward/result validation, semantic collision detection, exact legacy diagnostics, schema-driven canonical classification, backup-first invalid-V2 repair, and standalone schema-valid migration APIs.
  - Node12 active-window timing remains a historical risk despite the final 12/12 smoke.

## LW-017: Incremental Combat Runtime Modularization

- status: verified
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Allows combat improvements without turning every change into a 2000-line scene regression.
- dependsOn: `LW-016`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `nodes/node1.js`, new target workspace combat/input/skill/enemy/result modules
- invalidates: `gate:node-runtime`, `gate:ability`, `gate:e2e-smoke`
- requiredGate: behavior parity assertions, Node1-3 targeted E2E, Node1-12 smoke, manifest/runtime/ability/build gates
- doneCriteria:
  - Extract input, damage/combat, skill execution, enemy runtime, run metrics/results, and HUD boundaries incrementally with stable scene-facing APIs.
  - Preserve current Node1-12 behavior and test hooks during extraction; subclasses must not depend on private temporary fields.
  - Every new module owns teardown and exposes compact debug state; no new global mutable singleton is introduced.
  - Reduce `node1.js` responsibility and line count materially without a single all-at-once rewrite.
- verificationEvidence:
  - gate: `npm run runtime:modularization:check`
    result: passed
    report: stdout deterministic source/lifecycle contract
    runAt: 2026-07-13
    note: Covers Node2-12 super calls, inherited direct dependencies, Node1-owned provider evidence plus deletion mutations, input lock/vector/listener teardown, result projection, chain range, cone arc, laser projection, shield equal/partial, transform completion/teardown, enemy factory overrides, and no global mutable singleton.
  - gate: `npm run runtime:modularization:browser`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/runtime_modularization_browser_latest.json`
    runAt: 2026-07-13
    note: Codex ran the repaired runner sandbox-external. Node1 touch/skill/retreat result, Node2 chest reward, and Node3 pressure/Boss telegraph all passed; page/HTTP/request errors were zero and the only console warning was expected AudioContext autoplay blocking without a user gesture.
  - gate: `npm run progression:check`, `npm run balance:self-check`, `npm run maturity:self-check`, `npm run maturity:report`
    result: passed with intentional failed reports
    report: `reports/progression_contract_latest.json`, `reports/balance_simulation_latest.json`, `reports/maturity_score_latest.json`
    runAt: 2026-07-13
    note: Progression passed. Balance self-check passed while the refreshed report retains 64 known violations. Maturity self-check passed while the refreshed report remains failed at 28/100 with nine active hard caps.
  - gate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`
    result: passed
    report: n/a
    runAt: 2026-07-13
    note: Manifest current; LoreWeaver contract passed all 12 nodes; ability progression passed; final Vite build transformed 48 modules.
  - gate: `npm run smoke:node1-12`
    result: passed
    report: `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
    runAt: 2026-07-13
    note: Codex ran one sandbox-external final-source smoke after review remediation; 12/12 passed with zero console/page/HTTP/request errors.
  - gate: `git diff --check`
    result: passed
    report: n/a
    runAt: 2026-07-13
    note: Passed after the final coordination-document updates.
- residualRisk:
  - Later level-specific mechanics may reveal additional extension points; add only proven interfaces.
  - Codex Reviews 1-2 confirm the final scene-injected input/HUD/skill/combat/enemy/result modules, branch parity fixtures, field-provider contract, targeted browser paths, and 12-node release smoke.
  - Async root/dodge/combat state cleanup is verified for scene shutdown paths; future reuse outside scene shutdown would require additional restoration contracts.

## LW-018: Unified Power Budget And Runtime Scaling

- status: needs_review
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Keeps every realm dangerous and readable without damage-sponge enemies or accidental one-shots.
- dependsOn: `LW-017`
- owner: Antigravity
- claimedBy: Antigravity
- claimedAt: 2026-07-13
- reviewer: Codex
- patchLevel: L3
- targetArtifact: balance config, player/enemy/Boss stat resolution, number formatting, balance reports
- invalidates: `gate:balance`, `gate:ability`, `gate:progression`, `gate:node-runtime`
- requiredGate: passing balance gate for Node1-12 target bands, representative runtime DPS samples, progression/build/smoke gates
- doneCriteria:
  - Replace raw exponential realm bonuses with one documented power budget used by player, enemies, Bosses, rewards, and costs.
  - Normal enemies, elites, and Bosses meet per-node TTK and hits-to-kill bands; Node12 cannot be killed by one ordinary cast and cannot kill through an unexplained collision override.
  - HP/damage displays remain readable through abbreviations or normalized values and do not overflow HUD.
  - Runtime samples agree with simulator estimates within a documented tolerance.
- verificationEvidence:
  - gate: `npm run balance:gate`
    result: passed
    report: `reports/balance_simulation_latest.json`
    runAt: 2026-07-13
    note: Simulation report written with 0 violations.
  - gate: `npm run balance:self-check`
    result: passed
    report: n/a
    runAt: 2026-07-13
    note: Self-check successfully validated formulas, routes, RNG, eligibility, and drift limits.
  - gate: `npm run loreweaver:check`
    result: passed
    report: n/a
    runAt: 2026-07-13
    note: LoreWeaver runtime check verified all 12 nodes.
  - gate: `npm run build`
    result: passed
    report: `dist/`
    runAt: 2026-07-13
    note: Vite production build completed successfully.
- residualRisk:
  - Exact difficulty still needs playtest tuning after active controls and enemy moves exist.

## LW-019: Player Agency And Mobile Action Bar

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Turns the experience from moving around an auto-battle into a game with timing, mastery, and recoverable mistakes.
- dependsOn: `LW-018`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: input controller, skill controller, Node UI, settings, Node1 test hooks
- invalidates: `gate:input`, `gate:node-runtime`, `gate:mobile-e2e`, `gate:visual`
- requiredGate: touch/keyboard active-action E2E, pause/level-up/input-lock tests, 390x844 and 720x1280 screenshots, build/smoke gates
- doneCriteria:
  - Add a user-triggered dash with cooldown and invulnerability, one equipped active technique, and one charged/earned burst; keyboard equivalents remain available.
  - Touch buttons have stable dimensions, safe-area placement, pressed/cooldown/disabled states, and do not conflict with joystick drag or overlays.
  - Auto skills remain an optional build layer; critical defensive and burst decisions are never silently auto-fired.
  - Test state exposes action availability, cooldowns, last accepted/rejected action, and input lock reason.
- verificationEvidence: []
- residualRisk:
  - Haptic feedback differs by browser and must degrade gracefully.

## LW-020: Readable Enemy Archetype State Machines

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Creates learnable threats and counterplay instead of uniformly homing colored sprites.
- dependsOn: `LW-019`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: enemy controller/config, telegraph/VFX hooks, representative Node1 enemies
- invalidates: `gate:enemy-behavior`, `gate:ability-vfx`, `gate:node-runtime`
- requiredGate: forced enemy-move scenarios, telegraph timing assertions, damage/cancel tests, Node1 E2E/build
- doneCriteria:
  - Implement chase/melee, charge, ranged pressure, support/guard, and zone-control archetypes with explicit windup, active, recovery, interrupt, and cooldown states.
  - Node1 uses at least three distinct archetypes with silhouette/color-blind-safe cues and predictable counterplay.
  - Enemy attacks use move-specific VFX kinds and cannot deal damage before the declared active frame.
  - Runtime state reports current move, phase timing, target, interruptibility, and coverage gaps.
- verificationEvidence: []
- residualRisk:
  - Support and zone-control archetypes may first ship in later nodes but their contract must be exercised by fixtures.

## LW-021: Beat-Driven Run Director And Object Pools

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Replaces monotonically increasing spawn spam with authored pacing and stable performance.
- dependsOn: `LW-020`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: run director, LevelContract loader, spawn budgets, enemy/projectile/pickup pools
- invalidates: `gate:level-contract`, `gate:performance`, `gate:node-runtime`
- requiredGate: deterministic beat simulation, simultaneous-object limits, pool reuse/teardown tests, Node1-12 smoke
- doneCriteria:
  - Support intro, teach, pressure, elite, climax, and resolution beats with deterministic seeded tests.
  - Enforce per-archetype and total active budgets; remove unbounded `1 + floor(time/30)` spawning from production paths.
  - Pool high-frequency enemies, projectiles, pickups, and particles with lifecycle reset checks.
  - Expose beat, objective progress, spawn budget, active counts, and transition reason through test state.
- verificationEvidence: []
- residualRisk:
  - Existing Node subclasses need staged migration and must keep a compatibility path until their LevelContracts land.

## LW-022: Combat HUD And Responsive Shell Redesign

- status: needs_review
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Gives the battlefield back to the player and makes status, objective, cooldowns, Boss intent, and failure risk readable at a glance.
- dependsOn: `LW-019`, `LW-021`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: Node UI scene, game shell/index/CSS, level-up/pause/retreat overlays
- invalidates: `gate:visual`, `gate:mobile-e2e`, `gate:accessibility`
- requiredGate: responsive screenshots, text/touch bounds assertions, overlay input tests, build/smoke gates
- doneCriteria:
  - Replace the 520x154 always-visible skill text panel with compact icons/cooldowns and an optional detail surface.
  - Keep objective/HP/XP at the top, joystick/actions at the bottom, and reserve central screen space for combat; respect safe-area insets.
  - Remove desktop explanatory sidebars from the primary gameplay viewport and keep optional guidance outside the combat hierarchy.
  - Format large values, provide pause/settings/retry, and verify no overlap or overflow at all target viewports.
- verificationEvidence:
  - gate: `npm run dev` and `workflow/scripts/run_e2e_test.py`
    result: passed
    report: `reports/runtime_e2e_perfectworld_dahuang_latest.json`
    runAt: 2026-07-14
    note: Mobile HUD refactored with compact layout and safe area. Sidebars hidden from gameplay viewport. Large values formatted.
- residualRisk:
  - Final icon art arrives with Node1 production assets; temporary semantic placeholders must be explicitly tracked.

## LW-023: Offline Economy And Visibility Lifecycle Repair

- status: needs_review
- requirementId: REQ-20260711-001
- iteration: 1
- stage: runtime-foundation
- playerValue: Makes progression promises honest and prevents hidden timers from granting or losing resources incorrectly.
- dependsOn: `LW-016`, `LW-018`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: core Store timestamp handling, `js/IdleEngine.js`, MainScene lifecycle, economy report
- invalidates: `gate:save-migration`, `gate:economy`, `gate:scene-lifecycle`
- requiredGate: deterministic clock fixtures, offline cap tests, visibility/pause tests, no-ghost-timer smoke, balance/build gates
- doneCriteria:
  - Read the previous persisted timestamp before writing the current save time; offline gain survives reload and respects a documented cap.
  - Online idle gain pauses or follows the documented policy during hidden tabs, combat, and destroyed scenes.
  - Remove unrestricted non-Scene `setInterval` production fallback; test environments use an injected scheduler.
  - Economy simulator confirms idle income supplements play without replacing it or creating mandatory multi-hour walls.
- verificationEvidence:
  - gate: `npm run dev` and `workflow/scripts/run_e2e_test.py`
    result: passed
    report: `reports/runtime_e2e_perfectworld_dahuang_latest.json`
    runAt: 2026-07-14
    note: Idle engine refactored to remove setInterval fallback, respect visibility API, and accurately calculate elapsed time.
- residualRisk:
  - Browser background throttling varies, so elapsed-time reconciliation remains authoritative over tick counts.

## LW-024: Node1 Authored Level Beats

- status: needs_review
- requirementId: REQ-20260711-001
- iteration: 1
- stage: node1-vertical-slice
- playerValue: Delivers a concise first run with teaching, escalation, choice, and anticipation instead of two minutes of undifferentiated survival.
- dependsOn: `LW-021`, `LW-022`, `LW-023`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node1 LevelContract, Node1 scene integration, objective/tutorial callouts
- invalidates: `gate:level-contract`, `gate:node1-e2e`, `gate:balance`
- requiredGate: deterministic beat assertions, zero-save Node1 path, mobile visual/performance samples, build/smoke gates
- doneCriteria:
  - Author a 60-90 second teach/pressure/choice/elite/climax/resolution timeline with no idle filler.
  - Teach movement, dash, active technique, enemy cues, pickup/level choice, and break behavior through play and concise callouts.
  - Every beat has an observable completion/failure condition and transition reason.
  - Run time, active counts, XP cadence, and expected build power stay inside balance/performance budgets.
- verificationEvidence:
  - gate: `npm run dev` and `workflow/scripts/run_e2e_test.py`
    result: passed
    report: `reports/runtime_e2e_perfectworld_dahuang_latest.json`
    runAt: 2026-07-15
    note: Node 1 timeline added.
- residualRisk:
  - Tutorial pacing needs human calibration after all production feedback is present.

## LW-025: Node1 Dedicated Boss Encounter

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: node1-vertical-slice
- playerValue: Gives the opening level a memorable skill check and emotional payoff.
- dependsOn: `LW-024`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node1 Boss controller/spec, health/phase UI, move VFX hooks, Boss test scenarios
- invalidates: `gate:boss`, `gate:node1-e2e`, `gate:balance`, `gate:ability-vfx`
- requiredGate: forced move/phase/break/victory/failure assertions, Boss TTK band, mobile visual/performance samples
- doneCriteria:
  - Boss has a dedicated identity, health bar, two or three phases, at least three moves, and one break/counter window built from previously taught rules.
  - Every damaging move has windup, active, recovery, hit area, cancel policy, and readable audio/visual cue.
  - Boss cannot be ordinary-skill one-shot, cannot contact-kill without a declared move, and cannot time out into false victory.
  - Victory stops threats cleanly, awards the correct first-clear result, and produces a clear resolution beat.
- verificationEvidence: []
- residualRisk:
  - Final timing remains provisional until actor animation and audio land.

## LW-026: Node1 Build Choice, Scoring And Results

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: node1-vertical-slice
- playerValue: Makes each run express a choice and gives the player a concrete reason to improve or replay.
- dependsOn: `LW-016`, `LW-024`, `LW-025`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: skill choice model, run metrics, scoring/star rules, GameOver/MainScene result surfaces
- invalidates: `gate:result-contract`, `gate:progression`, `gate:node1-e2e`, `gate:visual`
- requiredGate: seeded choice outcomes, score/star boundaries, best-result/first-clear idempotency, retry and natural progression E2E
- doneCriteria:
  - Offer at least three choices that change projectile behavior, control/recovery, or dash/burst play rather than only percentages.
  - Score uses time, damage taken, objective execution, break success, and optional challenge; star thresholds are documented and stable.
  - Results show current versus best, build snapshot, reward split, first-clear state, failure reason, retry, and next objective.
  - Replaying cannot duplicate first-clear rewards and can improve best score without erasing prior best fields.
- verificationEvidence: []
- residualRisk:
  - Cross-node build persistence is completed in LW-032; Node1 initially proves the run-level contract.

## LW-027: Node1 Production Bitmap Art Slice

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: node1-vertical-slice
- playerValue: Replaces the empty-grid prototype look with a readable, original world and expressive combat actors.
- dependsOn: `LW-024`, `LW-025`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node1 imagegen sources/slicer/manifests, actor animations, environment, props, UI previews, RuntimeSprites integration
- invalidates: `gate:art-coverage`, `gate:visual`, `gate:node1-e2e`, `gate:build`
- requiredGate: slicer determinism, manifest/loaded coverage, frame-difference contact sheets, runtime screenshots, no missing keys/errors
- doneCriteria:
  - Player and Node1 enemy/Boss actors have semantic `idle/walk/attack/hurt/death` clips; dash/charge moves receive dedicated full-body frames where needed.
  - Add original battlefield background, ground variation, landmark, foreground, pickup, objective/prop, and UI icon assets.
  - Runtime gameplay and results use production assets first; menu-only use does not count.
  - Node1 production bitmap coverage reaches 100% for its required matrix; procedural fallback remains only a documented resilience path.
- verificationEvidence: []
- residualRisk:
  - Art direction must stay original and consistent across later batches; contact-sheet approval becomes the reference.

## LW-028: Node1 Audio, Ability VFX And Callout Slice

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: node1-vertical-slice
- playerValue: Makes attacks, danger, growth, Boss phases, victory, and failure emotionally legible.
- dependsOn: `LW-019`, `LW-020`, `LW-025`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: audio/voice manifests and assets, AudioManager channels, VFX coverage, Node1 runtime hooks and controls
- invalidates: `gate:audio-coverage`, `gate:ability-vfx`, `gate:node1-e2e`, `gate:release-assets`
- requiredGate: audio decode/fetch checks, user-gesture playback, BGM transition/mute/pause, SFX overlap, player/enemy/Boss VFX coverage
- doneCriteria:
  - Add menu/Node1/Boss BGM states, combat/UI/objective/skill/impact/victory/defeat SFX, and short original move callouts or visual labels.
  - Separate music, SFX, voice/callout, and ambience state; rapid attacks use pools and do not cut each other off.
  - Cover player active/auto moves and enemy melee/charge/ranged/Boss moves with specific VFX kinds and timing.
  - Manifest includes semantic keys, volume, loop, provider/source/license/provenance; runtime debug state reports current/missing/cached assets.
- verificationEvidence: []
- residualRisk:
  - Network-backed voice or third-party music may require a human licensing/provider decision; original visual callouts and local-safe audio are the fallback.

## LW-029: Node1 90-Point Acceptance Gate

- status: todo
- requirementId: REQ-20260711-001
- iteration: 1
- stage: node1-vertical-slice
- playerValue: Prevents the rest of the campaign from cloning a merely functional first level.
- dependsOn: `LW-026`, `LW-027`, `LW-028`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node1 mechanics/visual/audio/performance reports and maturity evidence
- invalidates: `gate:maturity-score`, `gate:node1-acceptance`, `gate:docs-collab`
- requiredGate: zero-save Node1 E2E, all beat/Boss/action assertions, art/audio coverage, visual regression, performance report, human 10-minute playtest
- doneCriteria:
  - Node1 weighted score is >=90 with no hard cap, missing critical evidence, console/page/network error, or P0/P1 finding.
  - Automated run proves active controls, one meaningful build branch, failure/retry, Boss counterplay, result persistence, and next-step clarity.
  - Visual and audio evidence is captured from runtime gameplay, not asset folders or menus.
  - Human tester can state what killed them, how to counter it, what build they chose, and why they would replay; feedback and tuning changes are recorded.
- verificationEvidence: []
- residualRisk:
  - Human playtest is the first planned non-optional collaboration checkpoint.

## LW-030: Node2 Treasure-Risk Level Completion

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: replay-spine
- playerValue: Turns chest channeling into route planning, escalating risk, and a distinct reward hunt.
- dependsOn: `LW-029`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node2 LevelContract, treasure/reward tiers, dedicated Boss, production assets and QA
- invalidates: `gate:node2`, `gate:balance`, `gate:art-audio-coverage`
- requiredGate: route/channel/interrupt/reward/Boss scenarios, mobile visual/performance, natural progression/build/smoke gates
- doneCriteria:
  - Chests have readable risk tiers, map landmarks, guarded approaches, deterministic interruption rules, and a finite objective rather than incidental farming.
  - Player chooses between safer progress and optional high-risk treasure; reward tiers feed the meta build system.
  - Dedicated guardian Boss uses treasure mechanics and has complete move/art/audio coverage.
  - Node2 score >=88 and no thin-level hard cap.
- verificationEvidence: []
- residualRisk:
  - Reward farming must be constrained by repeat tables and run time without removing the attraction of optional treasure.

## LW-031: Node3 Rival Duel Level Completion

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: replay-spine
- playerValue: Delivers a focused mastery duel instead of hiding the rival inside generic survivor noise.
- dependsOn: `LW-029`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node3 arena/LevelContract, rival phase controller, production assets and QA
- invalidates: `gate:node3`, `gate:boss`, `gate:balance`, `gate:art-audio-coverage`
- requiredGate: pressure-source, break-window, phase-combo, failure-reason and victory scenarios; visual/audio/performance gates
- doneCriteria:
  - Pressure rises from specific readable mistakes and can be reduced by intended counterplay; passive time pressure is limited and explained.
  - Rival has a taught move set, phase combinations, anti-cheese policy, and reliable break/damage windows.
  - Arena layout and adds support the duel rather than obscure it; failure identifies the actual missed rule.
  - Node3 score >=90 and no Boss/thin-level hard cap.
- verificationEvidence: []
- residualRisk:
  - Duel difficulty must support multiple builds without flattening move identity.

## LW-032: Three-School Relic And Synergy System

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: replay-spine
- playerValue: Creates durable build identity and replay reasons without an oversized inventory RPG.
- dependsOn: `LW-026`, `LW-030`, `LW-031`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: ability/relic catalogs, loadout state/UI, runtime effect resolver, drop/reward integration
- invalidates: `gate:save-migration`, `gate:balance`, `gate:ability`, `gate:progression`
- requiredGate: three seeded build scenarios, invalid-combination guards, save migration, reward/drop, balance and natural progression gates
- doneCriteria:
  - Implement lightning clear, branch control/recovery, and tide mobility/burst schools with distinct active/auto/relic synergies.
  - Each school supports at least one viable Node1-3 clear and changes moment-to-moment play, not only final damage.
  - Loadout is limited, understandable, and versioned; duplicate/repeat drops have a deterministic conversion policy.
  - Ability and relic descriptions match actual runtime effects and expose coverage/debug state.
- verificationEvidence: []
- residualRisk:
  - Cross-school hybrids need a power budget to avoid one dominant all-purpose build.

## LW-033: Mainline Map And Meta UX Redesign

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: replay-spine
- playerValue: Makes progress, goals, rewards, builds, and locked requirements understandable without sidebars or hidden console warnings.
- dependsOn: `LW-016`, `LW-032`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: MainScene, ability/relic views, index/CSS shell, node briefing/results links
- invalidates: `gate:visual`, `gate:mobile-e2e`, `gate:progression`
- requiredGate: zero-save navigation, lock-reason, loadout, node briefing, results/best-score flows; responsive visual/build gates
- doneCriteria:
  - Present a compact campaign map/list with node state, realm requirement, stars, best score, first-clear/repeat rewards, challenge, and recommended build.
  - Locked nodes cannot look playable; clicking explains the exact next action in UI.
  - Build/loadout, codex, settings, and upgrade paths are reachable without pushing the playable viewport into a tiny desktop frame.
  - Empty/new/complete/error and corrupted-save recovery states are designed and tested.
- verificationEvidence: []
- residualRisk:
  - Final campaign art thumbnails arrive incrementally with each node batch.

## LW-034: Natural Zero-Save Node1-3 Progression

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: replay-spine
- playerValue: Proves the game can actually be played from the beginning without developer injection or hidden grind walls.
- dependsOn: `LW-030`, `LW-031`, `LW-032`, `LW-033`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: natural progression E2E, economy tuning, progression report and fixtures
- invalidates: `gate:natural-progression`, `gate:balance`, `gate:save`, `gate:maturity-score`
- requiredGate: clean-profile Node1-3 completion, fail/retry branch, reload/resume, first-clear idempotency, balance and visual smoke
- doneCriteria:
  - A clean profile reaches and completes Node1-3 using only player-visible actions and documented rewards/upgrades.
  - Test records elapsed active play, retries, rewards/costs, selected builds, stars, and every unlock reason.
  - No direct Store mutation occurs after initial reset; reload between nodes preserves correct state.
  - Node1-3 aggregate score >=90 and the natural-progression hard cap is cleared.
- verificationEvidence: []
- residualRisk:
  - Automation cannot determine whether optional grind feels satisfying; human campaign testing returns in final hardening.

## LW-035: Node4 Tide And Whirlpool Level

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Tests mobility mastery through current, safe lanes, whirlpool control, and a movement-focused Boss.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node4 LevelContract/runtime, Boss, production art/audio, mechanics QA
- invalidates: `gate:node4`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: tide/whirlpool/counter/Boss scenarios, visual/audio/performance, natural progression and smoke
- doneCriteria:
  - Currents and whirlpools telegraph before displacement and create route choices rather than random unavoidable damage.
  - Tide-focused active/relic choices provide counters without becoming mandatory.
  - Dedicated Boss combines learned movement rules in readable phases.
  - Node score >=82 with complete required asset and verification matrices.
- verificationEvidence: []
- residualRisk:
  - Forced movement must remain controllable under small-screen touch latency.

## LW-036: Node5 Multi-Core Defense Level

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Creates prioritization between fighting, rotating lanes, repairing, and spending a limited defensive resource.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node5 LevelContract/runtime, defense controls, Boss, production art/audio and QA
- invalidates: `gate:node5`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: core targeting/repair/failure/Boss scenarios, visual/audio/performance, smoke
- doneCriteria:
  - Multiple cores/lanes create distinct threats; enemies intentionally target objectives and expose their target state.
  - Player can repair or reinforce through a constrained, visible action with opportunity cost.
  - Failure identifies which core/lane collapsed and why; Boss changes lane pressure rather than acting as another homing enemy.
  - Node score >=82 with complete required asset and verification matrices.
- verificationEvidence: []
- residualRisk:
  - Defense tuning must avoid both passive autopilot and unwinnable simultaneous lane spikes.

## LW-037: Node6 Poison And Antidote Level

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Creates a clear resource race between exposure, antidote targets, damage, and route safety.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node6 LevelContract/runtime, poison/antidote loop, Boss, production art/audio and QA
- invalidates: `gate:node6`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: exposure/antidote/elite/Boss/failure scenarios, visual/audio/performance, smoke
- doneCriteria:
  - Poison severity, safe zones, antidote sources, and decay are visible and deterministic.
  - Antidote elites require engagement but do not spawn outside reachable bounds or create unavoidable death spirals.
  - Dedicated Boss manipulates poison space with taught counters and an achievable recovery path.
  - Node score >=90 as a campaign key level with complete assets and verification.
- verificationEvidence: []
- residualRisk:
  - Green/red poison cues need shape/animation redundancy for color-vision accessibility.

## LW-038: Node7 Tournament Round Level

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Offers discrete elite rounds, opponent selection, recovery decisions, and build matchups.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node7 round/choice controller, elite roster, Boss, production art/audio and QA
- invalidates: `gate:node7`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: round transition/opponent choice/recovery/Boss scenarios, build matchups, visual/audio/performance
- doneCriteria:
  - Tournament is divided into authored rounds with clear start/end, optional opponent order, and bounded recovery/reward choices.
  - Elite opponents have distinct move kits and do not reuse only HP multipliers.
  - Final opponent remixes earlier cues and respects all damage/telegraph contracts.
  - Node score >=82 with complete required asset and verification matrices.
- verificationEvidence: []
- residualRisk:
  - Opponent ordering must not create one universally optimal low-risk path.

## LW-039: Node8 Branching Room Expedition

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Adds exploration, route identity, optional risk, and run-to-run variation beyond a single empty arena.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node8 room graph/seed contract, room templates, Boss, production art/audio and QA
- invalidates: `gate:node8`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: seeded route/room/treasure/trap/Boss scenarios, save/re-entry, visual/audio/performance
- doneCriteria:
  - Generate a small deterministic room graph with visible branch information, at least combat/risk/recovery/treasure room roles, and finite completion.
  - Route choices alter rewards or later encounter conditions and are stored in the run snapshot.
  - Re-entry and scene transitions clean up rooms, timers, colliders, and assets without residue.
  - Node score >=82 with complete required asset and verification matrices.
- verificationEvidence: []
- residualRisk:
  - Procedural variety must not exceed the number of genuinely authored room templates.

## LW-040: Node9 Escort Route Level

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Creates route control, threat interception, escort commands, and recoverable objective pressure.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node9 route/escort AI, command controls, ambushes, Boss, production art/audio and QA
- invalidates: `gate:node9`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: route/escort command/targeting/downed recovery/Boss scenarios, mobile visual/performance
- doneCriteria:
  - Escort follows an authored route and supports at least hold/follow or route-choice agency; enemies expose whether they target player or escort.
  - Objective damage has warning and recovery opportunities; collision does not simply delete attackers for fixed percentage damage.
  - Dedicated ambush Boss interacts with route position and escort protection.
  - Node score >=90 as a campaign key level with complete assets and verification.
- verificationEvidence: []
- residualRisk:
  - Escort pathfinding must stay deterministic enough for tests and forgiving enough for touch play.

## LW-041: Node10 Interactive Siege Defense

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Makes the wall and siege engines tactical systems rather than rectangles that auto-fire by proximity.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node10 lane/siege controller, active ballista controls, Boss, production art/audio and QA
- invalidates: `gate:node10`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: lane targeting/ballista cost-wall damage/repair/Boss scenarios, mobile visual/performance
- doneCriteria:
  - Lanes, wall sections, ballista ammo/cooldown, repair or reinforcement, and enemy siege roles are visible and player controlled.
  - Siege weapons require an explicit action/aim or lane choice and cannot silently farm the map.
  - Dedicated commander Boss coordinates pressure and exposes counterplay through siege systems.
  - Node score >=82 with complete required asset and verification matrices.
- verificationEvidence: []
- residualRisk:
  - Large wave fantasy must be achieved through pooling, background crowds, and budgets rather than hundreds of full AI bodies.

## LW-042: Node11 Elite Expedition Gauntlet

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Tests build resilience across authored elite combinations and limited recovery before the finale.
- dependsOn: `LW-034`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node11 gauntlet/encounter deck, recovery choices, Boss, production art/audio and QA
- invalidates: `gate:node11`, `gate:campaign-balance`, `gate:art-audio-coverage`
- requiredGate: encounter sequence/recovery/build-counter/Boss scenarios, visual/audio/performance, save/resume
- doneCriteria:
  - Replace escalating spawn multipliers with an authored elite encounter deck and explicit rest/reward choices.
  - Combinations test different build weaknesses but always preserve at least one skill-based recovery route.
  - Finale setup communicates carried resources, build, and remaining challenge without a long filler timer.
  - Node score >=82 with complete required asset and verification matrices.
- verificationEvidence: []
- residualRisk:
  - Difficulty must reward mastery without demanding one specific relic school.

## LW-043: Node12 Three-Phase Finale

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Pays off the campaign with a fair, spectacular final exam instead of a ten-minute timer or arbitrary one-touch death.
- dependsOn: `LW-035`, `LW-036`, `LW-037`, `LW-038`, `LW-039`, `LW-040`, `LW-041`, `LW-042`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node12 finale LevelContract/Boss controller, cut transitions, ending/results, production art/audio and QA
- invalidates: `gate:node12`, `gate:boss`, `gate:campaign-balance`, `gate:art-audio-coverage`, `gate:maturity-score`
- requiredGate: every move/phase/transition/break/defeat/victory/ending scenario, all-build clears, visual/audio/performance and save results
- doneCriteria:
  - Remove the 600-second inherited survival win and contact one-shot; victory requires defeating a documented three-phase Boss inside a tuned encounter length.
  - Phases first recall, then combine, then transform mechanics taught across the campaign without introducing an untelegraphed final gimmick.
  - Phase transitions clean hazards, checkpoint the move state, change music/visual identity, and preserve deterministic results.
  - Node12 score >=90 with unique actor/move/arena/finale assets and complete verification.
- verificationEvidence: []
- residualRisk:
  - Finale narrative wording remains original and must pass public-share scanning before release.

## LW-044: Full Campaign Balance And Replay Pass

- status: todo
- requirementId: REQ-20260711-001
- iteration: 2
- stage: full-campaign
- playerValue: Makes the complete journey paced, varied, fair, and worth replaying instead of twelve disconnected demos.
- dependsOn: `LW-043`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: Node1-12 balance/economy contracts, challenge/star/drop tuning, campaign reports
- invalidates: `gate:balance`, `gate:natural-progression`, `gate:maturity-score`, `gate:full-campaign`
- requiredGate: three-build campaign simulation, natural progression checkpoints, every-node score report, grind/TTK/performance thresholds
- doneCriteria:
  - Tune run length, XP cadence, TTK, damage pressure, rewards, upgrade costs, stars, challenges, and repeat drops across all 12 nodes.
  - All three schools have viable campaign paths; no node is trivialized or made mandatory by one relic.
  - Every node scores >=82, key nodes 1/3/6/9/12 score >=90, and campaign average is >=88 before final polish.
  - No balance, thin-level, Boss, or natural-progression hard cap remains.
- verificationEvidence: []
- residualRisk:
  - Final subjective pacing still requires a continuous human campaign session.

## LW-045: Campaign Art Coverage Completion

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: release-hardening
- playerValue: Gives every chapter, enemy, Boss, objective, item, and result surface a coherent production identity.
- dependsOn: `LW-044`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: full imagegen pipeline, actor/environment/UI manifests, RuntimeSprites, art reports and runtime captures
- invalidates: `gate:art-coverage`, `gate:visual`, `gate:performance`, `gate:release-assets`
- requiredGate: manifest/slicer determinism, frame differences/contact sheets, runtime loaded/missing counts, Node1-12 visual captures, build/smoke
- doneCriteria:
  - Production bitmap runtime coverage is >=95% overall and 100% for player, objectives, all Bosses, and critical moves.
  - Actor action clips use generated full-body frames, not distorted stills; adjacent-frame motion checks and human contact-sheet review pass.
  - Every node has background/ground/foreground/landmark/objective/hazard/decor identity with no empty-grid production view.
  - No player-visible placeholder or dominant procedural fallback remains.
- verificationEvidence: []
- residualRisk:
  - Asset size must remain inside the release preload/lazy-load budget.

## LW-046: Campaign Audio Coverage Completion

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: release-hardening
- playerValue: Sustains chapter identity and makes actions, danger, objectives, Boss phases, and outcomes audible.
- dependsOn: `LW-044`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: complete audio/voice manifests and assets, runtime channel transitions, credits/provenance and reports
- invalidates: `gate:audio-coverage`, `gate:release-assets`, `gate:full-campaign`
- requiredGate: decode/fetch/manifest checks, chapter/Boss/victory/defeat transitions, rapid SFX overlap, mute/volume/pause/visibility, campaign smoke
- doneCriteria:
  - Cover menu, chapter groups, every Boss, finale, victory and defeat music states; every critical player/enemy/objective/UI action has an intentional cue.
  - All assets have provider/source/license/provenance; no unclear third-party file enters the public package.
  - Music transitions compare semantic keys, fade correctly, never layer accidentally, and respect user gesture and settings.
  - Audio matrix and runtime cache/missing status report 100% critical coverage.
- verificationEvidence: []
- residualRisk:
  - Provider-generated voice may be replaced with original visual callouts if licensing or credentials are unavailable.

## LW-047: Game Feel, Accessibility And Mobile Performance Pass

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: release-hardening
- playerValue: Makes the polished content comfortable, responsive, readable, and stable during actual phone play.
- dependsOn: `LW-045`, `LW-046`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: VFX/camera/hit-stop/haptics/settings, responsive UI, pooling/loading/performance reports
- invalidates: `gate:visual`, `gate:performance`, `gate:accessibility`, `gate:maturity-score`
- requiredGate: 390x844/430x932/720x1280/desktop visual regression, P95 FPS/object/memory budgets, reduced-motion/color cue/haptic settings
- doneCriteria:
  - Tune hit stop, shake, flash, haptics, damage numbers, telegraphs, and animation timing with explicit maximums and reduced-motion alternatives.
  - Normal combat P95 >=55 FPS and Boss peaks P95 >=50 FPS in the defined browser profile; object, particle, texture and scene residue budgets pass.
  - Touch controls remain reachable and stable under safe-area insets; no text overflow, accidental scroll, or combat occlusion.
  - Critical cues use shape/motion/outline as well as color; settings persist through Save v2.
- verificationEvidence: []
- residualRisk:
  - A physical mid-range phone check remains desirable because desktop emulation cannot reproduce thermal throttling.

## LW-048: Full QA, Export And Public-Safety Gate

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: release-hardening
- playerValue: Ensures the game players receive is the same complete, error-free game that was reviewed.
- dependsOn: `LW-047`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: full E2E/visual/performance/save/content/export reports and standalone artifact
- invalidates: `gate:release`, `gate:export`, `gate:content-safety`, `gate:maturity-score`
- requiredGate: clean-save campaign checkpoints, all mechanisms/Bosses/builds, save migration/corruption, export unzip/start, zero errors/404, content safety
- doneCriteria:
  - Run natural progression, Node1-12 smoke, per-node mechanics, all Boss phases, three builds, fail/retry/pause/background/reload and save recovery suites.
  - Export a standalone artifact, unpack it into a clean temporary directory, serve it, and pass Node1/Node12/resource/save smoke without repo-relative dependencies.
  - Public artifact excludes collaboration docs, historical protected-IP notes, secrets, caches, source atlases not intended for release, and unrelated core demos.
  - All console/page/network errors, missing assets, Vite import warnings, and lifecycle residue are zero or explicitly fixed before pass.
- verificationEvidence: []
- residualRisk:
  - External store/platform requirements are outside scope until a release target is chosen.

## LW-049: Game 9/10 Final Acceptance

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: release-hardening
- playerValue: Provides an evidence-backed completion decision rather than a celebratory self-rating.
- dependsOn: `LW-048`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: final maturity report, review record, 30-minute campaign playtest and accepted release artifact
- invalidates: `gate:maturity-score`, `gate:requirement-final-review`
- requiredGate: `maturity:gate`, all report freshness checks, 30-minute human campaign playtest, final Codex review
- doneCriteria:
  - Game score >=90/100, every dimension clears its minimum, no hard cap, no missing critical evidence, and no P0/P1 finding.
  - Human session records comprehension, deaths, fatigue, build decisions, control issues, and replay intent; required changes are rerun through affected gates.
  - All reports point to the same source/build version and the accepted standalone artifact.
  - Codex requirement-level review maps every human Acceptance Criterion to evidence or a human-approved waiver.
- verificationEvidence: []
- residualRisk:
  - A 9/10 score is scoped to the agreed mobile H5 audience and rubric, not a universal market rating.

## LW-050: Extract Proven Mature Gameplay Core

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: loreweaver-productization
- playerValue: Ensures future LoreWeaver projects inherit the proven combat and level contract rather than the old thin survivor template.
- dependsOn: `LW-029`, may proceed in parallel with later campaign content after Node1 acceptance
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: `minigame_master/core` gameplay runtime, LevelContract, test hooks, compatibility adapter and docs
- invalidates: `gate:core-contract`, `gate:runtime-e2e`, `gate:target-regression`
- requiredGate: core contract/unit/demo E2E, target Node1 parity, existing adapter regressions, build/docs gates
- doneCriteria:
  - Extract only interfaces proven by the Node1 vertical slice: input actions, enemy moves, run director, result metrics, asset/audio requirements, teardown and test state.
  - Existing GameplayAdapter consumers remain compatible or migrate through a documented version boundary.
  - Core demo proves the template independently; target game still passes its own Node1 acceptance.
  - No theme-specific names, assets, save keys, or balance constants leak into reusable core.
- verificationEvidence: []
- residualRisk:
  - Later objective types may extend the contract but cannot weaken existing lifecycle and evidence requirements.

## LW-051: LoreWeaver Workspace Compiler And Gameplay Card V2

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: loreweaver-productization
- playerValue: Lets LoreWeaver create a real maintainable game workspace instead of a manifest preview with implied features.
- dependsOn: `LW-050`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: LoreWeaver backend compiler, templates, Gameplay Card schema/UI, generated workspace fixtures
- invalidates: `gate:gameplay-card-schema`, `gate:workspace-generation`, `gate:export`, `gate:app-build`
- requiredGate: golden generated workspace, schema validation, build/runtime E2E, revision invalidation and existing import/export regressions
- doneCriteria:
  - Compiler emits a complete Vite/Phaser source tree, LevelContracts, save/result runtime, assets/manifests, scripts, reports, and package commands.
  - Gameplay Card V2 declares runtime template, required assets, balance/score models, test scenarios, performance budget, compatible modifiers, and maturity impact.
  - Design-only cards are visibly blocked from production export until an adapter/template and tests exist.
  - Generated files have ownership/source metadata and can be regenerated without overwriting user-owned patches silently.
- verificationEvidence: []
- residualRisk:
  - Full arbitrary-code synthesis remains constrained; supported templates provide the production guarantee.

## LW-052: LoreWeaver Asset Jobs And Source Patch Workflow

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: loreweaver-productization
- playerValue: Makes visual/audio quality and code iteration first-class, reviewable operations instead of manual folder drops or JSON-only tweaks.
- dependsOn: `LW-051`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: asset job manifests/runners, provenance/license UI, source patch/diff/risk/gate workflow
- invalidates: `gate:asset-pipeline`, `gate:patch-workflow`, `gate:app-build`, `gate:runtime-e2e`
- requiredGate: deterministic fixture jobs, manifest/runtime coverage, patch apply/reject/rollback, gate invalidation, app lint/build/E2E
- doneCriteria:
  - Image/audio jobs create or ingest assets, post-process/slice, write semantic manifests/provenance/licenses, and verify runtime loading.
  - Source patches declare file ownership, patch level, before/after diff, invalidated gates, rollback snapshot, and test evidence.
  - Agent cannot mark production-ready when required asset/test/performance evidence is missing.
  - Secrets and provider credentials never enter workspace manifests, reports, exports, or logs.
- verificationEvidence: []
- residualRisk:
  - Provider availability varies; jobs must support pending/manual asset fulfillment without fabricating success.

## LW-053: Real Standalone Export Pipeline

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: loreweaver-productization
- playerValue: Delivers the actual authored game rather than a shell that displays its manifest.
- dependsOn: `LW-051`, `LW-052`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L4
- targetArtifact: LoreWeaver export API/compiler, release manifest, ZIP filter and export smoke
- invalidates: `gate:export`, `gate:release`, `gate:app-build`
- requiredGate: build->zip->unpack->serve E2E, asset/save/Node smoke, path traversal/filter/security tests, existing import/export regression
- doneCriteria:
  - Export builds and packages workspace-owned source, production assets, runtime dependencies, credits, and release metadata with no repo-relative imports.
  - ZIP excludes internal docs, caches, secrets, raw provider config, irrelevant demos, test-only profiles, and stale dist.
  - Clean-directory smoke verifies load, resource integrity, save, Node launch/return, and zero console/page/network errors.
  - UI reports artifact version, size, included asset counts, gates, warnings, and reproducible command metadata.
- verificationEvidence: []
- residualRisk:
  - Hosting/deployment remains separate from a correct standalone artifact.

## LW-054: Original-Theme Cold-Start Reproduction

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: loreweaver-productization
- playerValue: Proves LoreWeaver's maturity is reusable and not hidden handwork unique to one game.
- dependsOn: `LW-053`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: fresh generated workspace, generation log, Node1 artifact, maturity/export reports
- invalidates: `gate:workspace-generation`, `gate:maturity-score`, `gate:export`
- requiredGate: cold-start generation, workspace build, Node1 natural E2E, art/audio/runtime coverage, export smoke and score report
- doneCriteria:
  - Generate a new wholly original theme without copying target names/assets and without manually scaffolding source files after generation.
  - Produced Node1 is playable with active controls, authored beats, Boss, result/save flow, required asset manifests, and tests.
  - Document every human intervention; compiler defects become tasks rather than hidden manual corrections.
  - LoreWeaver production score reaches >=85/100 with evidence from both target and cold-start workspaces.
- verificationEvidence: []
- residualRisk:
  - Generated content quality may still need creative direction, but production structure and gates must be complete.

## LW-055: Program Final Review And Closeout

- status: todo
- requirementId: REQ-20260711-001
- iteration: 3
- stage: final-acceptance
- playerValue: Confirms both the game and the tool have met the promised outcome with no unresolved evidence gap.
- dependsOn: `LW-049`, `LW-054`
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: requirement-level review, final state/handoff, accepted artifacts and evidence index
- invalidates: `gate:requirement-final-review`
- requiredGate: game >=90, LoreWeaver >=85, all acceptance mappings, all reports fresh, no P0/P1, human acceptance
- doneCriteria:
  - Every task is verified or has an explicit human-approved waiver; skipped work cannot be silently counted in either score.
  - Final evidence index links source/build versions, reports, screenshots, audio/art manifests, playtests, exports, and cold-start artifact.
  - `state.md`, `tasks.md`, `review.md`, `review_request.md`, and `handoff.md` agree on completion and residual risks.
  - Human confirms final acceptance before requirement status moves from `requirement_ready` to `accepted`.
- verificationEvidence: []
- residualRisk:
  - Post-release telemetry and live operations are outside this local build objective unless separately requested.
