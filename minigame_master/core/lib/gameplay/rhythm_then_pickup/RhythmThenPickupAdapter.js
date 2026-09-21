import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'rhythm_then_pickup',
    beatIntervalMs: 1200,
    perfectWindowMs: 90,
    goodWindowMs: 180,
    phase1Target: 12,
    phase2LimitSec: 20,
    bottleAppearMinSec: 1.2,
    bottleAppearMaxSec: 3.0,
    bottleLifeMinSec: 0.9,
    bottleLifeMaxSec: 1.5,
    bottlesNeeded: 5,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const config = { ...base, ...patch };
    const bounds = { beatIntervalMs: [400, 2400], perfectWindowMs: [20, 250], goodWindowMs: [40, 400], phase1Target: [3, 40], phase2LimitSec: [5, 120], bottleAppearMinSec: [0.5, 4], bottleAppearMaxSec: [0.5, 4], bottleLifeMinSec: [0.5, 3], bottleLifeMaxSec: [0.5, 3], bottlesNeeded: [1, 20] };
    for (const [key, [min, max]] of Object.entries(bounds)) config[key] = Number.isFinite(config[key]) ? Math.max(min, Math.min(max, config[key])) : base[key];
    for (const key of ['phase1Target', 'bottlesNeeded']) config[key] = Math.floor(config[key]);
    config.goodWindowMs = Math.min(config.goodWindowMs, config.beatIntervalMs / 2 - 1);
    config.perfectWindowMs = Math.min(config.perfectWindowMs, config.goodWindowMs);
    config.bottleAppearMaxSec = Math.max(config.bottleAppearMinSec, config.bottleAppearMaxSec);
    config.bottleLifeMaxSec = Math.max(config.bottleLifeMinSec, config.bottleLifeMaxSec);
    config.phase2LimitSec = Math.max(config.phase2LimitSec, config.bottlesNeeded * config.bottleAppearMaxSec + 0.2);
    return config;
}

