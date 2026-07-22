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
        this.state = {
            gx: 1, gy: 1, qi: 80, score: 0, hp: 100,
            rescued: false, atChoice: false, moveLockUntil: 0
        };
        this.maze = null;
        this.cell = 24;
        this.keys = null;
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.maze = generateMaze(Number(this.config.mazeW || 15), Number(this.config.mazeH || 11));
        this.state.gx = this.maze.start[0];
        this.state.gy = this.maze.start[1];
        this.state.qi = Number(this.config.startingQi || 80);
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
        this.cell = Math.floor(Math.min((width - 40) / W, (height - 140) / H));
        this.originX = (width - W * this.cell) / 2;
        this.originY = 100;

        this.ui.title = scene.add.text(width / 2, 36, '迷宫抉择', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, 'WASD/方向键移动 · 到达出口', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
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
        }
        // touch dpad zones
        scene.input.on('pointerdown', (p) => {
            if (this.choiceOpen) return;
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
        // choice tile mid-map
        const cx = Math.floor(W / 2); const cy = Math.floor(H / 2);
        if (grid[cy]?.[cx] === 0) {
            this.choiceCell = [cx, cy];
            g.fillStyle(0xfbbf24, 0.5);
            g.fillRect(this.originX + cx * this.cell, this.originY + cy * this.cell, this.cell - 1, this.cell - 1);
        } else {
            this.choiceCell = [this.maze.start[0] + 2, this.maze.start[1]];
        }
    }

    syncPlayer() {
        this.playerGfx.x = this.originX + (this.state.gx + 0.5) * this.cell;
        this.playerGfx.y = this.originY + (this.state.gy + 0.5) * this.cell;
    }

    tryMove(dx, dy) {
        if (!this.isRunning() || this.choiceOpen) return;
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
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
        this.refreshHud();
        this.publishTestState();
    }

    openChoice() {
        this.choiceOpen = true;
        const { width, height } = this.scene.scale;
        const panel = this.scene.add.rectangle(width / 2, height / 2, width * 0.8, 160, 0x0f172a, 0.95)
            .setStrokeStyle(2, 0xfbbf24, 0.6);
        const text = this.scene.add.text(width / 2, height / 2 - 40, `发现目标点。救援需 ${this.config.rescueCost} 能量。`, {
            fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#e2e8f0', wordWrap: { width: width * 0.7 }
        }).setOrigin(0.5);
        const yes = this.scene.add.rectangle(width / 2 - 70, height / 2 + 36, 110, 36, 0x22c55e, 0.9)
            .setInteractive({ useHandCursor: true });
        const yesL = this.scene.add.text(width / 2 - 70, height / 2 + 36, '救援', {
            fontFamily: 'Inter, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#0f172a'
        }).setOrigin(0.5);
        const no = this.scene.add.rectangle(width / 2 + 70, height / 2 + 36, 110, 36, 0x64748b, 0.9)
            .setInteractive({ useHandCursor: true });
        const noL = this.scene.add.text(width / 2 + 70, height / 2 + 36, '离开', {
            fontFamily: 'Inter, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.choicePanel = [panel, text, yes, yesL, no, noL];
        yes.on('pointerdown', () => {
            if (this.state.qi >= this.config.rescueCost) {
                this.state.qi -= this.config.rescueCost;
                this.state.rescued = true;
                this.state.score += 50;
                this.closeChoice('已救援，获得奖励');
            } else {
                this.closeChoice('能量不足，未能救援');
            }
        });
        no.on('pointerdown', () => this.closeChoice('你选择继续前行'));
    }

    closeChoice(msg) {
        this.choicePanel?.forEach((n) => n.destroy?.());
        this.choicePanel = null;
        this.choiceOpen = false;
        this.ui.hint?.setText(msg);
        this.refreshHud();
    }

    update() {
        if (!this.isRunning() || this.choiceOpen || !this.keys) return;
        const JustDown = this.Phaser?.Input?.Keyboard?.JustDown;
        if (!JustDown) return;
        if (JustDown(this.keys.up) || JustDown(this.keys.up2)) this.tryMove(0, -1);
        if (JustDown(this.keys.down) || JustDown(this.keys.down2)) this.tryMove(0, 1);
        if (JustDown(this.keys.left) || JustDown(this.keys.left2)) this.tryMove(-1, 0);
        if (JustDown(this.keys.right) || JustDown(this.keys.right2)) this.tryMove(1, 0);
    }

    refreshHud() {
        this.ui.status?.setText(`能量 ${this.state.qi}  ·  位置 (${this.state.gx},${this.state.gy})  ·  ${this.state.rescued ? '已完成' : '探索中'}`);
    }

    getTestState() {
        return {
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

    retreat() { return this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.cleanup(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status, score: this.state.score, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as MAZE_EXPLORATION_CHOICE_DEFAULT_CONFIG };
