// utils/AudioManager.js — campaign audio matrix (Node1-12)
import WebAudioSynth from '../../../../minigame_master/core/lib/audio/WebAudioSynth.js';

const NODE_BGM = Object.freeze({
    1: 'node1_battle',
    2: 'node2_treasure',
    3: 'node3_rival',
    4: 'node4_tide',
    5: 'node5_defense',
    6: 'node6_poison',
    7: 'node7_tournament',
    8: 'node8_ruins',
    9: 'node9_escort',
    10: 'node10_siege',
    11: 'node11_gauntlet',
    12: 'node12_finale'
});

const BGM_BEDS = Object.freeze({
    menu_theme: [[196, 0.4, 'sine', 0.05], [247, 0.45, 'sine', 0.04, 120], [294, 0.5, 'triangle', 0.035, 240]],
    node1_battle: [[110, 0.18, 'sawtooth', 0.05], [165, 0.16, 'square', 0.03, 90], [220, 0.14, 'triangle', 0.03, 180]],
    node2_treasure: [[130, 0.16, 'triangle', 0.05], [196, 0.14, 'sine', 0.04, 100], [260, 0.12, 'triangle', 0.03, 200]],
    node3_rival: [[98, 0.18, 'sawtooth', 0.055], [147, 0.14, 'square', 0.035, 90], [196, 0.12, 'triangle', 0.03, 180]],
    node4_tide: [[90, 0.2, 'sine', 0.05], [140, 0.16, 'triangle', 0.04, 110], [180, 0.14, 'sine', 0.03, 220]],
    node5_defense: [[100, 0.18, 'square', 0.045], [150, 0.14, 'triangle', 0.035, 100], [200, 0.12, 'sine', 0.03, 190]],
    node6_poison: [[85, 0.2, 'sawtooth', 0.045], [120, 0.16, 'triangle', 0.035, 100], [170, 0.12, 'sine', 0.03, 200]],
    node7_tournament: [[140, 0.16, 'square', 0.05], [210, 0.14, 'triangle', 0.035, 90], [280, 0.12, 'sine', 0.03, 180]],
    node8_ruins: [[95, 0.18, 'triangle', 0.05], [145, 0.14, 'sine', 0.035, 110], [190, 0.12, 'triangle', 0.03, 210]],
    node9_escort: [[115, 0.16, 'sine', 0.05], [175, 0.14, 'triangle', 0.035, 100], [230, 0.12, 'sine', 0.03, 190]],
    node10_siege: [[80, 0.2, 'sawtooth', 0.055], [120, 0.16, 'square', 0.035, 100], [160, 0.14, 'triangle', 0.03, 200]],
    node11_gauntlet: [[105, 0.18, 'square', 0.05], [160, 0.14, 'sawtooth', 0.035, 90], [210, 0.12, 'triangle', 0.03, 180]],
    node12_finale: [[70, 0.22, 'sawtooth', 0.06], [105, 0.18, 'square', 0.04, 100], [140, 0.16, 'triangle', 0.035, 200]],
    boss_theme: [[82, 0.22, 'sawtooth', 0.07], [123, 0.18, 'square', 0.05, 100], [164, 0.2, 'sawtooth', 0.04, 200]],
    boss_theme_late: [[70, 0.24, 'sawtooth', 0.07], [100, 0.18, 'square', 0.05, 110], [150, 0.16, 'sawtooth', 0.04, 210]],
    victory_sting: [[523, 0.12, 'sine', 0.1], [659, 0.14, 'sine', 0.09, 90], [784, 0.2, 'sine', 0.08, 180]],
    defeat_sting: [[196, 0.18, 'triangle', 0.08], [147, 0.22, 'triangle', 0.07, 120], [98, 0.28, 'sine', 0.07, 240]]
});

