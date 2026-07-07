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

- status: waiting_for_antigravity
- requirementId: REQ-20260706-001
- iteration: 3
- iterationGoal: 验收与公开导出风险收束
- owner: Antigravity
- reviewer: Codex
- patchLevel: L3
- targetArtifact: `LoreWeaver/data/workspaces/20260611-060754-719406/scripts`, `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`, `minigame_master/workflow/scripts/run_e2e_test.py`, `minigame/perfectworld_dahuang`
- sourceReview: `LW-011`
- invalidates: `gate:e2e-smoke`, `gate:workspace-build`, `gate:docs-collab`
- requiredGate: `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run build`, `npm run check:docs-collab`, `Node1-12 smoke gate`
- doneCriteria:
  - Add or stabilize a repeatable Node1-12 smoke gate for the target workspace and/or tracked mirror that records machine-readable evidence for each node entering, staying alive/active briefly, and returning to `MainScene` or `GameOverScene` without console/page errors.
  - Prefer a workspace-local script and `npm` script when feasible; if the shared `minigame_master/workflow/scripts/run_e2e_test.py` must change, preserve existing `xianni` and `perfectworld_dahuang --node` behavior.
  - Use existing runtime hooks such as `NodeBridge.launchNode`, `window.__DAHUANG_NODE_TEST_STATE__`, and art/audio pipeline globals; avoid gameplay behavior changes unless the smoke exposes a real bug.
  - Write a latest report under the target workspace `reports/` or the workflow report directory, and record enough per-node detail for Codex review.
  - Do not broaden into Node4-12 gameplay redesign; this slice is QA evidence and stability only.
- verificationEvidence: []
- residualRisk:
  - A smoke gate proves entry/exit stability, not fun, balance, readable boss phases, or replay value.
  - Browser automation may still miss mobile touch ergonomics and visual overlap; manual/mobile screenshot QA remains separate.
  - If a node fails smoke because of a real runtime bug, Antigravity should either make the smallest fix in scope or return `changes_requested` evidence instead of weakening assertions.
