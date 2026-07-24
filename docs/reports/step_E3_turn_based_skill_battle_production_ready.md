# E3 — `turn_based_skill_battle` → `production_ready`

> **Date**: 2026-07-24  
> **Result**: **status = production_ready** · **exportPolicy.productionReady = true**

## Evidence (card-scoped)

| Gate | Report | releaseEligible |
| --- | --- | --- |
| Demo E2E | `runtime_e2e_turn_based_skill_battle_latest.json` | true |
| Browser summary | `standalone_browser_report_turn_based_skill_battle.json` | true |
| Visual | `visual_audit_turn_based_skill_battle_latest.json` | true |
| Soak 120s | `performance_report_turn_based_skill_battle_latest.json` (avgFps≈95) | true |
| Recipes | sect + neon compile | passed |
| Human signoff | `step_E3_turn_based_skill_battle_human_playtest_signoff.md` | approved |

## Commands

```bash
npm run check:tbsb-e2e:release
npm run check:tbsb-visual-soak:release
npm run check:tbsb-gate
npm run productize:card -- minigame_master/gameplay/cards/turn_based_skill_battle.json
```

## Residual waivers

1. Headless FPS proxy  
2. No VLM  
3. Demo browser gate primary (not full standalone zip host matrix)
