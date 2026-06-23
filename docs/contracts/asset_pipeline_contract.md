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
