import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    chance: 0.3,
    speed: 120,
    damage: 20,
    triggerRadius: 36,
    color: 0xf97316,
    fuseMs: 350
});

/**
 * Randomly marks spawned enemies as self-destruct units that explode near the player.
 */
export default class SelfDestructEnemyModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this._originalSpawn = null;
        this.fusing = new Set();
    }

    install(context) {
        super.install(context);
        this._originalSpawn = context.adapter.spawnEnemy.bind(context.adapter);
        const self = this;
        context.adapter.spawnEnemy = function patchedSpawn(patch = {}) {
            let enemy;
            if (Math.random() < self.config.chance) {
                enemy = self._originalSpawn({
                    id: 'self_destruct',
                    speed: self.config.speed,
                    damage: self.config.damage,
                    color: self.config.color,
                    hp: patch.hp || 3,
                    radius: patch.radius || 12,
                    reward: { score: 3 },
                    ...patch
                });
                enemy.setData?.('selfDestruct', true);
            } else {
                enemy = self._originalSpawn(patch);
            }
            return enemy;
        };
    }

    update(context) {
        if (!this.installed || !context.adapter.isRunning() || !context.player) return;
        context.groups.enemies.getChildren().forEach((enemy) => {
            if (!enemy.active || !enemy.getData?.('selfDestruct')) return;
            if (this.fusing.has(enemy)) return;
            const d = Math.hypot(enemy.x - context.player.x, enemy.y - context.player.y);
            if (d <= this.config.triggerRadius) {
                this.fusing.add(enemy);
                enemy.setFillStyle?.(0xfafafa, 1);
                context.lifecycle.trackTimer(context.scene.time.delayedCall(this.config.fuseMs, () => {
                    if (!enemy.active) return;
                    const blast = context.scene.add.circle(enemy.x, enemy.y, this.config.triggerRadius + 10, 0xf97316, 0.45);
                    context.lifecycle.trackTimer(context.scene.time.delayedCall(180, () => blast.destroy()));
                    if (Math.hypot(context.player.x - enemy.x, context.player.y - enemy.y) <= this.config.triggerRadius + 16) {
                        context.helpers.damagePlayer(this.config.damage, NODE_RESULT_REASONS.HP_ZERO);
                    }
                    enemy.destroy();
                    this.fusing.delete(enemy);
                }));
            }
        });
    }

    uninstall(context) {
        super.uninstall(context);
        if (this._originalSpawn && context?.adapter) {
            context.adapter.spawnEnemy = this._originalSpawn;
        }
        this.fusing.clear();
    }

    getTestState() {
        return { ...super.getTestState(), chance: this.config.chance };
    }
}

export { DEFAULT_CONFIG as SELF_DESTRUCT_ENEMY_DEFAULT_CONFIG };
