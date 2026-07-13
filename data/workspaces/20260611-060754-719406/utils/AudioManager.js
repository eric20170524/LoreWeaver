// utils/AudioManager.js
// 声音管理器 - 继承自 @core/audio/WebAudioSynth.js

import WebAudioSynth from '../../../../../minigame_master/core/lib/audio/WebAudioSynth.js';

const runtimeAudioStatus = {
    mode: 'webaudio_synth',
    externalAudioFiles: 0,
    bgm: 'none_declared',
    provenancePath: 'loreweaver/audio-provenance.md',
    skillCueKeys: [],
    missingCueKeys: [],
    toneCount: 0,
    lastCue: null,
    lastTone: null,
    isUnlocked: false,
    contextState: null
};

function cloneStatus(value) {
    return JSON.parse(JSON.stringify(value));
}

function publishRuntimeAudioStatus(audioClass = null) {
    if (audioClass?.getSkillCueKeys) {
        runtimeAudioStatus.skillCueKeys = audioClass.getSkillCueKeys();
    }
    if (audioClass) {
        runtimeAudioStatus.isUnlocked = Boolean(audioClass.isUnlocked);
        runtimeAudioStatus.contextState = audioClass.context?.state || null;
    }
    if (typeof window !== 'undefined') {
        window.__DAHUANG_AUDIO_PIPELINE__ = cloneStatus(runtimeAudioStatus);
    }
}

export class AudioManager extends WebAudioSynth {
    static getSkillCueKeys() {
        return [
            'short_fist_whoosh',
            'beast_roar_sweep',
            'soft_leaf_chime',
            'eagle_wind_cut',
            'wooden_shield_knock',
            'leaf_hum',
            'electric_arc_snap',
            'roar_thunder_pulse',
            'air_suction_dash',
            'grass_bind_sweep',
            'soft_fire_crackle',
            'sharp_space_cut',
            'low_tide_pull',
            'deep_bell_impact',
            'focused_beam_hum',
            'heartbeat_bell',
            'stacked_cave_resonance',
            'deep_leaf_chorus',
            'layered_voice_bell'
        ];
    }

    static getRuntimeAudioStatus() {
        publishRuntimeAudioStatus(this);
        return cloneStatus(runtimeAudioStatus);
    }

    static playTone(frequency, duration = 0.2, type = 'sine', volume = 0.3) {
        runtimeAudioStatus.toneCount += 1;
        runtimeAudioStatus.lastTone = { frequency, duration, type, volume };
        publishRuntimeAudioStatus(this);
        return super.playTone(frequency, duration, type, volume);
    }

    /**
     * 映射 init 到 unlock，符合原版的初始化/激活习惯
     */
    static init() {
        this.unlock();
        publishRuntimeAudioStatus(this);
    }

    /**
     * 实现原版特有的 playHit 敲击/击中音效
     */
    static playHit() {
        runtimeAudioStatus.lastCue = { key: 'hit', source: 'semantic_synth' };
        publishRuntimeAudioStatus(this);
        this.playTone(150, 0.1, 'square', 0.2);
    }

    static playSkillCue(skillData) {
        if (!skillData?.sfx) {
            runtimeAudioStatus.lastCue = { key: null, skillId: skillData?.id || null, status: 'no_sfx' };
            publishRuntimeAudioStatus(this);
            return;
        }

        const cueMap = {
            short_fist_whoosh: [[260, 0.05, 'square', 0.14], [180, 0.06, 'square', 0.1, 35]],
            beast_roar_sweep: [[180, 0.08, 'sawtooth', 0.16], [110, 0.12, 'sawtooth', 0.12, 55]],
            soft_leaf_chime: [[620, 0.1, 'sine', 0.08], [780, 0.12, 'sine', 0.06, 70]],
            eagle_wind_cut: [[720, 0.04, 'triangle', 0.12], [420, 0.08, 'triangle', 0.1, 40]],
            wooden_shield_knock: [[180, 0.08, 'triangle', 0.12], [240, 0.06, 'triangle', 0.08, 65]],
            leaf_hum: [[330, 0.12, 'sine', 0.06], [440, 0.12, 'sine', 0.05, 55]],
            electric_arc_snap: [[880, 0.04, 'square', 0.11], [1320, 0.035, 'square', 0.08, 35], [660, 0.04, 'square', 0.08, 70]],
            roar_thunder_pulse: [[220, 0.08, 'sawtooth', 0.14], [440, 0.05, 'square', 0.09, 45], [120, 0.12, 'sawtooth', 0.11, 80]],
            air_suction_dash: [[420, 0.05, 'triangle', 0.12], [260, 0.08, 'triangle', 0.09, 45]],
            grass_bind_sweep: [[300, 0.08, 'triangle', 0.09], [360, 0.08, 'triangle', 0.08, 55]],
            soft_fire_crackle: [[520, 0.035, 'square', 0.06], [390, 0.045, 'square', 0.05, 50]],
            sharp_space_cut: [[960, 0.04, 'sawtooth', 0.12], [300, 0.08, 'sawtooth', 0.1, 45]],
            low_tide_pull: [[120, 0.14, 'sine', 0.1], [180, 0.12, 'sine', 0.08, 80]],
            deep_bell_impact: [[90, 0.18, 'sine', 0.18], [180, 0.16, 'sine', 0.12, 80], [360, 0.12, 'sine', 0.08, 150]],
            focused_beam_hum: [[740, 0.14, 'sine', 0.09], [980, 0.12, 'sine', 0.07, 80]],
            heartbeat_bell: [[80, 0.08, 'triangle', 0.16], [160, 0.11, 'triangle', 0.12, 95], [420, 0.16, 'sine', 0.08, 180]],
            stacked_cave_resonance: [[120, 0.16, 'sine', 0.14], [240, 0.14, 'sine', 0.1, 70], [480, 0.12, 'sine', 0.08, 140]],
            deep_leaf_chorus: [[260, 0.14, 'sine', 0.07], [520, 0.15, 'sine', 0.06, 70], [780, 0.12, 'sine', 0.05, 130]],
            layered_voice_bell: [[110, 0.18, 'triangle', 0.16], [220, 0.18, 'triangle', 0.11, 90], [660, 0.14, 'sine', 0.08, 170]]
        };

        const cue = cueMap[skillData.sfx];
        runtimeAudioStatus.lastCue = {
            key: skillData.sfx,
            skillId: skillData.id || null,
            status: cue ? 'mapped' : 'fallback_hit'
        };
        if (!cue && !runtimeAudioStatus.missingCueKeys.includes(skillData.sfx)) {
            runtimeAudioStatus.missingCueKeys.push(skillData.sfx);
        }
        publishRuntimeAudioStatus(this);

        if (!cue) {
            this.playHit();
            return;
        }

        cue.forEach(([frequency, duration, wave, volume, delay = 0]) => {
            if (delay > 0) {
                setTimeout(() => this.playTone(frequency, duration, wave, volume), delay);
            } else {
                this.playTone(frequency, duration, wave, volume);
            }
        });
    }
}

export default AudioManager;
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager; // Bind to window for global access if needed
    publishRuntimeAudioStatus(AudioManager);
}
