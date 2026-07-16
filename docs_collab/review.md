# Review

## LW-001

- task: LW-001
- requirementId: REQ-20260706-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scenes/GameOverScene.js`
- commandsChecked:
  - `npm run build`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `venv/bin/python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 1`

### Resolved Findings

- P1 `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js:519`
  Exposed stable test state hook `window.dahuangTestState` containing
  currentNodeId, sceneKey, movementMode, hp, kills, level, activeSkills,
  rewards, and firstNodeGrowth.
- P2 `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js:537`
  Tracked and exposed `movementMode` state as 'pointer' or 'keyboard'.
- P3 `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js:531`
  Configured auto-cleanup of the test state hook on scene shutdown.

### Notes

- Keyboard/WASD movement, mobile drag inputs, Crimson/Azure/Emerald triangle
  mechanics, Emerald projectiles, Silver Winged Eagle miniboss, and
  GameOverScene loot logs are correctly implemented and build successfully.
- E2E smoke test for Node 1 runs and passes without console or page errors.

---

## LW-002

- task: LW-002
- requirementId: REQ-20260706-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node2.js`
- commandsChecked:
  - `npm run build`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `venv/bin/python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 2`

### Findings

- None open.

### Notes

- Proximity-based chest channeling system (takes 2 seconds, radius 40 to start,
  50 to maintain) successfully replaces instant chest collection.
- Progress bar renders dynamically over player's head.
- Interruption mechanics triggered correctly on leaving range or taking damage.
- Risk-reward pressure is implemented by spawning 2 fast-moving aggressive
  beasts (orange tint, 1.5x speed) when channeling begins.
- Runtime test hook extended to expose `chestChanneling` with getters for
  `isChanneling`, `channelProgress`, and `activeChestIndex`.
- Node 2 E2E smoke test runs and passes successfully under Playwright.

---

## LW-003

- task: LW-003
- requirementId: REQ-20260706-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node3.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scenes/GameOverScene.js`
- commandsChecked:
  - `npm run build`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `venv/bin/python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 3`

### Findings

- None open.

### Notes

- Color-shifting Rival Pressure HUD bar is implemented at the top, increasing
  gradually over time (scaled by enemy count) and by +5 on taking damage.
- Pressure overflow (100%) triggers defeat with cause text rendering on
  GameOverScene ("重瞳者威压过载败北").
- Boss Shi Yi has warning announcements, flashing telegraph circles, static
  charge phase (1.6s), and 8-directional projectile attack logic.
- Break window mechanism: dealing >=30 damage during telegraph stage breaks
  charging, decreases pressure, and stuns boss for 3s (takes 2x damage).
- E2E state hook extended with `rivalPressure` exposing `currentPressure`,
  `bossState`, and `breakWindowActive`.
- Node 3 E2E smoke test runs and passes successfully under Playwright.

---

## LW-004

- task: LW-004
- requirementId: REQ-20260706-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `minigame_master/workflow/scripts/run_e2e_test.py`
  - `LoreWeaver/workflow/scripts/run_e2e_test.py`
- commandsChecked:
  - `npm run check:docs-collab`
  - `venv/bin/python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 1`
  - `venv/bin/python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 2`
  - `venv/bin/python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 3`

### Findings

- None open.

### Notes

- E2E smoke test runner script `run_e2e_test.py` successfully updated and verified.
- Node 1 assertions correctly verify virtual joystick touch-drag interaction (checking
  `movementMode` updates to `'touch-drag'`) and growth skill level-ups (activeSkills level).
- Node 2 assertions verify chest channeling is triggered by proximity and that chest
  collection outputs rewards successfully (rewards count checks).
- Node 3 assertions check rival pressure increases over time and that boss state transitions
  work correctly.
- Enhanced Playwright exception handling is in place with screenshots and detailed active
  scene, action descriptor, and browser console log listings on errors.

---

## LW-005

- task: LW-005
- requirementId: REQ-20260706-001
- iteration: 2
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406`
- commandsChecked:
  - `npm run build`
  - `mobile screenshot smoke for Node1-3`

### Findings

- None open.

### Notes

- Mobile vertical viewport HUD layout check completed successfully at 720x1280.
- Custom screenshots `lw005_node1_mobile.png`, `lw005_node2_mobile.png`, and
  `lw005_node3_mobile.png` captured and verified under `screenshots/`.
- No incoherent overlap between HUD, virtual joystick, level-up choices, and
  boss pressure bars.
- Node 2 scene shutdown return flow error is fully fixed.

---

## LW-006

- task: LW-006
- requirementId: REQ-20260706-001
- iteration: 2
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/utils/RuntimeSprites.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/utils/AudioManager.js`
- commandsChecked:
  - `npm run build`
  - `browser art/audio hook smoke`

### Findings

- None open.

### Notes

- Audio and visual coverage and pipeline checked successfully via browser hook smoke.
- Exposed properties `window.__DAHUANG_ART_PIPELINE__` and `window.__DAHUANG_AUDIO_PIPELINE__`
  correctly show 100% Node 1 atlas coverage, webaudio synth mode, and 19 cues.

---

## LW-007

- task: LW-007
- requirementId: REQ-20260706-001
- iteration: 2
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/assets/imagegen/manifest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/assets/imagegen/provenance.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/assets/imagegen/atlas.png`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node2.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node3.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/utils/RuntimeSprites.js`
  - `minigame/perfectworld_dahuang/assets/imagegen/manifest.json`
  - `minigame/perfectworld_dahuang/assets/imagegen/manifest.js`
  - `minigame/perfectworld_dahuang/assets/imagegen/provenance.json`
  - `minigame/perfectworld_dahuang/assets/imagegen/atlas.png`
  - `minigame/perfectworld_dahuang/nodes/node2.js`
  - `minigame/perfectworld_dahuang/nodes/node3.js`
  - `minigame/perfectworld_dahuang/utils/RuntimeSprites.js`
  - `minigame_master/workflow/scripts/run_e2e_test.py`
  - `LoreWeaver/docs_collab/review_request.md`
  - `LoreWeaver/docs_collab/screenshots/lw007_node2_mobile.png`
  - `LoreWeaver/docs_collab/screenshots/lw007_node3_mobile.png`
- commandsChecked:
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`
  - Antigravity browser art-pipeline smoke on `http://127.0.0.1:18082/index.html`
  - Antigravity mobile screenshot smoke at 720x1280 for Node2 and Node3

### Findings

- None open.

### Notes

