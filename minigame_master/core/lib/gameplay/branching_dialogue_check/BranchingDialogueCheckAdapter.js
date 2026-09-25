import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_NODES = Object.freeze([
    {
        id: 'start',
        speaker: '引导者',
        text: '前路分岔。你的能力与持有物品，将决定可选择的探索路线。',
        choices: [
            { id: 'humble', label: '谦逊求教', favorDelta: 15, next: 'path_a', requires: {} },
            { id: 'proud', label: '自信宣称', favorDelta: -10, next: 'path_b', requires: {} },
            { id: 'relic', label: '展示关键物品', favorDelta: 25, next: 'path_c', requires: { flag: 'has_relic' }, fallback: 'path_blocked' }
        ]
    },
    {
        id: 'path_a',
        speaker: '引导者',
        text: '对方认可你的态度，提供了一条有价值的线索。',
        choices: [
            { id: 'accept', label: '表示感谢并接受', favorDelta: 10, next: 'end_good', requires: {} }
        ]
    },
    {
        id: 'path_b',
        speaker: '引导者',
        text: '对方语气冷淡。你可以尝试展示实力，或转为低调。',
        choices: [
            { id: 'fight', label: '展示实力', favorDelta: -20, next: 'end_bad', requires: { minRealm: 3 }, fallback: 'end_neutral' },
            { id: 'soften', label: '调整语气', favorDelta: 12, next: 'end_neutral', requires: {} }
        ]
    },
    {
        id: 'path_c',
        speaker: '引导者',
        text: '关键物品确认成功，前往核心区域的通道已打开。',
        choices: [
            { id: 'enter', label: '进入核心区域', favorDelta: 20, next: 'end_good', requires: {} }
        ]
    },
    {
        id: 'path_blocked',
        speaker: '引导者',
        text: '未检测到必需物品，无法开启该路线。',
        choices: [
            { id: 'leave', label: '返回主路线', favorDelta: -5, next: 'end_neutral', requires: {} }
        ]
    },
    {
        id: 'end_good',
        speaker: '系统',
        text: '你获得额外提升。',
        ending: 'good',
        rewardTier: 2
    },
    {
        id: 'end_neutral',
        speaker: '系统',
        text: '你勉强通过试炼，收获平平。',
        ending: 'neutral',
        rewardTier: 1
    },
    {
        id: 'end_bad',
        speaker: '系统',
        text: '心境失衡，此行受损。',
        ending: 'bad',
        rewardTier: 0,
        fail: true
    }
]);

