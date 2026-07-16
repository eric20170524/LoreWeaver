# LoreWeaver Patch and Revision Workflow

> Scope: the workbench stores gameplay edits as explicit patches first, then applies them into manifest revisions after confirmation.

## Patch Object

```json
{
  "id": "patch_1780920000000_1",
  "target": "nodes.1.gameplay",
  "operation": "replace",
  "before": {},
  "after": {},
  "reason": "Change node 1 base gameplay card",
  "invalidates": ["node:1", "adapter:phaser", "gate:build", "gate:e2e"],
  "patchLevel": "L2",
  "status": "proposed",
  "createdAt": "2026-06-08T00:00:00.000Z"
}
```

Patch levels:

| Level | Meaning | Default handling |
| --- | --- | --- |
| L0 | Text-only changes | Can be queued and applied locally |
| L1 | Numeric knobs | Can be queued and applied locally |
| L2 | Gameplay card or modifier composition | Requires confirmation in the workbench |
| L3 | Adapter implementation changes | Requires manual engineering review |
| L4 | Core/runtime contract changes | Requires manual engineering review and broad regression |

## Revision Record

Each approved patch creates a revision:

```json
{
  "id": "rev_1780920000000",
  "createdAt": "2026-06-08T00:00:00.000Z",
  "patches": ["patch_1780920000000_1"],
  "manifestSnapshot": {},
  "gateResults": {
    "build": "pending",
    "e2e": "pending"
  },
  "artifactStatus": "stale"
}
```

## Local Invalidation

Gameplay composition patches currently invalidate:

- The edited node: `node:<id>`
- The selected runtime adapter: `adapter:<adapter>`
- Build gate: `gate:build`
- Runtime E2E gate: `gate:e2e`

The workbench marks these artifacts as `stale`; Phase 6 is responsible for turning those marks into real build and runtime execution.