- Atlas replacement for `chest_gold` (Node2) and `boss_projectile` (Node3) is aligned across the ignored target workspace and the tracked source mirror.
- Target and mirror manifests expose 10 frames on a `256x192` atlas; provenance records both local Pillow-drawn additions and no external asset dependency for these two frames.
- Node2 chest creation and Node3 boss projectile creation now try `createAtlasFrameTexture()` before procedural fallback, and `RuntimeSprites.js` no longer reports these two keys as missing coverage.
- Antigravity browser smoke read `window.__DAHUANG_ART_PIPELINE__`: `atlasLoaded` was true, Node2 atlas frame keys included `chest_gold`, Node3 atlas frame keys included `boss_projectile`, both keys were absent from missing/fallback lists, and no page errors were reported.
- Codex reviewer gates passed on 2026-07-07: `manifest:check`, `loreweaver:check`, `ability:check`, `build`, and docs evidence check.
- Reviewed screenshots `lw007_node2_mobile.png` and `lw007_node3_mobile.png` show nonblank 720x1280 gameplay states for the changed chest and boss projectile/telegraph paths.
- Remaining Node2/Node3 character and boss sprites are still procedural fallback; that is recorded as follow-up risk, not a blocker for this two-key atlas slice.

---

## LW-008

- task: LW-008
- requirementId: REQ-20260706-001
- iteration: 3
- verdict: pass
- filesReviewed:
  - `LoreWeaver/workflow/scripts/content_safety_scan.mjs`
  - `LoreWeaver/workflow/reports/content_safety_scan_latest.json`
  - `minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/index.html`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/manifest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/js/data.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scenes/MenuScene.js`
  - `minigame/perfectworld_dahuang/index.html`
  - `minigame/perfectworld_dahuang/manifest.json`
  - `minigame/perfectworld_dahuang/js/data.js`
  - `minigame/perfectworld_dahuang/scenes/MenuScene.js`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `node LoreWeaver/workflow/scripts/content_safety_scan.mjs`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`

### Findings

- None open.

### Notes

- The scan now covers the target workspace, tracked mirror, shared export runtime, and generated app dist, with public-share blockers separated from generated/history notes.
- Codex reviewer reran the scan on 2026-07-07; it returned `passed_with_notes` with zero warnings and 145 note-level findings.
- The former blocking `石昊` fallback in `SurvivorHordeAdapter.js` was replaced with generic player/hero/avatar/protagonist matching and a neutral runtime texture key.
- High-priority public entry points and Node1-3 player-facing copy were originalized in the target workspace and tracked mirror: title, sidebar copy, player name, early node titles, rival names, core ability display names, and menu/help text.
- Target reviewer gates passed on 2026-07-07: `manifest:check`, `loreweaver:check`, `ability:check`, `build`, and docs evidence check.
- Remaining notes are acceptable for this L2 slice because they are historical docs, generated bundles, Node4-12 follow-up copy, audio descriptions, or contract-sensitive runtime identifiers.
- The tracked mirror manifest is now consistent with its own split-manifest builder but is less metadata-rich than the target workspace manifest; schema parity is recorded as a follow-up risk rather than a blocker for this public-text slice.

---

## LW-009

- task: LW-009
- requirementId: REQ-20260706-001
- iteration: 3
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-progression-contract.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js`
  - `minigame/perfectworld_dahuang/nodes/node1.js`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run progression:check`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`

### Findings

- None open.

### Notes

- The new `progression:check` gate audits target workspace and tracked mirror Node1-12 rewards, failure reward fallback, scene files, skill pools, ability unlock intent, GameOver result display, store persistence, and NodeBridge result flow.
- Codex reviewer reran `progression:check` on 2026-07-07; it returned `passed_with_notes` with 0 errors and 14 notes split evenly across target and mirror.
- Generic Node1-derived results now include `failureReason` for failure and retreat paths, and final test state exposes that failure reason.
- Generic sequential unlock now caps at Node12, so a successful final node no longer emits a non-existent Node13 unlock.
- Reviewer gates passed on 2026-07-07: `progression:check`, `manifest:check`, `loreweaver:check`, `ability:check`, `build`, and docs evidence check.
- Remaining notes on Node5, Node7, and Node9-12 lacking first-clear ability unlocks are valid follow-up work and are captured in LW-010.

---

## LW-010

- task: LW-010
- requirementId: REQ-20260706-001
- iteration: 3
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-progression-contract.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/progression_contract_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/js/data.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-05-shidu.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-07-three-thousand-states.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-09-tianshen-academy.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-10-imperial-pass.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-11-foreign-land.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-12-final-battle.json`
  - `minigame/perfectworld_dahuang/loreweaver/ability-catalog.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-05-shidu.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-07-three-thousand-states.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-09-tianshen-academy.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-10-imperial-pass.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-11-foreign-land.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-12-final-battle.json`
  - `minigame/perfectworld_dahuang/manifest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run progression:check`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`

### Findings

- None open.

### Notes

- Codex reviewer reran `progression:check` on 2026-07-07; it returned `passed` with 0 errors, 0 notes, target notes 0, and mirror notes 0.
- Node5, Node7, Node9, Node10, and Node11 are explicitly classified as `reinforce_existing(...)` first-clear intent nodes, and the check still errors if a listed reinforcement ability id is unknown.
- Node12 now has a real `rewardUnlocks: ["he_hua_zizai"]` finale reward in both target and mirror, and the ability check includes `万象化影`.
- Reviewer gates passed on 2026-07-07: `progression:check`, `manifest:check`, `loreweaver:check`, `ability:check`, `build`, and docs evidence check.
- The remaining progression risks are out of scope for this L2 slice: new runtime abilities, flag-driven unlocks, first-clear idempotency, best-result scoring, and save-key migrations.

---

## LW-011

- task: LW-011
- requirementId: REQ-20260706-001
- iteration: 3
- verdict: pass
- filesReviewed:
  - `LoreWeaver/workflow/reports/content_safety_scan_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-04-kunpeng-nest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-05-shidu.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-06-yaodu.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-07-three-thousand-states.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-08-xiangu.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-09-tianshen-academy.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-10-imperial-pass.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-11-foreign-land.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/nodes/node-12-final-battle.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/audio-cue-catalog.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node4.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node12.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/split-loreweaver-manifest.mjs`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-04-kunpeng-nest.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-05-shidu.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-06-yaodu.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-07-three-thousand-states.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-08-xiangu.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-09-tianshen-academy.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-10-imperial-pass.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-11-foreign-land.json`
  - `minigame/perfectworld_dahuang/loreweaver/nodes/node-12-final-battle.json`
  - `minigame/perfectworld_dahuang/nodes/node4.js`
  - `minigame/perfectworld_dahuang/nodes/node12.js`
  - `minigame/perfectworld_dahuang/scripts/split-loreweaver-manifest.mjs`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `node LoreWeaver/workflow/scripts/content_safety_scan.mjs`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`

### Findings

- None open.

### Notes

- Codex reviewer reran the content safety scan on 2026-07-07; it returned `passed_with_notes` with 0 warnings and 89 notes, down from the LW-011 baseline of 145.
- The reviewed report has 0 remaining findings for Node4-12 split JSON, target audio cue catalog, target/mirror manifests, Node4/Node12 runtime JS, and target Node8/11/12 iframe HTML titles.
- A direct term search over the LW-011 live-scope files found no remaining scanned legacy names or motif terms.
- Node4 display title `天潮巢` remains mapped to the existing `kunpeng-nest` split slug; runtime ids, ability ids, enemy ids, node ids, save keys, and schema fields were not renamed.
- Reviewer gates passed on 2026-07-07: content safety scan, `manifest:check`, `loreweaver:check`, `ability:check`, `build`, and docs evidence check.
- Remaining 89 scan notes are accepted for this slice because they are historical docs/archive text, old/generated dist, legacy Node2/3 split slug mappings, VFX comments, or the shared runtime classifier note.

---

## LW-012

- task: LW-012
- requirementId: REQ-20260706-001
- iteration: 3
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/run-node-release-smoke.py`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/index.html`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`
  - strict JSON assertion over `reports/node1_12_release_smoke_latest.json`

