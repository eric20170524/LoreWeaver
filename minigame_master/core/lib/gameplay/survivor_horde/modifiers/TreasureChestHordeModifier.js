import GameplayModifier from '../../GameplayModifier.js';
import ChannelInteractionSystem from '../systems/ChannelInteractionSystem.js';

const DEFAULT_RISK_TIERS = Object.freeze({
    safe: Object.freeze({
        durationMs: 1600,
        rewardMultiplier: 1,
        color: 0xaaddff,
        guardSpawnAt: null,
        guardCount: 0
    }),
    mid: Object.freeze({
        durationMs: 2400,
        rewardMultiplier: 2,
        color: 0xffdd66,
        guardSpawnAt: null,
        guardCount: 0
    }),
    high: Object.freeze({
        durationMs: 3200,
        rewardMultiplier: 3,
        color: 0xff6644,
        guardSpawnAt: 0.25,
        guardCount: 3
    })
});

const DEFAULT_CONFIG = Object.freeze({
    chestCount: 6,
    requiredOpenCount: null,
    finishOnRequiredOpen: false,
    respawnIntervalMs: 8000,
    interactionRadius: 90,
    leavePolicy: 'reset',
    damagePolicy: 'regress',
    damageRegressMs: 400,
    rewardScore: null,
    baseReward: Object.freeze({ score: 8 }),
    radius: 12,
    color: 0xfbbf24,
    riskSequence: Object.freeze(['high', 'mid', 'safe']),
    riskTiers: DEFAULT_RISK_TIERS,
    guardEnemy: Object.freeze({
        id: 'treasure_guard',
        hp: 5,
        speed: 76,
        damage: 14,
        radius: 11,
        color: 0xb45309,
        reward: Object.freeze({ score: 2 })
    }),
    bossSpawnRatio: 0.75,
    labels: Object.freeze({
        objective: 'Treasure',
        channeling: 'Opening',
        interrupted: 'Interrupted',
        completed: 'Opened',
        guards: 'Guards alerted'
    }),
    cues: Object.freeze({
        start: 'treasure_channel_start',
        interrupted: 'treasure_channel_interrupted',
        completed: 'treasure_open',
        guards: 'treasure_guards_alerted'
    })
});

