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
    const config = { ...base, ...patch };
    const bounds = { maxWave: [1, 10], waveTimeSec: [3, 120], warningSec: [0.3, 2], strikeDamage: [1, 100], collectTargetPerWave: [1, 20], hazardIntervalSec: [0.5, 4] };
    for (const [key, [min, max]] of Object.entries(bounds)) {
        config[key] = Number.isFinite(config[key]) ? Math.max(min, Math.min(max, config[key])) : base[key];
    }
    for (const key of ['maxWave', 'collectTargetPerWave', 'strikeDamage']) config[key] = Math.floor(config[key]);
    // Enough spawns for the final wave, including warning and collection time.
    const minimum = (config.collectTargetPerWave + config.maxWave - 1) * config.hazardIntervalSec + config.warningSec + 0.2;
    config.waveTimeSec = Math.max(config.waveTimeSec, Math.ceil(minimum * 10) / 10);
    return config;
}

export default class HazardCollectWavesAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.player = null;
        this.keys = null;
        this.random = context.random || Math.random;
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
        this.state.hp = Number.isFinite(payload.playerStats?.hp) ? Math.max(0, payload.playerStats.hp) : 100;
        this.state.hits = 0;
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

        this.ui.title = scene.add.text(width / 2, 188, '闪避采集', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 95, '拖动或 WASD 移动 · 点击或靠近能量珠采集', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.player = scene.add.circle(width / 2, height / 2, 16, 0x66fcf1, 1);
        this.bounds = { left: 24, right: width - 24, top: 330, bottom: height - 180 };
        const move = p => { if (p.isDown) this.moveTo(p.x, p.y); };
        this.lifecycle.trackListener(scene.input, 'pointermove', move);
        this.lifecycle.trackListener(scene.input, 'pointerdown', move);
        if (scene.input.keyboard) this.keys = scene.input.keyboard.addKeys({ left: 'A', right: 'D', up: 'W', down: 'S', left2: 'LEFT', right2: 'RIGHT', up2: 'UP', down2: 'DOWN' });

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
            for (const key of Object.values(this.keys || {})) scene.input.keyboard?.removeKey?.(key, true);
            this.ui = {}; this.player = null; this.hazards = []; this.pickups = []; this.keys = null;
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    moveTo(x, y) {
        if (!this.isRunning() || !Number.isFinite(x) || !Number.isFinite(y)) return;
        this.player.x = Math.max(this.bounds.left, Math.min(this.bounds.right, x));
        this.player.y = Math.max(this.bounds.top, Math.min(this.bounds.bottom, y));
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta <= 0) return;
        const down = key => this.keys?.[key]?.isDown;
        const dx = Number(Boolean(down('right') || down('right2'))) - Number(Boolean(down('left') || down('left2')));
        const dy = Number(Boolean(down('down') || down('down2'))) - Number(Boolean(down('up') || down('up2')));
        const distance = Math.hypot(dx, dy) || 1;
        this.moveTo(this.player.x + dx / distance * 400 * delta / 1000, this.player.y + dy / distance * 400 * delta / 1000);
    }

    spawnHazard() {
        if (!this.isRunning()) return;
        const { left, right, top, bottom } = this.bounds;
        const x = left + 70 + this.random() * (right - left - 140);
        const y = top + 70 + this.random() * (bottom - top - 140);
        const r = 40 + this.random() * 30;
        const sprite = this.scene.add.circle(x, y, r, 0xfbbf24, 0.2).setStrokeStyle(2, 0xfbbf24, 0.8);
        const h = { sprite, x, y, r, phase: 'warn', left: this.config.warningSec };
        this.hazards.push(h);
    }

    tick(dt) {
        if (!this.isRunning() || !Number.isFinite(dt) || dt <= 0) return;
        if (this.state.hp <= 0) return this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
        this.state.waveLeft = Math.max(0, this.state.waveLeft - dt);
        this.state.invuln = Math.max(0, this.state.invuln - dt);

        this.hazards = this.hazards.filter((h) => {
            h.left -= dt;
            if (h.phase === 'warn' && h.left <= 1e-9) {
                h.phase = 'strike';
                h.left = 0.25;
                h.sprite.setFillStyle(0xef4444, 0.55);
                h.sprite.setStrokeStyle(2, 0xef4444, 1);
                const d = Math.hypot(this.player.x - h.x, this.player.y - h.y);
                if (d <= h.r + 16 && this.state.invuln <= 0) {
                    this.state.hp = Math.max(0, this.state.hp - this.config.strikeDamage);
                    this.state.invuln = 0.6;
                    this.state.hits += 1;
                    this.scene.cameras.main.shake(100, 0.01);
                }
                // spawn collectible after strike
                const p = this.scene.add.circle(h.x, h.y, 10, 0x67e8f9, 0.95)
                    .setInteractive({ useHandCursor: true });
                p.on('pointerdown', () => this.collect(p));
                this.pickups.push(p);
                if (this.pickups.length > 64) this.pickups.shift().destroy();
            } else if (h.phase === 'strike' && h.left <= 1e-9) {
                h.sprite.destroy();
                return false;
            }
            return true;
        });

        // Do not run cleanup inside filter; onEnd may stop the scene synchronously.
        if (this.state.hp <= 0) return this.finish(false, NODE_RESULT_REASONS.HP_ZERO);

        // auto collect near player
        this.pickups = this.pickups.filter((p) => {
            if (!p.active) return false;
            if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 28) {
                this.collect(p);
                return false;
            }
            return true;
        });

        if (this.state.waveLeft <= 1e-9) {
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
        if (!this.isRunning() || !p?.active || !this.pickups.includes(p)) return;
        const { x, y } = p;
        p.destroy();
        this.state.collected += 1;
        this.state.nascent = Math.min(100, this.state.nascent + 12);
        this.state.score += 10;
        this.state.hp = Math.min(100, this.state.hp + 3);
        this.context.spawnParticles?.(x, y, 0x67e8f9);
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
            collected: this.state.collected, need: this.state.need, maxWave: this.config.maxWave,
            timer: this.state.waveLeft, goalValue: 0, hits: this.state.hits || 0,
            player: this.player ? { x: this.player.x, y: this.player.y } : null,
            hazards: this.hazards.map(({ x, y, r, phase, left }) => ({ x, y, r, phase, left })),
            pickups: this.pickups.filter(p => p.active).map(p => ({ x: p.x, y: p.y })),
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
            telemetry: { wave: this.state.wave, collected: this.state.collected, nascent: this.state.nascent, hp: this.state.hp }
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
            adapterId: this.config.id, status: this.status, wave: this.state.wave, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as HAZARD_COLLECT_WAVES_DEFAULT_CONFIG };
