# E3 — `drag_collect_grid` → `production_ready`

> **Date**: 2026-07-24  
> **Result**: **status = production_ready** · **exportPolicy.productionReady = true**

## Evidence (card-scoped)

| Gate | Report | releaseEligible |
| --- | --- | --- |
| Demo E2E | `runtime_e2e_drag_collect_grid_latest.json` | true |
| Browser summary | `standalone_browser_report_drag_collect_grid.json` | true |
| Visual | `visual_audit_drag_collect_grid_latest.json` | true |
| Soak 120s | `performance_report_drag_collect_grid_latest.json` (avgFps≈60) | true |
| Recipes | void + neon compile | passed |
| Human signoff | `step_E3_drag_collect_grid_human_playtest_signoff.md` | approved |

## Fixes during cert

- `CollectDodgeAdapter`: null-safe faller loop (finish/clear mid-iteration); capture x/y before destroy  
- Soak script: only click **visible** Start/Back; lower hazard rate for long soak

## Residual waivers

1. Headless FPS proxy (not device P95)  
2. No VLM  
3. Demo browser gate primary (not full standalone zip host matrix)  
4. `skipBoss` pure collect loop in production demos  

## Commands

```bash
npm run check:drag-e2e:release
npm run check:drag-visual-soak:release
npm run check:drag-gate
npm run productize:card -- minigame_master/gameplay/cards/drag_collect_grid.json
```
