/**
 * AudioAssetResolver.js (P3 Task 5.1)
 * Runtime Audio Asset Resolver that loads and plays real audio assets (BGM, SFX, Voice, Ambience).
 * Handles BGM fade-in/out, boss song transitions, victory/defeat stingers, mute, and synth fallback.
 */

import WebAudioSynth from './WebAudioSynth.js';

export class AudioAssetResolver {
  constructor(options = {}) {
    this.audioMap = new Map(); // cueKey -> HTMLAudioElement / AudioBuffer
    this.synthCues = new Map(); // cueKey -> authored oscillator settings
    this.currentBgmKey = null;
    this.currentBgmAudio = null;
    this.isMuted = false;
    this.volume = options.volume ?? 1.0;
    this.synthFallback = options.synthFallback ?? true;
    this.missingCues = new Set();
    this.synthBed = false;
    this.synthHz = null;
  }

  /**
   * Register audio asset mapping
   */
  registerCue(key, urlOrBuffer) {
    this.audioMap.set(key, urlOrBuffer);
  }

  registerSynthCue(key, config) {
    if (!key || !config || !Array.isArray(config.frequencies)) return;
    this.synthCues.set(key, config);
  }

  async unlock() {
    const unlocked = await WebAudioSynth.unlock();
    if (unlocked && this.synthBed && this.synthHz) this._startSynthBed(this.synthHz);
    return unlocked;
  }

  /**
   * Play BGM with smooth crossfade
   */
  playBgm(bgmKey, fadeMs = 1000, synthHz = null) {
    if (this.currentBgmKey === bgmKey && (this.currentBgmAudio || this.synthBed)) return;

    if (this.currentBgmAudio) {
      this.fadeOutAndStop(this.currentBgmAudio, fadeMs);
    }
    this.synthBed = false;

    this.currentBgmKey = bgmKey;
    this.synthHz = synthHz;
    const src = this.audioMap.get(bgmKey);

    if (src && typeof Audio !== 'undefined') {
      WebAudioSynth.stopASMR();
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
        this.currentBgmAudio = null;
        if (this.synthFallback) this._startSynthBed(synthHz);
      }
    } else {
      this.missingCues.add(bgmKey);
      this.currentBgmAudio = null;
      if (this.synthFallback) this._startSynthBed(synthHz);
    }
  }

  _startSynthBed(synthHz) {
    const hz = Number(synthHz);
    WebAudioSynth.startBed(Number.isFinite(hz) && hz > 0 ? hz : 60);
    WebAudioSynth.setBedGain(this.isMuted ? 0 : 0.1 * this.volume);
    this.synthBed = true;
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
      const synthCue = this.synthCues.get(sfxKey);
      if (synthCue) this.playSynthCue(synthCue);
      else this.fallbackSfx(sfxKey);
    }
  }

  playSynthCue(config) {
    const frequencies = config.frequencies.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    const duration = Math.max(0.03, Math.min(1, Number(config.durationMs || 120) / 1000));
    const volume = Math.max(0, Math.min(0.3, Number(config.volume ?? 0.12) * this.volume));
    const wave = ['sine', 'triangle', 'square', 'sawtooth'].includes(config.wave) ? config.wave : 'sine';
    frequencies.forEach((frequency, index) => {
      const play = () => {
        if (!this.isMuted) WebAudioSynth.playTone(Number(frequency), duration, wave, volume);
      };
      if (index === 0) play();
      else setTimeout(play, index * Math.min(90, duration * 300));
    });
  }

  fallbackSfx(sfxKey) {
    const authoredCue = this.synthCues.get(sfxKey);
    if (authoredCue) {
      this.playSynthCue(authoredCue);
      return;
    }
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
    this.synthBed = false;
    this.synthHz = null;
    if (this.synthFallback) WebAudioSynth.stopASMR();
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.currentBgmAudio) {
      this.currentBgmAudio.volume = muted ? 0 : this.volume;
    }
    WebAudioSynth.setBedGain(muted ? 0 : 0.1 * this.volume);
  }

  getReport() {
    return {
      currentBgm: this.currentBgmKey,
      registeredCount: this.audioMap.size,
      synthCueCount: this.synthCues.size,
      synthBed: this.synthBed,
      synthHz: this.synthHz,
      audioUnlocked: WebAudioSynth.isUnlocked,
      missingCues: Array.from(this.missingCues),
      isMuted: this.isMuted
    };
  }
}

export default AudioAssetResolver;
