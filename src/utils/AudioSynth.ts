// Web Audio API Procedural Synthesizer for Retro Juicing Game-feel
class AudioSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuteState(): boolean {
    return this.isMuted;
  }

  public playClick() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, this.ctx.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08); // Higher sweep

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio Context Click SFX warning:", e);
    }
  }

  public playLoot() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, this.ctx.currentTime); // E5
      osc.frequency.setValueAtTime(987.77, this.ctx.currentTime + 0.06); // B5

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.16);
    } catch (e) {
      // Ignored
    }
  }

  public playDamage() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.17);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    } catch (e) {
      // Ignored
    }
  }

  public playBreakthrough() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(261.63, this.ctx.currentTime); // C4
      osc.frequency.exponentialRampToValueAtTime(1046.50, this.ctx.currentTime + 0.4); // C6 sweep

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.65);
    } catch (e) {
      // Ignored
    }
  }

  public playNodeSuccess() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      o1.type = "sine";
      o2.type = "triangle";

      o1.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
      o1.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.1); // E5
      o1.frequency.setValueAtTime(783.99, this.ctx.currentTime + 0.2); // G5
      o1.frequency.setValueAtTime(1046.50, this.ctx.currentTime + 0.3); // C6

      o2.frequency.setValueAtTime(1046.5, this.ctx.currentTime);
      o2.frequency.setValueAtTime(1318.5, this.ctx.currentTime + 0.15);

      g.gain.setValueAtTime(0.12, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);

      o1.connect(g);
      o2.connect(g);
      g.connect(this.ctx.destination);

      o1.start();
      o2.start();
      o1.stop(this.ctx.currentTime + 0.5);
      o2.stop(this.ctx.currentTime + 0.5);
    } catch (e) {
      // Ignored
    }
  }

  public playVictoryFanfare() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.11, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.85);
      gain.connect(this.ctx.destination);

      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, index) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        osc.type = index % 2 === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + index * 0.08);
        osc.connect(gain);
        osc.start(this.ctx.currentTime + index * 0.08);
        osc.stop(this.ctx.currentTime + 0.55 + index * 0.08);
      });
    } catch (e) {
      // Ignored
    }
  }

  private bgmOscs: OscillatorNode[] = [];
  private bgmGain: GainNode | null = null;
  private bossOscs: OscillatorNode[] = [];
  private bossGain: GainNode | null = null;

  public startBgm() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    // Stop any existing BGM
    this.stopBgm();

    try {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.bgmGain.gain.linearRampToValueAtTime(0.025, this.ctx.currentTime + 2.0); // Slow fade-in
      this.bgmGain.connect(this.ctx.destination);

      // Create two low drone oscillators for a nice minor chord ambient sound (A2 and E3)
      const freqs = [110.00, 164.81]; 
      freqs.forEach(freq => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.connect(this.bgmGain!);
        osc.start();
        this.bgmOscs.push(osc);
      });
    } catch (e) {
      console.warn("Audio Synth BGM error:", e);
    }
  }

  public stopBgm() {
    if (!this.ctx) return;
    try {
      const activeGain = this.bgmGain;
      const activeOscs = [...this.bgmOscs];
      
      this.bgmGain = null;
      this.bgmOscs = [];

      if (activeGain) {
        activeGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0); // Slow fade-out
        this.ctx.resume();
        setTimeout(() => {
          try {
            activeOscs.forEach(osc => osc.stop());
            activeGain.disconnect();
          } catch (_) {}
        }, 1200);
      }
    } catch (e) {
      // Ignore
    }
  }

  public playBossTheme() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    this.stopBgm();
    this.stopBossTheme();

    try {
      this.bossGain = this.ctx.createGain();
      this.bossGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.bossGain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 1.0); // Fade-in
      this.bossGain.connect(this.ctx.destination);

      // Tense detuned saw waves for Boss combat feeling
      const freqs = [82.41, 83.00, 123.47]; // E2 detuned + B2
      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        osc.type = idx === 2 ? "triangle" : "sawtooth";
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        // Add subtle LFO pitch modulation for tension
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(3.5, this.ctx.currentTime); // 3.5 Hz modulation
        lfoGain.gain.setValueAtTime(1.5, this.ctx.currentTime);  // Detuning width
        
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        
        osc.connect(this.bossGain!);
        osc.start();
        
        this.bossOscs.push(osc);
        this.bossOscs.push(lfo as any); // Track LFO for clean termination
      });
    } catch (e) {
      console.warn("Audio Synth Boss Theme error:", e);
    }
  }

  public startBossTheme() {
    this.playBossTheme();
  }

  public stopBossTheme() {
    if (!this.ctx) return;
    try {
      const activeGain = this.bossGain;
      const activeOscs = [...this.bossOscs];
      
      this.bossGain = null;
      this.bossOscs = [];

      if (activeGain) {
        activeGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8);
        setTimeout(() => {
          try {
            activeOscs.forEach(osc => {
              try { osc.stop(); } catch (_) {}
            });
            activeGain.disconnect();
          } catch (_) {}
        }, 1000);
      }
    } catch (e) {
      // Ignore
    }
  }
}

export const synth = new AudioSynth();
// Expose synth to window for global access inside Phaser adapters
if (typeof window !== 'undefined') {
  (window as any).synth = synth;
}
