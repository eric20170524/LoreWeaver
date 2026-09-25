# LoreWeaver Asset Pipeline Contract

> This contract promotes three missing production steps into first-class
> LoreWeaver workflow artifacts: ability VFX/voice, generated bitmap art, and
> runtime audio assets. It complements the Runtime Feature Pack contract.

## 1. Pipeline Boundary

LoreWeaver should not treat art, audio, or ability presentation as late polish.
Every playable MVP that claims Runtime Feature Pack readiness should describe
how the following pipelines are produced, wired into runtime, and verified:

| Pipeline | Required Artifact | Purpose |
| --- | --- | --- |
| Ability VFX Voice | `loreweaver/asset-pipeline.json.abilityVfxVoice` | Bind playable and enemy abilities to VFX kinds, callouts, optional voice assets, runtime hooks, and verification coverage. |
| Game Art Asset Pipeline | `loreweaver/asset-pipeline.json.artAssets` | Describe generated bitmap atlas manifests, sprite clips, semantic art groups, runtime lookup path, and visual verification. |
| Game Audio Asset Pipeline | `loreweaver/asset-pipeline.json.audioAssets` | Describe BGM, SFX, ambience, and voice manifests, credits/provenance, runtime channels, and browser audio verification. |

These records are workflow contracts, not a license to move project-specific
assets into `minigame_master/core`. Core may receive generic loaders or runtime
contracts only after the corresponding pipeline has provenance and tests.

## 2. Asset Pipeline JSON Shape

Each generated or imported workspace may store:

```json
{
  "schemaVersion": "1.0",
  "abilityVfxVoice": {
    "abilitySpecPath": "loreweaver/ability-catalog.json",
    "voiceManifestPath": "assets/audio/voice/manifest.js",
    "calloutFallback": "visual_text",
    "playerAbilityCoverage": ["starter_projectile"],
    "enemyAbilityEffects": ["enemy-melee", "enemy-ranged", "enemy-boss-windup"],
    "runtimeHooks": ["startSpecial", "startEnemyAttack", "updateEnemyAttack"],
    "verification": ["voice manifest loads or visual callout fallback exists", "enemy ability effects covered"]
  },
  "artAssets": {
    "manifestPath": "assets/imagegen/manifest.json",
    "scriptManifestPath": "assets/imagegen/manifest.js",
    "imagegenProvider": "antigravity (LOREWEAVER_ENABLE_ANTIGRAVITY_IMAGEGEN=1) | sprite-gen bridge | auto | procedural_fallback",
    "groups": ["heroes", "enemies", "items", "props", "setpieces", "decorations"],
    "spriteClips": ["idle", "walk", "attack", "hurt", "death"],
    "runtimeBinding": "atlas first, simple canvas fallback last",
    "verification": ["manifest loaded count", "important art keys visible in gameplay", "frame motion checked"]
  },
  "audioAssets": {
    "manifestPath": "assets/audio/manifest.js",
    "creditsPath": "assets/audio/CREDITS.md",
    "channels": ["bgm", "sfx", "voice", "ambience"],
    "coverageMatrix": ["menu", "node", "boss", "victory", "defeat", "ability", "pickup", "hazard"],
    "runtimeBinding": "semantic keys resolved through audio engine channels",
    "verification": ["autoplay unlock", "mute respected", "current BGM key reported", "voice/SFX cached counts reported"]
  }
}
```

The exact paths may vary by generated game. The semantic obligations should not.

## 3. Ability VFX Voice Requirements

- Player abilities and enemy moves both need explicit effect kinds.
- Boss and elite enemy moves need either voice callouts or visual move-name
  callouts.
- Voice assets, when generated, must go through the project audio pipeline and
  manifest. Do not leave loose MP3 files without runtime keys.
- Runtime hooks must trigger gameplay, VFX, SFX, and voice/callout only after
  cooldown, windup, energy, or phase checks pass.
- Verification should report covered player ability ids, enemy ability effect
  kinds, missing effect kinds, voice manifest version or fallback mode, and
  console/page errors.

## 4. Art Asset Requirements

- Generated bitmap atlases are the preferred production art source for web/canvas
  games once sliced and verified.
- Runtime lookup should use semantic groups such as `heroes`, `enemies`, `items`,
  `props`, `setpieces`, and `decorations`.
- Sprite animation frames must be full-body generated frames, not warped still
  poses.
- `manifest.js` should exist when static/local browser loading cannot rely on
  `fetch`.
- Verification should report expected/loaded asset counts, important group keys,
  frame clip coverage, and whether generated art appears in real gameplay.

