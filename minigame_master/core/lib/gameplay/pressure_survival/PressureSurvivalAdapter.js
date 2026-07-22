import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'pressure_survival',
    durationSec: 30,
    pressureMax: 100,
    pressureGrowthPerSec: 8,
    clickRelief: 6,
    skillCooldownSec: 5,
    skillRelief: 28,
    skillDurationSec: 2,
    targetSpawnIntervalSec: 1.2,
    targetLifeSec: 2.5,
    targetClickRelief: 10,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class PressureSurvivalAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.targets = [];
        this.ui = {};
        this.state = {
            pressure: 0,
            elapsed: 0,
            skillCd: 0,
            skillActive: 0,
            clicks: 0,
            hp: 100,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.config.durationSec = Number(this.config.durationSec || 30);
        this.state = {
            pressure: 0,
            elapsed: 0,
            skillCd: 0,
            skillActive: 0,
            clicks: 0,
            hp: payload.playerStats?.hp || 100,
            score: 0
        };
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('PressureSurvivalAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 40, '极限抗压', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();
        this.ui.status = scene.add.text(width / 2, 88, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#cbd5e1'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 48, '点击画面泄压 · 右下角技能强压', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#94a3b8'
        }).setOrigin(0.5);

        this.ui.skill = scene.add.rectangle(width - 70, height - 90, 100, 44, 0xf97316, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });
        this.ui.skillLabel = scene.add.text(width - 70, height - 90, '强压', {
            fontFamily: 'Inter, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5);
        this.ui.skill.on('pointerdown', () => this.useSkill());

        scene.input.on('pointerdown', (p) => {
            if (p.y > height - 120 && p.x > width - 130) return;
            this.onCanvasClick(p);
        });

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 100, loop: true, callback: () => this.tick(0.1)
        }));
        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: this.config.targetSpawnIntervalSec * 1000,
            loop: true,
            callback: () => this.spawnTarget()
        }));

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.targets.forEach((t) => t.destroy?.());
            this.targets = [];
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    spawnTarget() {
        if (!this.isRunning()) return;
        const { width, height } = this.scene.scale;
        const t = this.scene.add.circle(
            40 + Math.random() * (width - 80),
            120 + Math.random() * (height - 220),
            16, 0xa855f7, 0.9
        ).setInteractive({ useHandCursor: true });
        t.born = this.scene.time.now;
        t.on('pointerdown', () => {
            if (!t.active) return;
            this.state.pressure = Math.max(0, this.state.pressure - this.config.targetClickRelief);
            this.state.score += 2;
            this.context.spawnParticles?.(t.x, t.y, 0xa855f7);
            t.destroy();
            this.targets = this.targets.filter((x) => x !== t);
            this.refreshHud();
        });
        this.targets.push(t);
    }

    onCanvasClick(pointer) {
        if (!this.isRunning()) return;
        this.state.clicks += 1;
        const relief = this.config.clickRelief * (this.state.skillActive > 0 ? 1.5 : 1);
        this.state.pressure = Math.max(0, this.state.pressure - relief);
        this.state.score += 1;
        this.context.spawnParticles?.(pointer.x, pointer.y, 0x38bdf8);
        this.refreshHud();
    }

    useSkill() {
        if (!this.isRunning() || this.state.skillCd > 0) return;
        this.state.skillCd = this.config.skillCooldownSec;
        this.state.skillActive = this.config.skillDurationSec;
        this.state.pressure = Math.max(0, this.state.pressure - this.config.skillRelief);
        this.scene.cameras.main.flash(100, 249, 115, 22);
        this.refreshHud();
    }

    tick(dt) {
        if (!this.isRunning()) return;
        this.state.elapsed += dt;
        this.state.skillCd = Math.max(0, this.state.skillCd - dt);
        this.state.skillActive = Math.max(0, this.state.skillActive - dt);

        const growth = this.config.pressureGrowthPerSec * (this.state.skillActive > 0 ? 0.35 : 1);
        this.state.pressure = Math.min(this.config.pressureMax, this.state.pressure + growth * dt);

        const now = this.scene.time.now;
        this.targets = this.targets.filter((t) => {
            if (now - t.born > this.config.targetLifeSec * 1000) {
                t.destroy();
                return false;
            }
            return true;
        });

        this.refreshHud();
        this.publishTestState();

        if (this.state.pressure >= this.config.pressureMax) {
            this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
            return;
        }
        if (this.state.elapsed >= this.config.durationSec) {
            this.finish(true, NODE_RESULT_REASONS.TIMER_EXPIRED);
        }
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (!g) return;
        const ratio = this.state.pressure / this.config.pressureMax;
        g.clear();
        g.fillStyle(0x1e293b, 0.9);
        g.fillRoundedRect(width * 0.15, 60, width * 0.7, 14, 7);
        g.fillStyle(ratio > 0.7 ? 0xef4444 : 0xf97316, 1);
        g.fillRoundedRect(width * 0.15, 60, width * 0.7 * ratio, 14, 7);
        const left = Math.max(0, this.config.durationSec - this.state.elapsed);
        this.ui.status?.setText(
            `压力 ${Math.ceil(this.state.pressure)}/${this.config.pressureMax}  ·  剩余 ${left.toFixed(1)}s  ·  技能CD ${this.state.skillCd.toFixed(1)}s`
        );
        this.ui.skill?.setAlpha(this.state.skillCd > 0 ? 0.4 : 0.95);
        this.ui.skillLabel?.setText(this.state.skillCd > 0 ? `${this.state.skillCd.toFixed(1)}s` : '强压');
    }

    getTestState() {
        return {
            adapter: 'PressureSurvivalAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            pressure: this.state.pressure,
            elapsed: this.state.elapsed,
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.TIMER_EXPIRED : NODE_RESULT_REASONS.FAILED),
            rewards: success ? { ...(this.config.rewardTable || {}), score: 1 } : {},
            telemetry: {
                pressurePeak: this.state.pressure,
                clicks: this.state.clicks,
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
            pressure: this.state.pressure, score: this.state.score, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as PRESSURE_SURVIVAL_DEFAULT_CONFIG };
