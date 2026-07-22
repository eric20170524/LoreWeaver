import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'observe_capture',
    targetProgress: 100,
    missPenalty: 12,
    captureGain: 22,
    moveSpeed: 280,
    pauseIntervalMinSec: 1.4,
    pauseIntervalMaxSec: 2.8,
    pauseWindowSec: 0.55,
    lockRingRadius: 28,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class ObserveCaptureAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.target = null;
        this.lockRing = null;
        this.ui = {};
        this.state = {
            progress: 0,
            captures: 0,
            misses: 0,
            paused: false,
            pauseLeft: 0,
            nextPauseIn: 1.5,
            vx: 1,
            vy: 0.4,
            hp: 100,
            score: 0,
            elapsed: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.state.progress = 0;
        this.state.captures = 0;
        this.state.misses = 0;
        this.state.paused = false;
        this.state.pauseLeft = 0;
        this.state.nextPauseIn = this.randPauseInterval();
        this.state.vx = 1;
        this.state.vy = 0.5;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        this.state.elapsed = 0;
        return this;
    }

    randPauseInterval() {
        const a = Number(this.config.pauseIntervalMinSec || 1.4);
        const b = Number(this.config.pauseIntervalMaxSec || 2.8);
        return a + Math.random() * Math.max(0, b - a);
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('ObserveCaptureAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 40, '观形捕捉', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 72, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();
        this.ui.hint = scene.add.text(width / 2, height - 40, '目标停顿/锁定环出现时点击捕捉', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.target = scene.add.circle(width * 0.3, height * 0.5, 18, 0xf472b6, 1)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setInteractive({ useHandCursor: true });
        this.lockRing = scene.add.circle(this.target.x, this.target.y, this.config.lockRingRadius, 0x38bdf8, 0)
            .setStrokeStyle(3, 0x38bdf8, 0);

        this.target.on('pointerdown', () => this.tryCapture());
        scene.input.on('pointerdown', (p) => {
            const d = Math.hypot(p.x - this.target.x, p.y - this.target.y);
            if (d < 40) this.tryCapture();
            else if (!this.state.paused) this.missClick();
        });

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.target?.destroy();
            this.lockRing?.destroy();
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    update(_time, delta) {
        if (!this.isRunning() || !this.target) return;
        const dt = delta / 1000;
        this.state.elapsed += dt;
        const { width, height } = this.scene.scale;

        if (this.state.paused) {
            this.state.pauseLeft -= dt;
            this.lockRing.setPosition(this.target.x, this.target.y);
            this.lockRing.setStrokeStyle(3, 0x38bdf8, 0.9 + Math.sin(this.state.elapsed * 20) * 0.1);
            this.lockRing.setAlpha(1);
            if (this.state.pauseLeft <= 0) {
                this.state.paused = false;
                this.lockRing.setAlpha(0);
                this.state.nextPauseIn = this.randPauseInterval();
                // bounce direction change
                this.state.vx = (Math.random() - 0.5) * 2;
                this.state.vy = (Math.random() - 0.5) * 2;
                const len = Math.hypot(this.state.vx, this.state.vy) || 1;
                this.state.vx /= len;
                this.state.vy /= len;
            }
        } else {
            this.state.nextPauseIn -= dt;
            const speed = this.config.moveSpeed;
            this.target.x += this.state.vx * speed * dt;
            this.target.y += this.state.vy * speed * dt;
            if (this.target.x < 30 || this.target.x > width - 30) this.state.vx *= -1;
            if (this.target.y < 100 || this.target.y > height - 80) this.state.vy *= -1;
            this.target.x = Math.max(30, Math.min(width - 30, this.target.x));
            this.target.y = Math.max(100, Math.min(height - 80, this.target.y));
            this.lockRing.setPosition(this.target.x, this.target.y).setAlpha(0);

            if (this.state.nextPauseIn <= 0) {
                this.state.paused = true;
                this.state.pauseLeft = this.config.pauseWindowSec;
            }
        }

        // slow passive progress
        this.state.progress = Math.min(this.config.targetProgress, this.state.progress + dt * 1.5);
        this.refreshHud();
        if (this.state.progress >= this.config.targetProgress) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
    }

    tryCapture() {
        if (!this.isRunning()) return;
        if (this.state.paused) {
            this.state.captures += 1;
            this.state.progress = Math.min(this.config.targetProgress, this.state.progress + this.config.captureGain);
            this.state.score += 15;
            this.state.paused = false;
            this.state.pauseLeft = 0;
            this.lockRing.setAlpha(0);
            this.state.nextPauseIn = this.randPauseInterval();
            this.context.spawnParticles?.(this.target.x, this.target.y, 0x38bdf8);
            this.scene.cameras.main.flash(60, 56, 189, 248);
            if (this.state.progress >= this.config.targetProgress) {
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
        } else {
            this.missClick();
        }
        this.refreshHud();
        this.publishTestState();
    }

    missClick() {
        this.state.misses += 1;
        this.state.progress = Math.max(0, this.state.progress - this.config.missPenalty);
        this.scene.cameras.main.shake(80, 0.006);
        this.target.setFillStyle(0xf87171, 1);
        this.lifecycle.trackTimer(this.scene.time.delayedCall(100, () => {
            this.target?.setFillStyle(0xf472b6, 1);
        }));
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (!g) return;
        const ratio = this.state.progress / this.config.targetProgress;
        g.clear();
        g.fillStyle(0x1e293b, 0.9);
        g.fillRoundedRect(width * 0.2, 96, width * 0.6, 12, 6);
        g.fillStyle(0x38bdf8, 1);
        g.fillRoundedRect(width * 0.2, 96, width * 0.6 * ratio, 12, 6);
        this.ui.status?.setText(
            `进度 ${Math.floor(this.state.progress)}%  ·  捕捉 ${this.state.captures}  ·  误点 ${this.state.misses}${this.state.paused ? '  ·  锁定中！' : ''}`
        );
    }

    getTestState() {
        return {
            adapter: 'ObserveCaptureAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            progress: this.state.progress,
            paused: this.state.paused,
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
                captures: this.state.captures,
                misses: this.state.misses,
                progress: this.state.progress,
                elapsedSec: this.state.elapsed
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
            adapterId: this.config.id, status: this.status,
            score: this.state.score, progress: this.state.progress, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as OBSERVE_CAPTURE_DEFAULT_CONFIG };
