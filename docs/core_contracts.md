# Core Contracts

> Stable contracts for `minigame_master/core`. These contracts are deliberately small. Gameplay adapters and modifiers should depend on these shapes instead of reaching directly into project-specific stores or scenes.

---

## 1. NodePayload

`NodePayload` is the launch payload passed from a hub/main scene/workbench into a playable node.

```js
{
  nodeId: "node_1",
  nodeIndex: 1,
  nodeConfig: {},
  playerStats: {},
  playerPerks: [],
  playerAbilities: [],
  activePassives: [],
  availableSkillPool: [],
  inventory: {},
  storyFlags: [],
  runtimeCatalogs: {
    abilities: [],
    passives: [],
    characters: [],
    enemies: [],
    skillEffects: [],
    audioCues: []
  },
  preview: {
    mode: "embedded",
    scale: "fit"
  },
  runSeed: "optional-seed",
  source: {
    workspaceId: "optional",
    projectId: "optional",
    engine: "phaser"
  }
}
```

Required:

- `nodeId`
- `nodeConfig`

Optional but recommended:

- `playerStats`
- `playerAbilities`
- `activePassives`
- `availableSkillPool`
- `runtimeCatalogs`
- `inventory`
- `storyFlags`
- `runSeed`

Compatibility notes:

- HTML iframe nodes can receive this as Base64 JSON query payload.
- Phaser nodes can receive this through `scene.start(sceneKey, payload)`.
- Ren'Py screens can map this to screen/default variables.

---

## 2. NodeResult

`NodeResult` is the only object a gameplay adapter should return to mutate outer progression.

```js
{
  success: true,
  reason: "completed",
  rewards: {},
  penalties: {},
  unlocks: {
    nodes: [],
    ages: [],
    abilities: [],
    flags: [],
    gallery: []
  },
  telemetry: {
    durationSec: 0,
    score: 0,
    hpRemaining: null,
    activeSkills: [],
    upgradedSkills: [],
    mistakes: 0
  }
}
```

Reason enum seed:

- `completed`
- `retreated`
- `failed`
- `timer_expired`
- `hp_zero`
- `boss_defeated`
- `objective_met`
- `condition_failed`

Path compatibility:

`Path_to_Immortality` currently returns rewards like `qi`, `xp`, `skill`, `skillUp`, `relic`, `unlockAges`, and `flag`. Core should support a compatibility adapter that maps:

```js
{
  qi: 80,
  xp: 30,
  skill: "SkillName",
  skillUp: 1,
  relic: "RelicName",
  unlockAges: [14],
  flag: "story_flag"
}
```

into the normalized `NodeResult` shape.

---

## 3. GameplayAdapter

```js
class GameplayAdapter {
  constructor(context) {}
  init(payload) {}
  create(scene) {}
  update(time, delta) {}
  pause() {}
  resume() {}
  destroy() {}
  end(partialResult) {}
}
```

Rules:

- Adapter owns gameplay runtime state.
- Adapter does not directly write persistent Store.
- Adapter returns `NodeResult` through `end`.
- Adapter should expose `getTestState` for TestHooks where possible.

---

## 4. GameplayModifier

```js
class GameplayModifier {
  constructor(config) {}
  install(context) {}
  update(context, time, delta) {}
  uninstall(context) {}
}
```

Rules:

- Modifier is optional behavior attached to an adapter.
- Modifier must clean up timers, objects, listeners, and physics overlaps it creates.
- Modifier may contribute telemetry.
- Modifier must not bypass adapter lifecycle.

---

## 5. SceneLifecycle

Every playable node must support:

- `boot`
- `running`
- `paused`
- `ending`
- `ended`
- `destroyed`

Required cleanup:

- Stop timers.
- Stop spawned UI scenes.
- Remove input listeners.
- Destroy transient groups and objects.
- Clear transition locks.
- Emit final TestHook state.

---

## 6. TestHooks

Minimum recommended shape:

```js
{
  sceneKey: "NodeScene",
  nodeId: "node_1",
  adapterId: "survivor_horde",
  status: "running",
  hp: 100,
  progress: 0,
  timer: 30,
  score: 0,
  lastResult: null,
  errors: []
}
```

TestHooks should be readable from browser automation. In Phaser, expose them on a stable global such as:

```js
window.__LW_TEST_HOOKS__
```

In iframe HTML nodes, expose them on the iframe window and mirror important result messages to the parent.

---

## 7. RuntimeFeaturePack

`RuntimeFeaturePack` is the reusable contract for playable MVP generation. It promotes project-specific discoveries into engine-visible catalogs that can drive NodePayloads, registries, HUD, character/enemy rendering, VFX/SFX, simulator preview, and validation gates.

Required catalogs:

- `abilityCatalog`
- `passiveSkillCatalog`
- `characterDesignCatalog`
- `enemyDesignCatalog`
- `skillEffectCatalog`
- `audioCueCatalog`
- `assetPipeline`

Required asset pipeline coverage:

- Ability VFX/voice metadata covers player skills, enemy moves, callout fallback, runtime hooks, and verification.
- Art asset metadata covers generated atlas manifests, semantic art groups, sprite clips, runtime lookup, and visual checks.
- Audio asset metadata covers BGM/SFX/voice/ambience manifests, credits/provenance, runtime channels, and browser audio checks.

Required first-node loop:

- First playable node has `planning.runSkillPool`.
- The initial run skill pool maps to `abilityCatalog.runtimeSkillIds`.
- At least one first-node skill has visible VFX and audible SFX.
- The run can demonstrate skill unlock, use, and upgrade through HUD or level-up UI.

Preview contract:

```js
{
  preview: {
    mode: "embedded" | "floating",
    scale: "s" | "m" | "l" | "fit" | "fullscreen",
    canDetach: true,
    canFullscreen: true
  }
}
```

Validation:

```bash
npm run check:runtime-feature-pack -- --workspace data/workspaces/<workspace-id>
npm run check:runtime-feature-pack -- --workspace data/workspaces/<workspace-id> --require-asset-pipeline
```

The detailed catalog schema lives in `docs/runtime_feature_pack.schema.json`; the human-readable workflow contract lives in `docs/runtime_feature_pack_contract.md` and `docs/asset_pipeline_contract.md`.
