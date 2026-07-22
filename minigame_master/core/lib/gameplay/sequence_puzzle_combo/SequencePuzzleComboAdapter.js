import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'sequence_puzzle_combo',
    sequenceLength: 4,
    pieceCount: 4,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class SequencePuzzleComboAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.phase = 1; // 1 sequence, 2 puzzle
        this.lamps = [];
        this.pieces = [];
        this.slots = [];
        this.ui = {};
        this.state = {
            progress: 0, step: 0, seq: [], mistakes: 0, piecesPlaced: 0, hp: 100, score: 0
        };
        this.dragging = null;
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        const n = Number(this.config.sequenceLength || 4);
        this.state.seq = Array.from({ length: n }, () => Math.floor(Math.random() * n));
        this.state.step = 0;
        this.state.progress = 0;
        this.state.mistakes = 0;
        this.state.piecesPlaced = 0;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        this.phase = 1;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('SequencePuzzleComboAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 36, '机关拼图', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, '阶段一：按亮灯顺序点亮', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        this.buildPhase1();
        scene.input.on('pointermove', (p) => {
            if (!this.dragging) return;
            this.dragging.sprite.x = p.x;
            this.dragging.sprite.y = p.y;
        });
        scene.input.on('pointerup', () => this.dropPiece());

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.clearPhase();
        });
        this.playSequenceDemo();
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    clearPhase() {
        this.lamps.forEach((l) => l.destroy?.());
        this.pieces.forEach((p) => p.sprite?.destroy());
        this.slots.forEach((s) => s.sprite?.destroy());
        this.lamps = [];
        this.pieces = [];
        this.slots = [];
    }

    buildPhase1() {
        this.clearPhase();
        const { width, height } = this.scene.scale;
        const n = this.config.sequenceLength;
        const gap = 70;
        const startX = width / 2 - ((n - 1) * gap) / 2;
        for (let i = 0; i < n; i += 1) {
            const lamp = this.scene.add.circle(startX + i * gap, height * 0.45, 24, 0x334155, 0.95)
                .setStrokeStyle(2, 0x94a3b8, 0.8)
                .setInteractive({ useHandCursor: true });
            lamp.index = i;
            lamp.on('pointerdown', () => this.onLamp(i));
            this.lamps.push(lamp);
        }
    }

    playSequenceDemo() {
        // brief flash of sequence order
        let t = 0;
        this.state.seq.forEach((idx, order) => {
            this.lifecycle.trackTimer(this.scene.time.delayedCall(400 + order * 450, () => {
                const lamp = this.lamps[idx];
                if (!lamp) return;
                lamp.setFillStyle(0xfbbf24, 1);
                this.lifecycle.trackTimer(this.scene.time.delayedCall(250, () => lamp.setFillStyle(0x334155, 0.95)));
            }));
            t = 400 + order * 450;
        });
        this.lifecycle.trackTimer(this.scene.time.delayedCall(t + 400, () => {
            this.ui.hint?.setText('请复现点亮顺序');
        }));
    }

    onLamp(i) {
        if (!this.isRunning() || this.phase !== 1) return;
        const expected = this.state.seq[this.state.step];
        if (i === expected) {
            this.lamps[i].setFillStyle(0x34d399, 1);
            this.state.step += 1;
            this.state.score += 5;
            this.state.progress = (this.state.step / this.state.seq.length) * 50;
            if (this.state.step >= this.state.seq.length) {
                this.state.progress = 50;
                this.lifecycle.trackTimer(this.scene.time.delayedCall(400, () => this.startPhase2()));
            }
        } else {
            this.state.mistakes += 1;
            this.state.step = 0;
            this.state.progress = 0;
            this.lamps.forEach((l) => l.setFillStyle(0x334155, 0.95));
            this.scene.cameras.main.shake(80, 0.008);
            this.ui.hint?.setText('顺序错误，重试').setColor('#f87171');
        }
        this.refreshHud();
        this.publishTestState();
    }

    startPhase2() {
        this.phase = 2;
        this.clearPhase();
        this.ui.hint?.setText('阶段二：拖拽碎片到对应槽位').setColor('#64748b');
        const { width, height } = this.scene.scale;
        const n = Number(this.config.pieceCount || 4);
        const colors = [0xef4444, 0x3b82f6, 0x22c55e, 0xfbbf24, 0xa855f7, 0x2dd4bf];
        for (let i = 0; i < n; i += 1) {
            const slot = this.scene.add.rectangle(width * 0.25 + i * 70, height * 0.4, 48, 48, 0x1e293b, 0.9)
                .setStrokeStyle(2, colors[i % colors.length], 0.7);
            this.slots.push({ sprite: slot, id: i, filled: false, x: slot.x, y: slot.y });
        }
        for (let i = 0; i < n; i += 1) {
            const sprite = this.scene.add.rectangle(
                width * 0.2 + Math.random() * width * 0.6,
                height * 0.7 + Math.random() * 40,
                40, 40, colors[i % colors.length], 0.95
            ).setInteractive({ useHandCursor: true });
            const piece = { sprite, id: i, placed: false };
            sprite.on('pointerdown', () => { if (!piece.placed) this.dragging = piece; });
            this.pieces.push(piece);
        }
        this.refreshHud();
    }

    dropPiece() {
        if (!this.dragging || this.phase !== 2) { this.dragging = null; return; }
        const piece = this.dragging;
        this.dragging = null;
        const slot = this.slots.find((s) => !s.filled && Math.hypot(piece.sprite.x - s.x, piece.sprite.y - s.y) < 36);
        if (!slot) return;
        if (slot.id === piece.id) {
            piece.placed = true;
            slot.filled = true;
            piece.sprite.x = slot.x;
            piece.sprite.y = slot.y;
            this.state.piecesPlaced += 1;
            this.state.score += 10;
            this.state.progress = 50 + (this.state.piecesPlaced / this.slots.length) * 50;
            if (this.state.piecesPlaced >= this.slots.length) {
                this.state.progress = 100;
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
        } else {
            this.state.mistakes += 1;
            this.scene.cameras.main.shake(60, 0.006);
        }
        this.refreshHud();
        this.publishTestState();
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (g) {
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.2, 90, width * 0.6, 10, 5);
            g.fillStyle(0xa78bfa, 1);
            g.fillRoundedRect(width * 0.2, 90, width * 0.6 * (this.state.progress / 100), 10, 5);
        }
        this.ui.status?.setText(
            `阶段 ${this.phase}/2  ·  进度 ${Math.floor(this.state.progress)}%  ·  失误 ${this.state.mistakes}`
        );
    }

    getTestState() {
        return {
            adapter: 'SequencePuzzleComboAdapter', status: this.status,
            hp: this.state.hp, score: this.state.score, progress: this.state.progress,
            phase: this.phase, lastResult: this.result
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
            telemetry: { progress: this.state.progress, mistakes: this.state.mistakes, phase: this.phase }
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
            adapterId: this.config.id, status: this.status, progress: this.state.progress, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as SEQUENCE_PUZZLE_COMBO_DEFAULT_CONFIG };
