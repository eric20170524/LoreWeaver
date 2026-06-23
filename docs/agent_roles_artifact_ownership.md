# Agent Roles and Artifact Ownership

LoreWeaver agent roles should be organized around artifact ownership, not decorative titles.

| Role | Owns | Can patch by default | Requires manual review |
| --- | --- | --- | --- |
| Gameplay Librarian | `gameplay_inventory.md`, gameplay cards | L0-L2 docs/cards | New adapter contract claims |
| Asset Pipeline Producer | `asset_pipeline_contract.md`, `loreweaver/asset-pipeline.json`, art/audio/voice manifest requirements | L0-L2 pipeline metadata, manifest plans, verification checklist | New runtime loaders, generated media licensing exceptions, Smart Asset Kit changes |
| Core Shell Engineer | `minigame_master/core/lib` contracts/adapters | L0-L1 comments/config | L3 adapter implementation, L4 core contracts |
| Workbench Curator | manifest, patch, revision, UI state | L0-L2 manifest/workbench UI | Persistence schema migrations |
| Gate Runner | build/e2e/hygiene reports | Gate scripts and report docs | Changing pass criteria |
| Compliance Reviewer | export checklist and content scan | L0-L1 wording cleanup | Public export approval |

## Operating Rule

Every patch should name:

- target artifact
- patch level
- expected invalidation
- required gate
- owning role
