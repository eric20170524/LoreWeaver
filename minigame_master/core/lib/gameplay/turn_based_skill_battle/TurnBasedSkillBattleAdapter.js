import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_SKILL_DECK = Object.freeze([
    { id: 'strike', label: '普攻', damage: 28, heal: 0, cooldown: 0, color: 0xfbbf24 },
    { id: 'heavy', label: '重击', damage: 55, heal: 0, cooldown: 2, color: 0xf97316 },
    { id: 'heal', label: '回春', damage: 0, heal: 35, cooldown: 3, color: 0x34d399 },
    { id: 'burst', label: '破军', damage: 90, heal: 0, cooldown: 4, color: 0xef4444 }
]);

const DEFAULT_CONFIG = Object.freeze({
    id: 'turn_based_skill_battle',
    playerHp: 100,
    playerAtk: 20,
    enemyHp: 180,
    enemyAtk: 18,
    enemyName: '敌方目标',
    skillDeck: DEFAULT_SKILL_DECK.slice(),
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const output = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            output[key] = value.slice();
        } else if (value && typeof value === 'object' && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

function normalizeSkillDeck(deck) {
    if (!Array.isArray(deck) || deck.length === 0) {
        return DEFAULT_SKILL_DECK.map((skill) => ({ ...skill }));
    }
    return deck.map((skill, index) => ({
        id: skill.id || `skill_${index}`,
        label: skill.label || skill.name || `技能${index + 1}`,
        damage: Number(skill.damage ?? skill.atk ?? 20),
        heal: Number(skill.heal ?? 0),
        cooldown: Math.max(0, Number(skill.cooldown ?? skill.cd ?? 0)),
        color: skill.color ?? 0x38bdf8
    }));
}

export default class TurnBasedSkillBattleAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.ui = {
            buttons: [],
            logLines: [],
            logText: null,
            playerHpBar: null,
            enemyHpBar: null,
            turnText: null,
            statusText: null
        };
        this.state = {
            playerHp: DEFAULT_CONFIG.playerHp,
            playerMaxHp: DEFAULT_CONFIG.playerHp,
            enemyHp: DEFAULT_CONFIG.enemyHp,
            enemyMaxHp: DEFAULT_CONFIG.enemyHp,
            turn: 'player',
            cooldowns: {},
            combatLog: [],
            turnsElapsed: 0,
            skillsUsed: 0,
            damageDealt: 0,
            damageTaken: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const nodeConfig = payload.nodeConfig || {};
        const gameplayConfig = nodeConfig.gameplay || {};
        const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));
        this.config.skillDeck = normalizeSkillDeck(this.config.skillDeck || knobs.skillDeck);

        const playerHp = Number(knobs.playerHp ?? this.config.playerHp ?? payload.playerStats?.hp ?? 100);
        const enemyHp = Number(knobs.enemyHp ?? this.config.enemyHp ?? 180);
        const enemyAtk = Number(knobs.enemyAtk ?? this.config.enemyAtk ?? 18);

        this.config.playerHp = playerHp;
        this.config.enemyHp = enemyHp;
        this.config.enemyAtk = enemyAtk;

        this.state.playerHp = playerHp;
        this.state.playerMaxHp = playerHp;
        this.state.enemyHp = enemyHp;
        this.state.enemyMaxHp = enemyHp;
        this.state.turn = 'player';
        this.state.cooldowns = {};
        this.state.combatLog = [];
        this.state.turnsElapsed = 0;
        this.state.skillsUsed = 0;
        this.state.damageDealt = 0;
        this.state.damageTaken = 0;
        this.config.skillDeck.forEach((skill) => {
            this.state.cooldowns[skill.id] = 0;
        });
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) {
            throw new Error('TurnBasedSkillBattleAdapter requires Phaser in adapter context.');
        }
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();

        const { width, height } = scene.scale;
        this.drawArena(width, height);
        this.drawHud(width, height);
        this.buildActionBar(width, height);
        this.pushLog('战斗开始。选择技能发动回合。');
        this.publishTestState();
        return this;
    }

    drawArena(width, height) {
        const g = this.scene.add.graphics();
        g.fillStyle(0x0f172a, 0.55);
        g.fillRoundedRect(24, 80, width - 48, height * 0.42, 16);
        g.lineStyle(2, 0x38bdf8, 0.35);
        g.strokeRoundedRect(24, 80, width - 48, height * 0.42, 16);

        this.playerSprite = this.scene.add.circle(width * 0.28, height * 0.32, 34, 0x66fcf1, 1);
        this.enemySprite = this.scene.add.circle(width * 0.72, height * 0.32, 42, 0xf43f5e, 1);

        this.scene.add.text(width * 0.28, height * 0.32 + 52, '玩家角色', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            color: '#e2e8f0'
        }).setOrigin(0.5);

        this.scene.add.text(width * 0.72, height * 0.32 + 56, this.config.enemyName || '敌方目标', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            color: '#fecdd3'
        }).setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            g.destroy();
            this.playerSprite?.destroy();
            this.enemySprite?.destroy();
        });
    }

    drawHud(width, height) {
        this.ui.turnText = this.scene.add.text(width / 2, 48, '你的回合', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#f8fafc'
        }).setOrigin(0.5);

        this.ui.playerHpBar = this.scene.add.graphics();
        this.ui.enemyHpBar = this.scene.add.graphics();
        this.ui.statusText = this.scene.add.text(width / 2, height * 0.52, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: '#94a3b8'
        }).setOrigin(0.5);

        this.ui.logText = this.scene.add.text(36, height * 0.56, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: '#cbd5e1',
            wordWrap: { width: width - 72 }
        });

        this.refreshBars();
        this.lifecycle.addCleanup(() => {
            this.ui.turnText?.destroy();
            this.ui.playerHpBar?.destroy();
            this.ui.enemyHpBar?.destroy();
            this.ui.statusText?.destroy();
            this.ui.logText?.destroy();
            this.ui.buttons.forEach((btn) => btn.destroy?.());
            this.ui.buttons = [];
        });
    }

    buildActionBar(width, height) {
        const deck = this.config.skillDeck;
        const gap = 12;
        const btnW = Math.min(120, (width - 48 - gap * (deck.length - 1)) / deck.length);
        const totalW = deck.length * btnW + (deck.length - 1) * gap;
        let x = (width - totalW) / 2 + btnW / 2;
        const y = height - 58;

        deck.forEach((skill) => {
            const bg = this.scene.add.rectangle(x, y, btnW, 44, skill.color, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.35)
                .setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(x, y - 6, skill.label, {
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#0f172a'
            }).setOrigin(0.5);
            const cdLabel = this.scene.add.text(x, y + 12, skill.cooldown > 0 ? `CD ${skill.cooldown}` : '就绪', {
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                color: '#1e293b'
            }).setOrigin(0.5);

            bg.on('pointerdown', () => this.onSkillClick(skill));
            this.ui.buttons.push({ bg, label, cdLabel, skillId: skill.id });
            x += btnW + gap;
        });
        this.refreshButtons();
    }

    refreshBars() {
        const { width } = this.scene.scale;
        const drawBar = (g, x, y, w, ratio, color) => {
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(x, y, w, 12, 6);
            g.fillStyle(color, 1);
            g.fillRoundedRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, ratio))), 12, 6);
        };
        drawBar(this.ui.playerHpBar, width * 0.12, 100, width * 0.3, this.state.playerHp / this.state.playerMaxHp, 0x34d399);
        drawBar(this.ui.enemyHpBar, width * 0.58, 100, width * 0.3, this.state.enemyHp / this.state.enemyMaxHp, 0xf43f5e);
        this.ui.statusText?.setText(
            `玩家 ${Math.ceil(this.state.playerHp)}/${this.state.playerMaxHp}  |  敌人 ${Math.ceil(this.state.enemyHp)}/${this.state.enemyMaxHp}`
        );
    }

    refreshButtons() {
        this.ui.buttons.forEach((btn) => {
            const cd = this.state.cooldowns[btn.skillId] || 0;
            const locked = this.state.turn !== 'player' || cd > 0 || !this.isRunning();
            btn.bg.setAlpha(locked ? 0.35 : 0.95);
            btn.bg.disableInteractive();
            if (!locked) btn.bg.setInteractive({ useHandCursor: true });
            btn.cdLabel.setText(cd > 0 ? `CD ${cd}` : '就绪');
        });
        if (this.ui.turnText) {
            this.ui.turnText.setText(this.state.turn === 'player' ? '你的回合' : '敌方回合');
            this.ui.turnText.setColor(this.state.turn === 'player' ? '#f8fafc' : '#fda4af');
        }
    }

    pushLog(line) {
        this.state.combatLog.push(line);
        if (this.state.combatLog.length > 6) this.state.combatLog.shift();
        if (this.ui.logText) {
            this.ui.logText.setText(this.state.combatLog.map((l) => `• ${l}`).join('\n'));
        }
    }

    onSkillClick(skill) {
        if (!this.isRunning() || this.state.turn !== 'player') return;
        const cd = this.state.cooldowns[skill.id] || 0;
        if (cd > 0) return;

        this.state.skillsUsed += 1;
        this.state.cooldowns[skill.id] = skill.cooldown;

        if (skill.heal > 0) {
            const before = this.state.playerHp;
            this.state.playerHp = Math.min(this.state.playerMaxHp, this.state.playerHp + skill.heal);
            this.pushLog(`使用【${skill.label}】回复 ${Math.round(this.state.playerHp - before)} 点生命。`);
            this.flashSprite(this.playerSprite, 0x34d399);
        }
        if (skill.damage > 0) {
            const dmg = skill.damage + Number(this.config.playerAtk || 0) * 0.25;
            this.state.enemyHp = Math.max(0, this.state.enemyHp - dmg);
            this.state.damageDealt += dmg;
            this.pushLog(`使用【${skill.label}】造成 ${Math.round(dmg)} 点伤害。`);
            this.flashSprite(this.enemySprite, 0xf97316);
            this.scene.cameras.main.shake(80, 0.004);
        }

        this.refreshBars();
        this.publishTestState();

        if (this.state.enemyHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
            return;
        }

        this.state.turn = 'enemy';
        this.refreshButtons();
        this.lifecycle.trackTimer(this.scene.time.delayedCall(650, () => this.resolveEnemyTurn()));
    }

    resolveEnemyTurn() {
        if (!this.isRunning()) return;
        const dmg = Number(this.config.enemyAtk || 18);
        this.state.playerHp = Math.max(0, this.state.playerHp - dmg);
        this.state.damageTaken += dmg;
        this.state.turnsElapsed += 1;
        this.pushLog(`敌人发动攻击，造成 ${Math.round(dmg)} 点伤害。`);
        this.flashSprite(this.playerSprite, 0xef4444);
        this.scene.cameras.main.shake(100, 0.006);

        // Tick cooldowns at end of full round
        Object.keys(this.state.cooldowns).forEach((id) => {
            if (this.state.cooldowns[id] > 0) this.state.cooldowns[id] -= 1;
        });

        this.refreshBars();
        if (this.state.playerHp <= 0) {
            this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
            return;
        }

        this.state.turn = 'player';
        this.refreshButtons();
        this.publishTestState();
    }

    flashSprite(sprite, color) {
        if (!sprite) return;
        const original = sprite.fillColor;
        sprite.setFillStyle(color, 1);
        this.lifecycle.trackTimer(this.scene.time.delayedCall(120, () => {
            sprite?.setFillStyle?.(original, 1);
        }));
    }

    update(_time, _delta) {}

    getTestState() {
        return {
            adapter: 'TurnBasedSkillBattleAdapter',
            status: this.status,
            hp: this.state.playerHp,
            score: Math.round(this.state.damageDealt),
            enemyHp: this.state.enemyHp,
            turn: this.state.turn,
            skillsUsed: this.state.skillsUsed,
            combatLog: this.state.combatLog.slice(),
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();

        const rewards = success
            ? { ...(this.config.rewardTable || {}), score: this.config.rewardTable?.score ?? 1 }
            : {};

        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.BOSS_DEFEATED : NODE_RESULT_REASONS.HP_ZERO),
            rewards,
            telemetry: {
                turnsElapsed: this.state.turnsElapsed,
                skillsUsed: this.state.skillsUsed,
                damageDealt: this.state.damageDealt,
                damageTaken: this.state.damageTaken,
                enemyHpRemaining: this.state.enemyHp,
                playerHpRemaining: this.state.playerHp
            }
        });

        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    retreat() {
        return this.finish(false, NODE_RESULT_REASONS.RETREATED);
    }

    isRunning() {
        return this.status === 'running' && !this.lifecycle?.transitionLocked;
    }

    destroy() {
        this.lifecycle?.cleanup();
        super.destroy();
    }

    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            hp: this.state.playerHp,
            enemyHp: this.state.enemyHp,
            turn: this.state.turn,
            score: Math.round(this.state.damageDealt),
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as TURN_BASED_SKILL_BATTLE_DEFAULT_CONFIG };