const SFX_TONES = Object.freeze({
    hit: [[150, 0.1, 'square', 0.18]],
    ui_click: [[520, 0.04, 'square', 0.08]],
    ui_confirm: [[660, 0.06, 'sine', 0.09], [880, 0.05, 'sine', 0.06, 40]],
    chest_open: [[400, 0.06, 'triangle', 0.1], [600, 0.07, 'sine', 0.08, 50], [800, 0.08, 'sine', 0.06, 100]],
    whirl_pull: [[90, 0.12, 'sine', 0.09], [130, 0.1, 'triangle', 0.07, 60]],
    core_hit: [[200, 0.08, 'square', 0.1], [120, 0.1, 'triangle', 0.08, 40]],
    poison_tick: [[180, 0.06, 'sawtooth', 0.06], [240, 0.05, 'triangle', 0.05, 40]],
    antidote: [[500, 0.07, 'sine', 0.08], [700, 0.08, 'sine', 0.07, 50], [900, 0.09, 'sine', 0.05, 100]],
    portal: [[300, 0.08, 'triangle', 0.08], [450, 0.09, 'sine', 0.07, 60], [600, 0.1, 'sine', 0.05, 120]],
    ballista: [[250, 0.06, 'square', 0.12], [100, 0.1, 'triangle', 0.08, 40]],
    wall_hit: [[90, 0.1, 'square', 0.14], [60, 0.12, 'triangle', 0.1, 50]],
    escort_warn: [[440, 0.07, 'triangle', 0.09], [330, 0.08, 'sine', 0.07, 50]],
    break_window: [[720, 0.06, 'sine', 0.09], [960, 0.07, 'sine', 0.07, 40]],
    phase_shift: [[200, 0.1, 'sawtooth', 0.08], [400, 0.1, 'triangle', 0.07, 70], [600, 0.12, 'sine', 0.05, 140]],
    wave_clear: [[392, 0.08, 'sine', 0.09], [523, 0.09, 'sine', 0.08, 60], [659, 0.12, 'sine', 0.07, 120]]
});

const runtimeAudioStatus = {
    mode: 'webaudio_synth_plus_wav_manifest',
    externalAudioFiles: 0,
    bgm: 'none',
    bgmChannel: null,
    channels: {
        music: { volume: 0.55, muted: false, current: null },
        sfx: { volume: 0.8, muted: false },
        voice: { volume: 0.75, muted: false },
        ambience: { volume: 0.4, muted: false, current: null }
    },
    provenancePath: 'assets/audio/manifest.json',
    skillCueKeys: [],
    missingCueKeys: [],
    bgmKeys: Object.keys(BGM_BEDS),
    sfxKeys: Object.keys(SFX_TONES),
    nodeBgm: { ...NODE_BGM },
    toneCount: 0,
    lastCue: null,
    lastTone: null,
    lastBgm: null,
    isUnlocked: false,
    contextState: null,
    sfxPoolActive: 0,
    cachedAssets: []
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
    runtimeAudioStatus.externalAudioFiles =
        runtimeAudioStatus.bgmKeys.length + runtimeAudioStatus.sfxKeys.length;
    if (typeof window !== 'undefined') {
        window.__DAHUANG_AUDIO_PIPELINE__ = cloneStatus(runtimeAudioStatus);
    }
}

export class AudioManager extends WebAudioSynth {
    static getSkillCueKeys() {
        return [
            'short_fist_whoosh', 'beast_roar_sweep', 'soft_leaf_chime', 'eagle_wind_cut',
            'wooden_shield_knock', 'leaf_hum', 'electric_arc_snap', 'roar_thunder_pulse',
            'air_suction_dash', 'grass_bind_sweep', 'soft_fire_crackle', 'sharp_space_cut',
            'low_tide_pull', 'deep_bell_impact', 'focused_beam_hum', 'heartbeat_bell',
            'stacked_cave_resonance', 'deep_leaf_chorus', 'layered_voice_bell',
            ...Object.keys(SFX_TONES)
        ];
    }