function mergeObject(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ...base };
    const result = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            result[key] = value.slice();
        } else if (
            value
            && typeof value === 'object'
            && base[key]
            && typeof base[key] === 'object'
            && !Array.isArray(base[key])
        ) {
            result[key] = mergeObject(base[key], value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

function normalizeConfig(config = {}) {
    const merged = mergeObject(DEFAULT_CONFIG, config);
    merged.riskTiers = Object.fromEntries(
        Object.entries({ ...DEFAULT_RISK_TIERS, ...(config.riskTiers || {}) })
            .map(([risk, tier]) => [risk, mergeObject(DEFAULT_RISK_TIERS[risk] || {}, tier)])
    );
    merged.riskSequence = Array.isArray(merged.riskSequence) && merged.riskSequence.length
        ? merged.riskSequence.filter((risk) => merged.riskTiers[risk])
        : Object.keys(merged.riskTiers);
    if (!merged.riskSequence.length) merged.riskSequence = ['safe'];
    if (!Number.isFinite(merged.requiredOpenCount) || merged.requiredOpenCount <= 0) {
        merged.requiredOpenCount = Math.max(1, Math.ceil(merged.chestCount * 0.5));
    }
    return merged;
}

function addReward(target, reward = {}) {
    for (const [key, value] of Object.entries(reward)) {
        if (Number.isFinite(value)) target[key] = (target[key] || 0) + value;
    }
}

export default class TreasureChestHordeModifier extends GameplayModifier {
    constructor(config = {}) {
        super(normalizeConfig(config));
        this.chests = [];
        this.timer = null;
        this.bossQueued = false;
        this.interaction = null;
        this.progressBar = null;
        this.objectiveText = null;
        this.unsubscribeDamage = null;
        this.openedCount = 0;
        this.highRiskOpened = 0;
        this.guardsSpawned = 0;
        this.totalReward = {};
        this.lastPresentation = null;
        this.spawnSequence = 0;
    }

    install(context) {
        super.install(context);
        this.interaction = new ChannelInteractionSystem({
            leavePolicy: this.config.leavePolicy,
            damagePolicy: this.config.damagePolicy,
            damageRegressMs: this.config.damageRegressMs,
            onEvent: (event) => this.handleInteractionEvent(context, event)
        });
        this.progressBar = context.scene.add.graphics().setDepth?.(20) || context.scene.add.graphics();
        this.objectiveText = context.scene.add.text(
            context.adapter.world.width / 2,
            24,
            '',
            { fontSize: '16px', color: '#ffd700', fontStyle: 'bold' }
        ).setOrigin?.(0.5, 0).setScrollFactor?.(0).setDepth?.(20) || null;
        this.updateObjectiveLabel();

        for (let i = 0; i < this.config.chestCount; i += 1) this.spawnChest(context);

        if (this.config.respawnIntervalMs > 0) {
            this.timer = context.scene.time.addEvent({
                delay: this.config.respawnIntervalMs,
                loop: true,
                callback: () => {
                    if (!context.adapter.isRunning()) return;
                    const available = this.chests.filter((chest) => this.isAvailable(chest)).length;
                    if (available < this.config.chestCount) this.spawnChest(context);
                }
            });
            context.lifecycle.trackTimer(this.timer);
        }

        this.unsubscribeDamage = context.events?.on?.('player-damaged', () => {
            this.interaction?.interrupt('damage', {
                policy: this.config.damagePolicy,
                regressMs: this.config.damageRegressMs
            });
        }) || null;
    }

    riskForIndex(index) {
        return this.config.riskSequence[index % this.config.riskSequence.length];
    }

    spawnChest(context) {
        const random = context.random || Math.random;
        const w = context.adapter.world.width;
        const h = context.adapter.world.height;
        const padding = Math.max(20, this.config.radius * 3);
        const x = padding + random() * Math.max(1, w - padding * 2);
        const y = padding + random() * Math.max(1, h - padding * 2);
        const chestId = `treasure_chest_${++this.spawnSequence}`;
        const risk = this.riskForIndex(this.spawnSequence - 1);
        const tier = this.config.riskTiers[risk] || this.config.riskTiers.safe;
        const art = context.adapter.runtimeArt;
        const chestKey = art?.propKey?.('chest_gold')
            || art?.resolve?.('chest')
            || (context.scene.textures.exists('lw_art_chest_gold') ? 'lw_art_chest_gold' : null)
            || (context.scene.textures.exists('chest_gold') ? 'chest_gold' : null);
        let chest;
        if (chestKey && context.scene.textures.exists(chestKey)) {
            chest = context.scene.add.sprite(x, y, chestKey);
            context.scene.physics.add.existing(chest);
            chest.setDisplaySize(this.config.radius * (risk === 'high' ? 4 : 3.5), this.config.radius * (risk === 'high' ? 4 : 3.5));
            chest.body?.setCircle?.(this.config.radius);
            chest.setData('artSource', 'atlas');
        } else if (context.helpers.createCircle) {
            chest = context.helpers.createCircle(x, y, this.config.radius, tier.color ?? this.config.color);
        } else {
            chest = context.scene.add.circle(x, y, this.config.radius, tier.color ?? this.config.color, 0.95);
        }

        chest.setTint?.(tier.color ?? this.config.color);
        chest.setData?.('chestId', chestId);
        chest.setData?.('risk', risk);
        chest.setData?.('durationMs', tier.durationMs);
        chest.setData?.('rewardMultiplier', tier.rewardMultiplier || 1);
        chest.setData?.('guardsSpawned', false);
        chest.setData?.('opened', false);
        chest.setData?.('isChest', true);
        this.chests.push(chest);
        return chest;
    }

    isAvailable(chest) {
        return Boolean(chest?.active && !chest.getData?.('opened'));
    }

    findNearestChest(context) {
        const player = context.player;
        if (!player) return null;
        let nearest = null;
        let nearestDistance = this.config.interactionRadius;
        for (const chest of this.chests) {
            if (!this.isAvailable(chest)) continue;
            const distance = Math.hypot(chest.x - player.x, chest.y - player.y);
            const chestId = chest.getData('chestId');
            const nearestId = nearest?.getData?.('chestId') || '';
            if (distance < nearestDistance || (distance === nearestDistance && chestId < nearestId)) {
                nearest = chest;
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    update(context, _time, delta = 0) {
        if (!this.installed) return;
        if (!context.adapter.isRunning()) {
            this.interaction?.step({ canRun: false });
            return;
        }

        this.progressBar?.clear?.();
        const nearest = this.findNearestChest(context);
        const snapshot = this.interaction.step({
            targetId: nearest?.getData?.('chestId') || null,
            durationMs: nearest?.getData?.('durationMs') || 0,
            deltaMs: delta,
            metadata: nearest ? { risk: nearest.getData('risk') } : null
        });

        const activeChest = this.chestById(snapshot.targetId);
        if (activeChest && this.isAvailable(activeChest) && snapshot.state !== 'completed') {
            this.drawProgress(activeChest, snapshot.progress);
        }

        const duration = context.config.duration || 120;
        const elapsed = context.state.elapsedSeconds || 0;
        if (!this.bossQueued && elapsed >= duration * this.config.bossSpawnRatio) {
            this.bossQueued = true;
            if (context.config.boss && !context.state.bossSpawned) {
                context.adapter.spawnBoss?.();
            } else {
                context.adapter.spawnEnemy?.({
                    id: 'chest_boss',
                    hp: 60,
                    speed: 45,
                    damage: 20,
                    radius: 26,
                    color: 0xf59e0b,
                    reward: { score: 30 }
                });
            }
        }
    }

    chestById(chestId) {
        if (!chestId) return null;
        return this.chests.find((chest) => chest?.getData?.('chestId') === chestId) || null;
    }

    handleInteractionEvent(context, event) {
        const chest = this.chestById(event.targetId);
        const risk = chest?.getData?.('risk') || event.metadata?.risk || null;
        if (event.type === 'started') {
            this.emitPresentation(context, 'channel_started', {
                targetId: event.targetId,
                risk,
                position: chest ? { x: chest.x, y: chest.y } : null,
                cueId: this.config.cues.start,
                callout: `${this.config.labels.channeling}: ${risk || ''}`.trim()
            });
        } else if (event.type === 'progressed') {
            if (chest) this.maybeSpawnGuards(context, chest, event.progress);
            this.updateObjectiveLabel(`${this.config.labels.channeling} ${Math.round(event.progress * 100)}%`);
        } else if (event.type === 'interrupted') {
            this.emitPresentation(context, 'channel_interrupted', {
                targetId: event.targetId,
                risk,
                position: chest ? { x: chest.x, y: chest.y } : null,
                reason: event.reason,
                policy: event.policy,
                cueId: this.config.cues.interrupted,
                callout: this.config.labels.interrupted
            });
            this.updateObjectiveLabel(this.config.labels.interrupted);
        } else if (event.type === 'completed' && chest) {
            this.openChest(context, chest);
        } else if (event.type === 'cancelled') {
            this.emitPresentation(context, 'channel_cancelled', {
                targetId: event.targetId,
                risk,
                reason: event.reason
            });
        }
    }

    maybeSpawnGuards(context, chest, progress) {
        const risk = chest.getData('risk');
        const tier = this.config.riskTiers[risk] || {};
        if (
            !Number.isFinite(tier.guardSpawnAt)
            || progress < tier.guardSpawnAt
            || chest.getData('guardsSpawned')
        ) {
            return;
        }

        chest.setData('guardsSpawned', true);
        const count = Math.max(0, Math.floor(tier.guardCount || 0));
        for (let index = 0; index < count; index += 1) {
            const enemy = context.adapter.spawnEnemy?.({ ...this.config.guardEnemy });
            const angle = (Math.PI * 2 * index) / Math.max(1, count);
            enemy?.setPosition?.(
                chest.x + Math.cos(angle) * 160,
                chest.y + Math.sin(angle) * 160
            );
            enemy?.setData?.('spawnSource', 'treasure_guard');
            this.guardsSpawned += enemy ? 1 : 0;
        }
        this.emitPresentation(context, 'guards_alerted', {
            targetId: chest.getData('chestId'),
            risk,
            position: { x: chest.x, y: chest.y },
            count,
            cueId: this.config.cues.guards,
            callout: this.config.labels.guards
        });
    }

    rewardForChest(chest) {
        const risk = chest.getData('risk');
        const tier = this.config.riskTiers[risk] || {};
        const multiplier = chest.getData('rewardMultiplier') || 1;
        const baseReward = {
            ...this.config.baseReward,
            score: Number.isFinite(this.config.rewardScore)
                ? this.config.rewardScore
                : this.config.baseReward?.score
        };
        const reward = {};
        for (const [key, value] of Object.entries(baseReward)) {
            if (Number.isFinite(value)) reward[key] = value * multiplier;
        }
        addReward(reward, tier.reward || {});
        return reward;
    }

    openChest(context, chest) {
        if (!this.isAvailable(chest)) return false;
        chest.setData('opened', true);
        chest.setTint?.(0x555555);
        this.openedCount += 1;
        const risk = chest.getData('risk');
        if (risk === 'high') this.highRiskOpened += 1;

        const reward = this.rewardForChest(chest);
        addReward(context.state.collectedRewards, reward);
        addReward(this.totalReward, reward);
        context.state.score += reward.score || 0;
        this.updateObjectiveLabel(this.config.labels.completed);
        this.emitPresentation(context, 'treasure_opened', {
            targetId: chest.getData('chestId'),
            risk,
            position: { x: chest.x, y: chest.y },
            reward,
            cueId: this.config.cues.completed,
            callout: this.config.labels.completed,
            vfx: { kind: 'reward_burst', color: this.config.riskTiers[risk]?.color }
        });

        if (this.config.finishOnRequiredOpen && this.openedCount >= this.config.requiredOpenCount) {
            context.helpers.end(true, 'completed');
        }
        return true;
    }

    emitPresentation(context, action, payload = {}) {
        const event = {
            source: 'treasure_chest_horde',
            action,
            accepted: true,
            ...payload
        };
        this.lastPresentation = event;
        context.helpers.emitPresentation?.(event);
    }

    drawProgress(chest, progress) {
        const width = 60;
        const x = chest.x - width / 2;
        const y = chest.y - 40;
        const color = this.config.riskTiers[chest.getData('risk')]?.color || this.config.color;
        this.progressBar
            ?.fillStyle?.(0x000000, 0.55)
            ?.fillRect?.(x, y, width, 8)
            ?.fillStyle?.(color, 1)
            ?.fillRect?.(x, y, width * Math.max(0, Math.min(1, progress)), 8);
    }

    updateObjectiveLabel(status = '') {
        const text = `${this.config.labels.objective} ${this.openedCount}/${this.config.requiredOpenCount}${status ? ` · ${status}` : ''}`;
        this.objectiveText?.setText?.(text);
    }

    uninstall() {
        if (!this.installed && !this.interaction) return;
        super.uninstall();
        this.unsubscribeDamage?.();
        this.unsubscribeDamage = null;
        this.timer?.remove?.(false);
        this.timer = null;
        this.interaction?.destroy();
        this.interaction = null;
        this.progressBar?.destroy?.();
        this.progressBar = null;
        this.objectiveText?.destroy?.();
        this.objectiveText = null;
        this.chests.forEach((chest) => chest.destroy?.());
        this.chests = [];
    }

    getTestState() {
        const channel = this.interaction?.getSnapshot?.() || null;
        const activeChest = this.chestById(channel?.targetId);
        return {
            ...super.getTestState(),
            chests: this.chests.filter((chest) => this.isAvailable(chest)).length,
            activeInteractable: activeChest ? {
                id: activeChest.getData('chestId'),
                risk: activeChest.getData('risk')
            } : null,
            channel,
            lastInterruptReason: channel?.lastInterruptReason || null,
            openedCount: this.openedCount,
            requiredOpenCount: this.config.requiredOpenCount,
            highRiskOpened: this.highRiskOpened,
            guardsSpawned: this.guardsSpawned,
            totalReward: { ...this.totalReward },
            lastPresentation: this.lastPresentation,
            bossQueued: this.bossQueued
        };
    }
}

export { DEFAULT_CONFIG as TREASURE_CHEST_HORDE_DEFAULT_CONFIG };
