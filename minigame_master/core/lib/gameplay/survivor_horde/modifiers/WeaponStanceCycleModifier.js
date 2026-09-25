import GameplayModifier from '../../GameplayModifier.js';
import VFX from '../../../juice/VFX.js';
import RunGrowthMilestonesModifier from './RunGrowthMilestonesModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    controlMode: 'timed',
    initialStance: 'melee',
    meleeDurationSec: 5,
    rangedDurationSec: 5,
    meleeRadius: 92,
    meleeDamage: 4,
    meleeMaxTargets: 12,
    meleeColor: 0x596c7b,
    meleeEffectTintFill: 0x596c7b,
    meleeEffectAlpha: 0.55,
    rangedBurstCount: 2,
    rangedDamageMultiplier: 1,
    rangedPlayerArtRole: null,
    announceStance: true,
    meleeLabel: 'MELEE',
    rangedLabel: 'RANGED',
    toggleHint: 'Q / SHIFT',
    showToggleButton: true,
    runGrowth: true,
    migrateLegacyFirstNodeGrowth: true,
    swapBurst: true,
    meleeSwapWindowSec: 1.5,
    meleeSwapDamageMultiplier: 1.3,
    meleeSwapRadiusMultiplier: 1.35,
    meleeSwapKnockbackResist: 0.3,
    rangedSwapShots: 3,
    rangedSwapCritMultiplier: 2
});

const DEFAULT_STANCE_GROWTH = Object.freeze({
    title: '架势熟练',
    scoreLabel: '战意',
    initialSkills: [
        { id: 'weapon_stance_cycle', label: '近远流转', level: 1 }
    ],
    milestones: [
        {
            id: 'melee_mastery',
            threshold: 4,
            skillId: 'melee_stance',
            label: '近战精进',
            level: 2,
            feedback: '近战精进：范围与威力提升',
            effects: [
                { target: 'modifier.weapon_stance_cycle.meleeDamage', op: 'multiply', value: 1.2 },
                { target: 'modifier.weapon_stance_cycle.meleeRadius', op: 'multiply', value: 1.08 }
            ]
        },
        {
            id: 'ranged_mastery',
            threshold: 8,
            skillId: 'ranged_stance',
            label: '远程精进',
            level: 1,
            feedback: '远程精进：追加连射',
            effects: [
                { target: 'modifier.weapon_stance_cycle.rangedBurstCount', op: 'add', value: 1 }
            ]
        }
    ]
});

