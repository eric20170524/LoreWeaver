import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const ELEMENTS = [
    { id: 'wood', label: '木', color: 0x22c55e },
    { id: 'fire', label: '火', color: 0xef4444 },
    { id: 'water', label: '水', color: 0x3b82f6 },
    { id: 'metal', label: '金', color: 0xeab308 },
    { id: 'earth', label: '土', color: 0xa16207 }
];

const DEFAULT_POINTS = Object.freeze([
    { id: 'p1', x: 0.3, y: 0.35, element: 'wood', label: '甲' },
    { id: 'p2', x: 0.7, y: 0.35, element: 'fire', label: '丙' },
    { id: 'p3', x: 0.25, y: 0.58, element: 'water', label: '壬' },
    { id: 'p4', x: 0.75, y: 0.58, element: 'metal', label: '庚' },
    { id: 'p5', x: 0.5, y: 0.72, element: 'earth', label: '戊' }
]);

const DEFAULT_CONFIG = Object.freeze({
    id: 'point_drag_progression',
    targetProgress: 100,
    stageThresholds: [33, 66, 100],
    instabilityMax: 100,
    instabilityOnMismatch: 18,
    instabilityOnMiss: 8,
    instabilityDecayPerSec: 4,
    matchProgress: 14,
    nearMatchProgress: 7,
    poolSpawnIntervalSec: 1.1,
    points: DEFAULT_POINTS.slice(),
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const out = { ...base, ...patch };
    if (Array.isArray(patch.points)) out.points = patch.points.slice();
    if (Array.isArray(patch.stageThresholds)) out.stageThresholds = patch.stageThresholds.slice();
    return out;
}

export default class PointDragProgressionAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.points = [];
        this.orbs = [];
        this.dragging = null;
        this.ui = {};
        this.state = {
            progress: 0,
            instability: 0,
            stage: 1,
            matches: 0,
            mismatches: 0,
            hp: 100,
            score: 0,
            elapsed: 0,
            branchWeights: { wood: 0, fire: 0, water: 0, metal: 0, earth: 0 }
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.state.progress = 0;
        this.state.instability = 0;
        this.state.stage = 1;
        this.state.matches = 0;
        this.state.mismatches = 0;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        this.state.elapsed = 0;
        this.state.branchWeights = { wood: 0, fire: 0, water: 0, metal: 0, earth: 0 };
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('PointDragProgressionAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 36, '点位灌注', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, '从能量池拖到属性匹配的点位 · 错配增加失稳', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        // figure silhouette
        this.ui.figure = scene.add.ellipse(width / 2, height * 0.5, width * 0.22, height * 0.42, 0x1e293b, 0.55)
            .setStrokeStyle(2, 0x475569, 0.6);

        const pointDefs = Array.isArray(this.config.points) && this.config.points.length
            ? this.config.points
            : DEFAULT_POINTS;

        this.points = pointDefs.map((def) => {
            const el = ELEMENTS.find((e) => e.id === def.element) || ELEMENTS[0];
            const x = width * (def.x ?? 0.5);
            const y = height * (def.y ?? 0.5);
            const circle = scene.add.circle(x, y, 22, el.color, 0.35)
                .setStrokeStyle(3, el.color, 0.95);
            const label = scene.add.text(x, y, def.label || el.label, {
                fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#f8fafc'
            }).setOrigin(0.5);
            return { ...def, element: el.id, color: el.color, x, y, circle, label, charge: 0 };
        });

        // energy pool
        this.pool = scene.add.rectangle(width / 2, height * 0.88, width * 0.7, 48, 0x0f172a, 0.9)
            .setStrokeStyle(2, 0x38bdf8, 0.4);
        this.ui.poolLabel = scene.add.text(width / 2, height * 0.88, '能量池', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        scene.input.on('pointermove', (p) => {
            if (!this.dragging) return;
            this.dragging.sprite.x = p.x;
            this.dragging.sprite.y = p.y;
            this.dragging.label.x = p.x;
            this.dragging.label.y = p.y;
            this.samplePath(p.x, p.y);
        });
        scene.input.on('pointerup', () => this.dropOrb());

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: this.config.poolSpawnIntervalSec * 1000,
            loop: true,
            callback: () => this.spawnOrb()
        }));
        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 100, loop: true, callback: () => this.tick(0.1)
        }));

        // seed a few orbs
        for (let i = 0; i < 3; i += 1) this.spawnOrb();

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.pool?.destroy();
            this.points.forEach((p) => { p.circle?.destroy(); p.label?.destroy(); });
            this.orbs.forEach((o) => { o.sprite?.destroy(); o.label?.destroy(); });
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    spawnOrb() {
        if (!this.isRunning() || this.orbs.filter((o) => o.alive).length >= 6) return;
        const { width, height } = this.scene.scale;
        const el = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
        const x = width * 0.2 + Math.random() * width * 0.6;
        const y = height * 0.88 + (Math.random() - 0.5) * 20;
        const sprite = this.scene.add.circle(x, y, 16, el.color, 0.95)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true })
            .setDepth(5);
        const label = this.scene.add.text(x, y, el.label, {
            fontFamily: 'Inter, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5).setDepth(6);
        const orb = {
            sprite, label, element: el.id, color: el.color, alive: true,
            path: [], pathScore: 1
        };
        sprite.on('pointerdown', () => {
            this.dragging = orb;
            orb.path = [{ x: sprite.x, y: sprite.y }];
        });
        this.orbs.push(orb);
    }

    samplePath(x, y) {
        if (!this.dragging) return;
        const path = this.dragging.path;
        const last = path[path.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 8) {
            path.push({ x, y });
            // path smoothness: reward gentle curves
            if (path.length >= 3) {
                const a = path[path.length - 3];
                const b = path[path.length - 2];
                const c = path[path.length - 1];
                const ab = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const bc = Math.hypot(c.x - b.x, c.y - b.y) || 1;
                const ac = Math.hypot(c.x - a.x, c.y - a.y) || 1;
                const straight = ac / (ab + bc);
                // closer to 1 = smoother
                this.dragging.pathScore = Math.min(1.35, 0.7 + straight * 0.5);
            }
        }
    }

    dropOrb() {
        if (!this.dragging?.alive) { this.dragging = null; return; }
        const orb = this.dragging;
        this.dragging = null;

        let best = null;
        let bestD = 40;
        this.points.forEach((p) => {
            const d = Math.hypot(orb.sprite.x - p.x, orb.sprite.y - p.y);
            if (d < bestD) { best = p; bestD = d; }
        });

        if (!best) {
            // miss - return toward pool or destroy
            this.state.instability = Math.min(
                this.config.instabilityMax,
                this.state.instability + this.config.instabilityOnMiss
            );
            orb.sprite.destroy();
            orb.label.destroy();
            orb.alive = false;
            this.orbs = this.orbs.filter((o) => o.alive);
            this.scene.cameras.main.shake(60, 0.005);
            this.refreshHud();
            return;
        }

        const smooth = orb.pathScore || 1;
        if (orb.element === best.element) {
            const gain = this.config.matchProgress * smooth;
            this.state.progress = Math.min(this.config.targetProgress, this.state.progress + gain);
            this.state.matches += 1;
            this.state.score += Math.round(10 * smooth);
            this.state.branchWeights[orb.element] = (this.state.branchWeights[orb.element] || 0) + 1;
            best.charge = Math.min(100, best.charge + 20);
            best.circle.setFillStyle(best.color, 0.35 + best.charge / 200);
            this.context.spawnParticles?.(best.x, best.y, best.color);
            this.scene.cameras.main.flash(60, 52, 211, 153);
        } else {
            // partial if adjacent-ish — treat as mismatch
            this.state.mismatches += 1;
            this.state.instability = Math.min(
                this.config.instabilityMax,
                this.state.instability + this.config.instabilityOnMismatch
            );
            this.state.progress = Math.min(
                this.config.targetProgress,
                this.state.progress + this.config.nearMatchProgress * 0.35
            );
            this.scene.cameras.main.shake(100, 0.01);
        }

        orb.sprite.destroy();
        orb.label.destroy();
        orb.alive = false;
        this.orbs = this.orbs.filter((o) => o.alive);

        this.updateStage();
        this.refreshHud();
        this.publishTestState();

        if (this.state.progress >= this.config.targetProgress) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        } else if (this.state.instability >= this.config.instabilityMax) {
            this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
        }
    }

    updateStage() {
        const thresholds = this.config.stageThresholds || [33, 66, 100];
        let stage = 1;
        thresholds.forEach((t, i) => {
            if (this.state.progress >= t) stage = i + 2;
        });
        this.state.stage = Math.min(thresholds.length, stage);
        // reveal more point stroke intensity by stage
        this.points.forEach((p, i) => {
            p.circle.setVisible(i < 2 + this.state.stage);
            p.label.setVisible(i < 2 + this.state.stage);
        });
    }

    tick(dt) {
        if (!this.isRunning()) return;
        this.state.elapsed += dt;
        this.state.instability = Math.max(
            0,
            this.state.instability - this.config.instabilityDecayPerSec * dt
        );
        this.refreshHud();
        this.publishTestState();
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (g) {
            g.clear();
            // progress
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.15, 88, width * 0.7, 10, 5);
            g.fillStyle(0x38bdf8, 1);
            g.fillRoundedRect(width * 0.15, 88, width * 0.7 * (this.state.progress / 100), 10, 5);
            // instability
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.15, 102, width * 0.7, 6, 3);
            g.fillStyle(0xef4444, 0.85);
            g.fillRoundedRect(
                width * 0.15, 102,
                width * 0.7 * (this.state.instability / this.config.instabilityMax), 6, 3
            );
        }
        const top = Object.entries(this.state.branchWeights).sort((a, b) => b[1] - a[1])[0];
        this.ui.status?.setText(
            `进度 ${Math.floor(this.state.progress)}%  ·  失稳 ${Math.floor(this.state.instability)}  ·  阶段 ${this.state.stage}  ·  倾向 ${top?.[0] || '—'}`
        );
    }

    getTestState() {
        return {
            adapter: 'PointDragProgressionAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            progress: this.state.progress,
            instability: this.state.instability,
            stage: this.state.stage,
            matches: this.state.matches,
            branchWeights: { ...this.state.branchWeights },
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const top = Object.entries(this.state.branchWeights).sort((a, b) => b[1] - a[1])[0];
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.CONDITION_FAILED),
            rewards: success ? {
                ...(this.config.rewardTable || {}),
                score: 1,
                branch: top?.[0] || null
            } : {},
            telemetry: {
                progress: this.state.progress,
                instability: this.state.instability,
                stage: this.state.stage,
                matches: this.state.matches,
                mismatches: this.state.mismatches,
                branchWeights: { ...this.state.branchWeights },
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
            adapterId: this.config.id,
            status: this.status,
            progress: this.state.progress,
            instability: this.state.instability,
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as POINT_DRAG_PROGRESSION_DEFAULT_CONFIG, DEFAULT_POINTS, ELEMENTS };
