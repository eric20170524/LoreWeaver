import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'drag_to_core',
    fragCount: 14,
    coreRadius: 50,
    hazardCount: 3,
    hazardSpeed: 70,
    hazardRadius: 28,
    hazardPenalty: 12,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class DragToCoreAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.random = context.random || Math.random;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.frags = [];
        this.hazards = [];
        this.dragging = null;
        this.core = null;
        this.ui = {};
        this.state = {
            progress: 0,
            deposited: 0,
            fails: 0,
            hp: 100,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        if (knobs.fragCount === undefined && knobs.FRAG_COUNT !== undefined) this.config.fragCount = knobs.FRAG_COUNT;
        const bounded = (key, min, max) => {
            const value = Number(this.config[key]);
            this.config[key] = Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : DEFAULT_CONFIG[key])));
        };
        bounded('fragCount', 1, 24);
        bounded('hazardCount', 0, 8);
        bounded('hazardSpeed', 0, 300);
        bounded('hazardPenalty', 0, 100);
        bounded('coreRadius', 40, 80);
        bounded('hazardRadius', 16, 48);
        this.state.progress = 0;
        this.state.deposited = 0;
        this.state.fails = 0;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('DragToCoreAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 188, '碎片归核', {
            fontFamily: 'Inter, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        this.core = scene.add.circle(width / 2, height / 2, this.config.coreRadius, 0x38bdf8, 0.35)
            .setStrokeStyle(3, 0x38bdf8, 0.9);

        for (let i = 0; i < this.config.fragCount; i += 1) {
            const angle = (i / this.config.fragCount) * Math.PI * 2;
            const r = Math.min(width, height) * 0.36;
            const x = width / 2 + Math.cos(angle) * r * (0.9 + this.random() * 0.1);
            const y = height / 2 + Math.sin(angle) * r * (0.9 + this.random() * 0.1);
            const sprite = scene.add.circle(x, y, 24, 0xfbbf24, 0.95)
                .setStrokeStyle(2, 0xffffff, 0.35)
                .setInteractive({ useHandCursor: true });
            const frag = { id: i, sprite, alive: true };
            this.frags.push(frag);
        }

        for (let i = 0; i < this.config.hazardCount; i += 1) {
            const hx = width * (0.25 + this.random() * 0.5);
            const hy = height * (0.25 + this.random() * 0.5);
            const h = scene.add.circle(hx, hy, this.config.hazardRadius, 0xef4444, 0.35)
                .setStrokeStyle(2, 0xf87171, 0.8);
            h.vx = (this.random() - 0.5) * this.config.hazardSpeed;
            h.vy = (this.random() - 0.5) * this.config.hazardSpeed;
            this.hazards.push(h);
        }

        this.lifecycle.trackListener(scene.input, 'pointerdown', (p) => {
            if (!this.isRunning()) return;
            this.dragging = this.frags.filter(f => f.alive)
                .map(f => ({ frag: f, distance: Math.hypot(p.x - f.sprite.x, p.y - f.sprite.y) }))
                .filter(hit => hit.distance <= 36).sort((a, b) => a.distance - b.distance)[0]?.frag || null;
        });
        this.lifecycle.trackListener(scene.input, 'pointermove', (p) => {
            if (!this.isRunning() || !p.isDown || !this.dragging?.alive) return;
            this.dragging.sprite.x = p.x;
            this.dragging.sprite.y = p.y;
        });
        this.lifecycle.trackListener(scene.input, 'pointerup', () => this.dropFrag());
        this.lifecycle.trackListener(scene.input, 'pointerupoutside', () => { this.dragging = null; });

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.core?.destroy();
            this.frags.forEach((f) => f.sprite?.destroy());
            this.hazards.forEach((h) => h.destroy?.());
            this.ui = {};
            this.core = null;
            this.frags = [];
            this.hazards = [];
            this.dragging = null;
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    dropFrag() {
        if (!this.isRunning() || !this.core || !this.dragging?.alive) { this.dragging = null; return; }
        const frag = this.dragging;
        this.dragging = null;
        const dCore = Math.hypot(frag.sprite.x - this.core.x, frag.sprite.y - this.core.y);
        const inHazard = this.hazards.some((h) => Math.hypot(frag.sprite.x - h.x, frag.sprite.y - h.y) <= this.config.hazardRadius + 24);

        if (inHazard) {
            this.state.fails += 1;
            this.state.progress = Math.max(0, this.state.progress - this.config.hazardPenalty);
            this.scene.cameras.main.shake(100, 0.01);
            this.state.score = this.state.progress;
            this.refreshHud();
            this.ui.status?.setColor('#f87171');
            this.publishTestState();
            return;
        }
        if (dCore <= this.config.coreRadius + 10) {
            frag.alive = false;
            frag.sprite.destroy();
            this.state.deposited += 1;
            const gain = (100 / this.config.fragCount) * 1.1;
            this.state.progress = Math.min(100, this.state.progress + gain);
            this.state.score = this.state.progress;
            this.context.spawnParticles?.(this.core.x, this.core.y, 0xfbbf24);
            if (this.state.progress >= 100 || this.state.deposited >= this.config.fragCount) {
                this.state.progress = 100;
                this.state.score = 100;
                return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
        }
        this.refreshHud();
        this.publishTestState();
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = Number.isFinite(delta) ? Math.max(0, delta) / 1000 : 0;
        const { width, height } = this.scene.scale;
        this.hazards.forEach((h) => {
            h.x += h.vx * dt;
            h.y += h.vy * dt;
            if (h.x < 40 || h.x > width - 40) h.vx *= -1;
            if (h.y < 330 || h.y > height - 170) h.vy *= -1;
            h.x = Math.max(40, Math.min(width - 40, h.x));
            h.y = Math.max(330, Math.min(height - 170, h.y));
        });
        // core interference pulse when hazards near core
        const interfered = this.hazards.some((h) => Math.hypot(h.x - this.core.x, h.y - this.core.y) < this.config.coreRadius + this.config.hazardRadius);
        this.core.setFillStyle(interfered ? 0xef4444 : 0x38bdf8, interfered ? 0.45 : 0.35);
        this.refreshHud();
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (!g) return;
        const ratio = this.state.progress / 100;
        g.clear();
        g.fillStyle(0x1e293b, 0.9);
        g.fillRoundedRect(width * 0.2, 270, width * 0.6, 12, 6);
        g.fillStyle(0xfbbf24, 1);
        g.fillRoundedRect(width * 0.2, 270, width * 0.6 * ratio, 12, 6);
        this.ui.status?.setText(
            `汇聚 ${Math.floor(this.state.progress)}%  ·  已投入 ${this.state.deposited}/${this.config.fragCount}  ·  干扰失败 ${this.state.fails}`
        ).setColor('#94a3b8');
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'DragToCoreAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            progress: this.state.progress,
            deposited: this.state.deposited,
            goalValue: 100,
            fragCount: this.config.fragCount,
            fails: this.state.fails,
            core: this.core ? { x: this.core.x, y: this.core.y, radius: this.config.coreRadius } : null,
            frags: this.frags.filter(f => f.alive).map(f => ({ id: f.id, x: f.sprite.x, y: f.sprite.y })),
            hazards: this.hazards.map(h => ({ x: h.x, y: h.y, radius: this.config.hazardRadius })),
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
                progress: this.state.progress,
                deposited: this.state.deposited,
                fails: this.state.fails
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
            adapterId: this.config.id, status: this.status,
            score: this.state.score, progress: this.state.progress, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as DRAG_TO_CORE_DEFAULT_CONFIG };