### 4.1 Core runtime binder

LoreWeaver workbench loads atlas art through:

```text
minigame_master/core/lib/graphics/RuntimeArtBinder.js
```

Wiring rules:

1. **Boot**: `RuntimeArtBinder.preload` + `install` on the Phaser Boot scene
   (see `src/game/GameRunner.ts`). All `manifest.frames` keys are sliced into
   textures (`lw_enemy_*`, `lw_runtime_player_*`, `lw_art_*`, …).
2. **Adapters**: Prefer `payload.runtimeArt.resolve(role)` / `enemyKey(id)`
   before procedural `Graphics` fallbacks. `SurvivorHordeAdapter` reports art
   sources in `NodeResult.telemetry.art`.
3. **Status**: Global `__LOREWEAVER_ART_PIPELINE__` exposes `loadedCount`,
   `groups`, `frameKeys`, and binder identity for VLM / E2E gates.
4. **Fallback**: Missing workspace imagegen is not a hard fail — adapters must
   remain playable with primitives/procedural sprites.
5. **Clips**: `manifest.clipSets[semanticPrefix][clip]` is the runtime SSoT for
   frame keys, fps, and loop/one-shot behavior. `playClip(sprite, role, clip)`
   consumes all declared keys; the historical player-8/enemy-4 probing remains
   compatibility fallback only for old manifests.
6. **Environment**: `createBackground({ nodeId, prefer })` maps nodes to
   `env_bg_*` frames and optionally layers `env_ground_patch` /
   `env_landmark_rock`.
7. **Modifier props**: semantic keys `core`, `escort`, `wall`, `portal`,
   `chest`, `ballista`, `whirlpool` resolve `core_eye`, `escort_npc`,
   `wall_segment`, `portal_ring`, etc.

### 4.2 sprite-gen bridge

LoreWeaver uses `minigame_master/capabilities/imagegen/sprite_gen_bridge.py` as an optional Art Department backend for component-row sprites, sparse effects, deterministic layer composites, and video-derived motion. The bridge stays outside generic `AssetRecipe` operations so recipe data cannot inject executable commands.

- The reviewed upstream is `aldegad/sprite-gen` 2.5.3 pinned to `eb941234bf2d7e5ea9d5f2f180494932a109b9de` (Apache-2.0, Python 3.11+).
- `sprite-gen` owns generation, extraction, layer composition, video-loop selection, and its source manifests. LoreWeaver consumes declared `frame_layout` or strip metadata; it does not infer frames from alpha.
- Every source first becomes an isolated candidate under `assets/imagegen/sprite-gen/<asset-id>/loreweaver/`.
- Supported candidate kinds are `character`, `effect`, `layer`, and `video-loop`.
- Runtime publication is a separate explicit `promote` step. Promotion deterministically repacks all active candidates into one `atlas.png + manifest.json + manifest.js + provenance.json` bundle.
- One semantic prefix has one active producer. Promoting a new producer for the same prefix replaces only that producer while preserving unrelated promoted assets.
- `manifest.clipSets` normalizes component rows, layer bakes, and video strips into the same RuntimeArtBinder contract.
- A runtime atlas modified outside the sprite-gen publisher fails promotion unless `--force` is explicit.

See `docs/guides/sprite_gen_integration.md` for commands and scope.

## 5. Audio Asset Requirements

- Audio coverage starts with a matrix: menu, chapter/node, boss, victory, defeat,
  UI, pickup, hazard, player ability, enemy ability, and voice/callout.
- Manifests should use semantic keys and separate BGM, SFX, voice, and ambience
  channels when the runtime supports them.
- Licensing and provenance are part of the deliverable. A generated or searched
  asset needs provider, license, source, and edits recorded in credits or manifest.
- Runtime must respect browser autoplay unlock, mute, pause, teardown, and track
  switching. BGM should not accidentally layer during scene changes.
- Verification should report current/requested BGM key, missing asset keys,
  cached voice/SFX counts, mute state, and fetch/decode failures.

## 6. Workbench Artifact Status

New workspaces should mark these keys once the pipeline is real:

```json
{
  "assetPipelineMetadata": "fresh",
  "abilityVfxVoicePipeline": "fresh",
  "artAssetPipeline": "fresh",
  "audioAssetPipeline": "fresh",
  "assetPipelineVerification": "fresh"
}
```

The Runtime Feature Pack gate warns when these are absent. Use
`--require-asset-pipeline` when a project is expected to be production-pipeline
ready and missing metadata should fail the gate.
