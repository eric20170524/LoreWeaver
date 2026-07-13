# LoreWeaver Manifest Sources

This directory is the editable source of truth for LoreWeaver import data.

- `project.json` stores project-level identity and migration metadata.
- `economy.json` stores the mainline resources and realm progression.
- `progression-systems.json` stores the main shell progression loops.
- `ability-catalog.json` stores baoshu unlocks, runtime skill mappings, and VFX/SFX specs.
- `passive-skill-catalog.json` stores bone-script passive tree effects, VFX, and SFX specs.
- `character-design-catalog.json` stores MVP character roles, visual stages, and skill connections.
- `skill-effect-catalog.json` stores runtime VFX keys and implementation notes.
- `audio-cue-catalog.json` stores programmatic WebAudio cue specs for MVP sound.
- `gameplay-cards.json` stores globally available LoreWeaver gameplay cards.
- `workbench.json` stores LoreWeaver workbench status metadata.
- `nodes/` stores one JSON file per playable story node.

The root `manifest.json` remains the compatibility artifact consumed by LoreWeaver.
After editing these split files, run:

```bash
npm run manifest:build
```

Before importing or committing, verify:

```bash
npm run manifest:check
```

`npm run manifest:split` is a migration helper. It rewrites this directory from
the root `manifest.json`, so do not use it after making manual split-file edits
unless you intentionally want to discard those edits.
