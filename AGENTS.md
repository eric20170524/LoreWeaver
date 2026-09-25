# Agent notes

CWD is `/Users/lm/pyProj/LoreWeaver`. Longer rules live in `docs/5_AGENT_RULES.md` and `docs/guides/`.

## Sprite atlas (sprite-gen + Imagine)

Pipeline:

```text
accepted base image in the workspace
  -> sprite-gen generate --provider grok --face-plus-x
  -> candidate under assets/imagegen/sprite-gen/<id>/loreweaver
  -> pack (never a second promote)
  -> assets/imagegen/atlas.png + manifest.json
  -> RuntimeArtBinder
```

Hard constraints:

- Default facing is screen **+x**. Engines flip with `setFlipX(dx < 0)`.
- `promote` overwrites the runtime atlas with **one** character. Additional characters must `pack`.
- Packed atlas width and height must stay **≤ 4096** (WebGL). Use a 2-column grid, not a vertical stack. Node 2's champion vanished when the sheet was 5120 tall.
- `pack` refreshes `assets/imagegen/character-pack/`. `append-effects` pastes from that snapshot onto a clear cell and copies source pixels, including partial alpha.
- Alias actual spawn ids (`arena_elite_1`, `arena_boss_2`, `elite_brute`, `dodge_counter_boss`) onto catalog prefixes. Binder looks up `enemy_<spawnId>_*`.
- Adapters that still draw silhouettes must mount sprites via `runtimeArt.createSprite` when `scene.add.sprite` exists; keep hit circles.

Commands: `docs/guides/sprite_gen_integration.md`.

## Contracts

Do not change `NodePayload` / `NodeResult` shape. Gameplay growth lives in modifiers. Phaser `scene.start` must come from the active scene (`LevelActiveScene` if a node is running).
