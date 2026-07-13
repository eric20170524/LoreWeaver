class VoiceManager {
    constructor() {
        this.ctx = null;
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.isMuted = false;
        this.isReady = false;
        this.currentUtterance = null;
    }

    init() {
        if (this.isReady) return;
        
        // Web Audio Context
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        } catch (e) {
            console.warn('Web Audio API not supported');
        }

        // Resume if suspended (common in modern browsers)
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(console.error);
        }

        // Speech Synthesis
        if (this.synth) {
            this.loadVoices();
            if (this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = () => this.loadVoices();
            }
        }
        this.isReady = true;
    }

    loadVoices() {
        if (!this.synth) return;
        const voices = this.synth.getVoices();
        // 优先中文，其次包含zh，最后默认
        this.voice = voices.find(v => v.lang === 'zh-CN') || 
                     voices.find(v => v.lang.includes('zh')) || 
                     voices[0];
    }

    setMute(muted) {
        this.isMuted = muted;
        if (this.synth && muted) {
            this.synth.cancel();
            this.currentUtterance = null;
        }
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.ctx || this.isMuted) return;
        try {
            // 确保 Context 处于运行状态
            if (this.ctx.state === 'suspended') this.ctx.resume();

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) { console.error(e); }
    }

    speak(text) {
        if (!this.synth || this.isMuted) return;
        
        // Remove error handler from previous utterance before canceling
        if (this.currentUtterance) {
            this.currentUtterance.onerror = null;
        }
        
        // 某些浏览器需要 cancel 才能打断上一句
        this.synth.cancel(); 
        
        const utterance = new SpeechSynthesisUtterance(text);
        if (this.voice) utterance.voice = this.voice;
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        utterance.volume = 1.0;
        
        // 错误处理防止卡死 - 只记录非 canceled 错误
        utterance.onerror = (e) => {
            if (e.error !== 'canceled') {
                console.warn("TTS Error:", e);
            }
        };
        
        this.currentUtterance = utterance;
        this.synth.speak(utterance);
    }

    // --- Specific Sound Effects ---

    playClick() {
        this.playTone(600, 'square', 0.1, 0.1);
    }

    playDrag() {
        // 拖拽声：短促的低频正弦波
        this.playTone(300, 'sine', 0.1, 0.1);
    }

    playCorrect() {
        // 成功：双音叮咚
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        this.playToneAtTime(800, 'sine', 0.2, now);
        this.playToneAtTime(1200, 'sine', 0.4, now + 0.1);
    }

    playToneAtTime(freq, type, duration, startTime) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    playWrong() {
        this.playTone(150, 'sawtooth', 0.4, 0.2);
    }

    playComplete() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        // C Major Arpeggio
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            this.playToneAtTime(freq, 'triangle', 0.3, now + i * 0.1);
        });
    }
}

export default new VoiceManager();