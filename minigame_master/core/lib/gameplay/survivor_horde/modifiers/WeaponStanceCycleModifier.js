import GameplayModifier from '../../GameplayModifier.js';
import RunGrowthMilestonesModifier from './RunGrowthMilestonesModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    meleeDurationSec: 5,
    rangedDurationSec: 5,
    meleeRadius: 92,
    meleeDamage: 4,
    meleeMaxTargets: 12,
    meleeColor: 0xff6b35,
    rangedBurstCount: 2,
    rangedDamageMultiplier: 1,
    announceStance: true,
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
        this._lastStance = null;
        this._runGrowth = null;
    }

    install(context) {
        super.install(context);
        const adapter = context.adapter;
        this._originalFireAtNearestEnemy = adapter.fireAtNearestEnemy.bind(adapter);

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

        // Compatibility bridge: GameRunner still contains a legacy, IP-specific
        // first-node growth loop. When this reusable stance modifier is active on
        // that node, migrate ownership to the manifest/modifier layer immediately
        // so legacy skill names and mutations never reach the playable loop.
        if (this.config.migrateLegacyFirstNodeGrowth !== false && context.scene?.runGrowthState?.enabled) {
            const growthConfig = this.config.runGrowth && typeof this.config.runGrowth === 'object'
                ? { ...DEFAULT_STANCE_GROWTH, ...this.config.runGrowth }
                : DEFAULT_STANCE_GROWTH;
            this._runGrowth = new RunGrowthMilestonesModifier(growthConfig);
            this._runGrowth.id = 'run_growth_milestones';
            this._runGrowth.install(context);
        }
    }

    update(context, time, delta) {
        this._runGrowth?.update(context, time, delta);
    }

    resolveStance(elapsedSeconds) {
        const meleeDuration = clampPositive(this.config.meleeDurationSec, DEFAULT_CONFIG.meleeDurationSec);
        const rangedDuration = clampPositive(this.config.rangedDurationSec, DEFAULT_CONFIG.rangedDurationSec);
        const cycleDuration = meleeDuration + rangedDuration;
        const cursor = elapsedSeconds % cycleDuration;
        return cursor < meleeDuration ? 'melee' : 'ranged';
    }

    announceIfChanged(context, stance) {
        if (this._lastStance === stance) return;
        this._lastStance = stance;
        if (!this.config.announceStance) return;

        context.events?.emit?.('presentation', {
            kind: 'weapon-stance',
            stance,
            label: stance === 'melee' ? 'MELEE' : 'RANGED'
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
        if (this._originalFireAtNearestEnemy && context?.adapter) {
            context.adapter.fireAtNearestEnemy = this._originalFireAtNearestEnemy;
        }
        this._originalFireAtNearestEnemy = null;
        this._lastStance = null;
        super.uninstall(context);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            currentStance: this._lastStance,
            meleeDurationSec: this.config.meleeDurationSec,
            rangedDurationSec: this.config.rangedDurationSec,
            runGrowth: this._runGrowth?.getTestState?.() || null
        };
    }
}

export { DEFAULT_CONFIG as WEAPON_STANCE_CYCLE_DEFAULT_CONFIG };
