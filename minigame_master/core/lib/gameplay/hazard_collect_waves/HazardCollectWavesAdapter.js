import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'hazard_collect_waves',
    maxWave: 3,
    waveTimeSec: 15,
    warningSec: 0.9,
    strikeDamage: 20,
    collectTargetPerWave: 4,
    hazardIntervalSec: 2.2,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class HazardCollectWavesAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.player = null;
        this.hazards = [];
        this.pickups = [];
        this.ui = {};
        this.state = {
            wave: 1, waveLeft: 15, collected: 0, need: 4,
            hp: 100, score: 0, invuln: 0, nascent: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.state.wave = 1;
        this.state.waveLeft = Number(this.config.waveTimeSec || 15);
        this.state.collected = 0;
        this.state.need = Number(this.config.collectTargetPerWave || 4);
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        this.state.invuln = 0;
        this.state.nascent = 0;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('HazardCollectWavesAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 36, '闪避采集', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, '拖动躲避预警区 · 限时拾取能量珠', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.player = scene.add.circle(width / 2, height / 2, 16, 0x66fcf1, 1);
        scene.input.on('pointermove', (p) => {
            if (!this.isRunning()) return;
            this.player.x = p.x;
            this.player.y = Math.max(100, Math.min(height - 50, p.y));
        });

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 100, loop: true, callback: () => this.tick(0.1)
        }));
        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: this.config.hazardIntervalSec * 1000, loop: true, callback: () => this.spawnHazard()
        }));

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.player?.destroy();
            this.hazards.forEach((h) => h.sprite?.destroy());
            this.pickups.forEach((p) => p.destroy?.());
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    spawnHazard() {
        if (!this.isRunning()) return;
        const { width, height } = this.scene.scale;
        const x = 60 + Math.random() * (width - 120);
        const y = 120 + Math.random() * (height - 200);
        const r = 40 + Math.random() * 30;
        const sprite = this.scene.add.circle(x, y, r, 0xfbbf24, 0.2).setStrokeStyle(2, 0xfbbf24, 0.8);
        const h = { sprite, x, y, r, phase: 'warn', left: this.config.warningSec };
        this.hazards.push(h);
    }

    tick(dt) {
        if (!this.isRunning()) return;
        this.state.waveLeft -= dt;
        this.state.invuln = Math.max(0, this.state.invuln - dt);

        this.hazards = this.hazards.filter((h) => {
            h.left -= dt;
            if (h.phase === 'warn' && h.left <= 0) {
                h.phase = 'strike';
                h.left = 0.25;
                h.sprite.setFillStyle(0xef4444, 0.55);
                h.sprite.setStrokeStyle(2, 0xef4444, 1);
                const d = Math.hypot(this.player.x - h.x, this.player.y - h.y);
                if (d <= h.r + 16 && this.state.invuln <= 0) {
                    this.state.hp = Math.max(0, this.state.hp - this.config.strikeDamage);
                    this.state.invuln = 0.6;
                    this.scene.cameras.main.shake(100, 0.01);
                    if (this.state.hp <= 0) {
                        this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
                        return false;
                    }
                }
                // spawn collectible after strike
                const p = this.scene.add.circle(h.x, h.y, 10, 0x67e8f9, 0.95)
                    .setInteractive({ useHandCursor: true });
                p.on('pointerdown', () => this.collect(p));
                this.pickups.push(p);
            } else if (h.phase === 'strike' && h.left <= 0) {
                h.sprite.destroy();
                return false;
            }
            return true;
        });

        // auto collect near player
        this.pickups = this.pickups.filter((p) => {
            if (!p.active) return false;
            if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 28) {
                this.collect(p);
                return false;
            }
            return true;
        });

        if (this.state.waveLeft <= 0) {
            if (this.state.collected >= this.state.need) {
                if (this.state.wave >= this.config.maxWave) {
                    this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
                    return;
                }
                this.state.wave += 1;
                this.state.waveLeft = this.config.waveTimeSec;
                this.state.collected = 0;
                this.state.need = this.config.collectTargetPerWave + (this.state.wave - 1);
                this.ui.hint?.setText(`第 ${this.state.wave} 波开始`);
            } else {
                this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
                return;
            }
        }
        this.refreshHud();
        this.publishTestState();
    }

    collect(p) {
        if (!p?.active) return;
        p.destroy();
        this.state.collected += 1;
        this.state.nascent = Math.min(100, this.state.nascent + 12);
        this.state.score += 10;
        this.state.hp = Math.min(100, this.state.hp + 3);
        this.context.spawnParticles?.(p.x, p.y, 0x67e8f9);
        this.refreshHud();
    }

    refreshHud() {
        this.ui.status?.setText(
            `波次 ${this.state.wave}/${this.config.maxWave}  ·  采集 ${this.state.collected}/${this.state.need}  ·  HP ${Math.ceil(this.state.hp)}  ·  ⏱ ${this.state.waveLeft.toFixed(1)}s`
        );
    }

    getTestState() {
        return {
            adapter: 'HazardCollectWavesAdapter', status: this.status,
            hp: this.state.hp, score: this.state.score, wave: this.state.wave,
            collected: this.state.collected, lastResult: this.result
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
            telemetry: { wave: this.state.wave, collected: this.state.collected, nascent: this.state.nascent, hp: this.state.hp }
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
            adapterId: this.config.id, status: this.status, wave: this.state.wave, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as HAZARD_COLLECT_WAVES_DEFAULT_CONFIG };
