# sprite-gen integration

LoreWeaver integrates [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen) as an optional Art Department sprite-production backend.

The boundary is intentional:

```text
accepted base image
  -> sprite-gen prepare / gen-set / extract / compose-atlas / inspect
  -> sprite-gen run manifest.frame_layout
  -> LoreWeaver deterministic adapter
  -> explicit promotion
  -> assets/imagegen/atlas.png + manifest.json
  -> RuntimeArtBinder
```

`AssetRecipe` remains command-neutral. The bridge does **not** put shell commands or executable paths into recipe parameters.

## Installation

`backend/requirements.txt` pins sprite-gen to the reviewed upstream commit. `start.sh` / `start.bat` install that dependency into LoreWeaver's `.venv` on Python 3.10+.

Check availability:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py status
```

The reviewed pin is sprite-gen 2.5.2 at commit `ff57a644205b83387aa4d1e324eba9eefb257d7c` (Apache-2.0).

## Generate a candidate

The base image must live inside the selected LoreWeaver workspace. The default state set matches `RuntimeArtBinder` clips: `idle,walk,attack,hurt,death`.

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py generate \
  --workspace <workspace-id> \
  --base-image assets/source/hero.png \
  --character-id hero \
  --semantic-prefix player \
  --provider codex
```

For an enemy, use a runtime semantic prefix such as:

```text
--character-id wild-rhino --semantic-prefix enemy_wild_rhino
```

Provider selection is explicit (`codex` or `grok`). `SPRITE_GEN_PROVIDER` and `SPRITE_GEN_MODEL` may provide defaults. Use `--logical-height N` only for pixel-art runs that should enable sprite-gen's pixel-unfake path.

The generated candidate is written under:

```text
assets/imagegen/sprite-gen/<character-id>/
  run/                         # canonical sprite-gen run
  loreweaver/
    atlas.png                  # candidate atlas
    manifest.json              # LoreWeaver RuntimeArtBinder shape
    manifest.js
    provenance.json
```

Nothing in `assets/imagegen/atlas.png` is changed at this stage.

## Adopt an existing sprite-gen run

A composed run can be converted without running an image provider again:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py adopt \
  --workspace <workspace-id> \
  --run-dir assets/imagegen/sprite-gen/hero/run \
  --character-id hero \
  --semantic-prefix player
```

The adapter treats `manifest.json.frame_layout` as the source of truth. It never re-infers frame boxes from alpha.

## Promote to runtime

Promotion is explicit:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py promote \
  --workspace <workspace-id> \
  --character-id hero
```

If the workspace already has a different runtime atlas, promotion stops. Replacing it requires an explicit `--force`.

**Do not `promote` a second character.** Promotion copies one candidate over `assets/imagegen/atlas.png` and drops everyone else. Multi-character workspaces must `pack`.

## Face +x, then pack under 4096

Sprite-gen rows often face left. Survivor and dodge-counter flip with `setFlipX(dx < 0)`, so default art must face screen +x:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py generate \
  --workspace <workspace-id> \
  --base-image assets/source/hero.png \
  --character-id hero \
  --semantic-prefix player \
  --provider grok \
  --face-plus-x
```

WebGL commonly caps a single texture at 4096px. Stacking 1280px character sheets vertically will drop later characters (Node 2 `arena_champion` sat at y=3840 and never loaded). Pack left-to-right, then down, two columns:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py pack \
  --workspace <workspace-id> \
  --characters shi_mu,bandit_cultivator,human_genius,arena_champion,rock_golem \
  --alias enemy_bandit_cultivator=enemy_arena_elite,enemy_arena_elite_1,enemy_arena_elite_2,enemy_arena_elite_3,enemy_elite_brute \
  --alias enemy_human_genius=enemy_arena_boss,enemy_arena_boss_1,enemy_arena_boss_2,enemy_arena_boss_3 \
  --alias enemy_arena_champion=enemy_dodge_counter_boss \
  --force
```

`pack` refuses any result whose width or height exceeds 4096.

Alias spawn ids that the adapter actually creates (`arena_elite_1`, `arena_boss_2`, `elite_brute`) onto catalog prefixes. RuntimeArtBinder looks up `enemy_<spawnId>_*`, not the design catalog id.

Adapters that still draw silhouettes (dodge-counter) must mount atlas sprites through `runtimeArt.createSprite` when `scene.add.sprite` exists. Keep hit circles for input.

Promotion publishes the existing LoreWeaver runtime contract:

```text
assets/imagegen/atlas.png
assets/imagegen/manifest.json
assets/imagegen/manifest.js
assets/imagegen/provenance.json
```

No `RuntimeArtBinder` fork is needed. The adapter emits generic aliases plus numbered clip keys, for example:

```text
player
player_idle
player_idle_0 ...
player_walk
player_walk_0 ...
player_attack
player_attack_0 ...
```

and equivalent `enemy_<id>_<clip>_<n>` keys for enemies.

## Verification

Run the deterministic adapter contract check:

```bash
npm run check:sprite-gen-bridge
```

After promotion, run the existing art checks as usual:

```bash
npm run check:art-binder
npm run check:atlas-integrity
```

`productize:asset-job atlas_verify ...` remains the downstream verification path because the promoted files keep LoreWeaver's existing imagegen manifest contract.

## Current scope

This first integration intentionally covers sprite-gen's component-row character sprite workflow. Video-to-loop, curation UI, recolor, layer rigs, effects, and scene/background tooling remain upstream sprite-gen capabilities and are not separately wired into LoreWeaver yet.
