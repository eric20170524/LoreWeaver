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
    return { ...base, ...patch };
}

/** Ray-cast point-in-polygon */
function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x; const yi = poly[i].y;
        const xj = poly[j].x; const yj = poly[j].y;
        const intersect = ((yi > y) !== (yj > y))
            && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
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
        this.state.claimed = Array.from({ length: rows }, () => Array(cols).fill(false));
        // start on border
        this.state.col = 0;
        this.state.row = Math.floor(rows / 2);
        this.state.drawing = false;
        this.state.path = [];
        this.state.captureRatio = 0;
        this.state.elapsed = 0;
        this.state.hp = payload.playerStats?.hp || 100;
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
        const padY = 100;
        this.cellW = (width - padX * 2) / this.cols;
        this.cellH = (height - padY - 50) / this.rows;
        this.originX = padX;
        this.originY = padY;

        this.ui.title = scene.add.text(width / 2, 36, '区域占领', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 32, 'WASD 沿边移动 · 进入空白画线 · 闭合边界完成占领', {
            fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        this.gfx = scene.add.graphics();
        this.pathGfx = scene.add.graphics();
        this.player = scene.add.circle(0, 0, Math.min(this.cellW, this.cellH) * 0.35, 0x66fcf1, 1)
            .setDepth(10);

        const enemyCount = Number(this.config.enemyCount || 2);
        for (let i = 0; i < enemyCount; i += 1) {
            const e = scene.add.circle(0, 0, Math.min(this.cellW, this.cellH) * 0.4, 0xef4444, 0.9).setDepth(9);
            e.cx = 4 + Math.floor(Math.random() * (this.cols - 8));
            e.cy = 3 + Math.floor(Math.random() * (this.rows - 6));
            e.vx = (Math.random() < 0.5 ? -1 : 1) * this.config.enemySpeed;
            e.vy = (Math.random() < 0.5 ? -1 : 1) * this.config.enemySpeed * 0.8;
            e.px = this.cellToX(e.cx);
            e.py = this.cellToY(e.cy);
            this.enemies.push(e);
        }

        if (scene.input.keyboard) {
            this.keys = scene.input.keyboard.addKeys({
                up: 'W', down: 'S', left: 'A', right: 'D',
                up2: 'UP', down2: 'DOWN', left2: 'LEFT', right2: 'RIGHT'
            });
        }
        // pointer: move toward tapped cell
        scene.input.on('pointerdown', (p) => {
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
        if (!this.isRunning()) return;
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
            if (nextSafe && this.state.path.length >= this.config.pathMinCells) {
                this.closePath();
            }
        }
        this.publishTestState();
    }

    closePath() {
        const path = this.state.path.slice();
        this.state.drawing = false;
        this.state.path = [];
        this.pathGfx.clear();

        // Build closed polygon in cell centers + claim flood region on smaller side
        const poly = path.map((p) => ({ x: p.c + 0.5, y: p.r + 0.5 }));
        // mark path cells claimed
        path.forEach((p) => { this.state.claimed[p.r][p.c] = true; });

        // Flood-fill unclaimed regions; claim the smaller open region(s) that don't contain enemies
        const visited = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
        const regions = [];
        for (let r = 0; r < this.rows; r += 1) {
            for (let c = 0; c < this.cols; c += 1) {
                if (this.state.claimed[r][c] || visited[r][c]) continue;
                const region = [];
                const q = [[c, r]];
                visited[r][c] = true;
                let hasEnemy = false;
                while (q.length) {
                    const [x, y] = q.pop();
                    region.push({ c: x, r: y });
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = x + dx; const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
                        if (visited[ny][nx] || this.state.claimed[ny][nx]) continue;
                        visited[ny][nx] = true;
                        q.push([nx, ny]);
                    }
                }
                for (const e of this.enemies) {
                    const ec = Math.floor((e.px - this.originX) / this.cellW);
                    const er = Math.floor((e.py - this.originY) / this.cellH);
                    if (region.some((cell) => cell.c === ec && cell.r === er)) hasEnemy = true;
                }
                // also use poly containment as soft check
                const mid = region[Math.floor(region.length / 2)];
                const inPoly = poly.length >= 3 && pointInPoly(mid.c + 0.5, mid.r + 0.5, poly);
                regions.push({ region, hasEnemy, inPoly, size: region.length });
            }
        }

        // Claim regions that are enclosed (inPoly or smaller non-enemy region)
        const totalOpen = this.cols * this.rows;
        regions.sort((a, b) => a.size - b.size);
        for (const reg of regions) {
            if (reg.hasEnemy) continue;
            if (reg.inPoly || reg.size < totalOpen * 0.45) {
                reg.region.forEach((cell) => { this.state.claimed[cell.r][cell.c] = true; });
            }
        }

        this.recomputeCapture();
        this.redrawField();
        this.state.score = Math.floor(this.state.captureRatio * 100);
        this.scene.cameras.main.flash(80, 52, 211, 153);

        if (this.state.captureRatio >= this.config.captureTarget) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
        this.refreshHud();
    }

    recomputeCapture() {
        let claimed = 0;
        const total = this.cols * this.rows;
        for (let r = 0; r < this.rows; r += 1) {
            for (let c = 0; c < this.cols; c += 1) {
                if (this.state.claimed[r][c] || this.isBorder(c, r)) claimed += 1;
            }
        }
        // borders always "claimed" for ratio of interior
        const interior = (this.cols - 2) * (this.rows - 2);
        let interiorClaimed = 0;
        for (let r = 1; r < this.rows - 1; r += 1) {
            for (let c = 1; c < this.cols - 1; c += 1) {
                if (this.state.claimed[r][c]) interiorClaimed += 1;
            }
        }
        this.state.captureRatio = interior > 0 ? interiorClaimed / interior : claimed / total;
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

    killPath() {
        this.state.drawing = false;
        this.state.path = [];
        this.pathGfx.clear();
        // snap back to nearest border
        this.state.col = 0;
        this.state.row = Math.floor(this.rows / 2);
        this.syncPlayerSprite();
        this.state.hp = Math.max(0, this.state.hp - 20);
        this.scene.cameras.main.shake(120, 0.012);
        if (this.state.hp <= 0) this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
        this.refreshHud();
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = delta / 1000;
        this.state.elapsed += dt;

        // keyboard step movement on accumulator
        this.moveAcc += dt;
        const stepEvery = 0.12;
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
        }

        // enemies move in continuous space, bounce on claimed/border
        this.enemies.forEach((e) => {
            e.px += e.vx * dt;
            e.py += e.vy * dt;
            const minX = this.cellToX(1);
            const maxX = this.cellToX(this.cols - 2);
            const minY = this.cellToY(1);
            const maxY = this.cellToY(this.rows - 2);
            if (e.px < minX || e.px > maxX) e.vx *= -1;
            if (e.py < minY || e.py > maxY) e.vy *= -1;
            e.px = Math.max(minX, Math.min(maxX, e.px));
            e.py = Math.max(minY, Math.min(maxY, e.py));
            // bounce out of claimed
            const cell = this.xyToCell(e.px, e.py);
            if (this.state.claimed[cell.r]?.[cell.c]) {
                e.vx *= -1;
                e.vy *= -1;
            }
            e.x = e.px;
            e.y = e.py;

            // hit open path
            if (this.state.drawing) {
                for (const p of this.state.path) {
                    if (Math.hypot(e.px - this.cellToX(p.c), e.py - this.cellToY(p.r)) < this.cellW * 0.55) {
                        this.killPath();
                        break;
                    }
                }
            }
        });

        this.refreshHud();
        this.publishTestState();
        if (this.state.elapsed >= this.config.timeLimitSec) {
            if (this.state.captureRatio >= this.config.captureTarget) {
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            } else {
                this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
            }
        }
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (g) {
            const ratio = Math.min(1, this.state.captureRatio / this.config.captureTarget);
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.2, 86, width * 0.6, 10, 5);
            g.fillStyle(0x3b82f6, 1);
            g.fillRoundedRect(width * 0.2, 86, width * 0.6 * ratio, 10, 5);
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
            drawing: this.state.drawing,
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

    retreat() { return this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.cleanup(); super.destroy(); }
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
