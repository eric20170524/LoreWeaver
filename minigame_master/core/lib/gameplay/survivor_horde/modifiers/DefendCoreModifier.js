import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    hp: 100,
    radius: 40,
    x: 'center',
    y: 'center',
    color: 0x33ccff,
    alpha: 0.32,
    enemyDamage: 10,
    aggro: true
});

function resolvePosition(value, size) {
    if (value === 'center') return size / 2;
    if (typeof value === 'number') return value;
    return size / 2;
}

export default class DefendCoreModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.hp = this.config.hp;
        this.core = null;
        this.previousTargetSelector = null;
    }

    install(context) {
        super.install(context);
        this.hp = this.config.hp;
        const x = resolvePosition(this.config.x, context.adapter.world.width);
        const y = resolvePosition(this.config.y, context.adapter.world.height);

        this.core = context.scene.add.circle(x, y, this.config.radius, this.config.color, this.config.alpha);
        this.core.setStrokeStyle?.(3, this.config.color, 0.9);

        if (this.config.aggro) {
            this.previousTargetSelector = context.adapter.enemyTargetSelector;
            context.adapter.setEnemyTargetSelector((enemy, runtimeContext) => {
                if (this.previousTargetSelector) {
                    return this.previousTargetSelector(enemy, runtimeContext) || this.core;
                }
                return this.core;
            });
        }
    }

    update(context) {
        if (!this.core || !context.adapter.isRunning()) return;

        context.groups.enemies.getChildren().forEach((enemy) => {
            if (!enemy.active) return;
            const enemyRadius = enemy.getData('radius') || enemy.radius || 10;
            const distance = Math.hypot(enemy.x - this.core.x, enemy.y - this.core.y);
            if (distance <= this.config.radius + enemyRadius) {
                enemy.destroy();
                this.hp = Math.max(this.hp - this.config.enemyDamage, 0);
                context.helpers.publishTestState();
                if (this.hp <= 0) {
                    context.helpers.end(false, NODE_RESULT_REASONS.CONDITION_FAILED);
                }
            }
        });
    }

    uninstall(context) {
        super.uninstall(context);
        this.core?.destroy?.();
        this.core = null;
        if (this.config.aggro) {
            context.adapter.setEnemyTargetSelector(this.previousTargetSelector);
        }
    }

    getTestState() {
        return {
            ...super.getTestState(),
            hp: this.hp
        };
    }
}

export { DEFAULT_CONFIG as DEFEND_CORE_DEFAULT_CONFIG };
