import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const POOL = [
    { id: 'item_a', label: '目标道具A', color: 0x34d399 },
    { id: 'item_b', label: '目标道具B', color: 0xfbbf24 },
    { id: 'sword', label: '残剑', color: 0x60a5fa },
    { id: 'trap', label: '陷阱', color: 0xef4444, trap: true },
    { id: 'mirror', label: '幻镜', color: 0xa78bfa, trap: true },
    { id: 'seal', label: '符印', color: 0x2dd4bf }
];

const DEFAULT_CONFIG = Object.freeze({
    id: 'reaction_pick',
    targetRounds: 6,
    lives: 3,
    showLifeMinSec: 2.2,
    showLifeMaxSec: 3.2,
    fakeCountMin: 2,
    fakeCountMax: 5,
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
    return { ...base, ...patch };
}

export default class ReactionPickAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.random = typeof context.random === 'function' ? context.random : Math.random;
        this.roundTimer = null;
        this.transitionTimer = null;
        this.options = [];
        this.ui = {};
        this.state = {
            round: 0,
            lives: 3,
            correct: 0,
            targetId: null,
            hp: 100,
            score: 0,
            waiting: false
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.config.targetRounds = bounded(this.config.targetRounds, 6, 1, 50, true);
        this.config.lives = bounded(this.config.lives, 3, 1, 20, true);
        this.config.showLifeMinSec = bounded(this.config.showLifeMinSec, 2.2, 0.5, 10);
        this.config.showLifeMaxSec = bounded(this.config.showLifeMaxSec, 3.2, this.config.showLifeMinSec, 10);
        this.config.fakeCountMin = bounded(this.config.fakeCountMin, 2, 1, 5, true);
        this.config.fakeCountMax = bounded(this.config.fakeCountMax, 5, this.config.fakeCountMin, 5, true);
        this.state.lives = this.config.lives;
        this.state.round = 0;
        this.state.correct = 0;
        this.state.score = 0;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.waiting = false;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('ReactionPickAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 188, '辨宝反应', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.prompt = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#fbbf24'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, height - 110, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '18px', color: '#94a3b8'
        }).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            this.clearRoundTimer();
            this.transitionTimer?.remove(false);
            this.transitionTimer = null;
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.ui = {};
            this.clearOptions();
        });

        this.startRound();
        this.publishTestState();
        return this;
    }

    clearOptions() {
        this.options.forEach((o) => { o.bg?.destroy(); o.label?.destroy(); });
        this.options = [];
    }

    clearRoundTimer() {
        this.roundTimer?.remove(false);
        this.roundTimer = null;
    }

    scheduleTransition(delay, callback) {
        this.transitionTimer?.remove(false);
        this.transitionTimer = this.scene.time.delayedCall(delay, () => {
            this.transitionTimer = null;
            if (this.isRunning()) callback();
        });
    }

    startRound() {
        if (!this.isRunning() || this.state.waiting || this.transitionTimer) return;
        this.clearRoundTimer();
        this.clearOptions();
        this.state.waiting = true;
        this.state.round += 1;

        const goods = POOL.filter((p) => !p.trap);
        const traps = POOL.filter((p) => p.trap);
        const target = goods[Math.floor(this.random() * goods.length)];
        this.state.targetId = target.id;

        const fakeN = this.config.fakeCountMin
            + Math.floor(this.random() * (this.config.fakeCountMax - this.config.fakeCountMin + 1));
        const pool = [{ ...target }];
        while (pool.length < fakeN + 1) {
            const candidates = [...goods, ...traps].filter((c) => !pool.some((p) => p.id === c.id));
            if (!candidates.length) break;
            pool.push({ ...candidates[Math.floor(this.random() * candidates.length)] });
        }
        // shuffle
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(this.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        this.ui.prompt?.setText(`找出：${target.label}`).setColor('#fbbf24');
        const { width, height } = this.scene.scale;
        const cols = Math.min(3, pool.length);
        const btnW = 132;
        const gap = 20;
        const totalW = cols * btnW + (cols - 1) * gap;
        pool.forEach((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = (width - totalW) / 2 + btnW / 2 + col * (btnW + gap);
            const y = height * 0.4 + row * 108;
            const bg = this.scene.add.rectangle(x, y, btnW, 88, item.color, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.3)
                .setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(x, y, item.label, {
                fontFamily: 'Inter, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#0f172a'
            }).setOrigin(0.5);
            bg.on('pointerdown', () => this.pick(item));
            this.options.push({ bg, label, item });
        });

        const life = (this.config.showLifeMinSec
            + this.random() * (this.config.showLifeMaxSec - this.config.showLifeMinSec)) * 1000;
        const round = this.state.round;
        this.roundTimer = this.scene.time.delayedCall(life, () => {
            if (round === this.state.round && this.state.waiting && this.isRunning()) this.miss('超时');
        });
        this.refreshHud();
    }

    pick(item) {
        if (!this.state.waiting || !this.isRunning() || !this.options.some(option => option.item === item)) return false;
        if (item.id === this.state.targetId) {
            this.state.waiting = false;
            this.clearRoundTimer();
            this.state.correct += 1;
            this.state.score += 10;
            this.scene.cameras.main.flash(80, 52, 211, 153);
            this.ui.prompt?.setText('正确！').setColor('#34d399');
            if (this.state.correct >= this.config.targetRounds) {
                this.scheduleTransition(400, () => {
                    this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
                });
            } else {
                this.scheduleTransition(500, () => this.startRound());
            }
        } else {
            this.miss(item.trap ? '踩中陷阱' : '选错');
        }
        this.refreshHud();
        this.publishTestState();
        return true;
    }

    miss(reason) {
        if (!this.isRunning() || !this.state.waiting) return false;
        this.state.waiting = false;
        this.clearRoundTimer();
        this.state.lives -= 1;
        this.ui.prompt?.setText(`${reason}！`).setColor('#f87171');
        this.scene.cameras.main.shake(100, 0.01);
        if (this.state.lives <= 0) {
            this.scheduleTransition(400, () => {
                this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
            });
        } else {
            this.scheduleTransition(600, () => this.startRound());
        }
        this.refreshHud();
        this.publishTestState();
        return true;
    }

    refreshHud() {
        this.ui.status?.setText(
            `轮次 ${this.state.correct}/${this.config.targetRounds}  ·  机会 ${this.state.lives}`
        );
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'ReactionPickAdapter',
            adapterId: 'reaction_pick',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            lives: this.state.lives,
            correct: this.state.correct,
            goalValue: this.config.targetRounds * 10,
            targetRounds: this.config.targetRounds,
            round: this.state.round,
            waiting: this.state.waiting,
            targetId: this.state.targetId,
            timer: this.state.waiting ? this.roundTimer?.getRemainingSeconds?.() ?? 0 : 0,
            options: this.options.filter(option => option.bg?.active).map(({ item, bg }) => ({
                id: item.id, label: item.label, trap: item.trap === true, x: bg.x, y: bg.y
            })),
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        this.state.waiting = false;
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.FAILED),
            rewards: success ? { ...(this.config.rewardTable || {}), score: 1 } : {},
            telemetry: { correct: this.state.correct, livesLeft: this.state.lives, rounds: this.state.round }
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
    destroy() { this.state.waiting = false; this.lifecycle?.destroy(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status,
            score: this.state.score, lives: this.state.lives, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as REACTION_PICK_DEFAULT_CONFIG };
