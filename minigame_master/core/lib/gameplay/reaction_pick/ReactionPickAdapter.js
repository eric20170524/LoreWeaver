import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const POOL = [
    { id: 'jade', label: '玉佩', color: 0x34d399 },
    { id: 'pill', label: '丹药', color: 0xfbbf24 },
    { id: 'sword', label: '残剑', color: 0x60a5fa },
    { id: 'trap', label: '陷阱', color: 0xef4444, trap: true },
    { id: 'mirror', label: '幻镜', color: 0xa78bfa, trap: true },
    { id: 'seal', label: '符印', color: 0x2dd4bf }
];

const DEFAULT_CONFIG = Object.freeze({
    id: 'reaction_pick',
    targetRounds: 6,
    lives: 3,
    showLifeMinSec: 2.0,
    showLifeMaxSec: 3.0,
    fakeCountMin: 2,
    fakeCountMax: 5,
    rewardTable: { score: 1 }
});

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
        this.state.lives = Number(this.config.lives || 3);
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

        this.ui.title = scene.add.text(width / 2, 40, '辨宝反应', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.prompt = scene.add.text(width / 2, 88, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#fbbf24'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, height - 40, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
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

    startRound() {
        if (!this.isRunning()) return;
        this.clearOptions();
        this.state.waiting = true;
        this.state.round += 1;

        const goods = POOL.filter((p) => !p.trap);
        const traps = POOL.filter((p) => p.trap);
        const target = goods[Math.floor(Math.random() * goods.length)];
        this.state.targetId = target.id;

        const fakeN = this.config.fakeCountMin
            + Math.floor(Math.random() * (this.config.fakeCountMax - this.config.fakeCountMin + 1));
        const pool = [target];
        while (pool.length < fakeN + 1) {
            const candidates = [...goods, ...traps].filter((c) => !pool.some((p) => p.id === c.id));
            if (!candidates.length) break;
            pool.push(candidates[Math.floor(Math.random() * candidates.length)]);
        }
        // shuffle
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        this.ui.prompt?.setText(`找出：${target.label}`);
        const { width, height } = this.scene.scale;
        const cols = Math.min(3, pool.length);
        const btnW = 100;
        const gap = 16;
        const totalW = cols * btnW + (cols - 1) * gap;
        pool.forEach((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = (width - totalW) / 2 + btnW / 2 + col * (btnW + gap);
            const y = height * 0.4 + row * 70;
            const bg = this.scene.add.rectangle(x, y, btnW, 52, item.color, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.3)
                .setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(x, y, item.label, {
                fontFamily: 'Inter, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#0f172a'
            }).setOrigin(0.5);
            bg.on('pointerdown', () => this.pick(item));
            this.options.push({ bg, label, item });
        });

        const life = (this.config.showLifeMinSec
            + Math.random() * (this.config.showLifeMaxSec - this.config.showLifeMinSec)) * 1000;
        this.lifecycle.trackTimer(this.scene.time.delayedCall(life, () => {
            if (this.state.waiting && this.isRunning()) this.miss('超时');
        }));
        this.refreshHud();
    }

    pick(item) {
        if (!this.state.waiting || !this.isRunning()) return;
        this.state.waiting = false;
        if (item.id === this.state.targetId) {
            this.state.correct += 1;
            this.state.score += 10;
            this.scene.cameras.main.flash(80, 52, 211, 153);
            this.ui.prompt?.setText('正确！').setColor('#34d399');
            if (this.state.correct >= this.config.targetRounds) {
                this.lifecycle.trackTimer(this.scene.time.delayedCall(400, () => {
                    this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
                }));
            } else {
                this.lifecycle.trackTimer(this.scene.time.delayedCall(500, () => this.startRound()));
            }
        } else {
            this.miss(item.trap ? '踩中陷阱' : '选错');
        }
        this.refreshHud();
        this.publishTestState();
    }

    miss(reason) {
        this.state.waiting = false;
        this.state.lives -= 1;
        this.ui.prompt?.setText(`${reason}！`).setColor('#f87171');
        this.scene.cameras.main.shake(100, 0.01);
        if (this.state.lives <= 0) {
            this.lifecycle.trackTimer(this.scene.time.delayedCall(400, () => {
                this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
            }));
        } else {
            this.lifecycle.trackTimer(this.scene.time.delayedCall(600, () => this.startRound()));
        }
        this.refreshHud();
        this.publishTestState();
    }

    refreshHud() {
        this.ui.status?.setText(
            `轮次 ${this.state.correct}/${this.config.targetRounds}  ·  机会 ${this.state.lives}`
        );
    }

    getTestState() {
        return {
            adapter: 'ReactionPickAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            lives: this.state.lives,
            correct: this.state.correct,
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
            telemetry: { correct: this.state.correct, livesLeft: this.state.lives, rounds: this.state.round }
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
            adapterId: this.config.id, status: this.status,
            score: this.state.score, lives: this.state.lives, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as REACTION_PICK_DEFAULT_CONFIG };
