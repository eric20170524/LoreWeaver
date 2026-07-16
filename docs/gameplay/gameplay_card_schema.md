# Gameplay Card Schema

> Gameplay Cards are the bridge between the `minigame` case library and the stable `minigame_master/core` runtime. A card describes what a gameplay pattern is, where it came from, how it is configured, how it is tested, and what can be safely patched.

---

## 1. JSON Shape

```json
{
  "schemaVersion": "1.0",
  "id": "rhythm_timing",
  "title": "Rhythm Timing",
  "category": "timing",
  "status": "candidate",
  "runtime": {
    "engineTargets": ["html_canvas", "phaser"],
    "adapter": "RhythmTimingAdapter",
    "container": "node_iframe_microgame"
  },
  "inputs": ["pointer", "button"],
  "objectives": ["reach_progress"],
  "failure": ["timer_expired", "hp_zero"],
  "knobs": {},
  "patchPolicy": {
    "defaultAllowedLevels": ["L0", "L1", "L2"],
    "requiresReview": ["L3", "L4"]
  },
  "requiredCoreSystems": [],
  "resultContract": {},
  "testFixture": {
    "type": "manual_or_e2e",
    "path": null,
    "assertions": []
  },
  "sourceProvenance": [],
  "fit": {
    "goodFor": [],
    "poorFor": []
  },
  "knownRisks": []
}
```

---

## 2. Required Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | Card schema version |
| `id` | yes | Stable machine id in snake_case |
| `title` | yes | Human-readable name |
| `category` | yes | Broad gameplay family |
| `status` | yes | `candidate`, `validated`, `deprecated` |
| `runtime.engineTargets` | yes | Supported target engines |
| `runtime.adapter` | yes | Adapter name or planned adapter name |
| `inputs` | yes | Required input modes |
| `objectives` | yes | Objective enum list |
| `failure` | yes | Failure reason enum list |
| `knobs` | yes | Patchable config schema |
| `requiredCoreSystems` | yes | Core dependencies |
| `resultContract` | yes | Expected NodeResult fields |
| `sourceProvenance` | yes | Evidence paths |
| `fit.goodFor` | yes | Good thematic/mechanical fit |
| `fit.poorFor` | yes | Weak thematic/mechanical fit |
| `knownRisks` | yes | Common failure modes |

---

## 3. Knob Schema

Each knob uses this shape:

```json
{
  "type": "number",
  "default": 30,
  "min": 5,
  "max": 300,
  "patchLevel": "L1",
  "description": "Duration in seconds."
}
```

Supported knob types:

- `number`
- `integer`
- `string`
- `boolean`
- `enum`
- `array`
- `object`

Patch level meaning:

- L0: text/content only.
- L1: numeric or data knobs.
- L2: gameplay composition and modifiers.
- L3: adapter behavior.
- L4: core contract/runtime behavior.

---

## 4. Review Gate

A Gameplay Card can move from `candidate` to `validated` only when:

1. It has at least one real source provenance.
2. It has a stable knob schema.
3. It has a clear NodePayload/NodeResult expectation.
4. It has an adapter or an adapter implementation task.
5. It has a build/runtime test plan.
6. Its known risks are documented.

---

## 5. Current Card Storage

Machine-readable cards live under:

```text
LoreWeaver/docs/gameplay_cards/
```

Modifier cards live under:

```text
LoreWeaver/docs/gameplay_cards/modifiers/
```
