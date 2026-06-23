# Precise Pipeline 1.1 To 3.3

> This document defines the cross-cutting LoreWeaver pipeline from world DNA to
> QA. It makes ability VFX/voice, generated art, and audio assets part of the
> main generation flow instead of late-stage polish.

## 1. Pipeline Tracks

Every step from 1.1 to 3.3 should carry these tracks forward:

| Track | Purpose | Primary Artifacts |
| --- | --- | --- |
| World Narrative | Theme, economy, realms, story stakes, node chronology | PRD JSON, 12-node manifest |
| Gameplay | Gameplay cards, objectives, failure states, knobs, modifiers | `nodes[].gameplay`, gameplay cards |
| Ability Runtime | Abilities, passives, player skills, enemy moves, boss phase moves | ability/passive catalogs, runtime skill ids |
| Asset Pipeline | Ability VFX/voice, generated art atlas, audio manifests, credits | `loreweaver/asset-pipeline.json`, manifests |
| Verification | Test hooks, gates, asset coverage, visual/audio/runtime evidence | build/e2e/VLM reports |

The tracks are parallel, but not independent. For example, a boss node in the
World track should create boss moves in Ability Runtime, required effects in
Asset Pipeline, and coverage assertions in Verification.

## 2. Step Outputs

| Step | Main Output | Required Pipeline Additions |
| --- | --- | --- |
| 1.1 IP DNA And Economy | Project DNA, resources, realms | `pipeline_dna.visual_style`, `pipeline_dna.audio_style`, `pipeline_dna.ability_fantasy`, `pipeline_dna.asset_policy`, `pipeline_dna.verification_seed` |
| 1.2 Node Outline | 12 narrative nodes | `assetBeats`, `vfxNeeds`, `audioNeeds`, `artNeeds`, `abilityRuntimeNeeds`, `verificationFocus` per node |
| 2.1 Architecture | Vite/Phaser shell | `assetRuntime` contracts for asset manifest loading, art resolving, audio channels, ability presentation routing, and test hooks |
| 2.2 Registry | `store.js`, `data.js` | `ASSET_PIPELINE_REGISTRY`, semantic art/audio keys, hostile move effect ids, coverage matrix |
| 2.3 Runtime Feature Pack | LoreWeaver catalogs | `asset-pipeline.json` plus fresh status for ability VFX/voice, art, audio, and verification |
| 3.1 Node Mechanics | Playable scene code | Node consumes semantic registries and triggers accepted gameplay, VFX, SFX, voice/callout together |
| 3.2 Asset Production And Polish | Runtime polish and media wiring | Manifests, generated/search asset hooks, callout fallback, audio/art runtime binding |
| 3.3 E2E And VLM QA | QA report and distilled lessons | Strict asset pipeline checks, art/audio/voice coverage, missing-key assertions, visual layout review |

## 3. Handoff Shape

Use this shape as the durable handoff across steps:

```json
{
  "pipeline_dna": {
    "visual_style": {
      "silhouette_language": "string",
      "palette_direction": ["#ffffff"],
      "camera_and_composition": "string",
      "sprite_strategy": "generated_atlas | procedural_fallback | hybrid"
    },
    "audio_style": {
      "bgm_mood": "string",
      "sfx_language": "string",
      "voice_direction": "string",
      "audio_strategy": "synth_only | manifest_assets | hybrid"
    },
    "ability_fantasy": {
      "naming_style": "string",
      "vfx_shape_language": ["string"],
      "callout_style": "visual_text | generated_voice | none",
      "enemy_move_language": ["string"]
    },
    "asset_policy": {
      "art_source": "imagegen_atlas | procedural | provided_assets",
      "audio_source": "synth | smart_asset_kit | provided_assets",
      "requires_credits": true,
      "public_export_cleanup": ["string"]
    },
    "verification_seed": {
      "must_observe": ["string"],
      "asset_gate_mode": "warn | strict"
    }
  }
}
```

Node outlines should carry the same intent locally:

```json
{
  "assetBeats": ["hero sprite visible", "boss callout visible"],
  "vfxNeeds": ["player special trail", "enemy windup warning"],
  "audioNeeds": ["node bgm", "boss phase stinger", "ability sfx"],
  "artNeeds": ["hero idle/walk", "enemy atlas key", "setpiece key"],
  "abilityRuntimeNeeds": ["runtime skill id", "enemy move effect kind"],
  "verificationFocus": ["VFX kind observed", "BGM key switched", "art key loaded"]
}
```

## 4. Gate Modes

- `warn`: missing `asset-pipeline.json` warns but does not fail old MVPs.
- `strict`: `--require-asset-pipeline` fails unless `asset-pipeline.json` exists,
  its three pipeline sections are valid, and workbench status marks the pipeline
  artifacts fresh, approved, or validated.

New projects should move to `strict` once Step 3.2 has produced or wired the
required manifests and Step 3.3 has browser evidence.

## 5. Operating Rule

Do not defer art, audio, or ability presentation to a vague polish pass. If a
node needs a boss, special skill, hazard, elite, cutscene, or reward moment, the
same node should also declare the VFX, art, audio, callout, and verification
needs required to make that moment visible, audible, and testable.
