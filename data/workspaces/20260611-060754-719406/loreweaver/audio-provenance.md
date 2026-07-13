# Audio Provenance

This workspace currently uses procedural WebAudio synthesis through `utils/AudioManager.js` and `minigame_master/core/lib/audio/WebAudioSynth.js`.

- External BGM files: none.
- External SFX files: none.
- External voice files: none.
- Voice/callout fallback: visual cast text through `Node1Scene.announceSkillCast` and synthesized cue `layered_voice_bell` for the finale skill.
- Audio cue source of truth: `loreweaver/audio-cue-catalog.json`.
- Runtime binding: `SKILL_POOL_REGISTRY[*].sfx` -> `AudioManager.playSkillCue`.
- License/provenance impact: no searched, copied, or generated audio files are included in this workspace.

Future production audio should add `assets/audio/manifest.js`, `assets/audio/voice/manifest.js`, file-level credits, and browser fetch/decode verification before replacing the procedural MVP cues.