### Findings

- Resolved P1: the first review found that a startup `/favicon.ico` 404 was recorded but did not fail the gate. The implementation now captures console location, HTTP response errors, request failures, and page errors; any global or node-scoped occurrence fails the report. The missing favicon was fixed with a local embedded icon rather than a whitelist.

### Notes

- Final report records 12/12 nodes entered, remained active for 1800 ms, and returned to `MainScene`; Node1-11 use retreat and Node12 uses the observed `GameOverScene` route.
- Final top-level and per-node console, page, HTTP response, and request-failure counts are all zero.
- Codex reran all non-browser workspace and collaboration gates successfully on 2026-07-11.
- Codex's browser-smoke rerun could not bind a loopback port inside the current sandbox, and escalation was unavailable because the execution quota was exhausted. Review therefore used the fresh Antigravity report, direct runner inspection, strict report assertions, and the independently rerun non-browser gates as replacement evidence.
- This gate proves launch/short activity/return stability only. It does not prove fun, balance, mobile ergonomics, natural progression, art quality, audio quality, or 9/10 maturity.

---

## LW-013 Review 1

- task: LW-013
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/maturity-rubric.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-maturity.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run maturity:report`
  - expected-failing `npm run maturity:gate`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run progression:check`
  - `npm run build`
  - `npm run check:docs-collab`
  - `git diff --check`

### Findings

- P1 `scripts/report-maturity.mjs:197` Every auxiliary report is trusted solely when its top-level `status` equals `passed`. A stale or hand-written minimal JSON can therefore award most evidence-backed points, clear progression/release blockers, and eventually make the gate lie. Introduce explicit per-report contracts that validate identity/schema, required semantic fields and thresholds, parseable generation time, and freshness against declared production inputs. All scoring, caps, and missing-evidence decisions must consume the validated evidence state, and the output must expose invalid/stale reasons.
- P1 `scripts/report-maturity.mjs:354` Several hard caps can be cleared by changing tokens without fixing the game: auto-combat clears as soon as any broad action-button marker is present, thin-level detection relies on one exact timer regex plus the mere text `nodeConfig.bossId`, fallback art clears at frame 13, and originality clears after removing only three phrases. `mobile_readability` is also hard-coded `active: false` despite being unverified. Require positive validated mechanics/art/visual/content evidence to clear these caps; represent unknown as `unverified` or conservatively active rather than falsely cleared.
- P1 `scripts/report-maturity.mjs:282` Category rationale is fixed baseline prose. It will continue claiming that controls, assets, audio, saves, and mobile evidence are missing even after the corresponding points pass, making future 90-point reports internally contradictory. Derive rationale and unmet criteria from the current point/evidence state on every run.
- P2 `scripts/report-maturity.mjs:40` The rubric advertises core/non-core minimum ratios, required missing-evidence IDs, and named hard caps, but validation only accepts whatever per-category ratio and ID list the same editable file supplies. Enforce the target ratios and exact required ID sets so accidental rubric drift cannot silently weaken the 9/10 gate.
- P2 `scripts/report-maturity.mjs:168` `offlineTimestampInitializedBeforeOfflineRead` is inferred only from two unrelated regex matches in different files and does not establish call order. Rename it into separately observable facts or collect the actual initialization/read ordering; do not report a causal conclusion the collector did not prove.

### Notes

- The baseline number itself is appropriately severe: reviewer rerun produced 30/100, seven active caps, four blocking evidence gaps, and all nine dimension minimum failures.
- `maturity:report` exited 0 and `maturity:gate` exited 1 as designed. All baseline workspace gates, build, docs evidence check, and `git diff --check` passed on 2026-07-11.
- LW-014 remains blocked on LW-013 verification because every later balance, visual, art, audio, campaign, and release report will feed this gate.

---

## LW-013 Review 2

- task: LW-013
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-maturity.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/maturity-rubric.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - focused synthetic balance/human evidence counterexample through `validateEvidenceObject`
  - contradictory `resolveCapState({ clearance: true, observedDefect: true })` counterexample
  - generated report evidence/cap/category assertions

### Findings

