# Agent Roles and Artifact Ownership

LoreWeaver agent roles should be organized around artifact ownership, not decorative titles.

> **Production model (film-prep style):** treat each production link as an independent **department agent** that collaborates via machine-readable handoffs. See:
>
> - `docs/workflow/production_department_agents.md`
> - `docs/workflow/department_agents.registry.json`

## Classic role table

| Role | Owns | Can patch by default | Requires manual review |
| --- | --- | --- | --- |
| Gameplay Librarian | `gameplay/gameplay_inventory.md`, `gameplay_cards/` | L0-L2 docs/cards | New adapter contract claims |
| Asset Pipeline Producer | `contracts/asset_pipeline_contract.md`, `loreweaver/asset-pipeline.json`, art/audio/voice manifest requirements | L0-L2 pipeline metadata, manifest plans, verification checklist | New runtime loaders, generated media licensing exceptions, Smart Asset Kit changes |
| Core Shell Engineer | `minigame_master/core/lib` contracts/adapters | L0-L1 comments/config | L3 adapter implementation, L4 core contracts |
| Workbench Curator | manifest, patch, revision, UI state | L0-L2 manifest/workbench UI | Persistence schema migrations |
| Gate Runner | build/e2e/hygiene reports | Gate scripts and report docs | Changing pass criteria |
| Compliance Reviewer | export checklist and content scan | L0-L1 wording cleanup | Public export approval |

## Department mapping (prep desk)

| Department id | Maps from classic roles | Notes |
| --- | --- | --- |
| `director` | Orchestrator | Schedule only; no design ownership |
| `world` | World Builder | DNA / economy |
| `narrative` | Narrative | Node prose |
| `gameplay` | Gameplay Librarian | Cards + node gameplay |
| `ability` | (split from World/Code) | Catalogs + runtime skill ids |
| `architecture` | Core Shell + Sandbox | Contracts / RFP lists |
| `art` / `audio` | Asset Pipeline Producer | Split media tracks |
| `code` | Code Foundry | L1–L2 wiring; L3 escalate |
| `qa` | Gate Runner + Auditor | Reports & rejects |
| `compliance` | Compliance Reviewer | Export veto |

## Operating Rule

Every patch should name:

- target artifact
- patch level
- expected invalidation
- required gate
- owning role **or department id**

Cross-department edits must go through a `DepartmentHandoff` (`request` → owning department patch → `ack`), not silent overwrites.
