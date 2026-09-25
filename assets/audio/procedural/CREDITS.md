# Procedural audio credits

All 12 music loops and 22 sound cues in this directory are original, deterministic synthesis from `scripts/build_fangame_audio.py`. They use oscillators and seeded noise. No third-party recording, sample pack, melody transcription, voice model, or sound library is included.

`provenance.json` records each file path and SHA-256. Music items also record the five recurring motif families used in the arrangement: `fist_wind`, `black_blade`, `purple_bow`, `moon_silver`, and `blood_pulse`.

Nodes 3 and 11 contain a quiet `corpse_tide` bed; nodes 6 and 8 use `encirclement`; node 9 uses `tribal_front`. These are deterministic oscillator and seeded-noise layers mixed into the respective BGM loops, so the existing music mute, pause, and scene transitions control them together. The `ambienceFamily` field identifies each layer.

Audio provenance is separate from the project's story, names, and visual IP rights. Public distribution of the complete game still requires the project's content-rights review.
