# Codex Design

## Requirement

Upgrade `LoreWeaver/data/workspaces/20260611-060754-719406` toward the maturity of `minigame/Path_to_Immortality` and `minigame/three_kingdoms_brawl`, without averaging effort across all 12 weak nodes. Iteration 1 focuses on turning Node1-3 into the first reusable quality template.

## Current Repository Facts

- The workspace is a standalone Vite + Phaser H5 game with source under `LoreWeaver/data/workspaces/20260611-060754-719406`.
- Workspace scripts already define the required baseline gates: `manifest:check`, `loreweaver:check`, `ability:check`, and `build`.
- `nodes/node1.js` is the inherited base combat scene. It already has HP, pickups, automatic skills, level-up choices, first-node growth milestones, retreat confirmation, and data-driven skill lookup.
- `nodes/node1.js` movement still reads only keyboard/WASD in `update()`, so mobile H5 playability is not yet solved.
- `nodes/node2.js` extends Node1 but its chest mechanic is instant pickup on overlap; it does not implement the requested stand-still/read-bar/interrupt risk-reward loop.
- `nodes/node3.js` extends Node1 but mostly raises spawn pressure and spawns a boss near the end; it does not yet expose a mature rival-pressure/break-window/failure-reason loop.
- `js/store.js` persists latest `nodeResults` and unlocks `abilityUnlocks`, but `unlockNextNode` is still supplied as `nodeConfig.id + 1` by `Node1Scene.endGame()`.
- `assets/imagegen/manifest.json` contains only 8 atlas frames: player, three Node1 enemies, Node1 boss, fist projectile, blood pickup, and VFX frame. Node2/3 enemies and bosses mostly fall back to procedural generated textures.
- `utils/RuntimeSprites.js` exposes runtime art status through `window.__DAHUANG_ART_PIPELINE__`, but Node-specific mechanic state is not similarly exposed.
- Existing LoreWeaver workbench E2E report proves app/export paths and atlas loading, but the target workspace still needs Node1-3 player-experience assertions.

## Design Direction

Iteration 1 should not attempt a full 12-node content pass. Build one narrow, verifiable spine:

1. Add touch-first movement and a stable Node test-state hook in Node1 base.
2. Use that hook to make Node1 mobile movement and early growth observable.
3. Upgrade Node2's chest into a channeling mechanic with interrupt feedback and observable reward state.
4. Upgrade Node3's rival encounter into pressure plus break-window state with visible failure/success signals.
5. Add Playwright or script-level assertions only after the runtime exposes stable state.

This keeps the first implementation pass L2: user-visible behavior and tests in one workspace, without changing core LoreWeaver contracts or export schemas.

## Artifact Scope

- `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node1.js`
- `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node2.js`
- `LoreWeaver/data/workspaces/20260611-060754-719406/nodes/node3.js`
- Later in this iteration: a workspace E2E/helper script if runtime hooks are stable.
- Collaboration docs: `LoreWeaver/docs_collab/state.md`, `tasks.md`, `handoff.md`, `review_request.md`, `review.md`.

## Patch Levels

- TASK-001 mobile movement/test hook: L2.
- TASK-002 Node2 chest channeling: L2.
- TASK-003 Node3 rival pressure/break-window: L2.
- TASK-004 Node1-3 QA assertions: L2, potentially L3 if shared workflow scripts outside the workspace are modified.
- Asset atlas expansion is deferred to a later task and should use the game art asset pipeline instructions before editing bitmap assets.

## Validation Plan

Baseline gates from the workspace root:

```bash
npm run manifest:check
npm run loreweaver:check
npm run ability:check
npm run build
```

Runtime gates after hooks/mechanics:

```bash
python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 1
python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 2
python3 minigame_master/workflow/scripts/run_e2e_test.py --game perfectworld_dahuang --node 3
```

If the old E2E route proves stale, Antigravity should record the failure and propose either a workspace-local Playwright gate or a targeted update to the shared script as a separate task, not silently broaden TASK-001.

## Antigravity Implementation Guidance

- Start with TASK-001 only.
- Do not modify Node2/Node3 while TASK-001 is in progress.
- Keep touch input inside `Node1Scene` or a clearly named helper in the same module unless a shared abstraction is necessary.
- Preserve keyboard movement.
- Avoid raw page reload assumptions in Playwright.
- Publish a compact test hook, for example `window.__DAHUANG_NODE_TEST_STATE__`, with node id, scene key, movement mode, hp, kills, level, active skills, rewards, and any node-specific mechanic state.
- Clean up pointer state and test globals on scene shutdown.

## Open Assumptions

- Antigravity is available as an execution collaborator in this Codex run.
- The user accepts an iterative collaboration loop instead of a single huge patch across all P0-P6 items.
- Public IP cleanup is deferred until the playable Node1-3 spine is stronger, but must be handled before any public export/share acceptance.

## Iteration 3 Hardening Direction

After LW-008 through LW-010, the main remaining iteration-3 risk is not whether the project builds; it is whether the live exported game can be shared without obvious public-facing borrowed names, motifs, or quotes.

LW-011 is intentionally bounded to live/public-facing text surfaces:

- Node4-12 split node JSON in target and mirror.
- Matching generated manifests and data files owned by existing build scripts.
- Target and mirror audio-cue descriptions when wording is user-facing or export-facing.
- Runtime comments or visible float text in Node4/Node12 only when the edit is pure text and does not touch ids or behavior.

Out of scope for LW-011:

- Renaming runtime ids, ability ids, node ids, enemy ids, save keys, schema fields, or storage contracts.
- Rewriting historical docs/archive files solely to reduce note counts.
- Editing generated `LoreWeaver/dist` by hand.
- Improving Node4-12 gameplay depth; that should follow as a separate playable-content task after public text risk is cleaner.

## LW-012 QA Direction

The next release-hardening gap is evidence, not another broad content pass. The project already has static gates and Node1-3 targeted assertions, but it still lacks a repeatable report showing that all 12 nodes can launch, run briefly, and return safely.

LW-012 should turn that into a gate:

- Prefer reusing the existing Playwright/Python path in `minigame_master/workflow/scripts/run_e2e_test.py` or adding a small workspace-local script over inventing a new test framework.
- Record per-node result data to JSON so review does not depend on terminal scrollback.
- Keep Node1-3 targeted assertions intact.
- For Node4-12, assert entry scene, short active runtime, return path, and absence of console/page errors.
- If smoke exposes a real runtime bug, fix the smallest local cause or report `changes_requested`; do not weaken the smoke to make it pass.
