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
    return { ...base, ...patch };
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
        this.lastBeatAt = 0;
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.phase = 1;
        this.state = {
            combo: 0, hits: 0, score: 0, hp: payload.playerStats?.hp || 100,
            bottles: 0, phase2Left: Number(this.config.phase2LimitSec || 20), beatPhase: 0
        };
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('RhythmThenPickupAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 36, '节奏·拾取', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, '阶段一：环最亮时点击呼吸', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.ring = scene.add.circle(width / 2, height * 0.48, 40, 0x38bdf8, 0.2)
            .setStrokeStyle(4, 0x38bdf8, 0.9)
            .setInteractive({ useHandCursor: true });
        this.ring.on('pointerdown', () => this.onBeatTap());
        scene.input.on('pointerdown', (p) => {
            if (this.phase === 1) {
                const d = Math.hypot(p.x - this.ring.x, p.y - this.ring.y);
                if (d < 80) this.onBeatTap();
            }
        });

        this.lastBeatAt = scene.time.now;
        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.ring?.destroy();
            this.bottles.forEach((b) => b.destroy?.());
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    onBeatTap() {
        if (!this.isRunning() || this.phase !== 1) return;
        const now = this.scene.time.now;
        const interval = this.config.beatIntervalMs;
        const phase = ((now - this.lastBeatAt) % interval);
        const dist = Math.min(phase, interval - phase);
        if (dist <= this.config.perfectWindowMs) {
            this.state.hits += 1;
            this.state.combo += 1;
            this.state.score += 10;
            this.ring.setFillStyle(0x34d399, 0.5);
        } else if (dist <= this.config.goodWindowMs) {
            this.state.hits += 1;
            this.state.combo += 1;
            this.state.score += 5;
            this.ring.setFillStyle(0xfbbf24, 0.4);
        } else {
            this.state.combo = 0;
            this.ring.setFillStyle(0xef4444, 0.35);
        }
        this.lifecycle.trackTimer(this.scene.time.delayedCall(100, () => this.ring?.setFillStyle(0x38bdf8, 0.2)));
        if (this.state.hits >= this.config.phase1Target) this.startPhase2();
        this.refreshHud();
        this.publishTestState();
    }

    startPhase2() {
        this.phase = 2;
        this.ring.setVisible(false);
        this.ui.hint?.setText('阶段二：限时点击目标');
        this.state.phase2Left = this.config.phase2LimitSec;
        this.scheduleBottle();
    }

    scheduleBottle() {
        if (!this.isRunning() || this.phase !== 2) return;
        const min = this.config.bottleAppearMinSec * 1000;
        const max = this.config.bottleAppearMaxSec * 1000;
        const delay = min + Math.random() * Math.max(0, max - min);
        this.lifecycle.trackTimer(this.scene.time.delayedCall(delay, () => {
            this.spawnBottle();
            this.scheduleBottle();
        }));
    }

    spawnBottle() {
        if (!this.isRunning() || this.phase !== 2) return;
        const { width, height } = this.scene.scale;
        const b = this.scene.add.circle(
            40 + Math.random() * (width - 80),
            120 + Math.random() * (height - 200),
            16, 0xa78bfa, 0.95
        ).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => {
            if (!b.active) return;
            this.state.bottles += 1;
            this.state.score += 15;
            this.context.spawnParticles?.(b.x, b.y, 0xa78bfa);
            b.destroy();
            this.bottles = this.bottles.filter((x) => x !== b);
            if (this.state.bottles >= this.config.bottlesNeeded) {
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
            this.refreshHud();
        });
        this.bottles.push(b);
        const life = (this.config.bottleLifeMinSec
            + Math.random() * (this.config.bottleLifeMaxSec - this.config.bottleLifeMinSec)) * 1000;
        this.lifecycle.trackTimer(this.scene.time.delayedCall(life, () => {
            if (b.active) {
                b.destroy();
                this.bottles = this.bottles.filter((x) => x !== b);
            }
        }));
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = delta / 1000;
        if (this.phase === 1 && this.ring) {
            const interval = this.config.beatIntervalMs;
            const now = this.scene.time.now;
            const phase = ((now - this.lastBeatAt) % interval) / interval;
            // pulse radius
            const pulse = 36 + Math.sin(phase * Math.PI * 2) * 16;
            this.ring.setRadius(pulse);
            this.ring.setAlpha(0.25 + Math.abs(Math.sin(phase * Math.PI)) * 0.55);
        }
        if (this.phase === 2) {
            this.state.phase2Left -= dt;
            if (this.state.phase2Left <= 0) {
                if (this.state.bottles >= this.config.bottlesNeeded) {
                    this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
                } else {
                    this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
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
            hits: this.state.hits, bottles: this.state.bottles, lastResult: this.result
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

    retreat() { return this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.cleanup(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status, phase: this.phase, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as RHYTHM_THEN_PICKUP_DEFAULT_CONFIG };
