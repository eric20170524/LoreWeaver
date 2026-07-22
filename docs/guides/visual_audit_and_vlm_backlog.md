# Visual Audit and VLM Backlog

The core gameplay loop has build, runtime E2E, and scene hygiene gates. The VLM visual audit has been enabled and integrates with the Codex local visual agent.

## Environment Configuration

- **`LOREWEAVER_ENABLE_VLM_AUDIT`** (preferred):
  - unset: **auto** — enable if `XAI_API_KEY` (Grok vision) or ChatGPT/Codex CLI is available
  - `1`: force VLM on
  - `0`: deterministic checks only
- **`LOREWEAVER_VLM_PROVIDER`**: `auto` | `grok` | `codex` | `chatgpt`
  - **grok**: xAI chat/completions with `image_url` (recommended; same key as department prep)
  - **codex / chatgpt**: desktop CLI at `/Applications/ChatGPT.app/Contents/Resources/codex` (product rebrand; still binary name `codex`)
- **`LOREWEAVER_ENABLE_CODEX_AUDIT=1`**: legacy force-on alias
- **`CODEX_CLI`**: optional override path to the codex binary

### What is / is not supported for automated audit

| Tool | Automated `/api/audit` VLM | Notes |
| --- | --- | --- |
| **Grok API (XAI_API_KEY)** | Yes | Preferred headless vision path |
| **ChatGPT.app Codex CLI** | Yes | `codex exec -i shot.png` |
| **Grok Build TUI (`grok`)** | No (interactive only) | Image paste in TUI; no stable headless image→JSON audit contract |
| **Antigravity (`agy`)** | No (interactive only) | Coding agent / IDE; `agy --print` is text, not vision QA |

Probe: `GET /api/llm/status` → field `vlm`.

## Node smoke gate (qa-owned)

Separate from VLM. Headless **per-node ~10s simulated smoke** for
`production_prep → asset_confirm`:

```bash
npm run check:node-smoke -- --workspace=20260611-060754-719406
# or
node workflow/scripts/run_node_smoke.mjs --workspace=<id>
```

| Owner | Responsibility |
| --- | --- |
| **qa** | Gate + `workflow/reports/node_smoke_latest.json` |
| **code** | enter / spawnOrProgress / retreat runtime failures |
| **gameplay** | cardId / duration / collect goal contracts |
| **art / audio** | soft warnings only (`envKey`, `bgmKey`) |
| **director** | schedules smoke on auto-prep / advance-stage |

APIs: `POST /api/workspaces/{id}/departments/node-smoke`,
advance-stage runs smoke by default (`runNodeSmoke: true`).

## Visual Gates Breakdown

| Gate | Type | Purpose / Description |
| --- | --- | --- |
| **Real Canvas Screenshot** | Deterministic | Asserts input screenshot is a valid, non-mock PNG. |
| **Canvas Nonblank Pixels** | Deterministic | Analyzes pixels to verify variance/luminance and catch black screens. |
| **Phaser FIT Scaling** | Deterministic | Verifies viewport fits a mobile-first aspect ratio. |
| **CJK Text Wrap Risk** | Deterministic | Checks for unusually long node title/description lines. |
| **Touch Safe-Area Frame** | Deterministic | Checks that the HTML canvas CSS size accommodates tap targets. |
| **VLM HUD Occlusion** | VLM | Evaluates if canvas overlays or UI components obscure essential indicators. |
| **VLM Button Overlap** | VLM | Checks if interactive elements block each other. |
| **VLM Text Overflow** | VLM | Detects truncated text or overflowing Chinese/English typography. |
| **VLM Touch & Readability**| VLM | Evaluates text contrast, sizing, and finger-friendly click spacing. |

## Reflow Patch Workflow

VLM critiques do not modify the codebase directly. Instead:
1. Layout/coordinate recommendations (e.g., changing `themeColor`, `goalValue`, or `knobs`) are mapped to **L1/L2 manifest patches** on the frontend.
2. The user reviews before/after diffs in the workbench and imports them as a "Pending Patch".
3. Applying the patch updates `manifest.json`, marks affected gates/nodes as `stale`, and triggers a rebuild/E2E re-verification.
4. Structural recommendations (touching adapter/core file logic) are mapped to **L3/L4 code patches** and labeled for manual audit only.

