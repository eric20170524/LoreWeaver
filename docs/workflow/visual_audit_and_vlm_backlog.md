# Visual Audit and VLM Backlog

The core gameplay loop has build, runtime E2E, and scene hygiene gates. The VLM visual audit has been enabled and integrates with the Codex local visual agent.

## Environment Configuration

- **`LOREWEAVER_ENABLE_CODEX_AUDIT`**:
  - `0` (Default): Runs only local deterministic checks (blank screen, fit scaling, text wrap, touch boundaries). Codex visual checks will return `WARNING` and status will show `available_disabled` or `unavailable`.
  - `1`: Invokes the Codex local visual critic agent at `/Applications/Codex.app/Contents/Resources/codex` using the Phaser emulator's high-contrast viewport screenshots.

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

