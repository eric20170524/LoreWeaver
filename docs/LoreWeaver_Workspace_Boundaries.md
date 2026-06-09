# LoreWeaver Workspace Boundaries

> This document defines write boundaries for the personal AI game workbench. It exists to keep case-study code, stable core runtime code, and LoreWeaver orchestration assets from bleeding into each other.

---

## 1. Asset Zones

### `minigame`

Role: case-study library.

Allowed operations:

- Read source code and docs.
- Extract gameplay patterns into inventory docs.
- Reference files as provenance for Gameplay Cards.
- Add non-invasive notes only when explicitly working on that project.

Default Agent write policy:

- Read-only.
- Do not refactor old case projects while extracting lessons.
- Do not move project-specific code directly into core.

Reason:

`minigame` contains real working examples with project-specific assumptions, IP text, quick fixes, and engine-specific hacks. These are valuable evidence, not stable abstractions.

### `minigame_master/core`

Role: stable engine shell and reusable runtime toolbox.

Allowed operations:

- Add stable contracts.
- Add generic helpers.
- Add gameplay adapters only after a Gameplay Card has schema, provenance, and test expectations.
- Add modifiers when they are engine-neutral enough to be configured.

Default Agent write policy:

- L3 adapter changes require explicit task-list alignment.
- L4 core changes require strong justification and regression tests.
- No IP-specific names, story text, character names, or one-off project constants.

Reason:

Core should be boring, durable, reusable, and easy to test.

### `LoreWeaver`

Role: workbench, orchestration layer, and design memory.

Allowed operations:

- Manage docs, manifests, gameplay cards, patch/revision/gate specs.
- Build UI and backend features for choosing, patching, and compiling gameplay cards.
- Store project-level state and generated artifacts.

Default Agent write policy:

- Docs and schemas can be updated proactively.
- Runtime orchestration changes must preserve existing workspace behavior.
- Generated games should be treated as artifacts, not the source of truth.

Reason:

LoreWeaver owns the user's working process. It should point at core and case studies, not become a dumping ground for gameplay implementations.

---

## 2. Patch Levels

| Level | Scope | Default Policy |
| --- | --- | --- |
| L0 | Text, labels, intro, taunts, hints | Agent may propose and apply with diff |
| L1 | Numeric knobs and reward tables | Agent may propose and apply after schema validation |
| L2 | Gameplay Card and modifier composition | Agent may propose and apply, then mark affected gates stale |
| L3 | Adapter implementation or new modifier implementation | Requires task-list alignment and targeted tests |
| L4 | Core contracts, Store, lifecycle, bridge, renderer, input | Requires regression plan and broader tests |

Agent output should prefer L0-L2. L3-L4 should be rare and explicitly tied to a roadmap task.

---

## 3. Artifact Ownership

| Artifact | Owner | Notes |
| --- | --- | --- |
| `gameplay_inventory.md` | LoreWeaver docs | Evidence and analysis from case studies |
| `gameplay_card_schema.md` | LoreWeaver docs | Contract for machine-readable cards |
| `gameplay_cards/*.json` | LoreWeaver docs | Workbench-facing library cards |
| `contracts/*.js` | `minigame_master/core` | Stable runtime interface definitions |
| Gameplay adapter source | `minigame_master/core/lib/gameplay` | Only after card + test expectations exist |
| Generated game project | LoreWeaver workspace artifact | Rebuildable from manifest/cards/core |
| Case-study source | `minigame` | Read-only evidence unless specifically targeted |

---

## 4. Revision and Invalidation Rules

Every approved patch should record:

- `target`
- `operation`
- `before`
- `after`
- `reason`
- `patchLevel`
- `invalidates`

Invalidation defaults:

- L0 text patch invalidates affected preview only.
- L1 knob patch invalidates affected node build/test.
- L2 gameplay composition patch invalidates affected node adapter config and E2E.
- L3 adapter patch invalidates all nodes using that adapter.
- L4 core patch invalidates all generated games that depend on the changed core contract.

---

## 5. Current Priority

Current extraction priority:

1. `minigame/Path_to_Immortality`
2. `minigame/xianni`
3. `minigame/perfectworld_dahuang`
4. `minigame/gals_panic`
5. `minigame/Lingmai_DualCultivation`

`Path_to_Immortality` is prioritized because it has a broad set of lightweight HTML/Canvas node minigames and a concrete iframe/postMessage node protocol.
