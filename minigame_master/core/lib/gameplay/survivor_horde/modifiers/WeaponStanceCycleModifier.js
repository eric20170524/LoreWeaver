import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    meleeDurationSec: 5,
    rangedDurationSec: 5,
    meleeRadius: 92,
    meleeDamage: 4,
    meleeMaxTargets: 12,
    meleeColor: 0xff6b35,
    rangedBurstCount: 2,
    rangedDamageMultiplier: 1,
    announceStance: true
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
            .filter((enemy) => enemy?.active)
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

        targets.forEach(({ enemy }) => adapter.damageEnemy(enemy, damage));
        context.events?.emit?.('weapon-stance-attack', {
            stance: 'melee',
            hitCount: targets.length,
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
        super.uninstall(context);
        if (this._originalFireAtNearestEnemy && context?.adapter) {
            context.adapter.fireAtNearestEnemy = this._originalFireAtNearestEnemy;
        }
        this._originalFireAtNearestEnemy = null;
        this._lastStance = null;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            currentStance: this._lastStance,
            meleeDurationSec: this.config.meleeDurationSec,
            rangedDurationSec: this.config.rangedDurationSec
        };
    }
}

export { DEFAULT_CONFIG as WEAPON_STANCE_CYCLE_DEFAULT_CONFIG };
