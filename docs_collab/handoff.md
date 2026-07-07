# Handoff

## Current Handoff

- agent: Codex
- requirementId: REQ-20260706-001
- iteration: 3
- task: `LW-012: Node1-12 Release Smoke Gate Slice`
- status: waiting_for_antigravity
- patchLevel: L3
- owner: Antigravity
- reviewer: Codex
- sourceReview:
  - `LW-011`

## Context

- LW-011 passed Codex review on 2026-07-07.
- Latest LW-011 reviewer gates passed: content safety scan, `manifest:check`, `loreweaver:check`, `ability:check`, `build`, and `check:docs-collab`.
- Existing shared E2E entry: `minigame_master/workflow/scripts/run_e2e_test.py`.
- That runner already has a `perfectworld_dahuang` branch, supports `--node`, starts the tracked mirror on port `18080`, and contains a full Node1-12 smoke loop when no `--node` is passed.
- Current target workspace has no package-level smoke script and no latest machine-readable Node1-12 smoke report.

## Goal

Make Node1-12 smoke verification repeatable enough for release hardening:

- prove each node can launch;
- prove it can stay active briefly without page/console errors;
- prove it can return to `MainScene` or route through `GameOverScene` safely;
- write per-node evidence that Codex can review without reading terminal scrollback.

## Scope

- Prefer a workspace-local smoke script and `npm` script if it is feasible with existing dependencies.
- If the shared `run_e2e_test.py` needs changes, preserve existing `xianni`, `perfectworld_dahuang --node`, and Node1-3 assertion behavior.
- The smoke gate may target the ignored workspace, the tracked mirror, or both, but the chosen target must be explicit in the report.
- Use existing runtime hooks such as `NodeBridge.launchNode`, `window.__DAHUANG_NODE_TEST_STATE__`, `window.__DAHUANG_ART_PIPELINE__`, and page console listeners.
- Do not redesign Node4-12 gameplay in this slice.

## Candidate Files

- `LoreWeaver/data/workspaces/20260611-060754-719406/package.json`
- `LoreWeaver/data/workspaces/20260611-060754-719406/scripts/`
- `LoreWeaver/data/workspaces/20260611-060754-719406/reports/`
- `minigame_master/workflow/scripts/run_e2e_test.py`
- `minigame/perfectworld_dahuang/package.json`
- `minigame/perfectworld_dahuang/reports/`

## Required Gates

- Node1-12 smoke gate, with report path recorded in `tasks.md`.
- `npm run manifest:check` from `LoreWeaver/data/workspaces/20260611-060754-719406`.
- `npm run loreweaver:check` from `LoreWeaver/data/workspaces/20260611-060754-719406`.
- `npm run ability:check` from `LoreWeaver/data/workspaces/20260611-060754-719406`.
- `npm run build` from `LoreWeaver/data/workspaces/20260611-060754-719406`.
- `npm run check:docs-collab` from `LoreWeaver`.

## Done Criteria

- `tasks.md` LW-012 is set to `needs_review`, not `verified`.
- `review_request.md` is replaced with `status: needs_review`, changed files, diff summary, smoke report summary, commands run, gates, residual risks, and `nextReviewer: Codex`.
- `state.md` and this `handoff.md` agree that LW-012 is `needs_review`.
- A machine-readable smoke report lists all 12 nodes and records pass/fail, entered scene key, return scene key, console/page errors, and any skipped/known-risk reason.
- If a node fails because of a real runtime issue, do not water down the smoke. Either fix the narrow bug and rerun, or return the task with clear failure evidence.
