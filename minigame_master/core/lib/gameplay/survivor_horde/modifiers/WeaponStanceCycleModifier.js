import GameplayModifier from '../../GameplayModifier.js';
import RunGrowthMilestonesModifier from './RunGrowthMilestonesModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    controlMode: 'timed',
    initialStance: 'melee',
    meleeDurationSec: 5,
    rangedDurationSec: 5,
    meleeRadius: 92,
    meleeDamage: 4,
    meleeMaxTargets: 12,
    meleeColor: 0xff6b35,
    rangedBurstCount: 2,
    rangedDamageMultiplier: 1,
    announceStance: true,
    meleeLabel: 'MELEE',
    rangedLabel: 'RANGED',
    toggleHint: 'Q / SHIFT',
    showToggleButton: true,
    runGrowth: true,
    migrateLegacyFirstNodeGrowth: true
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
        this._toggleButton = scene.add.text(width - 24, height * 0.58, this.toggleButtonLabel(), {
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#fff7ed',
            backgroundColor: 'rgba(15, 23, 42, 0.82)',
            padding: { x: 10, y: 8 },
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
        return `${stance}${hint}`;
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
        this._lastStance = stance;
        if (!this.config.announceStance) return;

        context.events?.emit?.('presentation', {
            kind: 'weapon-stance',
            stance,
            label: stance === 'melee' ? this.config.meleeLabel : this.config.rangedLabel
        });
    }

    performMeleeSweep(context) {
        const { adapter, scene, player, groups } = context;
        if (!player || !groups?.enemies) return;

        const radius = clampPositive(this.config.meleeRadius, DEFAULT_CONFIG.meleeRadius);
        const damage = clampPositive(this.config.meleeDamage, DEFAULT_CONFIG.meleeDamage);
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

        adapter.runtimeArt?.playClip?.(player, 'player', 'attack', { repeat: 0, frameRate: 12 });

        const color = Number(this.config.meleeColor ?? DEFAULT_CONFIG.meleeColor);
        const slash = scene.add?.circle?.(player.x, player.y, radius, color, 0.05);
        slash?.setStrokeStyle?.(4, color, 0.8);
        slash?.setDepth?.(4);
        if (slash && scene.tweens?.add) {
            scene.tweens.add({
                targets: slash,
                alpha: 0,
                scale: 1.12,
                duration: 180,
                onComplete: () => slash.destroy?.()
            });
        } else {
            slash?.destroy?.();
        }

        const hitCount = targets.reduce((count, { enemy }) => (
            count + (adapter.damageEnemy(enemy, damage) ? 1 : 0)
        ), 0);
        context.events?.emit?.('weapon-stance-attack', {
            stance: 'melee',
            hitCount,
            damage,
            radius
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

        try {
            for (let i = 0; i < burstCount; i += 1) {
                this._originalFireAtNearestEnemy();
            }
        } finally {
            adapter.config.weapon.bulletDamage = originalDamage;
        }

        context.events?.emit?.('weapon-stance-attack', {
            stance: 'ranged',
            burstCount,
            damageMultiplier: multiplier
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
        if (adapter) delete adapter.toggleWeaponStance;
        this._toggleButton?.destroy?.();
        this._toggleButton = null;
        this._originalFireAtNearestEnemy = null;
        this._originalSemanticActions = null;
        this._originalHandleSemanticInput = null;
        this._boundToggle = null;
        this._lastStance = null;
        super.uninstall(context);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            controlMode: this.config.controlMode,
            currentStance: this._lastStance || this._stance,
            meleeDurationSec: this.config.meleeDurationSec,
            rangedDurationSec: this.config.rangedDurationSec,
            runGrowth: this._runGrowth?.getTestState?.() || null
        };
    }
}

export { DEFAULT_CONFIG as WEAPON_STANCE_CYCLE_DEFAULT_CONFIG };
