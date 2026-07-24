# E3 — `rhythm_timing` → `production_ready`

> **Date**: 2026-07-24  
> **Owner direction**: conversation choice `1` (push to production_ready)

## Status

| Field | Value |
| --- | --- |
| `status` | **`production_ready`** |
| `exportPolicy.productionReady` | **true** |
| `productionExportAllowed` | **true** |
| `check:rhythm-gate` | productionReadyEligible: true |
| Catalog auto-select | **yes** (with survivor_horde) |

## Evidence package (card-scoped)

| Gate | Report | releaseEligible |
| --- | --- | --- |
| Node smoke | `node_smoke_latest.json` | n/a |
| Demo E2E | `runtime_e2e_rhythm_timing_latest.json` | **true** |
| Browser summary | `standalone_browser_report_rhythm_timing.json` | **true** |
| Visual | `visual_audit_rhythm_timing_latest.json` | **true** |
| Soak 120s | `performance_report_rhythm_timing_latest.json` (avgFps≈60) | **true** |
| Recipes | temple / neon / production compile | passed |
| Human signoff | `step_E3_rhythm_timing_human_playtest_signoff.md` | approved |

## Multi-card hard-gate

`evaluateProductionExportGate` resolves **per-card** filenames first so `survivor_horde` shared `*_latest` reports are not clobbered. Both cards validate with `productionExportAllowed: true` concurrently.

## Conditional waivers (residual)

1. **FPS**: headless soak proxy (avg≈60), not device-class P95  
2. **VLM**: deferred; deterministic visual screenshots used  
3. **Standalone zip host E2E**: demo browser gate primary for this lightweight card  
4. **Boss phase**: production demos use `skipBoss` pure timing loop  

## Commands

```bash
npm run check:rhythm-e2e:release
npm run check:rhythm-visual-soak:release
npm run check:rhythm-gate
npm run productize:card -- minigame_master/gameplay/cards/rhythm_timing.json
npm run productize:card -- minigame_master/gameplay/cards/survivor_horde.json
```
