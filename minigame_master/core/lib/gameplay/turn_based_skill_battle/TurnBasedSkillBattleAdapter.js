import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_SKILL_DECK = Object.freeze([
    { id: 'strike', label: 'Strike', damage: 28, heal: 0, cooldown: 0, color: 0xfbbf24 },
    { id: 'heavy', label: 'Heavy', damage: 55, heal: 0, cooldown: 2, color: 0xf97316 },
    { id: 'heal', label: 'Heal', damage: 0, heal: 35, cooldown: 3, color: 0x34d399 },
    { id: 'burst', label: 'Burst', damage: 90, heal: 0, cooldown: 4, color: 0xef4444 }
]);

const DEFAULT_CONFIG = Object.freeze({
    id: 'turn_based_skill_battle',
    playerHp: 100,
    playerAtk: 20,
    enemyHp: 180,
    enemyAtk: 18,
    enemyName: 'Enemy',
    timeLimitSec: 45,
    failOnTimeout: true,
    skillDeck: DEFAULT_SKILL_DECK.slice(),
    rewardTable: { score: 1 },
    allowQuit: true,
    allowPause: true
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const output = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            output[key] = value.slice();
        } else if (
            value &&
            typeof value === 'object' &&
            base[key] &&
            typeof base[key] === 'object' &&
            !Array.isArray(base[key])
        ) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

function positiveNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
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
        cooldown: Math.max(0, Math.floor(Number(skill.cooldown ?? skill.cd ?? 0) || 0)),
        color: skill.color ?? 0x38bdf8
    }));
}

export default class TurnBasedSkillBattleAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser =
            context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.ui = {
            buttons: [],
            logLines: [],
            logText: null,
            playerHpBar: null,
            enemyHpBar: null,
            turnText: null,
            statusText: null,
            playerNameText: null,
            enemyNameText: null
        };
        this.state = this.initialState();
    }

    initialState() {
        return {
            playerHp: this.config.playerHp,
            playerMaxHp: this.config.playerHp,
            enemyHp: this.config.enemyHp,
            enemyMaxHp: this.config.enemyHp,
            turn: 'player',
            cooldowns: {},
            combatLog: [],
            turnsElapsed: 0,
            skillsUsed: 0,
            damageDealt: 0,
            damageTaken: 0,
            elapsedSeconds: 0,
            timeRemaining: this.config.timeLimitSec
        };
    }

    init(payload = {}) {
        super.init(payload);
        const nodeConfig = payload.nodeConfig || {};
        const gameplayConfig = nodeConfig.gameplay || {};
        const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
        const playability = this.readPlayabilityKnobs(payload, DEFAULT_CONFIG.id);

        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));
        this.config.skillDeck = normalizeSkillDeck(this.config.skillDeck || knobs.skillDeck);

        const playerHp = positiveNumber(
            knobs.playerHp ?? this.config.playerHp ?? payload.playerStats?.hp,
            DEFAULT_CONFIG.playerHp
        );
        const enemyHp = positiveNumber(
            knobs.enemyHp ?? this.config.enemyHp,
            DEFAULT_CONFIG.enemyHp
        );
        const enemyAtkRaw = Number(knobs.enemyAtk ?? this.config.enemyAtk);
        const enemyAtk = Number.isFinite(enemyAtkRaw) && enemyAtkRaw >= 0
            ? enemyAtkRaw
            : DEFAULT_CONFIG.enemyAtk;
        const authoredDuration =
            knobs.timeLimitSec ??
            knobs.durationSec ??
            knobs.duration ??
            gameplayConfig.timeLimitSec ??
            gameplayConfig.durationSec ??
            gameplayConfig.duration ??
            nodeConfig.duration ??
            nodeConfig.durationLimit;
        const timeLimitSec = positiveNumber(
            authoredDuration !== undefined ? playability.durationSec : this.config.timeLimitSec,
            DEFAULT_CONFIG.timeLimitSec
        );

        this.config.playerHp = playerHp;
        this.config.enemyHp = enemyHp;
        this.config.enemyAtk = enemyAtk;
        this.config.timeLimitSec = timeLimitSec;
        this.config.failOnTimeout =
            knobs.failOnTimeout !== undefined
                ? Boolean(knobs.failOnTimeout)
                : this.config.failOnTimeout !== false;

        this.themePack =
            nodeConfig.themeContentPack || knobs.themeContentPack || payload.themeContentPack || null;
        this.themeLocale =
            knobs.locale || nodeConfig.locale || this.themePack?.defaultLocale || 'zh-CN';

        if (this.themePack?.copyKeys) {
            this.config.skillDeck = this.config.skillDeck.map((skill) => {
                const key = `skill_${skill.id}`;
                const label = this.t(key, skill.label);
                return { ...skill, label };
            });
        }
        this.config.enemyName = this.t('entity.boss', this.config.enemyName || 'Enemy');

        this.state = this.initialState();
        this.config.skillDeck.forEach((skill) => {
            this.state.cooldowns[skill.id] = 0;
        });
        this.result = null;
        return this;
    }

    t(key, fallback) {
        const pack = this.themePack;
        if (!pack) return fallback;
        const locale = this.themeLocale || pack.defaultLocale || 'zh-CN';
        const fb = pack.defaultLocale || 'zh-CN';
        if (pack.copyKeys?.[key]) {
            const v = pack.copyKeys[key];
            if (typeof v === 'object') {
                return v[locale] || v[fb] || Object.values(v)[0] || fallback;
            }
            if (typeof v === 'string') return v;
        }
        if (key === 'entity.boss' && pack.entities?.bosses?.boss) {
            const v = pack.entities.bosses.boss;
            return v[locale] || v[fb] || Object.values(v)[0] || fallback;
        }
        if (key === 'entity.player' && pack.entities?.player) {
            const v = pack.entities.player;
            return v[locale] || v[fb] || Object.values(v)[0] || fallback;
        }
        return fallback;
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
        this.pushLog(this.t('battle_start', 'Battle start. Choose a skill.'));
        this.publishTestState();
        return this;
    }

    drawArena(width, height) {
        const g = this.scene.add.graphics();
        g.fillStyle(0x0f172a, 0.55);
        g.fillRoundedRect(24, 80, width - 48, height * 0.42, 16);
        g.lineStyle(2, 0x38bdf8, 0.35);
        g.strokeRoundedRect(24, 80, width - 48, height * 0.42, 16);

        this.playerSprite = this.scene.add.circle(
            width * 0.28,
            height * 0.32,
            34,
            0x66fcf1,
            1
        );
        this.enemySprite = this.scene.add.circle(
            width * 0.72,
            height * 0.32,
            42,
            0xf43f5e,
            1
        );

        this.ui.playerNameText = this.scene.add
            .text(width * 0.28, height * 0.32 + 52, this.t('entity.player', 'Player'), {
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                color: '#e2e8f0'
            })
            .setOrigin(0.5);

        this.ui.enemyNameText = this.scene.add
            .text(
                width * 0.72,
                height * 0.32 + 56,
                this.config.enemyName || this.t('entity.boss', 'Enemy'),
                {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    color: '#fecdd3'
                }
            )
            .setOrigin(0.5);

        this.lifecycle.addCleanup(() => {
            g.destroy();
            this.playerSprite?.destroy();
            this.enemySprite?.destroy();
            this.ui.playerNameText?.destroy();
            this.ui.enemyNameText?.destroy();
            this.playerSprite = null;
            this.enemySprite = null;
            this.ui.playerNameText = null;
            this.ui.enemyNameText = null;
        });
    }

    drawHud(width, height) {
        this.ui.turnText = this.scene.add
            .text(width / 2, 48, this.t('turn_player', 'Your turn'), {
                fontFamily: 'Inter, sans-serif',
                fontSize: '20px',
                fontStyle: 'bold',
                color: '#f8fafc'
            })
            .setOrigin(0.5);

        this.ui.playerHpBar = this.scene.add.graphics();
        this.ui.enemyHpBar = this.scene.add.graphics();
        this.ui.statusText = this.scene.add
            .text(width / 2, height * 0.52, '', {
                fontFamily: 'Inter, sans-serif',
                fontSize: '13px',
                color: '#94a3b8'
            })
            .setOrigin(0.5);

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
            this.ui.buttons.forEach((btn) => {
                btn.bg?.removeAllListeners?.();
                btn.bg?.destroy?.();
                btn.label?.destroy?.();
                btn.cdLabel?.destroy?.();
            });
            this.ui.buttons = [];
            this.ui.turnText = null;
            this.ui.playerHpBar = null;
            this.ui.enemyHpBar = null;
            this.ui.statusText = null;
            this.ui.logText = null;
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
            const bg = this.scene.add
                .rectangle(x, y, btnW, 44, skill.color, 0.9)
                .setStrokeStyle(2, 0xffffff, 0.35)
                .setInteractive({ useHandCursor: true });
            const label = this.scene.add
                .text(x, y - 6, skill.label, {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontStyle: 'bold',
                    color: '#0f172a'
                })
                .setOrigin(0.5);
            const ready = this.t('skill_ready', 'Ready');
            const cdLabel = this.scene.add
                .text(x, y + 12, ready, {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '11px',
                    color: '#1e293b'
                })
                .setOrigin(0.5);

            bg.on('pointerdown', () => this.onSkillClick(skill));
            bg.setData?.('testid', `skill-${skill.id}`);
            if (bg.setName) bg.setName(`skill-${skill.id}`);
            this.ui.buttons.push({ bg, label, cdLabel, skillId: skill.id });
            x += btnW + gap;
        });
        this.refreshButtons();
    }

    refreshBars() {
        if (!this.scene) return;
        const { width } = this.scene.scale;
        const drawBar = (g, x, y, w, ratio, color) => {
            if (!g) return;
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(x, y, w, 12, 6);
            g.fillStyle(color, 1);
            g.fillRoundedRect(
                x,
                y,
                Math.max(0, w * Math.max(0, Math.min(1, ratio))),
                12,
                6
            );
        };
        drawBar(
            this.ui.playerHpBar,
            width * 0.12,
            100,
            width * 0.3,
            this.state.playerHp / this.state.playerMaxHp,
            0x34d399
        );
        drawBar(
            this.ui.enemyHpBar,
            width * 0.58,
            100,
            width * 0.3,
            this.state.enemyHp / this.state.enemyMaxHp,
            0xf43f5e
        );
        const pLabel = this.t('entity.player', 'Player');
        const eLabel = this.t('entity.boss', 'Enemy');
        this.ui.statusText?.setText(
            `${pLabel} ${Math.ceil(this.state.playerHp)}/${this.state.playerMaxHp}  |  ` +
                `${eLabel} ${Math.ceil(this.state.enemyHp)}/${this.state.enemyMaxHp}  |  ` +
                `⏱ ${Math.ceil(this.state.timeRemaining)}s`
        );
    }

    refreshButtons() {
        const ready = this.t('skill_ready', 'Ready');
        this.ui.buttons.forEach((btn) => {
            const cd = this.state.cooldowns[btn.skillId] || 0;
            const locked = this.state.turn !== 'player' || cd > 0 || !this.isRunning();
            btn.bg?.setAlpha?.(locked ? 0.35 : 0.95);
            btn.bg?.disableInteractive?.();
            if (!locked) btn.bg?.setInteractive?.({ useHandCursor: true });
            btn.cdLabel?.setText?.(cd > 0 ? `CD ${cd}` : ready);
        });
        if (this.ui.turnText) {
            this.ui.turnText.setText(
                this.state.turn === 'player'
                    ? this.t('turn_player', 'Your turn')
                    : this.t('turn_enemy', 'Enemy turn')
            );
            this.ui.turnText.setColor(
                this.state.turn === 'player' ? '#f8fafc' : '#fda4af'
            );
        }
    }

    pushLog(line) {
        this.state.combatLog.push(line);
        if (this.state.combatLog.length > 6) this.state.combatLog.shift();
        if (this.ui.logText) {
            this.ui.logText.setText(
                this.state.combatLog.map((l) => `• ${l}`).join('\n')
            );
        }
    }

    onSkillClick(skill) {
        if (!this.isRunning() || this.state.turn !== 'player') return false;
        const cd = this.state.cooldowns[skill.id] || 0;
        if (cd > 0) return false;

        this.state.skillsUsed += 1;
        // Store one extra internal step because cooldowns tick after the enemy
        // response. Authored CD=N therefore blocks the next N player turns.
        this.state.cooldowns[skill.id] = Math.max(0, Number(skill.cooldown || 0)) + 1;

        if (skill.heal > 0) {
            const before = this.state.playerHp;
            this.state.playerHp = Math.min(
                this.state.playerMaxHp,
                this.state.playerHp + skill.heal
            );
            this.pushLog(
                this.t('log_heal', 'Used [{skill}] heal {n}.')
                    .replace('{skill}', skill.label)
                    .replace('{n}', String(Math.round(this.state.playerHp - before)))
            );
            this.flashSprite(this.playerSprite, 0x34d399);
        }
        if (skill.damage > 0) {
            const dmg = skill.damage + Number(this.config.playerAtk || 0) * 0.25;
            this.state.enemyHp = Math.max(0, this.state.enemyHp - dmg);
            this.state.damageDealt += dmg;
            this.pushLog(
                this.t('log_damage', 'Used [{skill}] hit {n}.')
                    .replace('{skill}', skill.label)
                    .replace('{n}', String(Math.round(dmg)))
            );
            this.flashSprite(this.enemySprite, 0xf97316);
            this.scene?.cameras?.main?.shake?.(80, 0.004);
        }

        this.refreshBars();
        this.publishTestState();

        if (this.state.enemyHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
            return true;
        }

        this.state.turn = 'enemy';
        this.refreshButtons();
        this.lifecycle.trackTimer(
            this.scene.time.delayedCall(650, () => this.resolveEnemyTurn())
        );
        return true;
    }

    resolveEnemyTurn() {
        if (!this.isRunning() || this.state.turn !== 'enemy') return;
        const dmg = Number(this.config.enemyAtk || 0);
        this.state.playerHp = Math.max(0, this.state.playerHp - dmg);
        this.state.damageTaken += dmg;
        this.state.turnsElapsed += 1;
        this.pushLog(
            this.t('log_enemy_hit', 'Enemy hits for {n}.').replace(
                '{n}',
                String(Math.round(dmg))
            )
        );
        this.flashSprite(this.playerSprite, 0xef4444);
        this.scene?.cameras?.main?.shake?.(100, 0.006);

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
        this.lifecycle.trackTimer(
            this.scene.time.delayedCall(120, () => {
                if (sprite?.active) sprite.setFillStyle?.(original, 1);
            })
        );
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta < 0) return;
        const dt = delta / 1000;
        this.state.elapsedSeconds += dt;
        this.state.timeRemaining = Math.max(
            0,
            this.config.timeLimitSec - this.state.elapsedSeconds
        );
        this.refreshBars();
        this.publishTestState();

        if (this.state.timeRemaining <= 0 && this.config.failOnTimeout !== false) {
            this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
        }
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'TurnBasedSkillBattleAdapter',
            adapterId: this.config.id,
            status: this.status,
            hp: this.state.playerHp,
            timer: this.state.timeRemaining,
            score: Math.round(this.state.damageDealt),
            enemyHp: this.state.enemyHp,
            turn: this.state.turn,
            skillsUsed: this.state.skillsUsed,
            cooldowns: { ...this.state.cooldowns },
            combatLog: this.state.combatLog.slice(),
            lastResult: this.result
        };
    }

    damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning()) return this.result;
        this.state.playerHp = Math.max(0, this.state.playerHp - Number(amount || 0));
        this.refreshBars();
        this.publishTestState();
        if (this.state.playerHp <= 0) {
            return this.finish(false, failReason);
        }
        return null;
    }

    damageEnemy(amount) {
        if (!this.isRunning()) return this.result;
        const dmg = Number(amount || 0);
        this.state.enemyHp = Math.max(0, this.state.enemyHp - dmg);
        this.state.damageDealt += dmg;
        this.refreshBars();
        this.publishTestState();
        if (this.state.enemyHp <= 0) {
            return this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        }
        return null;
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();

        const rewards = success
            ? {
                  ...(this.config.rewardTable || {}),
                  score: this.config.rewardTable?.score ?? 1
              }
            : {};

        const result = this.end({
            success,
            reason:
                reason ||
                (success
                    ? NODE_RESULT_REASONS.BOSS_DEFEATED
                    : NODE_RESULT_REASONS.HP_ZERO),
            rewards,
            telemetry: {
                turnsElapsed: this.state.turnsElapsed,
                skillsUsed: this.state.skillsUsed,
                damageDealt: this.state.damageDealt,
                damageTaken: this.state.damageTaken,
                enemyHpRemaining: this.state.enemyHp,
                playerHpRemaining: this.state.playerHp,
                elapsedSeconds: this.state.elapsedSeconds,
                timeRemaining: this.state.timeRemaining
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
        this.context.testHooks?.update(this.getTestState());
    }
}

export { DEFAULT_CONFIG as TURN_BASED_SKILL_BATTLE_DEFAULT_CONFIG };
