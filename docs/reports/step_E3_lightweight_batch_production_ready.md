# E3 — Lightweight batch → `production_ready` (×5)

> **Date**: 2026-07-24  
> **Batch**: `npm run check:light-batch` (SOAK_SECONDS=90)

## Certified cards

| Card | E2E | Soak | productionExportAllowed |
| --- | --- | --- | --- |
| reaction_pick | passed | passed | true |
| energy_balance | passed | passed | true |
| observe_capture | passed | passed | true |
| drag_to_core | passed | passed | true |
| pressure_survival | passed | passed | true |

## Shared pipeline

| Piece | Path |
| --- | --- |
| Multi-card demo | `minigame_master/core/demo/lightweight?card=` |
| Registry | `productize/lib/lightweight-cards.mjs` |
| E2E | `npm run check:light-e2e -- --card <id>` |
| Soak | `npm run check:light-soak -- --card <id>` |
| Batch cert | `npm run check:light-batch` |

## Residual (same conditional policy)

- Headless FPS proxy (90s soak floor)
- No VLM
- Shared demo browser gate (not full standalone zip host matrix)

## Not in this batch

Heavy / deferred: `side_scrolling_brawler`, platformers, maze, shooter, qix, hazard waves, branching dialogue, container iframe, etc.
