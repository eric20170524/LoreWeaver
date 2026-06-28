# Review

## LW-001

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- `npm run loreweaver:check` passed in the reference workspace.
- `npm run ability:check` passed in the reference workspace.
- `npm run check:runtime-feature-pack` passed from the LoreWeaver root and selected the reference workspace.
- `npm run lint` and `npm run build` passed in the LoreWeaver root.
- `npm run build` passed in the reference workspace.

Residual risk:

- Node 20 still prints an experimental warning for JSON modules.

## LW-002

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- `asset-pipeline.json` and `art-asset-manifest.json` parse as valid JSON.
- `npm run manifest:build` rebuilt root `manifest.json` from split LoreWeaver files.
- `npm run manifest:check` passed.
- `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline` passed.
- `npm run check:runtime-feature-pack` passed from the LoreWeaver root.
- `npm run loreweaver:check`, `npm run ability:check`, root `npm run lint`, root `npm run build`, and reference workspace `npm run build` passed.

Residual risk:

- Asset metadata intentionally describes procedural art, WebAudio, and visual text fallback. Production generated bitmap art, BGM, and voice assets are still not implemented.
- Runtime feature pack still warns about missing `floatingSimulatorPreview` and `simulatorFullscreenPreview`.

## LW-003

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- Node gameplay metadata includes card id, knobs/modifiers, story beats, rewards, and unlock semantics.
- `RewardApplier` normalizes `NodeResult` into store progression.
- `npm run lint`, `npm run build`, and runtime feature-pack checks passed.

Residual risk:

- `sequence_synthesis`, `turn_based_skill_battle`, and iframe nodes are represented as bridge/runtime plans; the verified browser smoke targets are the currently runtime-ready Phaser cards.

## LW-004

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver` passed.
- App smoke covers nonblank canvas, `survivor_horde` success, reward return, next unlock, save restore, `rhythm_timing` retreat, and `drag_collect_grid` retreat.
- E2E scene entry now uses the same MainScene start path as the runtime UI and waits for clean scene teardown before continuing.

Residual risk:

- The E2E uses direct runtime hooks for deterministic smoke coverage rather than manual UI clicking through every node card.

## LW-005

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- Export ZIP contains `index.html`, `manifest.json`, `README.md`, `assets/`, `nodes/`, `scenes/`, `js/`, `systems/`, `loreweaver/`, and `core/lib/`.
- Exported `index.html` embeds `window.__LOREWEAVER_EMBEDDED_SPEC__` and uses relative asset paths.
- Extracted static export was served with `python -m http.server`; Playwright loaded it with zero console errors.
- Static export smoke verified nonblank canvas, `survivor_horde` success/reward/unlock, `rhythm_timing` retreat, and `drag_collect_grid` retreat.

Residual risk:

- The export smoke verifies the three runtime-ready cards, not every one of the 12 narrative nodes.

## LW-007

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- `npm run lint` passed in `LoreWeaver`.
- `npm run build` passed in `LoreWeaver`, with the known large-bundle warning.
- `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406` passed and wrote `workflow/reports/runtime_feature_pack_latest.json`.
- `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver` passed and wrote `workflow/reports/runtime_e2e_loreweaver_latest.json`.
- E2E assertions covered first-node growth collection source, `primordial_fist` Lv.2 mutation, bullet-damage combat impact, feedback event, reward return, next unlock, save restore, and the same growth checks in extracted static export smoke.

Residual risk:

- Later nodes still need similar resource-to-skill-loop assertions.
- The first-node growth assertion uses deterministic adapter pickup injection for reproducibility; full manual pointer collection can be added as a later polish test.

## LW-006

- reviewer: Codex
- result: passed
- reviewedAt: 2026-06-28

Findings: none.

Verification reviewed:

- `npm run check:runtime-feature-pack -- --workspace data/workspaces/20260611-060754-719406 --require-asset-pipeline` passed and wrote `workflow/reports/runtime_feature_pack_latest.json`.
- `npm run build` passed in `LoreWeaver`, with the known large-bundle warning.
- `venv/bin/python LoreWeaver/workflow/scripts/run_e2e_test.py --game loreweaver` passed and wrote `workflow/reports/runtime_e2e_loreweaver_latest.json`.
- E2E verified export ZIP inclusion of `assets/imagegen/atlas.png`, `assets/imagegen/manifest.json`, and `assets/imagegen/manifest.js`.
- Static export runtime reported atlas load status/counts and live survivor_horde player/enemy texture keys from the atlas-backed runtime path.
- Workspace checks passed: `npm run manifest:build`, `npm run manifest:check`, `npm run loreweaver:check`, `npm run ability:check`, and ES module import of `utils/RuntimeSprites.js`.

Residual risk:

- The current atlas is mechanically wired but visually simple; richer generated art and per-action animation clips should be a follow-up polish/art pass.
- Atlas coverage focuses on first-node player/enemy/projectile/pickup/VFX keys; later node-specific enemies still use documented procedural fallback.
