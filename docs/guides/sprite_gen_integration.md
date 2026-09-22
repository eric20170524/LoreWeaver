# sprite-gen integration

LoreWeaver integrates [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen) as an optional Art Department backend for component-row characters, sparse VFX, deterministic layer composites, and video-derived motion clips.

The runtime boundary is intentionally narrow:

```text
sprite-gen generation / video / layer bake
  -> LoreWeaver candidate adapter
  -> explicit promotion
  -> deterministic multi-candidate bundle
  -> assets/imagegen/atlas.png + manifest.json
  -> RuntimeArtBinder (manifest.clipSets)
```

`AssetRecipe` remains command-neutral. The bridge accepts data contracts (states / rig / layers / tracks), but it never stores shell commands or executable paths in recipe parameters.

## Installation

`backend/requirements.txt` pins sprite-gen 2.5.3 to reviewed commit `eb941234bf2d7e5ea9d5f2f180494932a109b9de` (Apache-2.0). sprite-gen requires Python 3.11+.

Check availability:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py status
```

The status payload reports the reviewed version, supported subjects, post-processing routes, motion backends, and the `multi-candidate-bundle` publish mode.

## Runtime contract: candidates first, one bundle at promotion

Every generated/adopted asset is isolated under:

```text
assets/imagegen/sprite-gen/<asset-id>/
  run/ or video-set/             # upstream-owned work
  loreweaver/
    atlas.png                    # normalized candidate
    manifest.json
    manifest.js
    provenance.json
```

Nothing changes `assets/imagegen/atlas.png` until explicit promotion.

Promotion no longer copies one candidate over the runtime atlas. It deterministically repacks all currently promoted candidates into one runtime bundle:

```text
character hero
enemy A
VFX slash
layer composite
video-loop replacement
       |
       v
assets/imagegen/
  atlas.png
  manifest.json
  manifest.js
  provenance.json
```

Each semantic prefix has exactly one active producer. Promoting a new candidate with an existing prefix replaces that producer (for example, a video-loop `player` candidate can replace the earlier component-row `player` candidate) while unrelated enemies/VFX/layers stay in the bundle.

If runtime art was modified outside the sprite-gen bundle publisher, promotion fails unless `--force` is explicit.

## 1. Component-row characters

The default character state set remains:

```text
idle,walk,attack,hurt,death
```

Generate:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py generate \
  --workspace <workspace-id> \
  --base-image assets/source/hero.png \
  --asset-id hero \
  --semantic-prefix player \
  --subject character \
  --provider codex
```

`--character-id` is kept as a backwards-compatible alias for `--asset-id`.

Enemy example:

```text
--asset-id wild-rhino --semantic-prefix enemy_wild_rhino
```

The adapter uses upstream `manifest.json.frame_layout` as truth. It never re-infers frame boxes from alpha.

## 2. Sprite VFX (`subject=effect`)

Sparse VFX use the same deterministic component-row path but opt into sprite-gen's effect subject profile:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py generate \
  --workspace <workspace-id> \
  --base-image assets/source/void-slash.png \
  --asset-id void-slash \
  --subject effect \
  --semantic-prefix vfx_void_slash \
  --provider codex
```

When no states are supplied, effect defaults are:

```text
cast   4 frames @ 12 fps, one-shot
loop   6 frames @ 12 fps, looping
impact 5 frames @ 15 fps, one-shot
```

A custom comma-separated state list is also accepted.

Runtime keys are normalized exactly like character clips:

```text
vfx_void_slash
vfx_void_slash_cast
vfx_void_slash_cast_0 ...
vfx_void_slash_loop_0 ...
vfx_void_slash_impact_0 ...
```

`RuntimeArtBinder.createEffect()` and `VFX.spriteClip()` provide an atlas-first path. Existing procedural VFX remain the fallback when no promoted sprite effect exists.

## 3. Layer composites

Layer declarations stay upstream-owned. LoreWeaver forwards only the command-neutral contract:

```json
{
  "rig": { "...": "sprite-gen rig contract" },
  "tracks": {
    "walk": "base",
    "sword": "prop_effect"
  },
  "layers": {
    "armed_walk": {
      "stack": ["... upstream layer stack ..."]
    }
  }
}
```

Through the API this object is passed as `layerContract`; through the CLI it is passed as `--layer-contract-json`.

After the component rows are generated/extracted, bake one declared composite and normalize it into a new LoreWeaver candidate:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py compose-layer \
  --workspace <workspace-id> \
  --source-asset-id hero \
  --layer-name armed_walk \
  --asset-id hero-armed \
  --semantic-prefix player_armed
```

The bridge calls upstream `compose-layers`, then consumes `layers/<name>.manifest.json.frame_layout`. Rig landmarks, masks, offsets, and track semantics do **not** enter RuntimeArtBinder. The baked layer becomes an ordinary runtime clip.

## 4. Video-derived motion loops

Video motion is generated by upstream `video-set` and normalized into the same LoreWeaver clip contract:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py video-set \
  --workspace <workspace-id> \
  --base-image assets/source/hero-side.png \
  --asset-id hero-video \
  --semantic-prefix player \
  --states idle,walk,run,jump,attack \
  --direction side \
  --facing right \
  --anchor feet
