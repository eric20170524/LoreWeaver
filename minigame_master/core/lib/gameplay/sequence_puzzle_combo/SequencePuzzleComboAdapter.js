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
    const config = { ...base, ...patch };
    for (const key of ['sequenceLength', 'pieceCount']) config[key] = Number.isFinite(config[key]) ? Math.max(2, Math.min(8, Math.floor(config[key]))) : base[key];
    return config;
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
        this.phaseLabels = [];
        this.demoTimers = [];
        this.phaseTimer = null;
        this.inputMode = 'demo';
        this.activeLamp = null;
        this.demoOrdinal = 0;
        this.random = context.random || Math.random;
        this.keyEvents = new WeakSet();
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        const n = Number(this.config.sequenceLength || 4);
        this.state.seq = Array.from({ length: n }, () => Math.floor(this.random() * n));
        this.state.step = 0;
        this.state.progress = 0;
        this.state.mistakes = 0;
        this.state.piecesPlaced = 0;
        this.state.hp = Number.isFinite(payload.playerStats?.hp) ? Math.max(0, payload.playerStats.hp) : 100;
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

        this.ui.title = scene.add.text(width / 2, 188, '机关拼图', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 95, '阶段一：按亮灯顺序点亮', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        this.buildPhase1();
        this.lifecycle.trackListener(scene.input, 'pointermove', p => {
            if (!this.isRunning() || !this.dragging || this.dragSource !== 'pointer' || !p.isDown) return;
            this.movePiece(this.dragging, Math.max(30, Math.min(width - 30, p.x)), Math.max(330, Math.min(height - 180, p.y)));
        });
        this.lifecycle.trackListener(scene.input, 'pointerup', () => this.dropPiece());
        this.lifecycle.trackListener(scene.input, 'pointerupoutside', () => this.cancelDrag());
        this.lifecycle.trackListener(scene.input, 'gameout', () => this.cancelDrag());
        this.lifecycle.trackListener(scene.input.keyboard, 'keydown', event => this.onKeyDown(event));

        this.lifecycle.addCleanup(() => {
            this.demoTimers.forEach(timer => timer.remove(false));
            this.demoTimers = [];
            this.phaseTimer?.remove(false); this.phaseTimer = null;
            Object.values(this.ui).forEach(n => n?.destroy?.());
            this.ui = {};
            this.clearPhase();
        });
        this.playSequenceDemo();
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    clearPhase() {
        this.dragging = null;
        this.phaseLabels.forEach(label => label.destroy());
        this.phaseLabels = [];
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
            this.phaseLabels.push(this.scene.add.text(lamp.x, lamp.y, String(i + 1), { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
        }
    }

    playSequenceDemo() {
        this.demoTimers.forEach(timer => timer.remove(false));
        this.demoTimers = [];
        this.inputMode = 'demo'; this.activeLamp = null; this.demoOrdinal = 0;
        this.ui.hint?.setText('观察亮灯顺序，演示结束后点击或按数字键').setColor('#94a3b8');
        const later = (delay, callback) => this.demoTimers.push(this.scene.time.delayedCall(delay, callback));
        this.state.seq.forEach((idx, order) => {
            later(400 + order * 450, () => {
                if (!this.isRunning() || this.phase !== 1 || this.inputMode !== 'demo') return;
                this.activeLamp = idx; this.demoOrdinal = order + 1;
                this.lamps[idx].setFillStyle(0xfbbf24, 1);
            });
            later(650 + order * 450, () => {
                if (this.phase !== 1 || this.inputMode !== 'demo') return;
                this.lamps[idx]?.setFillStyle(0x334155, 0.95); this.activeLamp = null;
            });
        });
        later(800 + (this.state.seq.length - 1) * 450, () => {
            if (!this.isRunning() || this.phase !== 1 || this.inputMode !== 'demo') return;
            this.inputMode = 'input'; this.demoTimers = [];
            this.ui.hint?.setText('请按顺序点击，或按对应数字键');
        });
    }

    onKeyDown(event) {
        if (!this.isRunning() || !event || event.repeat || this.keyEvents.has(event)) return;
        this.keyEvents.add(event);
        const match = /^(?:Digit|Numpad)([1-8])$/.exec(event.code || '');
        if (!match) return;
        const index = Number(match[1]) - 1;
        if (this.phase === 1) this.onLamp(index);
        else if (this.inputMode === 'puzzle') {
            if (!this.dragging) this.startDrag(this.pieces.find(p => p.id === index), 'keyboard');
            else if (this.slots[index]) { this.movePiece(this.dragging, this.slots[index].x, this.slots[index].y); this.dropPiece(); }
        }
    }

    startDrag(piece, source = 'pointer') {
        if (!this.isRunning() || this.inputMode !== 'puzzle' || !piece || piece.placed || !this.pieces.includes(piece)) return;
        this.cancelDrag(); this.dragging = piece; this.dragSource = source;
        piece.sprite.setStrokeStyle(3, 0xffffff, 1);
    }

    movePiece(piece, x, y) { piece.sprite.x = x; piece.sprite.y = y; piece.label.x = x; piece.label.y = y; }
    cancelDrag() {
        if (this.dragging && !this.dragging.placed) {
            this.movePiece(this.dragging, this.dragging.homeX, this.dragging.homeY);
            this.dragging.sprite.setStrokeStyle(0);
        }
        this.dragging = null;
    }

    onLamp(i) {
        if (!this.isRunning() || this.phase !== 1 || this.inputMode !== 'input' || !Number.isInteger(i) || !this.lamps[i]) return;
        const expected = this.state.seq[this.state.step];
        if (i === expected) {
            this.lamps[i].setFillStyle(0x34d399, 1);
            this.state.step += 1;
            this.state.progress = (this.state.step / this.state.seq.length) * 50;
            if (this.state.step >= this.state.seq.length) {
                this.state.progress = 50;
                this.inputMode = 'transition';
                this.phaseTimer = this.scene.time.delayedCall(400, () => this.startPhase2());
            }
        } else {
            this.state.mistakes += 1;
            this.state.step = 0;
            this.state.progress = 0;
            this.lamps.forEach((l) => l.setFillStyle(0x334155, 0.95));
            this.scene.cameras.main.shake(80, 0.008);
            this.playSequenceDemo();
        }
        this.state.score = Math.floor(this.state.progress);
        this.refreshHud();
        this.publishTestState();
    }

    startPhase2() {
        if (!this.isRunning() || this.phase !== 1 || this.inputMode !== 'transition') return;
        this.phaseTimer = null;
        this.inputMode = 'puzzle';
        this.phase = 2;
        this.clearPhase();
        this.ui.hint?.setText('拖拽匹配编号 · 数字键先选碎片，再选槽位').setColor('#64748b');
        const { width, height } = this.scene.scale;
        const n = Number(this.config.pieceCount || 4);
        const colors = [0xef4444, 0x3b82f6, 0x22c55e, 0xfbbf24, 0xa855f7, 0x2dd4bf, 0xf97316, 0xec4899];
        const startX = width / 2 - (n - 1) * 72 / 2;
        for (let i = 0; i < n; i += 1) {
            const slot = this.scene.add.rectangle(startX + i * 72, height * 0.4, 48, 48, 0x1e293b, 0.9)
                .setStrokeStyle(2, colors[i % colors.length], 0.7);
            this.phaseLabels.push(this.scene.add.text(slot.x, slot.y, String(i + 1), { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
            this.slots.push({ sprite: slot, id: i, filled: false, x: slot.x, y: slot.y });
        }
        const positions = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [positions[i], positions[j]] = [positions[j], positions[i]]; }
        for (let i = 0; i < n; i += 1) {
            const sprite = this.scene.add.rectangle(
                startX + positions[i] * 72,
                height * 0.7,
                40, 40, colors[i % colors.length], 0.95
            ).setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(sprite.x, sprite.y, String(i + 1), { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
            this.phaseLabels.push(label);
            const piece = { sprite, label, id: i, placed: false, homeX: sprite.x, homeY: sprite.y };
            sprite.on('pointerdown', () => this.startDrag(piece));
            this.pieces.push(piece);
        }
        this.refreshHud();
    }

    dropPiece() {
        if (!this.isRunning() || !this.dragging || this.phase !== 2 || this.inputMode !== 'puzzle') { this.cancelDrag(); return; }
        const piece = this.dragging;
        this.dragging = null;
        const slot = this.slots.find((s) => !s.filled && Math.hypot(piece.sprite.x - s.x, piece.sprite.y - s.y) < 36);
        if (!slot) { this.movePiece(piece, piece.homeX, piece.homeY); piece.sprite.setStrokeStyle(0); return; }
        if (slot.id === piece.id) {
            piece.placed = true;
            slot.filled = true;
            this.movePiece(piece, slot.x, slot.y);
            piece.sprite.setStrokeStyle(0);
            this.state.piecesPlaced += 1;
            this.state.progress = 50 + (this.state.piecesPlaced / this.slots.length) * 50;
            this.state.score = Math.floor(this.state.progress);
            if (this.state.piecesPlaced >= this.slots.length) {
                this.state.progress = 100;
                return this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
        } else {
            this.state.mistakes += 1;
            this.scene.cameras.main.shake(60, 0.006);
            this.movePiece(piece, piece.homeX, piece.homeY); piece.sprite.setStrokeStyle(0);
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
            g.fillRoundedRect(width * 0.2, 270, width * 0.6, 10, 5);
            g.fillStyle(0xa78bfa, 1);
            g.fillRoundedRect(width * 0.2, 270, width * 0.6 * (this.state.progress / 100), 10, 5);
        }
        this.ui.status?.setText(
            `阶段 ${this.phase}/2  ·  进度 ${Math.floor(this.state.progress)}%  ·  失误 ${this.state.mistakes}`
        );
    }

    getTestState() {
        return {
            adapter: 'SequencePuzzleComboAdapter', status: this.status,
            hp: this.state.hp, score: this.state.score, progress: this.state.progress,
            phase: this.phase, inputMode: this.inputMode, activeLamp: this.activeLamp, demoOrdinal: this.demoOrdinal,
            goalValue: 100, step: this.state.step, mistakes: this.state.mistakes, piecesPlaced: this.state.piecesPlaced,
            selectedPiece: this.dragging?.id ?? null,
            lamps: this.lamps.map((lamp, id) => ({ id, x: lamp.x, y: lamp.y })),
            pieces: this.pieces.map(p => ({ id: p.id, x: p.sprite.x, y: p.sprite.y, placed: p.placed })),
            slots: this.slots.map(s => ({ id: s.id, x: s.x, y: s.y, filled: s.filled })),
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
            telemetry: { progress: this.state.progress, mistakes: this.state.mistakes, phase: this.phase }
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
            adapterId: this.config.id, status: this.status, progress: this.state.progress, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as SEQUENCE_PUZZLE_COMBO_DEFAULT_CONFIG };
