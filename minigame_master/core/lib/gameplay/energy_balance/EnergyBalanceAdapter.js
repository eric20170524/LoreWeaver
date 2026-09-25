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
    failOverWarn: 8,
    failViolationLimit: 5,
    orbSpawnMinSec: 0.8,
    orbSpawnMaxSec: 1.6,
    safeZoneWidth: 0.22,
    warnZoneWidth: 0.4,
    pointerDrift: 0.015,
    allowQuit: true,
    allowPause: true,
    rewardTable: { score: 1 }
});

function bounded(value, fallback, min, max, integer = false) {
    const number = Number(value);
    const valid = Number.isFinite(number) ? number : fallback;
    return Math.max(min, Math.min(max, integer ? Math.floor(valid) : valid));
}

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
        this.random = typeof context.random === 'function' ? context.random : Math.random;
        this.spawnTimer = null;
        this.orbSerial = 0;
        this.orbs = [];
        this.dragging = null;
        this.ui = {};
        this.state = {
            balance: 0.5,
            stableSec: 0,
            violations: 0,
            overWarnSec: 0,
            elapsedSec: 0,
            deposits: 0,
            hp: 100,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        const gameplay = payload.nodeConfig?.gameplay || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplay, knobs));
        this.config.targetStableSec = bounded(knobs.targetStableSec ?? knobs.TARGET_STABLE ?? this.config.targetStableSec, 20, 5, 120);
        this.config.failOverWarn = bounded(this.config.failOverWarn, 8, 1, 30);
        this.config.failViolationLimit = bounded(this.config.failViolationLimit, 5, 1, 20, true);
        this.config.safeZoneWidth = bounded(this.config.safeZoneWidth, 0.22, 0.05, 0.6);
        this.config.warnZoneWidth = bounded(this.config.warnZoneWidth, 0.4, this.config.safeZoneWidth, 1);
        this.config.orbSpawnMinSec = bounded(this.config.orbSpawnMinSec, 0.8, 0.4, 5);
        this.config.orbSpawnMaxSec = bounded(this.config.orbSpawnMaxSec, 1.6, this.config.orbSpawnMinSec, 5);
        this.config.pointerDrift = bounded(this.config.pointerDrift, 0.015, 0, 0.1);
        this.driftDirection = this.random() < 0.5 ? -1 : 1;
        this.state = {
            balance: 0.5,
            stableSec: 0,
            violations: 0,
            overWarnSec: 0,
            elapsedSec: 0,
            deposits: 0,
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
        this.ui.title = scene.add.text(width / 2, 188, '能量平衡', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, height * 0.36, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#cbd5e1'
        }).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            this.spawnTimer?.remove(false); this.spawnTimer = null;
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.ui = {};
            this.orbs.forEach((o) => this.disposeOrb(o));
            this.orbs = [];
            this.dragging = null;
        });

        this.scheduleOrbSpawn();
        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => this.tickBalance(0.1)
        }));

        this.lifecycle.trackListener(scene.input, 'pointerdown', (p) => this.onPointerDown(p));
        this.lifecycle.trackListener(scene.input, 'pointermove', (p) => this.onPointerMove(p));
        this.lifecycle.trackListener(scene.input, 'pointerup', () => this.onPointerUp());
        this.lifecycle.trackListener(scene.input, 'pointerupoutside', () => { this.dragging = null; });

        this.refreshHud();
        this.publishTestState();
        return this;
    }

    scheduleOrbSpawn() {
        const min = Number(this.config.orbSpawnMinSec || 0.8) * 1000;
        const max = Number(this.config.orbSpawnMaxSec || 1.6) * 1000;
        const delay = min + this.random() * Math.max(0, max - min);
        this.spawnTimer?.remove(false);
        this.spawnTimer = this.scene.time.delayedCall(delay, () => {
            this.spawnTimer = null;
            if (!this.isRunning()) return;
            this.spawnOrb();
            this.scheduleOrbSpawn();
        });
    }

    disposeOrb(orb) {
        orb.alive = false; orb.sprite?.destroy(); orb.label?.destroy();
        if (this.dragging === orb) this.dragging = null;
    }

    spawnOrb() {
        if (!this.isRunning()) return;
        if (this.orbs.length >= 12) {
            const oldest = this.orbs.find(o => o !== this.dragging);
            this.disposeOrb(oldest); this.orbs = this.orbs.filter(o => o.alive);
        }
        const { width, height } = this.scene.scale;
        const type = ORB_TYPES[Math.floor(this.random() * ORB_TYPES.length)];
        const side = this.random() < 0.5 ? 0.15 : 0.85;
        const sprite = this.scene.add.circle(width * side, height * (0.55 + this.random() * 0.3), 36, type.color, 0.95)
            .setStrokeStyle(2, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });
        const label = this.scene.add.text(sprite.x, sprite.y, type.label, {
            fontFamily: 'Inter, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5);
        const orb = { id: ++this.orbSerial, sprite, label, type, alive: true };
        this.orbs.push(orb);
    }

    onPointerDown(pointer) {
        if (!this.isRunning()) return;
        // allow click-pick nearest
        if (this.dragging) return;
        let best = null;
        let bestD = 48;
        this.orbs.forEach((orb) => {
            if (!orb.alive) return;
            const d = Math.hypot(orb.sprite.x - pointer.x, orb.sprite.y - pointer.y);
            if (d < bestD) { best = orb; bestD = d; }
        });
        if (best) this.dragging = best;
    }

    onPointerMove(pointer) {
        if (!this.isRunning() || !pointer.isDown || !this.dragging?.alive) return;
        this.dragging.sprite.x = pointer.x;
        this.dragging.sprite.y = pointer.y;
        this.dragging.label.x = pointer.x;
        this.dragging.label.y = pointer.y;
    }

    onPointerUp() {
        if (!this.isRunning()) { this.dragging = null; return; }
        if (!this.dragging?.alive) { this.dragging = null; return; }
        const core = this.ui.core;
        const d = Math.hypot(this.dragging.sprite.x - core.x, this.dragging.sprite.y - core.y);
        if (d <= 56) {
            this.state.balance = Math.max(0, Math.min(1, this.state.balance + this.dragging.type.bias * 0.08));
            this.state.score += 1;
            this.state.deposits += 1;
            this.context.spawnParticles?.(core.x, core.y, this.dragging.type.color);
            this.disposeOrb(this.dragging);
            this.orbs = this.orbs.filter((o) => o.alive);
        }
        this.dragging = null;
        this.refreshHud();
        this.publishTestState();
    }

    tickBalance(dt) {
        if (!this.isRunning() || !Number.isFinite(dt) || dt <= 0) return;
        this.state.elapsedSec += dt;
        // natural drift toward edges
        // A centered gauge used to be an absorbing equilibrium: no input could
        // always win. A small directional pressure makes balancing necessary.
        this.state.balance += ((this.state.balance - 0.5) * 10 + this.driftDirection) * this.config.pointerDrift * dt;
        this.state.balance = Math.max(0, Math.min(1, this.state.balance));

        const safeHalf = this.config.safeZoneWidth / 2;
        const warnHalf = this.config.warnZoneWidth / 2;
        const dev = Math.abs(this.state.balance - 0.5);

        if (dev <= safeHalf) {
            this.state.stableSec = Math.min(this.config.targetStableSec, this.state.stableSec + dt);
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
        if (this.ui.pointer) this.ui.pointer.x = left + this.state.balance * gaugeW;
        this.ui.status?.setText(
            `稳定 ${this.state.stableSec.toFixed(1)}/${this.config.targetStableSec}s  ·  失衡 ${this.state.violations}/${this.config.failViolationLimit}`
        );
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'EnergyBalanceAdapter',
            adapterId: 'energy_balance',
            status: this.status,
            hp: this.state.hp,
            score: Math.floor(this.state.stableSec),
            balance: this.state.balance,
            stableSec: this.state.stableSec,
            violations: this.state.violations,
            goalValue: this.config.targetStableSec,
            targetStableSec: this.config.targetStableSec,
            failViolationLimit: this.config.failViolationLimit,
            safeZoneWidth: this.config.safeZoneWidth,
            timer: Math.max(0, this.config.targetStableSec - this.state.stableSec),
            overWarnSec: this.state.overWarnSec,
            elapsedSec: this.state.elapsedSec,
            deposits: this.state.deposits,
            core: this.ui.core ? { x: this.ui.core.x, y: this.ui.core.y } : null,
            orbs: this.orbs.filter(o => o.alive).map(o => ({ id: o.id, label: o.type.label, bias: o.type.bias, x: o.sprite.x, y: o.sprite.y })),
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

    pause() { if (this.config.allowPause !== false) { this.dragging = null; super.pause(); } }
    retreat() { return this.config.allowQuit === false ? null : this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
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
