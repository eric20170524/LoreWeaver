# Audio Provenance

Campaign audio for Node1–12 is original, workspace-local synthesis — no third-party samples, no stock libraries, and no scraped media.

## Runtime path

- Manager: `utils/AudioManager.js` (extends `minigame_master/core/lib/audio/WebAudioSynth.js`)
- Manifest: `assets/audio/manifest.json`
- Channels: `music`, `sfx`, `voice`, `ambience` (all managed in runtime status)

## BGM beds (WAV + synth fallback)

| Key | File | Role |
| --- | --- | --- |
| menu_theme | assets/audio/bgm/menu_theme.wav | Menu |
| node1_battle … node12_finale | assets/audio/bgm/nodeN_*.wav | Per-chapter battle bed |
| boss_theme / boss_theme_late | assets/audio/bgm/boss_theme*.wav | Boss / late-game boss |
| victory_sting / defeat_sting | assets/audio/bgm/*_sting.wav | Result payoffs |

Chapter mapping is declared in `manifest.nodeBgm` and `AudioManager.NODE_BGM` (Node1 treasure/rival/tide/…/finale).

## SFX (WAV + tone matrix)

Campaign mechanic cues: `hit`, `ui_click`, `ui_confirm`, `chest_open`, `whirl_pull`, `core_hit`, `poison_tick`, `antidote`, `portal`, `ballista`, `wall_hit`, `escort_warn`, `break_window`, `phase_shift`, `wave_clear`.

Skill whooshes remain pure WebAudio synth tones mapped through `playSkillCue` / `audio-cue-catalog.json`.

## License

- License: original-synth / local
- Provider: local
- External searched or copied audio files: **none**