export default class RhythmThenPickupAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.phase = 1;
        this.ring = null;
        this.ui = {};
        this.bottles = [];
        this.state = {
            combo: 0, hits: 0, score: 0, hp: 100,
            bottles: 0, phase2Left: 20, beatPhase: 0
        };
        this.random = context.random || Math.random;
        this.keyEvents = new WeakSet();
        this.feedbackTimer = null;
        this.spawnTimer = null;
        this.lastJudgedBeat = -1;
        this.beatElapsedMs = 0;
        this.judgement = null;
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.phase = 1;
        this.state = {
            combo: 0, hits: 0, score: 0, hp: Number.isFinite(payload.playerStats?.hp) ? Math.max(0, payload.playerStats.hp) : 100,
            bottles: 0, phase2Left: Number(this.config.phase2LimitSec || 20), beatPhase: 0
        };
        this.beatElapsedMs = 0; this.lastJudgedBeat = -1; this.judgement = null;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('RhythmThenPickupAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 188, '节奏·拾取', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 95, '环最亮时点击或按空格 · 每拍一次', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.ring = scene.add.circle(width / 2, height * 0.48, 40, 0x38bdf8, 0.2)
            .setStrokeStyle(4, 0x38bdf8, 0.9)
            .setInteractive({ useHandCursor: true });
        this.ring.on('pointerdown', () => this.onBeatTap());
        this.lifecycle.trackListener(scene.input.keyboard, 'keydown', event => {
            if (!this.isRunning() || !event || event.code !== 'Space' || event.repeat || this.keyEvents.has(event)) return;
            this.keyEvents.add(event); event.preventDefault?.();
            if (this.phase === 1) this.onBeatTap();
            else this.collectBottle(this.bottles.find(b => b.active));
        });
        this.lifecycle.addCleanup(() => {
            this.feedbackTimer?.remove(false); this.feedbackTimer = null;
            this.spawnTimer?.remove(false); this.spawnTimer = null;
            Object.values(this.ui).forEach(n => n?.destroy?.());
            this.ring?.destroy(); this.ring = null; this.ui = {};
            this.bottles.forEach(b => { b.expiryTimer?.remove(false); b.destroy(); });
            this.bottles = [];
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    onBeatTap() {
        if (!this.isRunning() || this.phase !== 1) return;
        const { beatIndex, distance: dist } = this.beatPosition();
        if (beatIndex <= this.lastJudgedBeat) return;
        this.lastJudgedBeat = beatIndex;
        if (dist <= this.config.perfectWindowMs) {
            this.state.hits += 1;
            this.state.combo += 1;
            this.state.score += 10; this.judgement = 'perfect';
            this.ring.setFillStyle(0x34d399, 0.5);
        } else if (dist <= this.config.goodWindowMs) {
            this.state.hits += 1;
            this.state.combo += 1;
            this.state.score += 5; this.judgement = 'good';
            this.ring.setFillStyle(0xfbbf24, 0.4);
        } else {
            this.state.combo = 0; this.judgement = 'miss';
            this.ring.setFillStyle(0xef4444, 0.35);
        }
        this.feedbackTimer?.remove(false);
        this.feedbackTimer = this.scene.time.delayedCall(100, () => { this.feedbackTimer = null; this.ring?.setFillStyle(0x38bdf8, 0.2); });
        if (this.state.hits >= this.config.phase1Target) this.startPhase2();
        this.refreshHud();
        this.publishTestState();
    }

    startPhase2() {
        if (!this.isRunning() || this.phase !== 1 || this.state.hits < this.config.phase1Target) return;
        this.phase = 2;
        this.ring.setVisible(false);
        this.ui.hint?.setText('限时点击目标 · 空格拾取最早出现的目标');
        this.state.phase2Left = this.config.phase2LimitSec;
        this.scheduleBottle();
    }

    scheduleBottle() {
        if (!this.isRunning() || this.phase !== 2) return;
        const min = this.config.bottleAppearMinSec * 1000;
        const max = this.config.bottleAppearMaxSec * 1000;
        const delay = min + this.random() * Math.max(0, max - min);
        this.spawnTimer?.remove(false);
        this.spawnTimer = this.scene.time.delayedCall(delay, () => {
            this.spawnTimer = null;
            this.spawnBottle();
            this.scheduleBottle();
        });
    }

    spawnBottle() {
        if (!this.isRunning() || this.phase !== 2) return;
        const { width, height } = this.scene.scale;
        const b = this.scene.add.circle(
            50 + this.random() * (width - 100),
            350 + this.random() * (height - 550),
            16, 0xa78bfa, 0.95
        ).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.collectBottle(b));
        this.bottles.push(b);
        const life = (this.config.bottleLifeMinSec
            + this.random() * (this.config.bottleLifeMaxSec - this.config.bottleLifeMinSec)) * 1000;
        b.expiryTimer = this.scene.time.delayedCall(life, () => {
            if (b.active) {
                b.destroy();
                this.bottles = this.bottles.filter((x) => x !== b);
            }
            b.expiryTimer = null;
        });
    }

    collectBottle(b) {
        if (!this.isRunning() || this.phase !== 2 || !b?.active || !this.bottles.includes(b)) return;
        this.state.bottles += 1; this.state.score += 15;
        this.context.spawnParticles?.(b.x, b.y, 0xa78bfa);
        b.expiryTimer?.remove(false); b.expiryTimer = null; b.destroy();
        this.bottles = this.bottles.filter(x => x !== b);
        if (this.state.bottles >= this.config.bottlesNeeded) return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        this.refreshHud();
    }

    beatPosition() {
        const beatIndex = Math.round(this.beatElapsedMs / this.config.beatIntervalMs);
        return { beatIndex, distance: Math.abs(this.beatElapsedMs - beatIndex * this.config.beatIntervalMs) };
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta <= 0) return;
        const dt = delta / 1000;
        if (this.phase === 1 && this.ring) {
            this.beatElapsedMs += delta;
            this.state.beatPhase = (this.beatElapsedMs % this.config.beatIntervalMs) / this.config.beatIntervalMs;
            const closeness = Math.max(0, 1 - this.beatPosition().distance / (this.config.beatIntervalMs / 2));
            this.ring.setRadius(36 + closeness * 16);
            this.ring.setAlpha(0.25 + closeness * 0.7);
        }
        if (this.phase === 2) {
            this.state.phase2Left = Math.max(0, this.state.phase2Left - dt);
            if (this.state.phase2Left <= 0) {
                if (this.state.bottles >= this.config.bottlesNeeded) {
                    return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
                } else {
                    return this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
                }
            }
            this.refreshHud();
        }
    }

    refreshHud() {
        if (this.phase === 1) {
            this.ui.status?.setText(`节奏 ${this.state.hits}/${this.config.phase1Target}  ·  连击 ${this.state.combo}`);
        } else {
            this.ui.status?.setText(
                `收集物 ${this.state.bottles}/${this.config.bottlesNeeded}  ·  剩余 ${Math.max(0, this.state.phase2Left).toFixed(1)}s`
            );
        }
    }

    getTestState() {
        return {
            adapter: 'RhythmThenPickupAdapter', status: this.status,
            hp: this.state.hp, score: this.state.score, phase: this.phase,
            hits: this.state.hits, bottles: this.state.bottles, phase1Target: this.config.phase1Target, bottlesNeeded: this.config.bottlesNeeded,
            goalValue: 0, timer: this.phase === 2 ? this.state.phase2Left : null,
            beatElapsedMs: this.beatElapsedMs, ...this.beatPosition(), lastJudgedBeat: this.lastJudgedBeat, judgement: this.judgement,
            ring: this.ring ? { x: this.ring.x, y: this.ring.y, radius: this.ring.radius, alpha: this.ring.alpha } : null,
            targets: this.bottles.filter(b => b.active).map(b => ({ x: b.x, y: b.y })),
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.FAILED),
            rewards: success ? { ...(this.config.rewardTable || {}), score: 1 } : {},
            telemetry: {
                phase: this.phase, hits: this.state.hits, bottles: this.state.bottles, combo: this.state.combo
            }
        });
        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    pause() { if (this.config.allowPause !== false) super.pause(); }
    retreat() { return this.config.allowQuit === false ? null : this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status, phase: this.phase, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as RHYTHM_THEN_PICKUP_DEFAULT_CONFIG };
