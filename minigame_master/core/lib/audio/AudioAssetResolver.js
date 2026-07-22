/**
 * AudioAssetResolver.js (P3 Task 5.1)
 * Runtime Audio Asset Resolver that loads and plays real audio assets (BGM, SFX, Voice, Ambience).
 * Handles BGM fade-in/out, boss song transitions, victory/defeat stingers, mute, and synth fallback.
 */

import WebAudioSynth from './WebAudioSynth.js';

export class AudioAssetResolver {
  constructor(options = {}) {
    this.audioMap = new Map(); // cueKey -> HTMLAudioElement / AudioBuffer
    this.currentBgmKey = null;
    this.currentBgmAudio = null;
    this.isMuted = false;
    this.volume = options.volume ?? 1.0;
    this.synthFallback = options.synthFallback ?? true;
    this.missingCues = new Set();
  }

  /**
   * Register audio asset mapping
   */
  registerCue(key, urlOrBuffer) {
    this.audioMap.set(key, urlOrBuffer);
  }

  /**
   * Play BGM with smooth crossfade
   */
  playBgm(bgmKey, fadeMs = 1000) {
    if (this.currentBgmKey === bgmKey && this.currentBgmAudio) return;

    if (this.currentBgmAudio) {
      this.fadeOutAndStop(this.currentBgmAudio, fadeMs);
    }

    this.currentBgmKey = bgmKey;
    const src = this.audioMap.get(bgmKey);

    if (src && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(src);
        audio.loop = true;
        audio.volume = this.isMuted ? 0 : this.volume;
        audio.play().catch(e => {
          this.missingCues.add(bgmKey);
          console.warn(`[Audio] Autoplay blocked for ${bgmKey}:`, e);
        });
        this.currentBgmAudio = audio;
      } catch (err) {
        this.missingCues.add(bgmKey);
        if (this.synthFallback) WebAudioSynth.startASMR();
      }
    } else {
      this.missingCues.add(bgmKey);
      if (this.synthFallback) WebAudioSynth.startASMR();
    }
  }

  /**
   * Play Sound Effect (SFX)
   */
  playSfx(sfxKey) {
    if (this.isMuted) return;

    const src = this.audioMap.get(sfxKey);
    if (src && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(src);
        audio.volume = this.volume;
        audio.play().catch(() => {
          this.fallbackSfx(sfxKey);
        });
      } catch {
        this.fallbackSfx(sfxKey);
      }
    } else {
      this.fallbackSfx(sfxKey);
    }
  }

  fallbackSfx(sfxKey) {
    this.missingCues.add(sfxKey);
    if (!this.synthFallback) return;

    if (sfxKey.includes('win') || sfxKey.includes('success')) {
      WebAudioSynth.playSuccess();
    } else if (sfxKey.includes('hit') || sfxKey.includes('damage')) {
      WebAudioSynth.playTone(220, 0.1, 'sawtooth');
    } else if (sfxKey.includes('click')) {
      WebAudioSynth.playClick();
    } else {
      WebAudioSynth.playCoin();
    }
  }

  fadeOutAndStop(audio, durationMs) {
    if (!audio) return;
    try {
      const step = 0.05;
      const interval = durationMs / (1 / step);
      const timer = setInterval(() => {
        if (audio.volume > step) {
          audio.volume -= step;
        } else {
          audio.pause();
          clearInterval(timer);
        }
      }, interval);
    } catch {
      audio.pause();
    }
  }

  stopAll() {
    if (this.currentBgmAudio) {
      this.currentBgmAudio.pause();
      this.currentBgmAudio = null;
    }
    this.currentBgmKey = null;
    if (this.synthFallback) WebAudioSynth.stopASMR();
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.currentBgmAudio) {
      this.currentBgmAudio.volume = muted ? 0 : this.volume;
    }
  }

  getReport() {
    return {
      currentBgm: this.currentBgmKey,
      registeredCount: this.audioMap.size,
      missingCues: Array.from(this.missingCues),
      isMuted: this.isMuted
    };
  }
}

export default AudioAssetResolver;
