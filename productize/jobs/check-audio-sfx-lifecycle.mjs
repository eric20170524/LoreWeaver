import assert from 'node:assert/strict';
import test from 'node:test';
import AudioAssetResolver from '../../minigame_master/core/lib/audio/AudioAssetResolver.js';

class FakeAudio {
  static created = [];
  constructor(src) {
    this.src = src;
    this.paused = true;
    this.volume = 1;
    this.currentTime = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.listeners = new Map();
    FakeAudio.created.push(this);
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type) { this.listeners.get(type)?.(); }
  play() { this.paused = false; this.playCount += 1; return Promise.resolve(); }
  pause() { this.paused = true; this.pauseCount += 1; }
}

test('file SFX follows mute, pause, resume, and scene teardown', async () => {
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  try {
    FakeAudio.created = [];
    const resolver = new AudioAssetResolver({ volume: 0.7, synthFallback: false });
    resolver.registerCue('heartbeat', 'assets/audio/heartbeat.mp3');
    resolver.playSfx('heartbeat');
    const audio = FakeAudio.created.at(-1);
    assert.equal(audio.src, 'assets/audio/heartbeat.mp3');
    assert.equal(resolver.getReport().activeSfxPlaying, 1);
    resolver.setMuted(true);
    assert.equal(audio.volume, 0);
    resolver.setMuted(false);
    assert.equal(audio.volume, 0.7);
    resolver.setPaused(true);
    assert.equal(audio.paused, true);
    assert.equal(resolver.getReport().activeSfxPlaying, 0);
    resolver.playSfx('heartbeat');
    assert.equal(FakeAudio.created.length, 1);
    resolver.setPaused(false);
    assert.equal(audio.paused, false);
    assert.equal(audio.playCount, 2);
    audio.currentTime = 0.2;
    resolver.stopAll();
    assert.equal(audio.paused, true);
    assert.equal(audio.currentTime, 0);
    assert.equal(resolver.getReport().activeSfxCount, 0);
  } finally {
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('completed SFX is released and is not resumed later', () => {
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  try {
    FakeAudio.created = [];
    const resolver = new AudioAssetResolver({ synthFallback: false });
    resolver.registerCue('click', 'assets/audio/click.mp3');
    resolver.playSfx('click');
    const audio = FakeAudio.created.at(-1);
    audio.emit('ended');
    assert.equal(resolver.getReport().activeSfxCount, 0);
    resolver.setPaused(true);
    resolver.setPaused(false);
    assert.equal(audio.playCount, 1);
  } finally {
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('pause rejection of an in-flight play promise preserves SFX for resume', async () => {
  class PauseRejectingAudio extends FakeAudio {
    play() {
      super.play();
      if (this.playCount === 1) return new Promise((_resolve, reject) => { this.rejectFirstPlay = reject; });
      return Promise.resolve();
    }
    pause() {
      super.pause();
      this.rejectFirstPlay?.(new Error('AbortError: pause interrupted play'));
      this.rejectFirstPlay = null;
    }
  }
  const originalAudio = globalThis.Audio;
  globalThis.Audio = PauseRejectingAudio;
  try {
    FakeAudio.created = [];
    const resolver = new AudioAssetResolver({ synthFallback: false });
    resolver.registerCue('long-pulse', 'assets/audio/long-pulse.mp3');
    resolver.playSfx('long-pulse');
    const audio = FakeAudio.created.at(-1);
    resolver.setPaused(true);
    await Promise.resolve();
    assert.equal(resolver.getReport().activeSfxCount, 1);
    resolver.setPaused(false);
    assert.equal(audio.playCount, 2);
    resolver.stopAll();
  } finally {
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('ability window stops its own cue without cutting unrelated SFX', () => {
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  try {
    FakeAudio.created = [];
    const resolver = new AudioAssetResolver({ synthFallback: false });
    resolver.registerCue('blood-window', 'assets/audio/blood-window.mp3');
    resolver.registerCue('blade-hit', 'assets/audio/blade-hit.mp3');
    resolver.playSfx('blood-window', { loop: true });
    resolver.playSfx('blade-hit');
    const [windowAudio, hitAudio] = FakeAudio.created;
    assert.equal(windowAudio.loop, true);
    assert.equal(hitAudio.loop, false);
    resolver.stopSfx('blood-window');
    assert.equal(windowAudio.paused, true);
    assert.equal(hitAudio.paused, false);
    assert.equal(resolver.getReport().activeSfxCount, 1);
    resolver.stopAll();
    assert.equal(hitAudio.paused, true);
  } finally {
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});
