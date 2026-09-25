import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'maze_exploration_choice',
    mazeW: 15,
    mazeH: 11,
    moveDelayMs: 140,
    rescueCost: 60,
    startingQi: 80,
    runSeed: 1,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

/** Recursive backtracker maze: 1 wall, 0 path */
function generateMaze(w, h, rng = Math.random) {
    const W = w % 2 === 0 ? w + 1 : w;
    const H = h % 2 === 0 ? h + 1 : h;
    const grid = Array.from({ length: H }, () => Array(W).fill(1));
    const stack = [[1, 1]];
    grid[1][1] = 0;
    const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    while (stack.length) {
        const [x, y] = stack[stack.length - 1];
        const options = dirs
            .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
            .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && grid[ny][nx] === 1);
        if (!options.length) { stack.pop(); continue; }
        const [nx, ny, dx, dy] = options[Math.floor(rng() * options.length)];
        grid[y + dy / 2][x + dx / 2] = 0;
        grid[ny][nx] = 0;
        stack.push([nx, ny]);
    }
    grid[H - 2][W - 2] = 0;
    return { grid, W, H, start: [1, 1], exit: [W - 2, H - 2] };
}

export default class MazeExplorationChoiceAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.gridGfx = null;
        this.playerGfx = null;
        this.ui = {};
        this.choiceOpen = false;
        this.choicePanel = null;
        this.skipScenePointer = null;
        this.state = {
            gx: 1, gy: 1, qi: 80, score: 0, hp: 100,
            rescued: false, atChoice: false, moveLockUntil: 0
        };
        this.maze = null;
        this.cell = 24;
        this.keys = null;
        this.handledKeyEvents = new WeakSet();
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        for (const [key, min, max] of [['mazeW', 5, 31], ['mazeH', 5, 31], ['moveDelayMs', 80, 1000], ['startingQi', 0, 1000], ['rescueCost', 0, 1000]]) {
            const value = Number(this.config[key]);
            this.config[key] = Math.round(Math.max(min, Math.min(max, Number.isFinite(value) ? value : DEFAULT_CONFIG[key])));
        }
        let seed = Number(knobs.runSeed ?? payload.runSeed ?? 1) >>> 0;
        this.maze = generateMaze(this.config.mazeW, this.config.mazeH, this.context.random || (() => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }));
        this.config.mazeW = this.maze.W;
        this.config.mazeH = this.maze.H;
        // Place the decision on the exit route so every generated maze can expose it before completion.
        const queue = [[this.maze.start]], seen = new Set([this.maze.start.join()]);
        for (const path of queue) {
            const [x, y] = path[path.length - 1];
            if (x === this.maze.exit[0] && y === this.maze.exit[1]) {
                this.choiceCell = path[Math.floor(path.length / 2)];
                break;
            }
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const next = [x + dx, y + dy];
                if (this.maze.grid[next[1]]?.[next[0]] === 0 && !seen.has(next.join())) {
                    seen.add(next.join());
                    queue.push([...path, next]);
                }
            }
        }
        this.state.gx = this.maze.start[0];
        this.state.gy = this.maze.start[1];
        this.state.qi = this.config.startingQi;
        this.state.moveLockUntil = 0;
        this.state.score = 0;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.rescued = false;
        this.state.atChoice = false;
        this.choiceOpen = false;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('MazeExplorationChoiceAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;
        const { W, H } = this.maze;
        this.cell = Math.floor(Math.min((width - 40) / W, (height - 500) / H));
        this.originX = (width - W * this.cell) / 2;
        this.originY = 300;

        this.ui.title = scene.add.text(width / 2, 188, '迷宫抉择', {
            fontFamily: 'Inter, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '22px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 95, '方向键移动，或点击角色周围 · 绿色为出口', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#64748b'
        }).setOrigin(0.5);

        this.gridGfx = scene.add.graphics();
        this.playerGfx = scene.add.circle(0, 0, this.cell * 0.28, 0x66fcf1, 1);
        this.drawMaze();
        this.syncPlayer();

        if (scene.input.keyboard) {
            this.keys = scene.input.keyboard.addKeys({
                up: 'W', down: 'S', left: 'A', right: 'D',
                up2: 'UP', down2: 'DOWN', left2: 'LEFT', right2: 'RIGHT'
            });
            this.lifecycle.trackListener(scene.input.keyboard, 'keydown', event => this.onKeyDown(event));
        }
        // touch dpad zones
        this.lifecycle.trackListener(scene.input, 'pointerdown', (p) => {
            if (p === this.skipScenePointer) { this.skipScenePointer = null; return; }
            if (!this.isRunning() || this.choiceOpen) return;
            const dx = p.x - (this.originX + (this.state.gx + 0.5) * this.cell);
            const dy = p.y - (this.originY + (this.state.gy + 0.5) * this.cell);
            if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? 1 : -1, 0);
            else this.tryMove(0, dy > 0 ? 1 : -1);
        });

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.gridGfx?.destroy();
            this.playerGfx?.destroy();
            this.choicePanel?.forEach?.((n) => n.destroy?.());
            for (const key of Object.values(this.keys || {})) scene.input.keyboard?.removeKey?.(key, true);
            this.keys = null;
            this.choicePanel = null;
            this.choiceOpen = false;
            this.skipScenePointer = null;
            this.playerGfx = null;
            this.gridGfx = null;
            this.ui = {};
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    drawMaze() {
        const g = this.gridGfx;
        g.clear();
        const { grid, W, H, exit } = this.maze;
        for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W; x += 1) {
                const px = this.originX + x * this.cell;
                const py = this.originY + y * this.cell;
                if (grid[y][x] === 1) {
                    g.fillStyle(0x1e293b, 1);
                    g.fillRect(px, py, this.cell - 1, this.cell - 1);
                } else {
                    g.fillStyle(0x0f172a, 0.8);
                    g.fillRect(px, py, this.cell - 1, this.cell - 1);
                }
            }
        }
        // exit
        g.fillStyle(0x22c55e, 0.7);
        g.fillRect(this.originX + exit[0] * this.cell, this.originY + exit[1] * this.cell, this.cell - 1, this.cell - 1);
        const [cx, cy] = this.choiceCell;
        g.fillStyle(0xfbbf24, 0.5);
        g.fillRect(this.originX + cx * this.cell, this.originY + cy * this.cell, this.cell - 1, this.cell - 1);
    }

    syncPlayer() {
        this.playerGfx.x = this.originX + (this.state.gx + 0.5) * this.cell;
        this.playerGfx.y = this.originY + (this.state.gy + 0.5) * this.cell;
    }

    tryMove(dx, dy) {
        if (!this.isRunning() || this.choiceOpen || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return;
        const now = this.scene.time.now;
        if (now < this.state.moveLockUntil) return;
        const nx = this.state.gx + dx;
        const ny = this.state.gy + dy;
        if (nx < 0 || ny < 0 || nx >= this.maze.W || ny >= this.maze.H) return;
        if (this.maze.grid[ny][nx] === 1) return;
        this.state.gx = nx;
        this.state.gy = ny;
        this.state.moveLockUntil = now + this.config.moveDelayMs;
        this.syncPlayer();
        this.state.score += 1;

        if (this.choiceCell && nx === this.choiceCell[0] && ny === this.choiceCell[1] && !this.state.rescued && !this.state.atChoice) {
            this.state.atChoice = true;
            this.openChoice();
        }
        if (nx === this.maze.exit[0] && ny === this.maze.exit[1]) {
            return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
        this.refreshHud();
        this.publishTestState();
    }

    openChoice() {
        if (!this.isRunning() || this.choiceOpen) return;
        this.choiceOpen = true;
        const { width, height } = this.scene.scale;
        const panel = this.scene.add.rectangle(width / 2, height / 2, width * 0.8, 220, 0x0f172a, 0.95)
            .setStrokeStyle(2, 0xfbbf24, 0.6);
        const text = this.scene.add.text(width / 2, height / 2 - 40, `发现目标点。救援需 ${this.config.rescueCost} 能量。`, {
            fontFamily: 'Inter, sans-serif', fontSize: '24px', color: '#e2e8f0', wordWrap: { width: width * 0.7, useAdvancedWrap: true }
        }).setOrigin(0.5);
        const yes = this.scene.add.rectangle(width / 2 - 110, height / 2 + 36, 180, 64, 0x22c55e, 0.9)
            .setInteractive({ useHandCursor: true });
        const yesL = this.scene.add.text(width / 2 - 110, height / 2 + 36, '救援', {
            fontFamily: 'Inter, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5);
        const no = this.scene.add.rectangle(width / 2 + 110, height / 2 + 36, 180, 64, 0x64748b, 0.9)
            .setInteractive({ useHandCursor: true });
        const noL = this.scene.add.text(width / 2 + 110, height / 2 + 36, '离开', {
            fontFamily: 'Inter, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.choicePanel = [panel, text, yes, yesL, no, noL];
        yes.on('pointerdown', p => this.chooseRescue(true, p));
        no.on('pointerdown', p => this.chooseRescue(false, p));
    }

    chooseRescue(rescue, pointer) {
        if (!this.isRunning() || !this.choiceOpen) return;
        this.skipScenePointer = pointer || null;
        this.state.moveLockUntil = this.scene.time.now + this.config.moveDelayMs;
        if (rescue && this.state.qi >= this.config.rescueCost) {
            this.state.qi -= this.config.rescueCost;
            this.state.rescued = true;
            this.state.score += 50;
            this.closeChoice('已救援，获得奖励');
        } else this.closeChoice(rescue ? '能量不足，未能救援' : '你选择继续前行');
    }

    closeChoice(msg) {
        this.choicePanel?.forEach((n) => n.destroy?.());
        this.choicePanel = null;
        this.choiceOpen = false;
        this.ui.hint?.setText(msg);
        this.refreshHud();
    }

    onKeyDown(event) {
        if (!event || this.handledKeyEvents.has(event)) return;
        this.handledKeyEvents.add(event);
        if (!this.isRunning() || this.choiceOpen) return;
        const directions = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
            KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
        const direction = directions[event.code];
        if (direction) this.tryMove(...direction);
    }

    refreshHud() {
        this.ui.status?.setText(`能量 ${this.state.qi}  ·  位置 (${this.state.gx},${this.state.gy})  ·  ${this.state.rescued ? '已完成' : '探索中'}`);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            goalValue: 0,
            maze: this.maze, choiceCell: this.choiceCell, choiceOpen: this.choiceOpen,
            cell: this.cell, originX: this.originX, originY: this.originY,
            moveDelayMs: this.config.moveDelayMs,
            choices: this.choicePanel ? { yes: { x: this.choicePanel[2].x, y: this.choicePanel[2].y }, no: { x: this.choicePanel[4].x, y: this.choicePanel[4].y } } : null,
            adapter: 'MazeExplorationChoiceAdapter', status: this.status,
            hp: this.state.hp, score: this.state.score, qi: this.state.qi,
            gx: this.state.gx, gy: this.state.gy, rescued: this.state.rescued, lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.FAILED),
            rewards: success ? {
                ...(this.config.rewardTable || {}), score: 1,
                relic: this.state.rescued ? 'rescue_token' : undefined
            } : {},
            flags: this.state.rescued ? ['rescued_npc'] : [],
            telemetry: { qi: this.state.qi, rescued: this.state.rescued, score: this.state.score }
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
            adapterId: this.config.id, status: this.status, score: this.state.score, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as MAZE_EXPLORATION_CHOICE_DEFAULT_CONFIG };
