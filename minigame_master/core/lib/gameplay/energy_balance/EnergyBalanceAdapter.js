import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const ORB_TYPES = [
    { id: 'wood', label: '木', color: 0x22c55e, bias: -1 },
    { id: 'fire', label: '火', color: 0xef4444, bias: 1.2 },
    { id: 'water', label: '水', color: 0x3b82f6, bias: -1.1 },
    { id: 'metal', label: '金', color: 0xeab308, bias: 0.8 },
    { id: 'earth', label: '土', color: 0xa16207, bias: 0.3 }
];

const DEFAULT_CONFIG = Object.freeze({
    id: 'energy_balance',
    targetStableSec: 20,
    failOverWarn: 5,
    failViolationLimit: 5,
    orbSpawnMinSec: 0.8,
    orbSpawnMaxSec: 1.6,
    safeZoneWidth: 0.22,
    warnZoneWidth: 0.4,
    pointerDrift: 0.015,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const output = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

export default class EnergyBalanceAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.orbs = [];
        this.dragging = null;
        this.ui = {};
        this.state = {
            balance: 0.5,
            stableSec: 0,
            violations: 0,
            overWarnSec: 0,
            elapsedSec: 0,
            hp: 100,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        const gameplay = payload.nodeConfig?.gameplay || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplay, knobs));
        this.config.targetStableSec = Number(knobs.targetStableSec ?? knobs.TARGET_STABLE ?? this.config.targetStableSec ?? 20);
        this.config.failOverWarn = Number(knobs.failOverWarn ?? this.config.failOverWarn ?? 5);
        this.config.failViolationLimit = Number(knobs.failViolationLimit ?? this.config.failViolationLimit ?? 5);
        this.config.safeZoneWidth = Number(knobs.safeZoneWidth ?? this.config.safeZoneWidth);
        this.state = {
            balance: 0.5,
            stableSec: 0,
            violations: 0,
            overWarnSec: 0,
            elapsedSec: 0,
            hp: payload.playerStats?.hp || 100,
            score: 0
        };
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('EnergyBalanceAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        // Gauge
        this.ui.gaugeBg = scene.add.rectangle(width / 2, height * 0.28, width * 0.7, 28, 0x1e293b, 0.95);
        this.ui.safe = scene.add.rectangle(width / 2, height * 0.28, width * 0.7 * this.config.safeZoneWidth, 28, 0x22c55e, 0.35);
        this.ui.warn = scene.add.rectangle(width / 2, height * 0.28, width * 0.7 * this.config.warnZoneWidth, 28, 0xfbbf24, 0.15);
        this.ui.pointer = scene.add.rectangle(width / 2, height * 0.28, 6, 36, 0xf8fafc, 1);
        this.ui.core = scene.add.circle(width / 2, height * 0.52, 48, 0x38bdf8, 0.35).setStrokeStyle(2, 0x38bdf8, 0.8);
        this.ui.title = scene.add.text(width / 2, 48, '能量平衡', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, height * 0.36, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#cbd5e1'
        }).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.orbs.forEach((o) => o.sprite?.destroy());
            this.orbs = [];
        });

        this.scheduleOrbSpawn();
        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => this.tickBalance(0.1)
        }));

        scene.input.on('pointerdown', (p) => this.onPointerDown(p));
        scene.input.on('pointermove', (p) => this.onPointerMove(p));
        scene.input.on('pointerup', () => this.onPointerUp());

        this.refreshHud();
        this.publishTestState();
        return this;
    }

    scheduleOrbSpawn() {
        const min = Number(this.config.orbSpawnMinSec || 0.8) * 1000;
        const max = Number(this.config.orbSpawnMaxSec || 1.6) * 1000;
        const delay = min + Math.random() * Math.max(0, max - min);
        this.lifecycle.trackTimer(this.scene.time.delayedCall(delay, () => {
            if (!this.isRunning()) return;
            this.spawnOrb();
            this.scheduleOrbSpawn();
        }));
    }

    spawnOrb() {
        const { width, height } = this.scene.scale;
        const type = ORB_TYPES[Math.floor(Math.random() * ORB_TYPES.length)];
        const side = Math.random() < 0.5 ? 0.15 : 0.85;
        const sprite = this.scene.add.circle(width * side, height * (0.55 + Math.random() * 0.3), 18, type.color, 0.95)
            .setStrokeStyle(2, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });
        const label = this.scene.add.text(sprite.x, sprite.y, type.label, {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5);
        const orb = { sprite, label, type, alive: true };
        this.orbs.push(orb);
        sprite.on('pointerdown', () => { this.dragging = orb; });
    }

    onPointerDown(pointer) {
        // allow click-pick nearest
        if (this.dragging) return;
        let best = null;
        let bestD = 40;
        this.orbs.forEach((orb) => {
            if (!orb.alive) return;
            const d = Math.hypot(orb.sprite.x - pointer.x, orb.sprite.y - pointer.y);
            if (d < bestD) { best = orb; bestD = d; }
        });
        if (best) this.dragging = best;
    }

    onPointerMove(pointer) {
        if (!this.dragging?.alive) return;
        this.dragging.sprite.x = pointer.x;
        this.dragging.sprite.y = pointer.y;
        this.dragging.label.x = pointer.x;
        this.dragging.label.y = pointer.y;
    }

    onPointerUp() {
        if (!this.dragging?.alive) { this.dragging = null; return; }
        const core = this.ui.core;
        const d = Math.hypot(this.dragging.sprite.x - core.x, this.dragging.sprite.y - core.y);
        if (d <= 56) {
            this.state.balance = Math.max(0, Math.min(1, this.state.balance + this.dragging.type.bias * 0.08));
            this.state.score += 1;
            this.context.spawnParticles?.(core.x, core.y, this.dragging.type.color);
            this.dragging.alive = false;
            this.dragging.sprite.destroy();
            this.dragging.label.destroy();
            this.orbs = this.orbs.filter((o) => o.alive);
        }
        this.dragging = null;
        this.refreshHud();
        this.publishTestState();
    }

    tickBalance(dt) {
        if (!this.isRunning()) return;
        this.state.elapsedSec += dt;
        // natural drift toward edges
        this.state.balance += (this.state.balance - 0.5) * this.config.pointerDrift * dt * 10;
        this.state.balance = Math.max(0, Math.min(1, this.state.balance));

        const safeHalf = this.config.safeZoneWidth / 2;
        const warnHalf = this.config.warnZoneWidth / 2;
        const dev = Math.abs(this.state.balance - 0.5);

        if (dev <= safeHalf) {
            this.state.stableSec += dt;
            this.state.overWarnSec = 0;
            this.state.score = Math.max(this.state.score, Math.floor(this.state.stableSec));
        } else if (dev > warnHalf) {
            this.state.overWarnSec += dt;
            if (this.state.overWarnSec >= this.config.failOverWarn) {
                this.state.violations += 1;
                this.state.overWarnSec = 0;
                this.scene.cameras.main.shake(100, 0.008);
                if (this.state.violations >= this.config.failViolationLimit) {
                    this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
                    return;
                }
            }
        } else {
            this.state.overWarnSec = Math.max(0, this.state.overWarnSec - dt * 0.5);
        }

        this.refreshHud();
        if (this.state.stableSec >= this.config.targetStableSec) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
        this.publishTestState();
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const gaugeW = width * 0.7;
        const left = width / 2 - gaugeW / 2;
        this.ui.pointer.x = left + this.state.balance * gaugeW;
        this.ui.status?.setText(
            `稳定 ${this.state.stableSec.toFixed(1)}/${this.config.targetStableSec}s  ·  失衡 ${this.state.violations}/${this.config.failViolationLimit}`
        );
    }

    getTestState() {
        return {
            adapter: 'EnergyBalanceAdapter',
            status: this.status,
            hp: this.state.hp,
            score: Math.floor(this.state.stableSec),
            balance: this.state.balance,
            stableSec: this.state.stableSec,
            violations: this.state.violations,
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
            rewards: success ? { ...(this.config.rewardTable || {}), score: this.config.rewardTable?.score ?? 1 } : {},
            telemetry: {
                stableSec: this.state.stableSec,
                violations: this.state.violations,
                elapsedSec: this.state.elapsedSec
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
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            score: Math.floor(this.state.stableSec),
            hp: this.state.hp,
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as ENERGY_BALANCE_DEFAULT_CONFIG };
