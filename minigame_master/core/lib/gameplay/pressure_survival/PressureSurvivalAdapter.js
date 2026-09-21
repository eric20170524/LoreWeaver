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
        this.random = context.random || Math.random;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.targets = [];
        this.ui = {};
        this.state = {
            pressure: 0,
            pressurePeak: 0,
            targetsHit: 0,
            skillsUsed: 0,
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
        const bounds = { durationSec: [5, 120], pressureMax: [10, 1000], pressureGrowthPerSec: [1, 100],
            clickRelief: [1, 100], skillCooldownSec: [1, 30], skillRelief: [1, 100], skillDurationSec: [0.1, 10],
            targetSpawnIntervalSec: [0.4, 5], targetLifeSec: [0.5, 5], targetClickRelief: [1, 100] };
        for (const [key, [min, max]] of Object.entries(bounds)) {
            const value = Number(this.config[key]);
            this.config[key] = Math.max(min, Math.min(max, Number.isFinite(value) ? value : DEFAULT_CONFIG[key]));
        }
        this.state = {
            pressure: 0,
            pressurePeak: 0,
            targetsHit: 0,
            skillsUsed: 0,
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

        this.ui.title = scene.add.text(width / 2, 188, '极限抗压', {
            fontFamily: 'Inter, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#cbd5e1'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 90, '点击画面泄压 · 右下角技能强压', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#94a3b8'
        }).setOrigin(0.5);

        this.ui.skill = scene.add.rectangle(width - 100, height - 170, 144, 80, 0xf97316, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true });
        this.ui.skillLabel = scene.add.text(width - 100, height - 170, '强压', {
            fontFamily: 'Inter, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5);
        this.lifecycle.trackListener(scene.input, 'pointerdown', (p) => {
            if (!this.isRunning()) return;
            if (Math.abs(p.x - this.ui.skill.x) <= 72 && Math.abs(p.y - this.ui.skill.y) <= 40) {
                this.useSkill();
                return;
            }
            const target = this.targets.filter(t => t.active && Math.hypot(p.x - t.x, p.y - t.y) <= 44)
                .sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))[0];
            if (target) {
                this.state.pressure = Math.max(0, this.state.pressure - this.config.targetClickRelief);
                this.state.targetsHit += 1;
                this.context.spawnParticles?.(target.x, target.y, 0xa855f7);
                target.destroy();
                this.targets = this.targets.filter(t => t !== target);
            }
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
            this.ui = {};
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    spawnTarget() {
        if (!this.isRunning()) return;
        const { width, height } = this.scene.scale;
        const t = this.scene.add.circle(
            48 + this.random() * (width - 96),
            340 + this.random() * (height - 620),
            32, 0xa855f7, 0.9
        ).setInteractive({ useHandCursor: true });
        t.born = this.scene.time.now;
        this.targets.push(t);
    }

    onCanvasClick(pointer) {
        if (!this.isRunning()) return;
        this.state.clicks += 1;
        const relief = this.config.clickRelief * (this.state.skillActive > 0 ? 1.5 : 1);
        this.state.pressure = Math.max(0, this.state.pressure - relief);

        this.context.spawnParticles?.(pointer.x, pointer.y, 0x38bdf8);
        this.refreshHud();
    }

    useSkill() {
        if (!this.isRunning() || this.state.skillCd > 0) return;
        this.state.skillsUsed += 1;
        this.state.skillCd = this.config.skillCooldownSec;
        this.state.skillActive = this.config.skillDurationSec;
        this.state.pressure = Math.max(0, this.state.pressure - this.config.skillRelief);
        this.scene.cameras.main.flash(100, 249, 115, 22);
        this.refreshHud();
    }

    tick(dt) {
        if (!this.isRunning()) return;
        if (!Number.isFinite(dt) || dt <= 0) return;
        this.state.elapsed = Math.min(this.config.durationSec, this.state.elapsed + dt);
        this.state.score = this.state.elapsed;
        this.state.skillCd = Math.max(0, this.state.skillCd - dt);
        this.state.skillActive = Math.max(0, this.state.skillActive - dt);

        const growth = this.config.pressureGrowthPerSec * (this.state.skillActive > 0 ? 0.35 : 1);
        this.state.pressure = Math.min(this.config.pressureMax, this.state.pressure + growth * dt);

        this.state.pressurePeak = Math.max(this.state.pressurePeak, this.state.pressure);
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
        g.fillRoundedRect(width * 0.15, 270, width * 0.7, 14, 7);
        g.fillStyle(ratio > 0.7 ? 0xef4444 : 0xf97316, 1);
        g.fillRoundedRect(width * 0.15, 270, width * 0.7 * ratio, 14, 7);
        const left = Math.max(0, this.config.durationSec - this.state.elapsed);
        this.ui.status?.setText(
            `压力 ${Math.ceil(this.state.pressure)}/${this.config.pressureMax}  ·  剩余 ${left.toFixed(1)}s  ·  技能CD ${this.state.skillCd.toFixed(1)}s`
        );
        this.ui.skill?.setAlpha(this.state.skillCd > 0 ? 0.4 : 0.95);
        this.ui.skillLabel?.setText(this.state.skillCd > 0 ? `${this.state.skillCd.toFixed(1)}s` : '强压');
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'PressureSurvivalAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            pressure: this.state.pressure,
            elapsed: this.state.elapsed,
            goalValue: this.config.durationSec,
            durationSec: this.config.durationSec,
            timer: Math.max(0, this.config.durationSec - this.state.elapsed),
            pressureMax: this.config.pressureMax,
            pressurePeak: this.state.pressurePeak,
            clicks: this.state.clicks,
            targetsHit: this.state.targetsHit,
            skillsUsed: this.state.skillsUsed,
            skillCd: this.state.skillCd,
            skillActive: this.state.skillActive,
            skill: this.ui.skill ? { x: this.ui.skill.x, y: this.ui.skill.y } : null,
            targets: this.targets.map(t => ({ x: t.x, y: t.y })),
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
                pressurePeak: this.state.pressurePeak,
                targetsHit: this.state.targetsHit,
                skillsUsed: this.state.skillsUsed,
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

    pause() { if (this.config.allowPause !== false) super.pause(); }
    retreat() { return this.config.allowQuit === false ? null : this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status,
            pressure: this.state.pressure, score: this.state.score, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as PRESSURE_SURVIVAL_DEFAULT_CONFIG };