function clampPositive(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default class WeaponStanceCycleModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this._originalFireAtNearestEnemy = null;
        this._originalSemanticActions = null;
        this._originalHandleSemanticInput = null;
        this._lastStance = null;
        this._stance = this.normalizeStance(this.config.initialStance);
        this._runGrowth = null;
        this._toggleButton = null;
        this._boundToggle = null;
        this._originalDamagePlayer = null;
        this._originalBulletOverlap = null;
        this._swapUntil = 0;
        this._swapStance = null;
        this._rangedSwapShots = 0;
    }

    isManual() {
        return String(this.config.controlMode || DEFAULT_CONFIG.controlMode).toLowerCase() === 'manual';
    }

    normalizeStance(value) {
        return String(value || '').toLowerCase() === 'ranged' ? 'ranged' : 'melee';
    }

    install(context) {
        super.install(context);
        const adapter = context.adapter;
        this._originalFireAtNearestEnemy = adapter.fireAtNearestEnemy.bind(adapter);
        this._originalSemanticActions = adapter.semanticActions?.bind(adapter);
        this._originalHandleSemanticInput = adapter.handleSemanticInput?.bind(adapter);
        this._boundToggle = (event) => {
            if (event?.repeat) return;
            this.toggleStance(context);
        };

        adapter.fireAtNearestEnemy = () => {
            if (!adapter.isRunning()) return;
            const stance = this.resolveStance(adapter.state.elapsedSeconds || 0);
            this.announceIfChanged(context, stance);

            if (stance === 'melee') {
                this.performMeleeSweep(context);
                return;
            }

            this.performRangedBurst(context);
        };

        adapter.semanticActions = () => {
            const actions = this._originalSemanticActions ? this._originalSemanticActions() : [];
            if (!actions.includes('toggle_stance')) actions.push('toggle_stance');
            return actions;
        };
        adapter.handleSemanticInput = (payload = {}) => {
            if (String(payload?.action || '').trim() === 'toggle_stance') {
                return this.toggleStance(context);
            }
            if (this._originalHandleSemanticInput) {
                return this._originalHandleSemanticInput(payload);
            }
            return { action: payload?.action, accepted: false };
        };
        adapter.toggleWeaponStance = () => this.toggleStance(context);

        if (typeof adapter.damagePlayer === 'function') {
            this._originalDamagePlayer = adapter.damagePlayer.bind(adapter);
            adapter.damagePlayer = (amount, reason) => {
                let next = amount;
                if (this.isMeleeSwapActive(adapter) && Number.isFinite(next)) {
                    next *= 1 - clampPositive(this.config.meleeSwapKnockbackResist, 0);
                    if (next < 0) next = 0;
                }
                return this._originalDamagePlayer(next, reason);
            };
        }
        if (typeof adapter.handleBulletEnemyOverlap === 'function') {
            this._originalBulletOverlap = adapter.handleBulletEnemyOverlap.bind(adapter);
            adapter.handleBulletEnemyOverlap = (bullet, enemy) => {
                if (bullet?.getData?.('pierce')) {
                    if (!adapter.isRunning() || !bullet?.active || !adapter.isEnemyTargetable?.(enemy)) return;
                    const hit = bullet._piercedIds || (bullet._piercedIds = new Set());
                    const id = enemy.getData?.('id') || enemy;
                    if (hit.has(id)) return;
                    hit.add(id);
                    adapter.damageEnemy(enemy, bullet.getData('damage') || adapter.config.weapon.bulletDamage);
                    return;
                }
                return this._originalBulletOverlap(bullet, enemy);
            };
        }

        this.bindToggleInput(context);
        this.mountToggleButton(context);
        this.announceIfChanged(context, this._stance);

        if (this.config.runGrowth !== false) {
            const growthConfig = this.config.runGrowth && typeof this.config.runGrowth === 'object'
                ? { ...DEFAULT_STANCE_GROWTH, ...this.config.runGrowth }
                : DEFAULT_STANCE_GROWTH;
            this._runGrowth = new RunGrowthMilestonesModifier(growthConfig);
            this._runGrowth.id = 'run_growth_milestones';
            this._runGrowth.install(context);
        }
    }

    bindToggleInput(context) {
        const keyboard = context.scene?.input?.keyboard;
        if (!keyboard || !this.isManual()) return;
        const bind = (eventName) => {
            if (context.lifecycle?.trackListener) {
                context.lifecycle.trackListener(keyboard, eventName, this._boundToggle);
                return;
            }
            if (typeof keyboard.on === 'function') keyboard.on(eventName, this._boundToggle);
        };
        bind('keydown-Q');
        bind('keydown-SHIFT');
    }

    mountToggleButton(context) {
        if (!this.isManual() || this.config.showToggleButton === false) return;
        const scene = context.scene;
        if (!scene?.add?.text) return;
        const width = scene.scale?.width || 720;
        const height = scene.scale?.height || 1280;
        this._toggleButton = scene.add.text(width - 70, height * 0.58, this.toggleButtonLabel(), {
            fontFamily: 'Inter, sans-serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#fff7ed',
            backgroundColor: 'rgba(15, 23, 42, 0.82)',
            padding: { x: 14, y: 10 },
            align: 'right'
        });
        this._toggleButton.setOrigin?.(1, 0.5);
        this._toggleButton.setDepth?.(40);
        this._toggleButton.setScrollFactor?.(0);
        this._toggleButton.setInteractive?.({ useHandCursor: true });
        this._toggleButton.on?.('pointerdown', (pointer) => {
            pointer?.event?.stopPropagation?.();
            this.toggleStance(context);
        });
        context.lifecycle?.addCleanup?.(() => {
            this._toggleButton?.destroy?.();
            this._toggleButton = null;
        });
    }

    toggleButtonLabel() {
        const stance = this._stance === 'ranged' ? this.config.rangedLabel : this.config.meleeLabel;
        const hint = this.config.toggleHint ? `\n${this.config.toggleHint}` : '';
        return `${stance} · 点按${hint}`;
    }

    refreshToggleButton() {
        this._toggleButton?.setText?.(this.toggleButtonLabel());
    }

    toggleStance(context) {
        if (!this.isManual()) {
            return { action: 'toggle_stance', accepted: false, stance: this.resolveStance(context?.adapter?.state?.elapsedSeconds || 0) };
        }
        this._stance = this._stance === 'melee' ? 'ranged' : 'melee';
        this.announceIfChanged(context, this._stance);
        this.refreshToggleButton();
        context?.adapter?.updateObservationState?.({
            semanticAction: { action: 'toggle_stance', stance: this._stance }
        });
        return { action: 'toggle_stance', accepted: true, stance: this._stance };
    }

    update(context, time, delta) {
        this._runGrowth?.update(context, time, delta);
    }

    resolveStance(elapsedSeconds) {
        if (this.isManual()) return this._stance;
        const meleeDuration = clampPositive(this.config.meleeDurationSec, DEFAULT_CONFIG.meleeDurationSec);
        const rangedDuration = clampPositive(this.config.rangedDurationSec, DEFAULT_CONFIG.rangedDurationSec);
        const cycleDuration = meleeDuration + rangedDuration;
        const cursor = elapsedSeconds % cycleDuration;
        this._stance = cursor < meleeDuration ? 'melee' : 'ranged';
        return this._stance;
    }

    announceIfChanged(context, stance) {
        if (this._lastStance === stance) return;
        const previous = this._lastStance;
        this._lastStance = stance;
        if (this.config.rangedPlayerArtRole && context?.adapter?.player) {
            const adapter = context.adapter;
            adapter.playerArtRole = stance === 'ranged' ? this.config.rangedPlayerArtRole : 'player';
            adapter.playerClip = 'idle';
            adapter.playPlayerClip?.('idle', { repeat: -1, frameRate: 4 });
        }
        if (previous && this.isManual() && this.config.swapBurst !== false) {
            this.beginSwapBurst(context?.adapter, stance);
        }
        if (!this.config.announceStance) return;

        context.events?.emit?.('presentation', {
            kind: 'weapon-stance',
            stance,
            label: stance === 'melee' ? this.config.meleeLabel : this.config.rangedLabel,
            swapBurst: this.isMeleeSwapActive(context?.adapter) || this._rangedSwapShots > 0
        });
    }

    beginSwapBurst(adapter, stance) {
        const elapsed = Number(adapter?.state?.elapsedSeconds || 0);
        this._swapStance = stance;
        if (stance === 'melee') {
            this._swapUntil = elapsed + clampPositive(this.config.meleeSwapWindowSec, DEFAULT_CONFIG.meleeSwapWindowSec);
            this._rangedSwapShots = 0;
        } else {
            this._swapUntil = 0;
            this._rangedSwapShots = Math.max(0, Math.floor(Number(this.config.rangedSwapShots) || 0));
        }
    }

    isMeleeSwapActive(adapter) {
        return this._swapStance === 'melee'
            && Number(adapter?.state?.elapsedSeconds || 0) < this._swapUntil;
    }

    performMeleeSweep(context) {
        const { adapter, scene, player, groups } = context;
        if (!player || !groups?.enemies) return;

        const swap = this.isMeleeSwapActive(adapter);
        const radius = clampPositive(this.config.meleeRadius, DEFAULT_CONFIG.meleeRadius)
            * (swap ? clampPositive(this.config.meleeSwapRadiusMultiplier, 1) : 1);
        const damage = clampPositive(this.config.meleeDamage, DEFAULT_CONFIG.meleeDamage)
            * (swap ? clampPositive(this.config.meleeSwapDamageMultiplier, 1) : 1);
        const maxTargets = Math.max(1, Math.floor(clampPositive(
            this.config.meleeMaxTargets,
            DEFAULT_CONFIG.meleeMaxTargets
        )));

        const targets = groups.enemies.getChildren()
            .filter((enemy) => adapter.isEnemyTargetable(enemy))
            .map((enemy) => ({
                enemy,
                distance: Math.hypot(enemy.x - player.x, enemy.y - player.y)
            }))
            .filter((entry) => entry.distance <= radius)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, maxTargets);

        adapter.playPlayerClip?.('attack', { repeat: 0, frameRate: 12 });

        const color = Number(this.config.meleeColor ?? DEFAULT_CONFIG.meleeColor);
        const slashSprite = VFX.spriteClip(scene, adapter.runtimeArt, 'black_blade', player.x, player.y, {
            clip: 'impact',
            depth: 1.5
        });
        if (slashSprite) {
            const diameter = Math.max(48, radius * 2.2);
            slashSprite.setDisplaySize?.(diameter, diameter);
            slashSprite.setFlipX?.(Boolean(player.flipX));
            if (this.config.meleeEffectTintFill != null && Number.isFinite(Number(this.config.meleeEffectTintFill))) {
                // Phaser 4 TintModes.FILL = 1; preserve atlas alpha while replacing fire-orange pixels.
                slashSprite.setTint?.(Number(this.config.meleeEffectTintFill));
                slashSprite.setTintMode?.(1);
            }
            if (this.config.meleeEffectAlpha != null && Number.isFinite(Number(this.config.meleeEffectAlpha))) {
                slashSprite.setAlpha?.(Math.max(0, Math.min(1, Number(this.config.meleeEffectAlpha))));
            }
        } else {
            const fadeSlash = (node, scale) => {
                if (!node) return;
                if (scene.tweens?.add) {
                    scene.tweens.add({
                        targets: node,
                        alpha: 0,
                        scale,
                        duration: 340,
                        onComplete: () => node.destroy?.()
                    });
                } else {
                    node.destroy?.();
                }
            };
            const slash = scene.add?.circle?.(player.x, player.y, Math.max(12, radius * 0.72), color, 0.35);
            slash?.setStrokeStyle?.(8, color, 0.95);
            slash?.setDepth?.(1.5);
            const ring = scene.add?.circle?.(player.x, player.y, radius, color, 0);
            ring?.setStrokeStyle?.(6, 0xffe08a, 0.9);
            ring?.setDepth?.(1.5);
            fadeSlash(slash, 1.35);
            fadeSlash(ring, 1.18);
        }

        const hitCount = targets.reduce((count, { enemy }) => (
            count + (adapter.damageEnemy(enemy, damage) ? 1 : 0)
        ), 0);
        context.events?.emit?.('weapon-stance-attack', {
            stance: 'melee',
            hitCount,
            damage,
            radius,
            swapBurst: swap
        });
    }

    performRangedBurst(context) {
        if (!this._originalFireAtNearestEnemy) return;
        const adapter = context.adapter;
        const burstCount = Math.max(1, Math.floor(clampPositive(
            this.config.rangedBurstCount,
            DEFAULT_CONFIG.rangedBurstCount
        )));
        const multiplier = clampPositive(
            this.config.rangedDamageMultiplier,
            DEFAULT_CONFIG.rangedDamageMultiplier
        );
        const originalDamage = adapter.config.weapon.bulletDamage;
        adapter.config.weapon.bulletDamage = originalDamage * multiplier;

        const groups = adapter.groups?.bullets;
        let critShots = 0;
        try {
            for (let i = 0; i < burstCount; i += 1) {
                const before = groups?.getChildren?.()?.length || 0;
                const crit = this._rangedSwapShots > 0;
                if (crit) {
                    adapter.config.weapon.bulletDamage = originalDamage * multiplier
                        * clampPositive(this.config.rangedSwapCritMultiplier, 1);
                    this._rangedSwapShots -= 1;
                    critShots += 1;
                } else {
                    adapter.config.weapon.bulletDamage = originalDamage * multiplier;
                }
                this._originalFireAtNearestEnemy();
                if (crit && groups?.getChildren) {
                    const bullets = groups.getChildren();
                    const newest = bullets[bullets.length - 1];
                    if (newest && bullets.length > before) newest.setData?.('pierce', true);
                }
            }
        } finally {
            adapter.config.weapon.bulletDamage = originalDamage;
        }

        context.events?.emit?.('weapon-stance-attack', {
            stance: 'ranged',
            burstCount,
            damageMultiplier: multiplier,
            swapBurst: critShots > 0,
            critShots
        });
    }

    uninstall(context) {
        this._runGrowth?.uninstall(context);
        this._runGrowth = null;
        const adapter = context?.adapter;
        if (this._originalFireAtNearestEnemy && adapter) {
            adapter.fireAtNearestEnemy = this._originalFireAtNearestEnemy;
        }
        if (this._originalSemanticActions && adapter) {
            adapter.semanticActions = this._originalSemanticActions;
        }
        if (this._originalHandleSemanticInput && adapter) {
            adapter.handleSemanticInput = this._originalHandleSemanticInput;
        }
        if (this._originalDamagePlayer && adapter) {
            adapter.damagePlayer = this._originalDamagePlayer;
        }
        if (this._originalBulletOverlap && adapter) {
            adapter.handleBulletEnemyOverlap = this._originalBulletOverlap;
        }
        if (adapter) delete adapter.toggleWeaponStance;
        if (adapter?.playerArtRole && this.config.rangedPlayerArtRole) {
            adapter.playerArtRole = 'player';
        }
        this._toggleButton?.destroy?.();
        this._toggleButton = null;
        this._originalFireAtNearestEnemy = null;
        this._originalSemanticActions = null;
        this._originalHandleSemanticInput = null;
        this._originalDamagePlayer = null;
        this._originalBulletOverlap = null;
        this._boundToggle = null;
        this._lastStance = null;
        this._swapUntil = 0;
        this._swapStance = null;
        this._rangedSwapShots = 0;
        super.uninstall(context);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            controlMode: this.config.controlMode,
            currentStance: this._lastStance || this._stance,
            meleeDurationSec: this.config.meleeDurationSec,
            rangedDurationSec: this.config.rangedDurationSec,
            swapBurst: this.config.swapBurst,
            rangedSwapShots: this._rangedSwapShots,
            meleeSwapUntil: this._swapUntil,
            runGrowth: this._runGrowth?.getTestState?.() || null
        };
    }
}

export { DEFAULT_CONFIG as WEAPON_STANCE_CYCLE_DEFAULT_CONFIG };
