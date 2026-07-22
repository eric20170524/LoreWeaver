import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'rune_connect_sequence',
    runeCount: 8,
    snapRadius: 36,
    wrongLinkPenalty: 1,
    maxMistakes: 6,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

function seededRandom(seed) {
    let s = Number(seed) || 1;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

export default class RuneConnectSequenceAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.runes = [];
        this.links = [];
        this.lineGfx = null;
        this.dragFrom = null;
        this.previewLine = null;
        this.ui = {};
        this.state = {
            stepIndex: 0,
            mistakes: 0,
            elapsedSec: 0,
            hp: 100,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.config.runeCount = Math.max(3, Number(this.config.runeCount || knobs.RUNE_COUNT || 8));
        this.config.snapRadius = Number(this.config.snapRadius || 36);
        this.config.maxMistakes = Number(this.config.maxMistakes || 6);
        this.state.stepIndex = 0;
        this.state.mistakes = 0;
        this.state.elapsedSec = 0;
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        this._rng = seededRandom(payload.runSeed || Date.now() % 100000);
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('RuneConnectSequenceAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 40, '顺序连线', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#fbbf24'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, height - 36, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);

        this.lineGfx = scene.add.graphics().setDepth(1);
        this.previewLine = scene.add.graphics().setDepth(2);
        this.layoutRunes(width, height);

        scene.input.on('pointerdown', (p) => this.onDown(p));
        scene.input.on('pointermove', (p) => this.onMove(p));
        scene.input.on('pointerup', (p) => this.onUp(p));

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 1000, loop: true,
            callback: () => { if (this.isRunning()) this.state.elapsedSec += 1; this.publishTestState(); }
        }));

        this.lifecycle.addCleanup(() => {
            this.runes.forEach((r) => { r.circle?.destroy(); r.label?.destroy(); });
            this.lineGfx?.destroy();
            this.previewLine?.destroy();
            Object.values(this.ui).forEach((n) => n?.destroy?.());
        });

        this.refreshHud();
        this.publishTestState();
        return this;
    }

    layoutRunes(width, height) {
        const n = this.config.runeCount;
        const cx = width / 2;
        const cy = height * 0.52;
        const rx = Math.min(width, height) * 0.32;
        const ry = Math.min(width, height) * 0.28;
        // shuffle order ids 0..n-1 around ellipse
        const order = Array.from({ length: n }, (_, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(this._rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        this.connectOrder = order; // sequence of rune indices to connect
        // place runes in circle in index order (visual), connect by connectOrder sequence
        this.runes = Array.from({ length: n }, (_, i) => {
            const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const x = cx + Math.cos(angle) * rx;
            const y = cy + Math.sin(angle) * ry;
            const circle = this.scene.add.circle(x, y, 22, 0x312e81, 0.95)
                .setStrokeStyle(2, 0xa78bfa, 0.9)
                .setDepth(5)
                .setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(x, y, String(i + 1), {
                fontFamily: 'Inter, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#e2e8f0'
            }).setOrigin(0.5).setDepth(6);
            return { index: i, x, y, circle, label, linked: false };
        });
        // Hint shows next required node number in sequence
        this.refreshHud();
    }

    requiredFromIndex() {
        return this.connectOrder[this.state.stepIndex];
    }

    requiredToIndex() {
        return this.connectOrder[this.state.stepIndex + 1];
    }

    linksNeeded() {
        return Math.max(0, this.connectOrder.length - 1);
    }

    hitRune(x, y) {
        const r = this.config.snapRadius;
        return this.runes.find((rune) => Math.hypot(rune.x - x, rune.y - y) <= r) || null;
    }

    onDown(pointer) {
        if (!this.isRunning()) return;
        if (this.state.stepIndex >= this.linksNeeded()) return;
        const rune = this.hitRune(pointer.x, pointer.y);
        if (!rune) return;
        // Drag must start from the current sequence node
        if (rune.index === this.requiredFromIndex()) {
            this.dragFrom = rune;
        } else {
            this.registerMistake('起点不符');
        }
    }

    onMove(pointer) {
        if (!this.dragFrom) return;
        this.previewLine.clear();
        this.previewLine.lineStyle(3, 0x38bdf8, 0.7);
        this.previewLine.lineBetween(this.dragFrom.x, this.dragFrom.y, pointer.x, pointer.y);
    }

    onUp(pointer) {
        if (!this.dragFrom) return;
        this.previewLine.clear();
        const target = this.hitRune(pointer.x, pointer.y);
        const requiredTo = this.requiredToIndex();
        if (!target || target.index === this.dragFrom.index) {
            this.dragFrom = null;
            return;
        }
        if (target.index === requiredTo) {
            this.links.push({ from: this.dragFrom.index, to: target.index });
            this.drawLinks();
            this.dragFrom.circle.setFillStyle(0x7c3aed, 1);
            target.circle.setFillStyle(0x7c3aed, 1);
            this.state.stepIndex += 1;
            this.state.score += 10;
            this.context.spawnParticles?.(target.x, target.y, 0xa78bfa);
            if (this.state.stepIndex >= this.linksNeeded()) {
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
        } else {
            this.registerMistake('连线顺序错误');
        }
        this.dragFrom = null;
        this.refreshHud();
        this.publishTestState();
    }

    registerMistake(msg) {
        this.state.mistakes += 1;
        this.ui.hint?.setText(`反噬：${msg}`).setColor('#f87171');
        this.scene.cameras.main.shake(100, 0.01);
        if (this.state.mistakes >= this.config.maxMistakes) {
            this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
        }
    }

    drawLinks() {
        this.lineGfx.clear();
        this.lineGfx.lineStyle(4, 0xc4b5fd, 0.85);
        this.links.forEach((link) => {
            const a = this.runes[link.from];
            const b = this.runes[link.to];
            this.lineGfx.lineBetween(a.x, a.y, b.x, b.y);
        });
    }

    refreshHud() {
        const done = this.state.stepIndex >= this.linksNeeded();
        const from = done ? '—' : this.requiredFromIndex() + 1;
        const to = done ? '—' : this.requiredToIndex() + 1;
        this.ui.hint?.setText(done ? '阵法闭合' : `连接 #${from} → #${to}`).setColor('#fbbf24');
        this.ui.status?.setText(
            `进度 ${this.state.stepIndex}/${this.linksNeeded()}  ·  失误 ${this.state.mistakes}/${this.config.maxMistakes}`
        );
        this.runes.forEach((r) => {
            const isFrom = !done && r.index === this.requiredFromIndex();
            const isTo = !done && r.index === this.requiredToIndex();
            r.circle.setStrokeStyle(2, isFrom ? 0x38bdf8 : isTo ? 0xfbbf24 : 0xa78bfa, (isFrom || isTo) ? 1 : 0.9);
        });
    }

    getTestState() {
        return {
            adapter: 'RuneConnectSequenceAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            stepIndex: this.state.stepIndex,
            runeCount: this.config.runeCount,
            mistakes: this.state.mistakes,
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
                mistakes: this.state.mistakes,
                runeCount: this.config.runeCount,
                elapsedSec: this.state.elapsedSec,
                links: this.links.length
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
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            score: this.state.score,
            stepIndex: this.state.stepIndex,
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as RUNE_CONNECT_SEQUENCE_DEFAULT_CONFIG };
