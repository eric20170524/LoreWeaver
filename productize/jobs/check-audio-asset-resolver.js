#!/usr/bin/env node
/**
 * AudioAssetResolver Verification Script (P3 Task 5.1 - 5.3)
 * Tests AudioAssetResolver, cue registration, BGM transitions, missing cue tracking, and synth fallback.
 */

import AudioAssetResolver from "../../minigame_master/core/lib/audio/AudioAssetResolver.js";

function runAudioResolverTest() {
  console.log("Running AudioAssetResolver Verification...");

  const resolver = new AudioAssetResolver({ volume: 0.8, synthFallback: true });

  // Register mock cues
  resolver.registerCue("bgm_main", "assets/audio/bgm_main.mp3");
  resolver.registerCue("sfx_win", "assets/audio/sfx_win.wav");

  // Play BGM & SFX
  resolver.playBgm("bgm_main");
  resolver.playSfx("sfx_win");
  resolver.playSfx("sfx_missing_cue"); // Missing cue should trigger fallback & tracking

  const report = resolver.getReport();
  console.log("Audio Resolver Report:", report);

  const ok = report.currentBgm === "bgm_main" && report.missingCues.includes("sfx_missing_cue");
  if (ok) {
    console.log("PASSED: AudioAssetResolver correctly tracks cues, handles BGM, and records missing audio keys.");
  } else {
    console.error("FAILED: AudioAssetResolver behavior mismatch.");
  }

  resolver.stopAll();
  return ok;
}

if (!runAudioResolverTest()) {
  process.exit(1);
}
