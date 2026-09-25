#!/usr/bin/env node
/**
 * AudioAssetResolver Verification Script (P3 Task 5.1 - 5.3)
 * Tests AudioAssetResolver, cue registration, BGM transitions, missing cue tracking, and synth fallback.
 */

import AudioAssetResolver from "../../minigame_master/core/lib/audio/AudioAssetResolver.js";
import WebAudioSynth from "../../minigame_master/core/lib/audio/WebAudioSynth.js";

async function runAudioResolverTest() {
  console.log("Running AudioAssetResolver Verification...");

  const resolver = new AudioAssetResolver({ volume: 0.8, synthFallback: true });

  // Register mock cues
  resolver.registerCue("bgm_main", "assets/audio/bgm_main.mp3");
  resolver.registerCue("sfx_win", "assets/audio/sfx_win.wav");
  resolver.registerSynthCue("sfx_stance_melee", {
    frequencies: [260], wave: "sawtooth", durationMs: 130, volume: 0.12
  });
  const originalTone = WebAudioSynth.playTone;
  const originalUnlock = WebAudioSynth.unlock;
  const tones = [];
  WebAudioSynth.playTone = (...args) => tones.push(args);
  WebAudioSynth.unlock = async () => true;

  // Play BGM & SFX
  resolver.playBgm("bgm_main");
  resolver.playSfx("sfx_win");
  resolver.playSfx("sfx_missing_cue"); // Missing cue should trigger fallback & tracking
  resolver.playSfx("sfx_stance_melee");
  resolver.playBgm("node5_defense", 1000, 146);
  await resolver.unlock();

  const report = resolver.getReport();
  console.log("Audio Resolver Report:", report);

  const ok = report.currentBgm === "node5_defense"
    && report.missingCues.includes("sfx_missing_cue")
    && report.missingCues.includes("node5_defense")
    && WebAudioSynth.requestedHz === 146
    && report.synthCueCount === 1
    && report.synthBed === true
    && tones.some(([frequency]) => frequency === 260);
  if (ok) {
    console.log("PASSED: AudioAssetResolver correctly tracks cues, handles BGM, and records missing audio keys.");
  } else {
    console.error("FAILED: AudioAssetResolver behavior mismatch.");
  }

  resolver.stopAll();
  WebAudioSynth.playTone = originalTone;
  WebAudioSynth.unlock = originalUnlock;
  return ok;
}

if (!(await runAudioResolverTest())) {
  process.exit(1);
}
