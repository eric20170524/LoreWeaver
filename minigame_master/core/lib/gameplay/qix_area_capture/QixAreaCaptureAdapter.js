import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'qix_area_capture',
    captureTarget: 0.7,
    gridCols: 24,
    gridRows: 16,
    playerSpeed: 140,
    enemyCount: 2,
    enemySpeed: 90,
    timeLimitSec: 90,
    pathMinCells: 4,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const config = { ...base, ...patch };
    const bounds = { captureTarget: [0.3, 0.95], gridCols: [10, 48], gridRows: [8, 36], playerSpeed: [70, 420], enemyCount: [0, 8], enemySpeed: [30, 300], timeLimitSec: [20, 300], pathMinCells: [2, 12] };
    for (const [key, [min, max]] of Object.entries(bounds)) config[key] = Number.isFinite(config[key]) ? Math.max(min, Math.min(max, config[key])) : base[key];
    for (const key of ['gridCols', 'gridRows', 'enemyCount', 'pathMinCells']) config[key] = Math.floor(config[key]);
    return config;
}

export default class QixAreaCaptureAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.gfx = null;
        this.pathGfx = null;
        this.player = null;
        this.enemies = [];
        this.keys = null;
        this.random = context.random || Math.random;
        this.ui = {};
        this.state = {
            col: 0, row: 0,
            drawing: false,
            path: [],
            claimed: null, // 2d boolean grid of claimed cells
            captureRatio: 0,
            elapsed: 0,
            hp: 100,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        const cols = Number(this.config.gridCols || 24);
        const rows = Number(this.config.gridRows || 16);
        this.cols = cols;
        this.rows = rows;
        this.state.claimed = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => this.isBorder(c, r)));
        // start on border
        this.state.col = 0;
        this.state.row = Math.floor(rows / 2);
        this.state.drawing = false;
        this.state.path = [];
        this.state.captureRatio = 0;
        this.state.elapsed = 0;
        this.state.hp = Number.isFinite(payload.playerStats?.hp) ? Math.max(0, payload.playerStats.hp) : 100;
        this.state.pathHits = 0;
        this._pointerTarget = null;
        this.state.score = 0;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('QixAreaCaptureAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        const padX = 24;
        const padY = 330;
        this.cellW = (width - padX * 2) / this.cols;
        this.cellH = (height - padY - 170) / this.rows;
        this.originX = padX;
        this.originY = padY;

        this.ui.title = scene.add.text(width / 2, 188, '区域占领', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 95, 'WASD 或点击目的格 · 离开安全区画线 · 回到安全区占领', {
            fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        this.gfx = scene.add.graphics();
        this.pathGfx = scene.add.graphics();
        this.player = scene.add.circle(0, 0, Math.min(this.cellW, this.cellH) * 0.35, 0x66fcf1, 1)
            .setDepth(10);

        const enemyCount = this.config.enemyCount;
        for (let i = 0; i < enemyCount; i += 1) {
            const e = scene.add.circle(0, 0, Math.min(this.cellW, this.cellH) * 0.4, 0xef4444, 0.9).setDepth(9);
            e.cx = 4 + Math.floor(this.random() * (this.cols - 8));
            e.cy = 3 + Math.floor(this.random() * (this.rows - 6));
            e.vx = (this.random() < 0.5 ? -1 : 1) * this.config.enemySpeed;
            e.vy = (this.random() < 0.5 ? -1 : 1) * this.config.enemySpeed * 0.8;
            e.px = this.cellToX(e.cx);
            e.py = this.cellToY(e.cy);
            e.x = e.px; e.y = e.py;
            this.enemies.push(e);
        }

        if (scene.input.keyboard) {
            this.keys = scene.input.keyboard.addKeys({
                up: 'W', down: 'S', left: 'A', right: 'D',
                up2: 'UP', down2: 'DOWN', left2: 'LEFT', right2: 'RIGHT'
            });
        }
        // pointer: move toward tapped cell
        this.lifecycle.trackListener(scene.input, 'pointerdown', p => {
            if (!this.isRunning() || p.x < this.originX || p.x >= this.originX + this.cols * this.cellW || p.y < this.originY || p.y >= this.originY + this.rows * this.cellH) return;
            this._pointerTarget = this.xyToCell(p.x, p.y);
        });

        this.moveAcc = 0;
        this.syncPlayerSprite();
        this.redrawField();
        this.refreshHud();
        this.publishTestState();

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.gfx?.destroy();
            this.pathGfx?.destroy();
            this.player?.destroy();
            this.enemies.forEach((e) => e.destroy?.());
            for (const key of Object.values(this.keys || {})) scene.input.keyboard?.removeKey?.(key, true);
            this.ui = {}; this.gfx = null; this.pathGfx = null; this.player = null;
            this.enemies = []; this.keys = null; this._pointerTarget = null;
        });
        return this;
    }

    cellToX(c) { return this.originX + (c + 0.5) * this.cellW; }
    cellToY(r) { return this.originY + (r + 0.5) * this.cellH; }

    xyToCell(x, y) {
        const c = Math.floor((x - this.originX) / this.cellW);
        const r = Math.floor((y - this.originY) / this.cellH);
        return {
            c: Math.max(0, Math.min(this.cols - 1, c)),
            r: Math.max(0, Math.min(this.rows - 1, r))
        };
    }

    isBorder(c, r) {
        return c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
    }

    isSafe(c, r) {
        return this.isBorder(c, r) || this.state.claimed[r][c];
    }

    syncPlayerSprite() {
        this.player.x = this.cellToX(this.state.col);
        this.player.y = this.cellToY(this.state.row);
    }

    tryStep(dc, dr) {
        if (!this.isRunning() || !Number.isInteger(dc) || !Number.isInteger(dr) || Math.abs(dc) + Math.abs(dr) !== 1) return;
        const nc = this.state.col + dc;
        const nr = this.state.row + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) return;
        // cannot walk through claimed interior freely when not drawing from safe - allow claimed as safe
        const nextSafe = this.isSafe(nc, nr);
        const curSafe = this.isSafe(this.state.col, this.state.row);

        if (!this.state.drawing) {
            if (curSafe && !nextSafe) {
                // start drawing into open area
                this.state.drawing = true;
                this.state.path = [{ c: this.state.col, r: this.state.row }];
            } else if (!nextSafe && !curSafe) {
                return;
            } else if (!nextSafe) {
                return;
            }
        } else {
            // drawing: cannot cross self path
            if (this.state.path.some((p) => p.c === nc && p.r === nr)) {
                // allow backtrack one step
                const prev = this.state.path[this.state.path.length - 2];
                if (!prev || prev.c !== nc || prev.r !== nr) return;
                this.state.path.pop();
                this.state.col = nc;
                this.state.row = nr;
                if (this.isSafe(nc, nr)) { this.state.drawing = false; this.state.path = []; }
                this.syncPlayerSprite();
                this.drawPath();
                return;
            }
        }

        this.state.col = nc;
        this.state.row = nr;
        this.syncPlayerSprite();

        if (this.state.drawing) {
            this.state.path.push({ c: nc, r: nr });
            this.drawPath();
            if (nextSafe) {
                if (this.state.path.length >= this.config.pathMinCells) this.closePath();
                else { this.state.drawing = false; this.state.path = []; this.pathGfx.clear(); }
            }
        }
        this.publishTestState();
    }

    closePath() {
        if (!this.isRunning() || !this.state.drawing || this.state.path.length < this.config.pathMinCells) return;
        if (this.enemies.some(e => { const cell = this.xyToCell(e.px, e.py); return this.touchesPath(e) || this.state.path.some(p => p.c === cell.c && p.r === cell.r); })) return this.killPath();
        const path = this.state.path.slice();
        this.state.drawing = false; this.state.path = []; this.pathGfx.clear();
        path.forEach(p => { this.state.claimed[p.r][p.c] = true; });
        // Safe borders and the completed trail separate open regions. Only regions
        // unreachable from every enemy are captured, independent of polygon size.
        const reachable = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
        const queue = this.enemies.map(e => this.xyToCell(e.px, e.py));
        while (queue.length) {
            const { c, r } = queue.pop();
            if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || reachable[r][c] || this.state.claimed[r][c]) continue;
            reachable[r][c] = true;
            queue.push({ c: c - 1, r }, { c: c + 1, r }, { c, r: r - 1 }, { c, r: r + 1 });
        }
        for (let r = 1; r < this.rows - 1; r++) for (let c = 1; c < this.cols - 1; c++) {
            if (!reachable[r][c]) this.state.claimed[r][c] = true;
        }

        this.recomputeCapture();
        this.redrawField();
        this.state.score = Math.floor(this.state.captureRatio * 100);
        this.scene.cameras.main.flash(80, 52, 211, 153);

        if (this.state.captureRatio >= this.config.captureTarget) {
            return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
        this.refreshHud();
    }

    recomputeCapture() {
        const interior = (this.cols - 2) * (this.rows - 2);
        let interiorClaimed = 0;
        for (let r = 1; r < this.rows - 1; r += 1) {
            for (let c = 1; c < this.cols - 1; c += 1) {
                if (this.state.claimed[r][c]) interiorClaimed += 1;
            }
        }
        this.state.captureRatio = interiorClaimed / interior;
    }

    redrawField() {
        const g = this.gfx;
        g.clear();
        // field bg
        g.fillStyle(0x0b1220, 1);
        g.fillRect(this.originX, this.originY, this.cols * this.cellW, this.rows * this.cellH);
        for (let r = 0; r < this.rows; r += 1) {
            for (let c = 0; c < this.cols; c += 1) {
                const x = this.originX + c * this.cellW;
                const y = this.originY + r * this.cellH;
                if (this.isBorder(c, r)) {
                    g.fillStyle(0x334155, 1);
                    g.fillRect(x, y, this.cellW - 0.5, this.cellH - 0.5);
                } else if (this.state.claimed[r][c]) {
                    g.fillStyle(0x1d4ed8, 0.55);
                    g.fillRect(x, y, this.cellW - 0.5, this.cellH - 0.5);
                }
            }
        }
        // outline
        g.lineStyle(2, 0x38bdf8, 0.6);
        g.strokeRect(this.originX, this.originY, this.cols * this.cellW, this.rows * this.cellH);
    }

    drawPath() {
        this.pathGfx.clear();
        if (this.state.path.length < 2) return;
        this.pathGfx.lineStyle(3, 0xfbbf24, 0.95);
        for (let i = 1; i < this.state.path.length; i += 1) {
            const a = this.state.path[i - 1];
            const b = this.state.path[i];
            this.pathGfx.lineBetween(this.cellToX(a.c), this.cellToY(a.r), this.cellToX(b.c), this.cellToY(b.r));
        }
    }

    touchesPath(e) {
        return this.state.drawing && this.state.path.some(p => !this.isSafe(p.c, p.r) && Math.hypot((e.px - this.cellToX(p.c)) / this.cellW, (e.py - this.cellToY(p.r)) / this.cellH) < 0.55);
    }

    killPath() {
        if (!this.isRunning() || !this.state.drawing) return;
        this._pointerTarget = null;
        this.state.pathHits += 1;
        this.state.drawing = false;
        this.state.path = [];
        this.pathGfx.clear();
        // snap back to nearest border
        this.state.col = 0;
        this.state.row = Math.floor(this.rows / 2);
        this.syncPlayerSprite();
        this.state.hp = Math.max(0, this.state.hp - 20);
        this.scene.cameras.main.shake(120, 0.012);
        if (this.state.hp <= 0) return this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
        this.refreshHud();
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta <= 0) return;
        if (this.state.hp <= 0) return this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
        const dt = delta / 1000;
        this.state.elapsed += dt;
        if (this.state.elapsed >= this.config.timeLimitSec) return this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);

        // keyboard step movement on accumulator
        this.moveAcc += dt;
        const stepEvery = 0.12 * 140 / this.config.playerSpeed;
        if (this.moveAcc >= stepEvery) {
            this.moveAcc = 0;
            let dc = 0; let dr = 0;
            if (this.keys?.left?.isDown || this.keys?.left2?.isDown) dc = -1;
            else if (this.keys?.right?.isDown || this.keys?.right2?.isDown) dc = 1;
            else if (this.keys?.up?.isDown || this.keys?.up2?.isDown) dr = -1;
            else if (this.keys?.down?.isDown || this.keys?.down2?.isDown) dr = 1;
            else if (this._pointerTarget) {
                const tc = this._pointerTarget.c - this.state.col;
                const tr = this._pointerTarget.r - this.state.row;
                if (Math.abs(tc) >= Math.abs(tr) && tc !== 0) dc = Math.sign(tc);
                else if (tr !== 0) dr = Math.sign(tr);
                else this._pointerTarget = null;
            }
            if (dc || dr) this.tryStep(dc, dr);
            if (!this.isRunning()) return;
        }

        // Substeps prevent tunnelling; reject the colliding axis before bouncing.
        const steps = Math.max(1, Math.ceil(dt * this.config.enemySpeed * 2 / Math.min(this.cellW, this.cellH)));
        for (let step = 0; step < steps; step++) {
            for (const e of this.enemies) {
                for (const [position, velocity] of [['px', 'vx'], ['py', 'vy']]) {
                    const old = e[position]; e[position] += e[velocity] * dt / steps;
                    const cell = this.xyToCell(e.px, e.py);
                    if (this.isSafe(cell.c, cell.r)) { e[position] = old; e[velocity] *= -1; }
                }
                e.x = e.px; e.y = e.py;
                if (this.touchesPath(e)) this.killPath();
                if (!this.isRunning()) return;
            }
        }
        this.refreshHud();
        this.publishTestState();
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (g) {
            const ratio = Math.min(1, this.state.captureRatio / this.config.captureTarget);
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.2, 280, width * 0.6, 10, 5);
            g.fillStyle(0x3b82f6, 1);
            g.fillRoundedRect(width * 0.2, 280, width * 0.6 * ratio, 10, 5);
        }
        const left = Math.max(0, this.config.timeLimitSec - this.state.elapsed);
        this.ui.status?.setText(
            `占领 ${(this.state.captureRatio * 100).toFixed(0)}% / ${(this.config.captureTarget * 100).toFixed(0)}%  ·  HP ${Math.ceil(this.state.hp)}  ·  ⏱ ${left.toFixed(0)}s${this.state.drawing ? '  ·  画线中' : ''}`
        );
    }

    getTestState() {
        return {
            adapter: 'QixAreaCaptureAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            captureRatio: this.state.captureRatio,
            drawing: this.state.drawing, goalValue: 0,
            timer: Math.max(0, this.config.timeLimitSec - this.state.elapsed), captureTarget: this.config.captureTarget,
            col: this.state.col, row: this.state.row, cols: this.cols, rows: this.rows,
            claimed: this.state.claimed?.map(row => [...row]), path: this.state.path.map(p => ({ ...p })), pathHits: this.state.pathHits || 0,
            geometry: { originX: this.originX, originY: this.originY, cellW: this.cellW, cellH: this.cellH },
            stepEvery: 0.12 * 140 / this.config.playerSpeed,
            enemies: this.enemies.map(e => ({ x: e.px, y: e.py, vx: e.vx, vy: e.vy })) ,
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
                captureRatio: this.state.captureRatio,
                elapsedSec: this.state.elapsed,
                hp: this.state.hp
            }
        });
        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    pause() { if (this.config.allowPause !== false) { this._pointerTarget = null; super.pause(); } }
    retreat() { return this.config.allowQuit === false ? null : this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id,
            status: this.status,
            captureRatio: this.state.captureRatio,
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as QIX_AREA_CAPTURE_DEFAULT_CONFIG };
