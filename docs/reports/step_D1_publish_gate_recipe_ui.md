# Step D1 / publish gate — Level Recipe UI + hard-block + stale

> **Date**: 2026-07-24  
> **Goal**: Close remaining task.md gaps so theme/asset/knobs inputs yield publishable levels without adapter rewrites.

## Delivered

### 1. Production publish hard-block (fail-closed)

- Shared policy: `productize/lib/production-export-gate.mjs` → `evaluateProductionExportGate`
- Wired into `productize/validate-gameplay-card.mjs` (`npm run productize:card`)
- Blocks when any of:
  - required reports missing / empty / `status != passed`
  - `standalone_browser_report.releaseEligible != true`
  - `cardId` mismatch (visual / perf / standalone)
  - report marked `stale` / `artifactStatus: stale` / `freshness: stale`
  - companion E2E/C7 reports present but stale
  - optional identity fields (`recipeHash` / `contentHash` / `atlasHash`) mismatch when both sides claim them
- Unit job: `npm run check:production-export-gate`

### 2. Level Recipe workbench path (not CLI-only)

- Shared apply core: `productize/lib/apply-level-recipe-core.mjs`
- CLI: `npm run recipe:apply` / `npm run recipe:list` (thin wrapper)
- Backend:
  - `GET /api/workspaces/{ws_id}/level-recipes`
  - `POST /api/workspaces/{ws_id}/level-recipe/apply` (spawns same CLI job)
  - `GET /api/workspaces/{ws_id}/production-export-gate`
- UI: `GameplayPanel` Level Recipe selector + Apply / Dry-run (`data-testid=level-recipe-*`)
- Outcome: node `cardId` / modifiers / knobs + theme title/intro from Theme Content Pack

### 3. Stale invalidation on identity change

- `productize/lib/mark-gate-reports-stale.mjs`
- On non-dry-run recipe apply, marks: standalone browser, visual, performance, demo/standalone E2E, C7 readiness, theme-skin, validate latest
- Publish gate then returns `productionExportAllowed: false` until evidence re-run

## Verification (scratch)

Captured under goal implementer scratch:

| Artifact | Result |
|----------|--------|
| `unit_jobs.log` (dual gate check) | PASSED twice |
| `publish_gate_pass.log` | `productionExportAllowed: true` |
| `publish_gate_fail.log` | stale → `productionExportAllowed: false` |
| `stale_gate.log` | 8 reports marked stale |
| `recipe_apply_ui.json` | cyber recipe dry-run → title `霓虹脉冲清场` |
| `level_recipe_compile.log` | both golden recipes passed |
| `ui_recipe_control.txt` | UI testids + API route present |

## Non-goals (still open in task.md)

- Phase B game-feel, full 23-card matrix, device FPS P95, VLM overflow, full audio cue matrix, balance profiles, CI merge-block smoke wiring.

## Commands

```bash
npm run check:production-export-gate
npm run check:level-recipe
npm run recipe:apply -- --dry-run --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json --workspace 20260611-060754-719406 --node 1
npm run productize:card -- minigame_master/gameplay/cards/survivor_horde.json
```