- P1 `scripts/maturity-evidence.mjs:184` Freshness dependencies do not cover the runtime behavior each report claims. Most critically, `balance` watches only `js/data.js`, `nodes`, and a currently absent `loreweaver/economy.json`; changes to `js/store.js`, `js/IdleEngine.js`, `scenes/MainScene.js`, result application, cave/breakthrough costs, or offline income leave an old balance report valid. Audit every contract's declared inputs against its claim, especially balance, progression, release smoke, and human playtest, so later runtime/UI/economy patches automatically invalidate affected evidence.
- P1 `scripts/maturity-evidence.mjs:210` `resolveCapState` lets positive clearance override a simultaneously observed defect, and the self-check explicitly blesses that behavior. Consequently a summary-only balance report can clear `late_game_balance` while Node12 still has an observed instant-fail projectile; content evidence can clear originality while anchor phrases remain; similar contradictions exist for auto-combat and thin levels. Strong current-source defects must win until removed. Refine weak observations where necessary, but require both validated positive evidence and no contradictory blocking observation before a cap is cleared.
- P1 `scripts/maturity-evidence.mjs:44` Future evidence contracts validate mostly self-declared summary fields. A six-field balance summary with no profile/node/violation rows and a six-field playtest summary with no human approval, session, deaths, decisions, fatigue, build, or notes both validate as `valid`. Summary must be a projection of report-specific detailed records whose counts and thresholds the validator recomputes. Human playtest additionally needs an explicit human-owned approval record and substantive session evidence; an Agent-authored `humanConfirmed: true` boolean cannot satisfy the gate.

### Notes

- Review 1's original defects are substantially improved: raw status-only JSON and stale reports are rejected, cap unknowns remain blocking, rationale is derived, rubric ratios/IDs are enforced, and offline facts no longer claim unproved ordering.
- The focused counterexample returned `minimalBalance.valid=true`, `minimalHuman.valid=true`, and `{ state: "cleared", active: false }` for simultaneous clearance plus observed defect. Add these exact cases to `maturity:self-check` as required failures.
- Include `maturity:self-check` in the maturity report's expected runtime scripts while touching this area.

---

## LW-013 Review 3

- task: LW-013
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-maturity.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
- commandsChecked:
  - direct detail-validator and cap-predicate inspection
  - generated evidence-state and category/cap assertions

### Findings

- P1 `scripts/maturity-evidence.mjs:122` Mechanics coverage is recomputed as 1 when a tag appears in any passing scenario. Twelve generic node scenarios plus all five quality tags on Node1 can therefore claim complete `manualActionCoverage`, `levelContractCoverage`, `bossPhaseCoverage`, `counterplayCoverage`, and `hitFeedbackCoverage`, clearing auto-combat/thin-level caps without Node2-12 coverage. Compute required per-node coverage for each tag (12/12 for the current campaign contract), expose ratios/counts, and require complete coverage before returning 1.
- P1 `scripts/maturity-evidence.mjs:306` Human playtest P0/P1 counts ignore findings with `accepted: true`. Accepting a severe defect is not fixing it, and the acceptance criteria require no open P0/P1. Give findings explicit resolution state/evidence, count every unresolved P0/P1 regardless of risk acceptance, and keep the machine gate blocked until they are resolved.
- P1 `scripts/report-maturity.mjs:390` `fallback_art` treats any `recordProceduralFallback(...)` call site as a permanent observed defect. The approved architecture intentionally retains a failure-only procedural fallback after production bitmap coverage reaches 100%, so this predicate makes 90/100 impossible without deleting resilience code. Keep the current baseline active from strong facts such as the ten-frame/no-action-matrix production set, but let validated zero-runtime-fallback art evidence clear the cap once the production manifest/action matrix is complete. Add a fixture proving dormant resilience fallback support does not block an otherwise complete production-art state.

### Notes

- Review 2 successfully fixed summary-only evidence, detailed count recomputation, broad freshness inputs, contradictory strong-defect precedence, human ownership, and expected self-check registration.
- Add `package.json` to the full production freshness set while touching the contract list.
- Broader artifact-path/hash verification can be strengthened by the producing art/audio/export tasks; it is not another LW-013 blocker once these three semantic errors are corrected.

---

## LW-013 Review 4

- task: LW-013
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/maturity-rubric.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-maturity.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run maturity:self-check`
  - `npm run maturity:report`
  - expected-failing `npm run maturity:gate`
  - attempted `npm run smoke:node1-12`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run progression:check`
  - `npm run build`
  - `npm run check:docs-collab`
  - strict maturity-report assertions
  - `git diff --check`

### Findings

- None open for LW-013.

### Notes

- Review 1-3 findings are resolved: auxiliary evidence is identity/detail/freshness validated; unsupported summaries fail; strong observed defects win; mechanics coverage is per tag across Node1-12; severe playtest findings require evidenced resolution; dormant failure-only art fallback remains allowed; rubric thresholds and waivers cannot weaken the machine gate.
- Reviewer rerun produced an honest 24/100 baseline, nine active-or-unverified caps, four blocking evidence gaps, all dimension minimum failures, stale release smoke, and valid progression evidence.
- The release smoke rerun reached `find_open_port()` but the sandbox denied loopback binding. Escalation was attempted and rejected by the current usage limit. The stale report remains uncredited and `release_integrity` stays active; this limitation does not invalidate the score collector's correct conservative behavior.
- Non-browser runtime/build/collaboration gates and strict report assertions passed on 2026-07-11. LW-014 may now consume the strict balance evidence contract.

---

## LW-014 Review 1

- task: LW-014
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/balance-simulation-config.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-balance-simulation.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-balance-simulation.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/systems/NodeBridge.js`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - direct report summary/profile/resource/violation assertions
  - source review of Store, IdleEngine, MainScene, NodeBridge, Node1-12, and registries

### Findings

- P1 `scripts/report-balance-simulation.mjs:255` The report calls sequential result unlocks `bypassable_node_progression`, but `NodeBridge.launchNode()` rejects entry when `progression.realm < realmRequired`. The actual defect is a prematurely interactive button and duplicated/divergent unlock state, not a playable realm bypass. Rename and model the real UI/launch contract; do not count 11 false bypass violations.
- P1 `scripts/report-balance-simulation.mjs:152` Resource reachability and repeats use only the current node's expected reward. Node4 is therefore labeled unable to obtain `suanBoneScript`, even though Node1 remains replayable and yields an expected 0.5 per clear. Compute farm availability across all currently accessible prior nodes, report the selected source/time per resource, and reserve `unreachable` for resources with no positive accessible source. Keep current-node yield as a separate local-sustain fact. Remove the invented fallback of four repeats for unreachable resources and state carryover/wallet assumptions explicitly.
- P1 `scripts/report-balance-simulation.mjs:245` The simulator emits a Boss-TTK violation only for Node12. Missing Node1 runtime Boss and sub-20-second Node2-11 Bosses can therefore let `balance:gate` pass while the strict maturity validator still rejects the same report. Add `missing_runtime_boss` and all-node Boss-TTK violations so the producing gate and consuming contract agree.
- P2 `loreweaver/balance-simulation-config.json:13` Boss HP multipliers and spawn behavior are manually duplicated from Node source without a drift assertion. A later Node edit will stale and regenerate the report but continue using old config values. Add focused source-contract checks or derive the supported multipliers/absence/instant-fail facts from runtime source; fail loudly when the audited mapping no longer matches.

### Notes

- Effective stat ordering, expected crit/DPS, Node12 5000 HP and instant-failure path, separate resource vectors, RNG labeling, and offline timestamp diagnosis are directionally sound.
- The current game should still fail hard after correction; the objective is to remove false findings and make the remaining violations trustworthy, not reduce the count cosmetically.
- Self-check currently asserts the false Node4 unreachable and bypass claims. Replace those fixtures with cross-node farming, launch-blocked UI divergence, missing Boss, all-Boss TTK, and runtime/config drift cases.

---

## LW-014 Review 2

- task: LW-014
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-balance-simulation.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-balance-simulation.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/maturity-evidence.mjs`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - direct report summary and violation-count assertions
  - per-profile/per-node cross-source farm-plan projection
  - source review of `farmPlanForCost` and balance self-check fixtures

