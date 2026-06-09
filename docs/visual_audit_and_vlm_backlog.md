# Visual Audit and VLM Backlog

The core gameplay loop now has build, runtime E2E, and scene hygiene gates. Visual/VLM work can start after those gates stay stable across more adapters.

## Next Visual Gates

| Gate | Purpose | First target |
| --- | --- | --- |
| Canvas nonblank check | Confirm primary canvas renders non-empty pixels | `survivor_horde` demo |
| Desktop/mobile screenshots | Catch text overlap and button overflow | LoreWeaver workbench + core demo |
| HUD safe-area check | Ensure controls stay inside viewport | Phaser node scenes |
| VLM critique | Summarize visual issues after deterministic screenshots exist | Workbench UI and generated games |

## Rule

VLM should not replace deterministic gates. It comes after build, runtime E2E, TestHooks, and screenshot capture.
