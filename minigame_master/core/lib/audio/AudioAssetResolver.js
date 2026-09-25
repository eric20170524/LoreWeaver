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
    this.activeSfx = new Map(); // HTMLAudioElement -> cue key
    this.isMuted = false;
    this.volume = options.volume ?? 1.0;
    this.synthFallback = options.synthFallback ?? true;
    this.missingCues = new Set();
    this.synthBed = false;
    this.synthHz = null;
    this.pendingBgmPlayback = false;
    this.isPaused = false;
    this._bgmStartPromise = null;
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
    if (unlocked && this.pendingBgmPlayback && !this.isPaused) await this._startAudioBgm();
    if (unlocked && this.synthBed && this.synthHz && !this.isPaused) this._startSynthBed(this.synthHz);
    return unlocked;
  }

  async _startAudioBgm() {
    const audio = this.currentBgmAudio;
    if (!audio || this.isPaused) return false;
    if (this._bgmStartPromise) return this._bgmStartPromise;
    const attempt = (async () => {
      try {
        await audio.play();
        if (this.currentBgmAudio !== audio) {
          audio.pause();
          return false;
        }
        this.pendingBgmPlayback = false;
        this.missingCues.delete(this.currentBgmKey);
        return true;
      } catch {
        if (this.currentBgmAudio === audio) {
          this.missingCues.add(this.currentBgmKey);
          this.currentBgmAudio = null;
          this.pendingBgmPlayback = false;
          if (this.synthFallback) this._startSynthBed(this.synthHz);
        }
        return false;
      }
    })();
    this._bgmStartPromise = attempt;
    void attempt.finally(() => {
      if (this._bgmStartPromise === attempt) this._bgmStartPromise = null;
    });
    return attempt;
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
    this.pendingBgmPlayback = false;
    this._bgmStartPromise = null;

    this.currentBgmKey = bgmKey;
    this.synthHz = synthHz;
    const src = this.audioMap.get(bgmKey);

    if (src && typeof Audio !== 'undefined') {
      WebAudioSynth.stopASMR();
      try {
        const audio = new Audio(src);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = this.isMuted ? 0 : this.volume;
        this.currentBgmAudio = audio;
        this.pendingBgmPlayback = true;
        if (WebAudioSynth.isUnlocked && !this.isPaused) void this._startAudioBgm();
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
  playSfx(sfxKey, options = {}) {
    if (this.isMuted || this.isPaused) return;

    const src = this.audioMap.get(sfxKey);
    if (src && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(src);
        audio.loop = options.loop === true;
        audio.volume = this.volume;
        const cleanup = () => this.activeSfx.delete(audio);
        audio.addEventListener?.('ended', cleanup, { once: true });
        audio.addEventListener?.('error', cleanup, { once: true });
        this.activeSfx.set(audio, sfxKey);
        Promise.resolve(audio.play()).catch(() => {
          if (!this.activeSfx.has(audio)) return;
          if (this.isPaused) return; // pause may reject an in-flight play promise
          cleanup();
          if (!this.isMuted && !this.isPaused) this.fallbackSfx(sfxKey);
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

  stopSfx(sfxKey) {
    for (const [audio, cueKey] of this.activeSfx) {
      if (cueKey !== sfxKey) continue;
      audio.pause();
      try { audio.currentTime = 0; } catch { /* stream may not be seekable */ }
      this.activeSfx.delete(audio);
    }
  }

  playSynthCue(config) {
    const frequencies = config.frequencies.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    const duration = Math.max(0.03, Math.min(1, Number(config.durationMs || 120) / 1000));
    const volume = Math.max(0, Math.min(0.3, Number(config.volume ?? 0.12) * this.volume));
    const wave = ['sine', 'triangle', 'square', 'sawtooth'].includes(config.wave) ? config.wave : 'sine';
    frequencies.forEach((frequency, index) => {
      const play = () => {
        if (!this.isMuted && !this.isPaused) WebAudioSynth.playTone(Number(frequency), duration, wave, volume);
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
    for (const audio of this.activeSfx.keys()) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* stream may not be seekable */ }
    }
    this.activeSfx.clear();
    if (this.currentBgmAudio) {
      this.currentBgmAudio.pause();
      this.currentBgmAudio = null;
    }
    this.currentBgmKey = null;
    this.synthBed = false;
    this.synthHz = null;
    this.pendingBgmPlayback = false;
    this._bgmStartPromise = null;
    if (this.synthFallback) WebAudioSynth.stopASMR();
  }

  setMuted(muted) {
    this.isMuted = muted;
    for (const audio of this.activeSfx.keys()) audio.volume = muted ? 0 : this.volume;
    if (this.currentBgmAudio) {
      this.currentBgmAudio.volume = muted ? 0 : this.volume;
    }
    WebAudioSynth.setBedGain(muted || this.isPaused ? 0 : 0.1 * this.volume);
  }

  setPaused(paused) {
    const nextPaused = Boolean(paused);
    if (this.isPaused === nextPaused) return;
    this.isPaused = nextPaused;
    for (const [audio, cueKey] of this.activeSfx) {
      if (this.isPaused) audio.pause();
      else {
        Promise.resolve(audio.play()).catch(() => {
          if (this.isPaused) return;
          if (this.activeSfx.delete(audio)) this.missingCues.add(cueKey);
        });
      }
    }
    if (this.currentBgmAudio) {
      if (this.isPaused) this.currentBgmAudio.pause();
      else {
        this.pendingBgmPlayback = true;
        if (WebAudioSynth.isUnlocked) void this._startAudioBgm();
      }
    }
    WebAudioSynth.setBedGain(this.isPaused || this.isMuted ? 0 : 0.1 * this.volume);
  }

  getReport() {
    return {
      currentBgm: this.currentBgmKey,
      registeredCount: this.audioMap.size,
      synthCueCount: this.synthCues.size,
      synthBed: this.synthBed,
      synthHz: this.synthHz,
      bgmSource: this.currentBgmAudio ? 'asset' : this.synthBed ? 'synth' : 'none',
      bgmPlaying: Boolean(this.currentBgmAudio && !this.currentBgmAudio.paused),
      bgmReadyState: this.currentBgmAudio?.readyState ?? null,
      bgmVolume: this.currentBgmAudio?.volume ?? null,
      bgmPending: this.pendingBgmPlayback,
      activeSfxCount: this.activeSfx.size,
      activeSfxPlaying: [...this.activeSfx.keys()].filter(audio => !audio.paused).length,
      audioUnlocked: WebAudioSynth.isUnlocked,
      missingCues: Array.from(this.missingCues),
      isMuted: this.isMuted,
      isPaused: this.isPaused
    };
  }
}

export default AudioAssetResolver;