```

This route requires the upstream video prerequisites (`ffmpeg`, `img2webp >= 1.5`, and the user's Grok/xAI video credentials).

The adapter consumes each successful `*.strip.png + *.strip.json` and preserves:

- every emitted frame (not an 8/4-frame cap);
- effective playback fps derived from `delay_ms`;
- `loop: true|false`;
- upstream `kind` such as `periodic` or `one-shot`.

A video candidate promoted with semantic prefix `player` replaces the prior `player` producer but leaves other promoted assets intact.

## 5. Manifest-driven clips

Runtime animation no longer guesses the useful frame count. The canonical runtime surface is:

```json
{
  "clipSets": {
    "player": {
      "walk": {
        "keys": ["player_walk_0", "player_walk_1", "..."],
        "fps": 24,
        "loop": true
      }
    },
    "vfx_void_slash": {
      "impact": {
        "keys": ["vfx_void_slash_impact_0", "..."],
        "fps": 18,
        "loop": false
      }
    }
  }
}
```

`RuntimeArtBinder.resolveClipSpec()`, `resolveClipKeys()`, and `playClip()` consume this data. The historical player-8/enemy-4 key probing remains only as a compatibility fallback for old manifests.

## 6. Adopt an existing component-row run

A composed upstream run can be converted without generating again:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py adopt \
  --workspace <workspace-id> \
  --run-dir assets/imagegen/sprite-gen/hero/run \
  --asset-id hero \
  --semantic-prefix player
```

## 7. Promote

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py promote \
  --workspace <workspace-id> \
  --asset-id hero
```

If runtime art was modified outside the sprite-gen bundle publisher, promotion stops unless `--force` is explicit.

## Face +x, then pack under 4096

Sprite-gen rows often face left. Survivor and dodge-counter flip with `setFlipX(dx < 0)`, so default art must face screen +x:

```bash
.venv/bin/python minigame_master/capabilities/imagegen/sprite_gen_bridge.py generate \
  --workspace <workspace-id> \
  --base-image assets/source/hero.png \
  --asset-id hero \
  --semantic-prefix player \
  --provider grok \
  --face-plus-x
```

`promote` republishes every currently promoted candidate (characters, effects, layers, video loops) into one runtime bundle. `pack` is the separate multi-character publisher for full character sheets that must stay inside one WebGL texture and carry spawn-id aliases.

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

`pack` refuses any result whose width or height exceeds 4096. If a runtime atlas already exists, pass `--force`.

Alias spawn ids that the adapter actually creates (`arena_elite_1`, `arena_boss_2`, `elite_brute`) onto catalog prefixes. RuntimeArtBinder looks up `enemy_<spawnId>_*`, not the design catalog id.

Adapters that still draw silhouettes (dodge-counter) must mount atlas sprites through `runtimeArt.createSprite` when `scene.add.sprite` exists. Keep hit circles for input.

Promotion publishes:

```text
assets/imagegen/atlas.png
assets/imagegen/manifest.json
assets/imagegen/manifest.js
assets/imagegen/provenance.json
```

The provenance file lists every candidate included in the bundle, its semantic prefix, type, source hash, and placement.

## API surface

- `GET /api/imagegen/sprite-gen/status`
- `POST /api/workspaces/{id}/imagegen/sprite-gen/generate`
- `POST /api/workspaces/{id}/imagegen/sprite-gen/compose-layer`
- `POST /api/workspaces/{id}/imagegen/sprite-gen/video-set`
- `POST /api/workspaces/{id}/imagegen/sprite-gen/adopt`
- `POST /api/workspaces/{id}/imagegen/sprite-gen/promote`
- `POST /api/workspaces/{id}/imagegen/sprite-gen/pack`

`generate` accepts `subject: "character" | "effect"`, `assetId`, `semanticPrefix`, `states`, optional `layerContract`, and `facePlusX`.

## Verification

Run:

```bash
npm run check:sprite-gen-bridge
npm run check:art-binder
npm run check:atlas-integrity
```

The sprite-gen bridge check now covers:

- character candidates;
- effect candidates;
- deterministic multi-candidate bundling;
- layer-manifest adoption;
- video-strip adoption;
- arbitrary video frame counts;
- one-shot timing;
- semantic-prefix replacement;
- external runtime atlas tamper protection.

## Current boundary

Integrated now:

- component-row characters;
- `subject=effect` VFX;
- deterministic `compose-layers` output;
- `video-set` / video-loop strip output;
- multi-candidate bundle publication;
- manifest-driven runtime clip timing.

Still upstream-only / not separately surfaced in LoreWeaver:

- curation web UI;
- recolor/palette variants;
- projected shadows;
- repeating background tiling;
- full sprite-gen scene renderer;
- Aseprite/Flame export tooling.

These can be added later without changing the runtime contract: they should still terminate in a normalized candidate or another explicit LoreWeaver asset domain rather than teaching RuntimeArtBinder upstream-internal formats.
