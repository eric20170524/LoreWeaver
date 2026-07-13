# Survivor Horde Core Demo

This standalone demo starts `SurvivorHordeAdapter` from pure config, creates modifiers through `createSurvivorHordeModifiers([{ id, knobs }])`, and publishes runtime state through `window.__LW_TEST_HOOKS__`.

The survivor horde registry currently covers the LoreWeaver modifier ids used by Dahuang: `hazard_telegraph`, `defend_core`, `boss_phases`, `poison_fog`, `escort_npc`, and `laser_warning`.

It is intentionally separate from existing sample games so the core adapter can be verified without carrying project-specific story, Store writes, or shell UI.

## Gates

Build gate:

```bash
minigame/perfectworld_dahuang/node_modules/.bin/vite build --config minigame_master/core/demo/survivor_horde/vite.config.mjs --outDir /private/tmp/lw_survivor_horde_build
```

Runtime E2E gate:

- Serve the demo directory or a temporary root that provides Phaser locally.
- Open the demo, click `data-testid="start-run"`, wait 5-10 seconds, and read `data-testid="test-state"`.
- Passing state: `status=running`, timer decreases, no browser console errors.
- Click `data-testid="retreat-run"` and verify `status=ended`, `resultReason=retreated`.
- Click `data-testid="back-menu"` and verify `mode=menu`.