const DEFAULT_CONFIG = Object.freeze({
    id: 'branching_dialogue_check',
    startFavor: 40,
    dialogueGraph: DEFAULT_NODES.slice(),
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const out = { ...base, ...patch };
    return out;
}

export default class BranchingDialogueCheckAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.graph = new Map();
        this.endingTimer = null;
        this.choiceButtons = [];
        this.ui = {};
        this.state = {
            favor: 40,
            nodeId: 'start',
            path: [],
            flags: [],
            realmStage: 1,
            hp: 100,
            score: 0,
            choicesMade: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });

        const nodes = Array.isArray(this.config.dialogueGraph) && this.config.dialogueGraph.length
            ? this.config.dialogueGraph
            : DEFAULT_NODES;
        this.invalidGraph = nodes.some(n => !n || typeof n.id !== 'string' || !n.id);
        this.graph = new Map(nodes.filter(n => n && typeof n.id === 'string').map(n => [n.id, n]));
        this.invalidGraph ||= this.graph.size !== nodes.length || nodes.some(n => !n?.ending &&
            (!Array.isArray(n?.choices) || !n.choices.length || n.choices.some(c => !c || !this.graph.has(c.next) || (c.fallback && !this.graph.has(c.fallback)))));

        const inventory = payload.inventory || {};
        const storyFlags = payload.storyFlags || payload.flags || [];
        const flags = Array.isArray(storyFlags) ? storyFlags.slice() : [];
        if (inventory.relics?.length || knobs.hasRelic) flags.push('has_relic');
        if (payload.playerPerks?.some?.((p) => /relic/i.test(String(p)))) flags.push('has_relic');

        const favor = Number(this.config.startFavor);
        this.state.favor = Math.min(100, Math.max(0, Number.isFinite(favor) ? favor : 40));
        this.state.nodeId = nodes[0]?.id || 'start';
        this.state.path = [this.state.nodeId];
        this.state.flags = [...new Set(flags)];
        const overrideRealm = Number(knobs.realmStage);
        const realm = Number(Number.isFinite(overrideRealm) && overrideRealm > 0 ? overrideRealm : (payload.playerStats?.realmStage ?? payload.playerStats?.realm ?? 1));
        this.state.realmStage = Math.min(100, Math.max(1, Number.isFinite(realm) ? Math.floor(realm) : 1));
        this.state.hp = payload.playerStats?.hp || 100;
        this.state.score = 0;
        this.state.choicesMade = 0;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('BranchingDialogueCheckAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.panel = scene.add.rectangle(width / 2, height * 0.38, width * 0.86, height * 0.42, 0x0f172a, 0.92)
            .setStrokeStyle(2, 0x38bdf8, 0.4);
        this.ui.speaker = scene.add.text(width * 0.12, height * 0.22, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#38bdf8'
        });
        this.ui.body = scene.add.text(width * 0.12, height * 0.28, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '26px', color: '#e2e8f0',
            wordWrap: { width: width * 0.76, useAdvancedWrap: true }
        });
        this.ui.meta = scene.add.text(width / 2, height * 0.58, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#94a3b8'
        }).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.clearChoices();
            this.ui = {};
            this.endingTimer?.remove(false);
            this.endingTimer = null;
        });

        if (this.invalidGraph) this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
        else this.renderNode();
        this.publishTestState();
        return this;
    }

    clearChoices() {
        this.choiceButtons.forEach((b) => {
            b.bg?.destroy();
            b.label?.destroy();
            b.lock?.destroy();
        });
        this.choiceButtons = [];
    }

    meetsRequirement(req = {}) {
        if (!req || typeof req !== 'object') return true;
        if (req.flag && !this.state.flags.includes(req.flag)) return false;
        if (req.minFavor != null && this.state.favor < req.minFavor) return false;
        if (req.minRealm != null && this.state.realmStage < req.minRealm) return false;
        if (req.maxFavor != null && this.state.favor > req.maxFavor) return false;
        return true;
    }

    renderNode() {
        this.clearChoices();
        const node = this.graph.get(this.state.nodeId);
        if (!node) {
            this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
            return;
        }

        this.ui.speaker?.setText(node.speaker || '—');
        this.ui.body?.setText(node.text || '');
        this.ui.meta?.setText(`好感 ${this.state.favor}  ·  阶段 ${this.state.realmStage}  ·  已选择 ${this.state.choicesMade} 次`);

        if (node.ending) {
            const tier = Number(node.rewardTier ?? 0);
            this.state.score = (Number.isFinite(tier) ? tier : 0) * 50 + Math.max(0, this.state.favor);
            this.endingTimer?.remove(false);
            this.endingTimer = this.scene.time.delayedCall(900, () => {
                this.endingTimer = null;
                if (node.fail) this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
                else this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            });
            return;
        }

        const { width, height } = this.scene.scale;
        const choices = node.choices || [];
        choices.forEach((choice, i) => {
            const step = Math.min(88, 350 / choices.length);
            const y = height * 0.66 + i * step;
            const ok = this.meetsRequirement(choice.requires);
            const bg = this.scene.add.rectangle(width / 2, y, width * 0.8, Math.min(72, step - 8), ok ? 0x1e293b : 0x334155, 0.95)
                .setStrokeStyle(1, ok ? 0x38bdf8 : 0x64748b, 0.5)
                .setInteractive({ useHandCursor: ok });
            const label = this.scene.add.text(width / 2, y, choice.label, {
                fontFamily: 'Inter, sans-serif',
                fontSize: `${Math.min(24, step * 0.4)}px`,
                color: ok ? '#f8fafc' : '#94a3b8'
            }).setOrigin(0.5);
            let lock = null;
            if (!ok) {
                lock = this.scene.add.text(width * 0.86, y, choice.fallback ? '改道' : '锁定', {
                    fontFamily: 'Inter, sans-serif', fontSize: '22px', color: '#f87171'
                }).setOrigin(0.5);
            }
            if (ok) {
                bg.on('pointerdown', () => this.pickChoice(choice));
            } else if (choice.fallback) {
                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerdown', () => this.pickChoice(choice));
            }
            this.choiceButtons.push({ bg, label, lock, choice, allowed: ok });
        });
    }

    pickChoice(choice) {
        if (!this.isRunning()) return;
        const node = this.graph.get(this.state.nodeId);
        if (node?.ending || !node?.choices?.includes(choice)) return;
        const allowed = this.meetsRequirement(choice.requires);
        if (!allowed && !choice.fallback) return;
        const next = allowed ? choice.next : choice.fallback;
        const delta = Number(choice.favorDelta ?? 0);
        this.state.choicesMade += 1;
        this.state.favor += (Number.isFinite(delta) ? delta : 0) - (allowed ? 0 : 5);
        if (!next || !this.graph.has(next)) {
            this.finish(false, NODE_RESULT_REASONS.CONDITION_FAILED);
            return;
        }
        this.state.nodeId = next;
        this.state.path.push(next);
        this.renderNode();
        this.publishTestState();
    }

    getTestState() {
        const bodyBounds = this.ui.body?.getBounds?.();
        return {
            ...super.getTestState(),
            adapter: 'BranchingDialogueCheckAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            favor: this.state.favor,
            nodeId: this.state.nodeId,
            path: this.state.path.slice(),
            choicesMade: this.state.choicesMade,
            bodyBounds: bodyBounds ? { x: bodyBounds.x, y: bodyBounds.y, width: bodyBounds.width, height: bodyBounds.height } : null,
            goalValue: 0, // Only the graph ending decides success, including bad endings with positive favor.
            realmStage: this.state.realmStage,
            flags: this.state.flags.slice(),
            ending: this.graph.get(this.state.nodeId)?.ending || null,
            choices: this.choiceButtons.map(b => ({ id: b.choice.id, label: b.choice.label, allowed: b.allowed, fallback: b.choice.fallback || null, x: b.bg.x, y: b.bg.y })),
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const node = this.graph.get(this.state.nodeId);
        const rewards = success
            ? {
                ...(this.config.rewardTable || {}),
                score: (this.config.rewardTable?.score ?? 1) * (Number.isFinite(Number(node?.rewardTier)) ? Number(node.rewardTier) : 1),
                favor: this.state.favor
            }
            : {};
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.FAILED),
            rewards,
            flags: this.state.flags,
            telemetry: {
                favor: this.state.favor,
                path: this.state.path.slice(),
                ending: node?.ending || null,
                choicesMade: this.state.choicesMade
            }
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
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            favor: this.state.favor,
            dialogueNode: this.state.nodeId,
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as BRANCHING_DIALOGUE_CHECK_DEFAULT_CONFIG, DEFAULT_NODES };