### Findings

- P1 `scripts/report-balance-simulation.mjs:228` Multi-resource costs sourced from different nodes are treated as if those runs happen in parallel. The planner takes the maximum per-resource repeat count and reports only that resource's elapsed time. For fresh Node4 it reports 70 repeats/12,600 seconds while its own detail requires 70 Node4 clears plus 20 Node1 clears; fresh Node5 similarly collapses 54 Node5 plus 50 Node1 clears into 54 total. This systematically understates progression grind and violates the task's estimated-clears/time contract. Emit a deterministic sequential farm route whose node clear counts jointly satisfy every resource vector, credit every selected clear with all resources yielded by that node, and recompute total clears, total elapsed time, remaining deficits, and limiting/bottleneck explanation from the route. Source selection must account for duration, not merely highest yield per clear. Do not paper over the issue with a blind sum of independently selected resources, because one clear may legitimately satisfy multiple costs.

### Notes

- Review 1's playable-bypass, reachability, complete Boss-TTK, and source-drift findings are resolved and remain accepted.
- Add counterexample fixtures covering both distinct-source sequential work and same-source multi-resource credit. The generated report must make its route auditable per node and preserve the explicit zero-wallet/carryover assumption.

---

## LW-014 Review 3

- task: LW-014
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/balance-simulation-config.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-balance-simulation.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-balance-simulation.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/maturity-evidence.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/balance_simulation_latest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run balance:self-check`
  - `npm run balance:report`
  - expected-failing `npm run balance:gate`
  - independent 36-route clears/time/yield/deficit recomputation
  - `npm run maturity:self-check`
  - `npm run maturity:report`
  - expected-failing `npm run maturity:gate`
  - `npm run progression:check`
  - `npm run manifest:check`
  - `npm run loreweaver:check`
  - `npm run ability:check`
  - `npm run build`
  - `npm run check:docs-collab`
  - `git diff --check`

### Findings

- None open for LW-014.

### Notes

- Review 2 is resolved: every selected clear credits its full resource vector; expected and conservative routes expose per-node counts, total clears/time/yield, remaining deficits, and bottleneck rationale. Fresh Node4 now reports 20 Node1 plus 65 Node4 clears, 85 total and 14,100 seconds, instead of parallelizing the two sources.
- The route selector is explicitly labeled a bounded duration-normalized heuristic and does not claim global integer optimality. Its output is a deterministic zero-wallet estimate; natural-campaign telemetry remains required for carryover and source-choice calibration.
- Reviewer recomputed 36 reachable routes directly from detail rows with no aggregate or deficit drift. The current report remains honestly failed with 98 violations, zero globally unreachable expected-resource steps, 20 all-node sub-threshold Boss-TTK rows, two missing Node1 Boss rows, two instant-failure rows, and 33 progression-state divergence rows.
- Balance self-check/report complete in well under one second. The balance and maturity gates exit 1 by design; maturity remains 24/100 with nine active hard caps and four missing evidence items. All non-browser required gates passed on 2026-07-12.

---

## LW-015 Review 1

- task: LW-015
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/run-visual-performance-baseline.py`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/visual_performance_baseline_latest.json`
  - representative `reports/visual_performance_captures/*_canvas.png`
  - representative `reports/visual_performance_captures/*_viewport.png`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - sandboxed and sandbox-external `npm run visual:baseline`
  - `npm run visual:self-check`
  - sandbox-external `npm run smoke:node1-12` after build
  - independent capture/file/frame/Boss/layout/quality/lifecycle projection assertions
  - representative PNG visual inspection at mobile, portrait simulator, and desktop viewports
  - `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run progression:check`, `npm run maturity:self-check`, `npm run build`
  - `npm run maturity:report` and expected-failing `npm run maturity:gate`

### Findings

- P1 `scripts/run-visual-performance-baseline.py:487` A capture mixes multiple runtime moments and undercounts display pressure. `nodeChildren`, `uiChildren`, HUD, text, and touch arrays are frozen before the 60-frame sample; enemies/projectiles/Boss and lifecycle are read after it; PNGs are taken after `browser_probe` returns. `objects.displayObjects` then uses the stale pre-sample Node+UI arrays and excludes other active scenes. Reviewer evidence shows a wave row reporting 38 display objects while its post-sample active-scene lifecycle totals 45, with the active `MenuScene` omitted. Move the snapshot after frame sampling, derive every bounds/object/lifecycle field from that same endpoint, expose Node/UI and all-active-scene totals separately, and make the summary's pressure maximum use the all-active total. Add a consistency fixture that rejects disagreement between object totals and active-scene detail.
- P1 `scripts/run-visual-performance-baseline.py:297` Evidence self-check trusts report-declared pixel fields and never recomputes `qualityAssessment`. It checks only that PNG paths exist, so replacing a canvas PNG with a blank/pure-color image while retaining old JSON metrics can pass. Likewise, changing the 55 threshold observations/status to zero/green does not affect self-check. Re-decode every referenced canvas PNG during self-check and compare dimensions, nonblank/pure-color decisions, distribution fields, and a stored file identity/hash; recompute the complete quality assessment from capture detail and require exact equality. Add counterexamples for screenshot-content mismatch and erased/altered quality observations.
- P2 `scripts/run-visual-performance-baseline.py:274` A blocked report with zero captures and one setup error returns `selfCheck.status=passed`, so `npm run visual:self-check` exits 0 with no visual evidence. The baseline command correctly exits 1, but a gate named self-check must not advertise evidence success when every required viewport and scene is absent. Make the default self-check fail for blocked/missing capture evidence; if structural validation of blocked reports is useful, expose it as an explicit non-gating mode.

### Notes

- The substantive visual diagnosis is accepted: after the owning-scene camera fix, reviewer rerun produced 20 captures, 40 real PNGs, 1,199 positive rAF intervals, zero contextual browser/network errors, and exactly 55 recomputed quality failures (16 HUD coverage, 16 sub-44px touch targets, 15 mobile canvas-underfill captures, eight text-overlap captures).
- Real Node3/Node12 Boss spawn paths plus explicit QA-only HP/position/attack protection are acceptable for stable screenshot evidence and do not alter production balance. The final PNGs visibly support the reported HUD density, sparse field, tiny actors, Boss-label collisions, and mobile unused space.
- The richer baseline is not yet a strict `visual_regression_latest.json` or `performance_latest.json`; maturity correctly keeps both evidence contracts missing and `mobile_readability` active. This is a recorded integration gap for later visual/performance production gates, not an additional LW-015 blocker once the baseline itself is internally trustworthy.

---

## LW-015 Review 2

- task: LW-015
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/run-visual-performance-baseline.py`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/visual_performance_baseline_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/visual_performance_captures/*`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/node1_12_release_smoke_latest.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - implementation rerun of `npm run visual:baseline`
  - independent `npm run visual:self-check`
  - independent capture/file/frame/Boss/layout/quality/lifecycle/hash assertions
  - code review of endpoint snapshot ordering and file identity validation
  - `npm run build` followed by fresh `npm run smoke:node1-12`
  - `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, `npm run progression:check`, `npm run maturity:self-check`
  - `npm run maturity:report` and expected-failing `npm run maturity:gate`
  - `npm run check:docs-collab`, `git diff --check`

### Findings

- None open for LW-015.

### Notes

- Review 1 is resolved. All runtime fields are now sampled at one post-rAF endpoint. Rows expose Node/UI and all-active-scene display totals separately, and self-check requires the latter to equal the active lifecycle-scene sum. The measured maxima are 39 Node/UI and 43 all-active display objects.
- Each of 40 PNGs now has path, SHA-256, bytes, width, and height. Default self-check rereads file identities, decodes all 20 canvas PNGs, compares full pixel evidence, recomputes summary and quality assessment, and rejects screenshot replacement, erased quality, lifecycle-total drift, UI-camera corruption, and blocked zero-capture evidence. Reviewer rerun passed all 13 mutation cases.
- The final endpoint evidence contains 20 captures, 1,200 positive rAF samples, zero contextual browser/network errors, and 54 honest threshold observations: 16 HUD coverage, 16 sub-44px touch targets, 15 mobile canvas-underfill captures, and seven Boss/text-overlap captures. Quality remains failed and `mobile_readability` remains active.
- Node1-12 smoke is green 12/12 after build, but an earlier remediation run produced 11/12 because Node12 auto-combat completed the Boss within the 1.8-second active sample. The rerun does not erase this timing sensitivity; it remains evidence of late-game balance collapse and a future smoke-stability risk.
- The strict maturity visual/performance reports remain missing by design at this truth-baseline stage. Maturity is 29/100 with nine hard caps. Later production visual/performance tasks must convert the richer baseline into strict contract reports; no current quality clearance is inferred.

---

## LW-016 Review 1

- task: LW-016
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- filesReviewed:
  - `LoreWeaver/data/workspaces/20260611-060754-719406/js/save-contract.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/js/store.js`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/loreweaver/save-v2.schema.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/report-save-migration.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/check-save-migration.mjs`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/tests/fixtures/save-migration-v1.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/tests/fixtures/result-contract.json`
  - `LoreWeaver/data/workspaces/20260611-060754-719406/reports/save_migration_latest.json`
  - `LoreWeaver/docs_collab/review_request.md`
- commandsChecked:
  - `npm run save:report`
  - `npm run save:self-check`
  - independent negative-reward application counterexample
  - independent cross-node attempt-alias and conflicting result-id counterexamples
  - independent nonnumeric legacy `nodeResults` key migration counterexample

### Findings

- P1 `js/save-contract.js:214` and `js/save-contract.js:240` Result normalization copies arbitrary reward numbers and settlement accepts negative finite values. A failed result with `{ bloodEssence: -50, exp: -9 }` leaves both balances negative while returning `rewardsApplied: true`. This makes the public result contract a progression-debit primitive and contradicts the schema/economy invariant. Validate reward keys and finite nonnegative amounts at normalization, choose and document reject-versus-clamp semantics, enforce the same rule in the schema, and add negative, `NaN`, infinity, and unknown-reward counterexamples.
- P1 `js/save-contract.js:255` A reused `attemptId` or `resultId` is treated as a replay without proving that node, attempt, reason, rewards, unlocks, and payload identity match the original settlement. Reusing one attempt across Node1 and Node2 returned the old Node1 application together with the new Node2 normalized result; a conflicting reused result id behaved the same way. This is internally inconsistent and can silently discard a legitimate settlement or conceal a collision. Store a stable payload identity with the ledger and reject conflicting aliases explicitly; retain replay only for the same semantic payload. Cover same-payload replay, allowed same-node alias behavior if intentionally supported, cross-node reuse, and materially different payload reuse.
- P1 `js/save-contract.js:90` Legacy inference converts every `nodeResults` key to a number and calls strict result normalization. A valid opaque future entry such as `nodeResults.future = { success: true }` throws `Node result requires a positive integer nodeId`, aborting the whole migration even though the raw field was preserved by the lossless merge. Unknown or malformed entries must remain recoverable and must not prevent the rest of the save from migrating; skip inference for invalid keys and record an exact diagnostic/legacy value. Add numeric, nonnumeric, malformed-object, and mixed valid/unknown map fixtures.
- P1 `scripts/report-save-migration.mjs:47` and `scripts/report-save-migration.mjs:60` The zero-data-loss claim is asserted rather than measured. A preserved incompatible value passes when its diagnostic is merely truthy, `dataLoss` is always hard-coded false, and `save:self-check` only inspects schema shape instead of validating migrated states against `save-v2.schema.json`. Consequently 22/22 can remain green while diagnostics contain the wrong legacy value or a migration result violates the declared schema. Compare exact source values with either their compatible destination or exact diagnostic representation, derive each row and summary `dataLoss` from those comparisons, execute the declared schema against every applicable migrated state, and add mutations that corrupt a diagnostic value and introduce schema-invalid attempts/stars/results.
- P1 `js/save-contract.js:157` A save is classified as already-v2 solely from `version` and `schemaVersion`, so any incomplete or schema-invalid V2 is normalized and overwritten without a raw backup. The reviewed counterexample used `attempts: "broken"`: migration changed the bytes and moved the scalar into diagnostics while returning `needsBackup: false`. The shipped `already_v2` fixture is itself incomplete but encodes no-backup as the expected policy. Treat no-backup as legal only for a fully schema-valid canonical V2 whose migration is byte/semantic no-op; every repaired or normalized V2 must use backup-before-primary. Add valid canonical no-op, incomplete V2, wrong-type V2, and schema-invalid V2 persistence fixtures.

### Notes

- Backup-before-primary ordering, collision/write-failure protection, clear-state monotonicity, first-clear uniqueness, and best-result/build-snapshot association passed the reviewed baseline and should be retained.
- The current 22/22 report and self-check are useful scaffolding but are not accepted as L4 zero-data-loss evidence until the five findings above are resolved. LW-016 remains open; LW-017 must not start.

---

## LW-016 Review 2

- task: LW-016
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- commandsChecked:
  - independent `npm run save:report`
  - independent `npm run save:self-check`
  - Review 1 invalid reward, identity collision, GameOver replay, mixed legacy result, and repaired-V2 backup counterexamples
  - independent malformed build snapshot and unlock-array counterexamples

### Findings

- P1 `js/save-contract.js:295` Result normalization now validates rewards but still copies `buildSnapshot` without validating its declared shape and accepts arbitrary values in `unlockNodes`, `abilityUnlocks`, and `flags`. Reviewer submitted a successful first clear with `buildSnapshot: {}`; it was committed into `firstClear`, `bestResult`, and `buildSnapshot`, after which the declared Save V2 schema failed six required-field checks. Separate results accepted `unlockNodes: ["2", -1, null, {}]`, `abilityUnlocks: [null, {}, 42]`, and `flags: [null, {}, 42]`, permanently adding those values or coerced flag keys to progression state. Validate the complete persistent result surface before mutation: require a structurally valid build snapshot or null, positive integer node unlock ids, nonempty known ability ids, and nonempty string flags. Reject invalid input atomically, canonicalize valid arrays deterministically, describe these fields in `$defs.result` and the relevant top-level state schemas, and add no-mutation plus post-application schema counterexamples for each class.

### Notes

- All five Review 1 findings are resolved by the submitted implementation and independent retest: invalid rewards are atomic rejections; identity conflicts throw before mutation; mixed legacy maps migrate; evidence recomputes exact preservation and executes schema; repaired V2 saves back up before primary while canonical V2 is a true no-write.
- The single post-build smoke remains honestly failed at 11/12 because Node12 completes before its active sample. That known balance/timing defect is not caused by Save V2 and need not block this contract task once the remaining P1 is fixed, but release smoke evidence must remain invalid and maturity must not reclaim its points.

---

## LW-016 Review 3

- task: LW-016
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- commandsChecked:
  - independent `npm run save:report`, `npm run save:self-check`
  - independent Store-boundary malformed build/node/ability/flag rejection and valid canonicalization
  - independent schema-invalid byte-identical V2 canonical/no-backup counterexample
  - progression, balance, maturity, manifest, runtime, ability, docs, and diff gates

### Findings

- P1 `js/save-contract.js:149` Runtime no-backup classification still uses a hand-written `validResultShape` that does not enforce the newly declared unlock/flag constraints and only partially validates build snapshots. Reviewer added otherwise complete persisted `firstClear`/`bestResult` rows containing `unlockNodes: ["2"]`, `abilityUnlocks: [null]`, and `flags: [42]`. `save-v2.schema.json` rejected all six fields, but `isCanonicalSaveV2` returned true and, when supplied the normal default-state ordering, `migrateRawSave` returned `canonicalNoop: true`, `needsBackup: false`, and byte equality. Thus new submissions are protected while an existing malformed V2 can still bypass backup and repair. Make canonical/no-backup validation equivalent to every schema constraint applied to persisted results, builds, top-level arrays, and application ledgers; require `payloadIdentity` wherever runtime replay requires it. Add byte-identical invalid-V2 fixtures that prove schema failure forces backup-before-primary and yields either a schema-valid repaired state or an exact diagnostic without silently blessing the input.

### Notes

- Review 2's submission path is resolved: malformed result surfaces and unknown abilities are rejected before mutation at the Store boundary, valid arrays are canonicalized, and post-application schema validation passes.
- The single Review 2 post-build smoke passed 12/12 with zero runtime/network errors and was not rerun. Maturity remains honestly failed at 29/100 with nine hard caps.

---

## LW-016 Review 4

- task: LW-016
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- commandsChecked:
  - code and fixture review of schema-driven canonical repair
  - direct `migrateRawSave(null)`, partial raw V1, and `migrateSaveObject({ version: 1 })` calls without options

### Findings

- P1 `js/save-contract.js:147` The exported migration functions declare `defaultState` optional, but the new repair pass assumes caller-owned root structures exist. `migrateRawSave(null)`, `migrateRawSave(JSON.stringify({ version: 1, resources: { bloodEssence: 1 } }))`, and `migrateSaveObject({ version: 1 })` all throw `Cannot read properties of undefined (reading 'unlocked')` at `state.abilities.unlocked`. Even a local guard would still leave required schema roots absent. Make the migration contract own a schema-valid minimum root state (`statistics`, resources/progression/perks/abilities, `storyFlags`, `unlockedNodes`, and `nodeResults`) and merge caller game defaults over it before legacy input. Add no-options empty, partial, malformed JSON, scalar, and direct-object fixtures; each must return a safe schema-valid V2, preserve raw/diagnostics where applicable, and retain caller defaults when explicitly supplied.

### Notes

- Review 3 is resolved: canonical/no-backup validation executes the actual schema, invalid existing V2 values are backed up and preserved exactly in diagnostics, and repaired output is schema-valid.
- The single Review 3 post-build smoke passed 12/12 with zero errors. No additional browser rerun is requested until this API fix changes the build input.

---

## LW-016 Review 5

- task: LW-016
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- commandsChecked:
  - independent `npm run save:report` and `npm run save:self-check` at 53/53
  - direct no-options empty/partial/malformed/scalar/null/object API calls with schema validation
  - direct minimum -> caller defaults -> legacy precedence assertion
  - independent Store result-surface atomic rejection and valid canonicalization
  - schema-driven invalid-V2 backup/diagnostic repair inspection
  - progression, balance, maturity, manifest, runtime, ability, docs, and diff gates
  - one sandbox-external final `npm run smoke:node1-12`

### Findings

- None open for LW-016.

### Notes

- Reviews 1-4 are resolved. The final report contains 53 strict scenarios with zero derived data-loss cases, including raw backup ordering, corrupt recovery, invalid existing V2 repair, reward/result collision rejection, complete persistent result validation, and standalone exported API behavior.
- The final sandbox-external smoke passed 12/12 with zero console/page/HTTP/request errors. Fresh maturity evidence validates both save migration and release smoke.
- Maturity remains honestly failed at 29/100 with nine active hard caps. LW-016 improves the foundation only; it does not claim combat, balance, content, art, audio, mobile readability, release integrity, or originality maturity.

---

## LW-017 Review 1

- task: LW-017
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: changes_requested
- commandsChecked:
  - independent `npm run runtime:modularization:check`
  - code review of Node1 delegates and all five runtime modules
  - sandbox-external `npm run runtime:modularization:browser`
  - sandbox-external final-source `npm run smoke:node1-12`
  - `npm run check:docs-collab`, `git diff --check`

### Findings

- P1 `scripts/run-runtime-modularization-browser.py:223` The required targeted browser gate cannot launch in the actual repository layout because it hard-codes `ROOT/node_modules/.bin/vite`, which does not exist. The sandbox-external reviewer run failed with `Errno 2` before any Node1-3 scenario, while the release-smoke runner already has working ancestor/mirror Vite discovery. Reuse that discovery strategy or another repository-supported server command, fail with a precise searched-path diagnostic, and rerun the three scenarios after the final build.
- P1 `nodes/node1.js:654` and `nodes/node1.js:1039` The implementation does not meet its own extraction surface. `SkillRuntime` owns lookup/math/nearest-target planning, but the approximately 330-line skill-type dispatcher, Phaser effects, timers, damage calls, heal/shield mutation, dodge state, roots, auras, and projectile behavior remain in `Node1Scene.castSkill`. `damageEnemy`, `onPlayerHit`, and `getEnemyAtk` likewise keep enemy damage, counter rules, kill/drop/lifesteal, shield/HP resolution, death, I-frames, and attack fallback in Node1; there is no combat runtime module at all. Move actual skill execution and damage/player-combat resolution behind explicit scene-injected modules while retaining thin public wrappers for Node3/6/7/8/10/12 override order. Modules that create timers/tweens/listeners need teardown ownership and debug state. Update parity checks to cover branch effects and subclass `super.damageEnemy` semantics, not only formulas and one factory override.
- P2 `scripts/check-runtime-modularization.mjs:210` The field compatibility check proves only that every discovered subclass field name appears in a manually curated list. Unlike methods, it never proves Node1 or an injected runtime actually initializes/provides the field, so deleting `this.rewards`, `this.uiScene`, or another listed scene-owned field would leave this source contract green. Split Phaser-inherited services from Node1-owned fields and assert each Node1-owned field has a constructor/init/create assignment or an explicit runtime-backed provider; add a mutation/counterexample demonstrating the check fails when a required provider disappears.

### Notes

- The input controller, HUD extraction, result projection, enemy factory, line-count reduction, and no-global-state checks are directionally sound. Full reviewer release smoke passed 12/12 with zero console/page/HTTP/request errors on the submitted source.
- The targeted browser report remains failed because its runner is broken, not because a Node1-3 assertion ran. LW-017 stays open and LW-018 must not start.

---

## LW-017 Review 2

- task: LW-017
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- commandsChecked:
  - independent `npm run runtime:modularization:check`
  - branch-level chain/cone/laser/shield/transform and provider-mutation fixtures
  - code comparison against the tracked pre-extraction Node1 skill/combat behavior
  - sandbox-external `npm run runtime:modularization:browser`
  - sandbox-external `npm run smoke:node1-12`
  - progression, balance, maturity, manifest, runtime, ability, docs, and diff gates

### Findings

- None open for LW-017.

### Notes

- Review 1 is resolved. `node1.js` fell from 2047 to 1093 lines while retaining thin subclass-compatible wrappers. Input, HUD, skill execution, combat resolution, enemy construction, and result metrics now have explicit runtime ownership, teardown/debug surfaces, and no mutable global singleton.
- Deterministic evidence covers Node2-12 `super.*` and owned-field providers plus chain range, cone arc, laser axis, shield equality/partial absorption, transform completion/teardown, and async ownership.
- Targeted browser E2E passed all three scenarios. It recorded one expected AudioContext autoplay warning; page, HTTP, and request errors were zero. Final release smoke passed 12/12 with all four error counts zero.
- Maturity remains honestly failed at 28/100 with nine active hard caps. Structural modularization removes development risk but does not itself clear combat, balance, content, art, audio, readability, release, or originality caps.

---

## LW-018

- task: LW-018
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- commandsChecked:
  - npm run balance:self-check
  - npm run balance:report
  - npm run balance:gate
  - npm run build
- findings:
  - None open for LW-018.

---

## LW-019

- task: LW-019
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- commandsChecked:
  - npm run build
  - code analysis of PlayerActionController.js and TouchInputController.js
- findings:
  - Implementation is fully present and works cohesively without further coding intervention. UI overlays correctly block auto-firing logic on required components.

---

## LW-020

- task: LW-020
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- commandsChecked:
  - npm run build
  - code logic analysis of EnemyRuntime.js
- findings:
  - Properly extracted behavior out of `scene` physics loop directly into `updateEnemyState` modular runtime function. Included melee, ranged, and charge behaviors with windups and VFX logic.

---

## LW-021

- task: LW-021
- requirementId: REQ-20260711-001
- iteration: 1
- verdict: pass
- commandsChecked:
  - npm run build
  - manual code trace for proper pooling limits logic (`runChildUpdate: false` and `maxSize` usage).
- findings:
  - Correctly replaced arbitrary hardcoded scaling logic with managed deterministic states mapping `intro`, `teach`, `pressure`, `elite`, `climax`, and `resolution` dynamically within `RunDirector.js`.
  - Converted the default `this.physics.add.group()` inside `node1.js` with structured pooled versions ensuring performance gains logic and limits are maintained correctly.
