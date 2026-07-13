class WebAudioSynth {
    static context = null;
    static isUnlocked = false;
    static asmrOsc = null;
    static asmrGain = null;
    
    /**
     * 必须在用户首次交互 (PointerDown) 时调用此方法，以解锁移动端的 AudioContext
     */
    static unlock() {
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (this.context.state === 'suspended') {
            this.context.resume().then(() => {
                this.isUnlocked = true;
                // 播放一段极短的静音来彻底激活
                const osc = this.context.createOscillator();
                osc.connect(this.context.destination);
                osc.start();
                osc.stop(this.context.currentTime + 0.001);
            });
        } else {
            this.isUnlocked = true;
        }
    }
    
    /**
     * 核心发声器
     */
    static playTone(frequency, duration = 0.2, type = 'sine', volume = 0.3) {
        if (!this.context || !this.isUnlocked) return;
        
        const ctx = this.context;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        
        // 避免爆音的包络线 (Envelope)
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
    }
    
    // --- 语义化音效 (Semantic SFX) ---
    
    static playClick() {
        this.playTone(800, 0.05, 'sine', 0.2);
    }

    static playCoin() {
        // 连续两个上升频率的方波
        this.playTone(400, 0.1, 'square', 0.1);
        setTimeout(() => this.playTone(800, 0.15, 'square', 0.1), 80);
    }
    
    static playSuccess() {
        this.playTone(523.25, 0.1, 'sine', 0.3); // C5
        setTimeout(() => this.playTone(659.25, 0.1, 'sine', 0.3), 100); // E5
        setTimeout(() => this.playTone(783.99, 0.2, 'sine', 0.3), 200); // G5
    }
    
    static playError() {
        this.playTone(200, 0.15, 'square', 0.2);
        setTimeout(() => this.playTone(150, 0.25, 'square', 0.2), 150);
    }
    
    static playLevelUp() {
        const notes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.15 + (i * 0.05), 'sine', 0.2), i * 80);
        });
    }

    // --- 氛围音效 (Atmosphere/ASMR) ---
    
    /**
     * 播放低频呼吸背景音 (海浪/修仙灵气感)
     * 利用 LFO 调制滤波器的频率
     */
    static startASMR() {
        if (!this.context || !this.isUnlocked || this.asmrOsc) return;

        const ctx = this.context;
        
        // 主振荡器 (低频三角波)
        this.asmrOsc = ctx.createOscillator();
        this.asmrOsc.type = 'triangle';
        this.asmrOsc.frequency.value = 60; // 60Hz 极低频

        // 低通滤波器
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 100; // 初始滤波频率

        // LFO (低频振荡器)，用于缓慢改变滤波器的频率，产生“呼吸”感
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.2; // 0.2Hz (5秒一次呼吸循环)
        
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 200; // 滤波器频率摆幅 (+-200Hz)

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        // 主音量控制
        this.asmrGain = ctx.createGain();
        this.asmrGain.gain.value = 0.1; // 极低音量，避免吵闹

        // 连接链条
        this.asmrOsc.connect(filter);
        filter.connect(this.asmrGain);
        this.asmrGain.connect(ctx.destination);

        this.asmrOsc.start();
        lfo.start();
    }

    static stopASMR() {
        if (this.asmrOsc) {
            this.asmrOsc.stop();
            this.asmrOsc.disconnect();
            this.asmrOsc = null;
        }
        if (this.asmrGain) {
            this.asmrGain.disconnect();
            this.asmrGain = null;
        }
    }
}

export default WebAudioSynth;
