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
    const bounds = { targetProgress: [30, 200], instabilityMax: [20, 200], instabilityOnMismatch: [1, 100], instabilityOnMiss: [1, 100], instabilityDecayPerSec: [0, 20], matchProgress: [1, 50], nearMatchProgress: [0, 50], poolSpawnIntervalSec: [0.3, 5] };
    for (const [key, [min, max]] of Object.entries(bounds)) out[key] = Number.isFinite(out[key]) ? Math.max(min, Math.min(max, out[key])) : base[key];
    out.points = (Array.isArray(out.points) ? out.points : DEFAULT_POINTS).filter(p => p && ELEMENTS.some(e => e.id === p.element)).slice(0, 20).map((p, i) => ({ ...p, id: p.id || `p${i + 1}`, x: Number.isFinite(p.x) ? Math.max(.1, Math.min(.9, p.x)) : .5, y: Number.isFinite(p.y) ? Math.max(.3, Math.min(.75, p.y)) : .5 }));
    if (!out.points.length) out.points = DEFAULT_POINTS.map(p => ({ ...p }));
    const thresholds = Array.isArray(patch.stageThresholds) ? patch.stageThresholds.filter(n => Number.isFinite(n) && n > 0 && n <= out.targetProgress).slice(0, 12) : [];
    out.stageThresholds = thresholds.length ? [...new Set(thresholds)].sort((a, b) => a - b) : [.33, .66, 1].map(n => n * out.targetProgress);
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
        this.random = context.random || Math.random;
        this.keyEvents = new WeakSet();
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
        this.state.hp = Number.isFinite(payload.playerStats?.hp) ? Math.max(0, payload.playerStats.hp) : 100;
        this.state.misses = 0;
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

        this.ui.title = scene.add.text(width / 2, 188, '点位灌注', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 95, '拖到同属性点位 · 数字键先选球再选点 · Esc 取消', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        // figure silhouette
        this.ui.figure = scene.add.ellipse(width / 2, height * 0.5, width * 0.22, height * 0.42, 0x1e293b, 0.55)
            .setStrokeStyle(2, 0x475569, 0.6);

        const pointDefs = Array.isArray(this.config.points) && this.config.points.length
            ? this.config.points
            : DEFAULT_POINTS;

        this.points = pointDefs.map((def, index) => {
            const el = ELEMENTS.find((e) => e.id === def.element) || ELEMENTS[0];
            const x = width * (def.x ?? 0.5);
            const y = height * (def.y ?? 0.5);
            const circle = scene.add.circle(x, y, 28, el.color, 0.35)
                .setStrokeStyle(3, el.color, 0.95);
            const label = scene.add.text(x, y, `${index + 1} ${el.label}·${def.label || ''}`, {
                fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#f8fafc'
            }).setOrigin(0.5);
            return { ...def, element: el.id, color: el.color, x, y, circle, label, charge: 0 };
        });

        // energy pool
        this.pool = scene.add.rectangle(width / 2, height * 0.86, width * 0.7, 48, 0x0f172a, 0.9)
            .setStrokeStyle(2, 0x38bdf8, 0.4);
        this.ui.poolLabel = scene.add.text(width / 2, height * 0.86, '能量池', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.lifecycle.trackListener(scene.input, 'pointermove', p => {
            if (!this.isRunning() || !this.dragging || this.dragSource !== 'pointer' || !p.isDown) return;
            this.moveOrb(this.dragging, p.x, p.y); this.samplePath(p.x, p.y);
        });
        this.lifecycle.trackListener(scene.input, 'pointerup', () => this.dropOrb());
        this.lifecycle.trackListener(scene.input, 'pointerupoutside', () => this.cancelDrag());
        this.lifecycle.trackListener(scene.input, 'gameout', () => this.cancelDrag());
        this.lifecycle.trackListener(scene.input.keyboard, 'keydown', event => this.onKeyDown(event));

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: this.config.poolSpawnIntervalSec * 1000,
            loop: true,
            callback: () => this.spawnOrb()
        }));
        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 100, loop: true, callback: () => this.tick(0.1)
        }));

        this.updateStage();
        // seed a few orbs
        for (let i = 0; i < 3; i += 1) this.spawnOrb();

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.pool?.destroy();
            this.points.forEach((p) => { p.circle?.destroy(); p.label?.destroy(); });
            this.orbs.forEach((o) => { o.sprite?.destroy(); o.label?.destroy(); });
            this.ui = {}; this.pool = null; this.points = []; this.orbs = []; this.dragging = null;
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    spawnOrb() {
        if (!this.isRunning() || this.orbs.filter((o) => o.alive).length >= 6) return;
        const { width, height } = this.scene.scale;
        const available = ELEMENTS.filter(e => this.points.some(p => p.available && p.element === e.id));
        const el = available[Math.floor(this.random() * available.length)];
        if (!el) return;
        const poolSlot = Array.from({ length: 6 }, (_, i) => i).find(i => !this.orbs.some(o => o.alive && o.poolSlot === i));
        const x = width * (0.2 + poolSlot * 0.12);
        const y = height * 0.86;
        const sprite = this.scene.add.circle(x, y, 16, el.color, 0.95)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setInteractive({ useHandCursor: true })
            .setDepth(5);
        const label = this.scene.add.text(x, y, `${poolSlot + 1}${el.label}`, {
            fontFamily: 'Inter, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5).setDepth(6);
        const orb = {
            sprite, label, element: el.id, color: el.color, alive: true,
            path: [], pathScore: 1, poolSlot, homeX: x, homeY: y
        };
        sprite.on('pointerdown', () => this.startDrag(orb));
        this.orbs.push(orb);
    }

    startDrag(orb, source = 'pointer') {
        if (!this.isRunning() || !orb?.alive || !this.orbs.includes(orb)) return;
        this.cancelDrag(); this.dragging = orb; this.dragSource = source;
        orb.pathScore = 1; orb.path = [{ x: orb.sprite.x, y: orb.sprite.y }];
        orb.sprite.setStrokeStyle(3, 0xffffff, 1);
    }
    moveOrb(orb, x, y) { orb.sprite.x = x; orb.sprite.y = y; orb.label.x = x; orb.label.y = y; }
    cancelDrag() {
        if (this.dragging?.alive) { this.moveOrb(this.dragging, this.dragging.homeX, this.dragging.homeY); this.dragging.sprite.setStrokeStyle(2, 0xffffff, .35); }
        this.dragging = null;
    }
    onKeyDown(event) {
        if (!this.isRunning() || !event || event.repeat || this.keyEvents.has(event)) return;
        this.keyEvents.add(event);
        if (event.code === 'Escape') return this.cancelDrag();
        const match = /^(?:Digit|Numpad)([1-6])$/.exec(event.code || '');
        if (!match) return;
        const index = Number(match[1]) - 1;
        if (!this.dragging) this.startDrag(this.orbs.find(o => o.poolSlot === index), 'keyboard');
        else if (this.points[index]?.available) { const p = this.points[index]; this.moveOrb(this.dragging, p.x, p.y); this.dropOrb(); }
    }
    finishIfNeeded() {
        if (this.state.instability >= this.config.instabilityMax) { this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED); return true; }
        if (this.state.progress >= this.config.targetProgress) { this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET); return true; }
        return false;
    }

    samplePath(x, y) {
        if (!this.isRunning() || !this.dragging?.alive) return;
        const path = this.dragging.path;
        const last = path[path.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 8) {
            path.push({ x, y });
            if (path.length > 3) path.shift();
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
        if (!this.isRunning() || !this.dragging?.alive) { this.cancelDrag(); return; }
        const orb = this.dragging;
        this.dragging = null;

        let best = null;
        let bestD = 40;
        this.points.filter(p => p.available).forEach((p) => {
            const d = Math.hypot(orb.sprite.x - p.x, orb.sprite.y - p.y);
            if (d < bestD) { best = p; bestD = d; }
        });

        if (!best) {
            this.state.misses += 1;
            // An on-canvas miss consumes the orb; outside release cancels instead.
            this.state.instability = Math.min(
                this.config.instabilityMax,
                this.state.instability + this.config.instabilityOnMiss
            );
            orb.sprite.destroy();
            orb.label.destroy();
            orb.alive = false;
            this.orbs = this.orbs.filter((o) => o.alive);
            this.scene.cameras.main.shake(60, 0.005);
            if (this.finishIfNeeded()) return;
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
        if (this.finishIfNeeded()) return;
        this.refreshHud();
        this.publishTestState();
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
            p.available = i < 2 + this.state.stage;
            p.circle.setVisible(p.available);
            p.label.setVisible(p.available);
        });
    }

    tick(dt) {
        if (!this.isRunning() || !Number.isFinite(dt) || dt <= 0) return;
        if (this.finishIfNeeded()) return;
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
            g.fillRoundedRect(width * 0.15, 280, width * 0.7, 10, 5);
            g.fillStyle(0x38bdf8, 1);
            g.fillRoundedRect(width * 0.15, 280, width * 0.7 * (this.state.progress / this.config.targetProgress), 10, 5);
            // instability
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.15, 294, width * 0.7, 6, 3);
            g.fillStyle(0xef4444, 0.85);
            g.fillRoundedRect(
                width * 0.15, 294,
                width * 0.7 * (this.state.instability / this.config.instabilityMax), 6, 3
            );
        }
        const top = Object.entries(this.state.branchWeights).sort((a, b) => b[1] - a[1])[0];
        this.ui.status?.setText(
            `进度 ${Math.floor(this.state.progress)}/${this.config.targetProgress}  ·  失稳 ${Math.floor(this.state.instability)}  ·  阶段 ${this.state.stage}  ·  倾向 ${top?.[1] > 0 ? ELEMENTS.find(e => e.id === top[0])?.label : '—'}`
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
            matches: this.state.matches, mismatches: this.state.mismatches, misses: this.state.misses || 0,
            goalValue: 0, targetProgress: this.config.targetProgress, instabilityMax: this.config.instabilityMax,
            selectedSlot: this.dragging?.poolSlot ?? null,
            points: this.points.map((p, index) => ({ index, id: p.id, element: p.element, x: p.x, y: p.y, available: p.available })),
            orbs: this.orbs.filter(o => o.alive).map(o => ({ slot: o.poolSlot, element: o.element, x: o.sprite.x, y: o.sprite.y })),
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
                branch: top?.[1] > 0 ? top[0] : null
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

    pause() { if (this.config.allowPause !== false) { this.cancelDrag(); super.pause(); } }
    retreat() { return this.config.allowQuit === false ? null : this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
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
