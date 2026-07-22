# Campaign Gameplay Core (LW-050)

Extracted from the mature Node1–12 H5 campaign workspace. **Theme-agnostic.**

## Modules

| Module | Purpose |
| --- | --- |
| `LevelContract.js` | Authored beats, budgets, victory modes |
| `GameFeelCore.js` | Hit-stop, shake caps, reduced motion, telegraphs, haptics |

## Compatibility

- Existing `GameplayAdapter` consumers are unchanged.
- Workspaces may keep local thin wrappers that re-export these modules.
- No IP-specific names, assets, save keys, or balance constants live here.

## Tests

See `LoreWeaver/productize/jobs/check-campaign-core.mjs`.
