# Environment art prompts

These twelve original backgrounds were made with the built-in OpenAI image generator on 2026-09-23. Each accepted image was resized to 512 × 910, then packed by `scripts/build_environment_atlas.py`. The original generated images are retained in the local Codex generated-images directory; the accepted game assets and hashes are stored here.

Shared prompt: “Use case: stylized-concept. Asset type: one original portrait 2D game environment background for a top-down martial-fantasy action game. Style: richly painted detailed low-resolution 2D game art matching the existing character sprites; textured brushwork, readable silhouettes, atmospheric depth. Composition: portrait 9:16, top-down three-quarter view, broad unobstructed central fighting area and visually quiet lower third for HUD. No characters, text, logos, weapons, UI, or copyrighted references. Finished game background, not a concept sheet.”

| Frame | Scene prompt |
| --- | --- |
| `env_bg_desert` | Ancient Chinese-inspired walled market street at night, low timber shops and cloth awnings, warm lanterns, wet stone and earth, distant rooftops, dark iron black and ember red with violet accents. |
| `env_bg_cliff` | Mountain cliff contest platform at night, stone ring and railings, distant pines and misty precipice, lanterns and drum pavilion, four-school competition atmosphere. |
| `env_bg_arena` | Roofless ruined mountain temple courtyard, cracked flagstones, broken pillars and dark iron fragments, pale dawn mist and a faint cold red glow. |
| `env_bg_tide` | Storm-lashed coastal forge and tidal stone causeway, wet black iron slabs, gusting fire and wind, distant waves and crimson furnace glow. |
| `env_bg_city` | Walled mountain city at twilight with elevated stone archery terrace, far defensive towers, cool violet-blue lantern light and banners, clear ranged-duel sightline. |
| `env_bg_poison` | Poisoned bamboo forest monastery courtyard during a siege, wet flagstones, dense bamboo walls, sickly green mist and close torchlight. |
| `env_bg_tournament` | Quiet moonlit stone tournament platform beside a lake and ancient observatory, silver reflections, pale blue-white light and meditative geometric patterns. |
| `env_bg_ruins` | Ancient mountain ruins at night, broken pagoda fragments and black stone, distant fire and blood-red smoke, ambush atmosphere. |
| `env_bg_escort` | Rugged frontier escort road and defensive line before a mountain pass, war drums and horn towers, broken timber palisades, dusty amber light, advance direction from upper to lower edge. |
| `env_bg_wall` | High fortress wall at dusk, stone battlements and heavy gates, red light reflecting on masonry, restrained blood-red mist hinting at awakening inner strength, no creature visible. |
| `env_bg_void` | Vast shadowed basalt arena in a ruined citadel, dark crimson pulse and pale bone-white cracks in stone, dramatic open combat space. |
| `env_bg_finale` | Final gate of an ancient mystical realm, monumental dark iron doors and violet steel arcs, moon-silver light meeting restrained crimson flame. |

The environment atlas is separate from the character and VFX atlas. Both remain below the WebGL 4096-pixel edge limit.