    static getNodeBgmKey(nodeId) {
        return NODE_BGM[nodeId] || 'node1_battle';
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

    static init() {
        this.unlock();
        publishRuntimeAudioStatus(this);
    }

    static playHit() {
        this.playSfx('hit');
    }

    static playClick() {
        this.playSfx('ui_click');
    }

    static playSfx(key) {
        const musicMuted = false;
        const sfxVol = runtimeAudioStatus.channels.sfx.muted ? 0 : runtimeAudioStatus.channels.sfx.volume;
        const tones = SFX_TONES[key];
        runtimeAudioStatus.lastCue = { key, channel: 'sfx', status: tones ? 'mapped' : 'missing' };
        if (!tones) {
            if (!runtimeAudioStatus.missingCueKeys.includes(key)) runtimeAudioStatus.missingCueKeys.push(key);
            publishRuntimeAudioStatus(this);
            return this.playHit();
        }
        if (!runtimeAudioStatus.cachedAssets.includes(`sfx:${key}`)) {
            runtimeAudioStatus.cachedAssets.push(`sfx:${key}`);
        }
        runtimeAudioStatus.sfxPoolActive += 1;
        tones.forEach(([frequency, duration, wave, volume, delay = 0]) => {
            const play = () => this.playTone(frequency, duration, wave, volume * sfxVol);
            if (delay > 0) setTimeout(play, delay);
            else play();
        });
        setTimeout(() => {
            runtimeAudioStatus.sfxPoolActive = Math.max(0, runtimeAudioStatus.sfxPoolActive - 1);
            publishRuntimeAudioStatus(this);
        }, 350);
        publishRuntimeAudioStatus(this);
        return key;
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
        const cue = cueMap[skillData.sfx] || SFX_TONES[skillData.sfx];
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
        const sfxVol = runtimeAudioStatus.channels.sfx.muted ? 0 : runtimeAudioStatus.channels.sfx.volume;
        runtimeAudioStatus.sfxPoolActive += 1;
        cue.forEach(([frequency, duration, wave, volume, delay = 0]) => {
            const play = () => this.playTone(frequency, duration, wave, volume * sfxVol);
            if (delay > 0) setTimeout(play, delay);
            else play();
        });
        setTimeout(() => {
            runtimeAudioStatus.sfxPoolActive = Math.max(0, runtimeAudioStatus.sfxPoolActive - 1);
            publishRuntimeAudioStatus(this);
        }, 400);
    }

    static playBgm(key, { force = false } = {}) {
        const music = runtimeAudioStatus.channels.music;
        if (!force && music.current === key) return music.current;
        if (music.muted) {
            runtimeAudioStatus.bgm = 'muted';
            runtimeAudioStatus.bgmChannel = key;
            publishRuntimeAudioStatus(this);
            return key;
        }
        const bed = BGM_BEDS[key];
        if (!bed) {
            if (!runtimeAudioStatus.missingCueKeys.includes(key)) runtimeAudioStatus.missingCueKeys.push(key);
            runtimeAudioStatus.lastBgm = { key, status: 'missing' };
            publishRuntimeAudioStatus(this);
            return null;
        }
        music.current = key;
        runtimeAudioStatus.bgm = key;
        runtimeAudioStatus.bgmChannel = 'music';
        runtimeAudioStatus.lastBgm = { key, status: 'playing', at: Date.now() };
        if (!runtimeAudioStatus.cachedAssets.includes(`bgm:${key}`)) {
            runtimeAudioStatus.cachedAssets.push(`bgm:${key}`);
        }
        const vol = music.volume;
        bed.forEach(([frequency, duration, wave, volume, delay = 0]) => {
            const play = () => this.playTone(frequency, duration, wave, volume * vol);
            if (delay > 0) setTimeout(play, delay);
            else play();
        });
        publishRuntimeAudioStatus(this);
        return key;
    }

    static playNodeBgm(nodeId, { boss = false } = {}) {
        if (boss) {
            return this.playBgm(nodeId >= 10 ? 'boss_theme_late' : 'boss_theme', { force: true });
        }
        return this.playBgm(this.getNodeBgmKey(nodeId), { force: true });
    }

    static stopBgm() {
        runtimeAudioStatus.channels.music.current = null;
        runtimeAudioStatus.bgm = 'none';
        runtimeAudioStatus.lastBgm = { key: null, status: 'stopped', at: Date.now() };
        publishRuntimeAudioStatus(this);
    }

    static setChannelMuted(channel, muted) {
        if (!runtimeAudioStatus.channels[channel]) return;
        runtimeAudioStatus.channels[channel].muted = Boolean(muted);
        publishRuntimeAudioStatus(this);
    }

    static playUi(kind = 'click') {
        const map = { click: 'ui_click', confirm: 'ui_confirm', cancel: 'ui_click', levelup: 'wave_clear', objective: 'ui_confirm' };
        return this.playSfx(map[kind] || 'ui_click');
    }

    static playCallout(label = '') {
        runtimeAudioStatus.lastCue = { key: 'callout', label, source: 'voice' };
        const voice = runtimeAudioStatus.channels.voice;
        if (!voice.muted) this.playTone(480, 0.08, 'triangle', 0.07 * voice.volume);
        publishRuntimeAudioStatus(this);
    }
}

export default AudioManager;
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
    publishRuntimeAudioStatus(AudioManager);
}
