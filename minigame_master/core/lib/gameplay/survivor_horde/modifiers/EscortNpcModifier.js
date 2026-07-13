import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    allyName: 'Escort Ally',
    hp: 100,
    radius: 20,
    speed: 34,
    start: { x: 0.15, y: 0.5 },
    end: { x: 0.85, y: 0.5 },
    color: 0x38bdf8,
    alpha: 0.88,
    enemyDamage: 10,
    aggro: true,
    allyAura: false,
    auraRadius: 110,
    auraColor: 0x60a5fa,
    finishOnArrival: true
});

function resolvePoint(point, world) {
    return {
        x: typeof point.x === 'number' && point.x <= 1 ? point.x * world.width : point.x,
        y: typeof point.y === 'number' && point.y <= 1 ? point.y * world.height : point.y
    };
}

export default class EscortNpcModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.hp = this.config.hp;
        this.npc = null;
        this.aura = null;
        this.label = null;
        this.previousTargetSelector = null;
        this.progress = 0;
    }

    install(context) {
        super.install(context);
        this.hp = this.config.hp;
        this.start = resolvePoint(this.config.start, context.adapter.world);
        this.end = resolvePoint(this.config.end, context.adapter.world);
        this.npc = context.helpers.createCircle(this.start.x, this.start.y, this.config.radius, this.config.color, this.config.alpha);
        this.npc.setData('escortNpc', true);

        if (this.config.allyAura) {
            this.aura = context.scene.add.circle(this.npc.x, this.npc.y, this.config.auraRadius, this.config.auraColor, 0.12);
            this.aura.setStrokeStyle?.(2, this.config.auraColor, 0.35);
        }

        this.label = context.scene.add.text(this.npc.x, this.npc.y - this.config.radius - 14, this.config.allyName, {
            fontSize: '12px',
            color: '#dbeafe'
        }).setOrigin(0.5);

        if (this.config.aggro) {
            this.previousTargetSelector = context.adapter.enemyTargetSelector;
            context.adapter.setEnemyTargetSelector((enemy, runtimeContext) => {
                if (this.previousTargetSelector) {
                    return this.previousTargetSelector(enemy, runtimeContext) || this.npc;
                }
                return this.npc;
            });
        }
    }

    update(context, _time, delta = 16) {
        if (!this.npc || !context.adapter.isRunning()) return;
        this.moveNpc(context, delta);
        this.damageFromEnemies(context);
        this.syncVisuals();
        context.helpers.publishTestState();
    }

    moveNpc(context, delta) {
        const dx = this.end.x - this.npc.x;
        const dy = this.end.y - this.npc.y;
        const distance = Math.hypot(dx, dy);
        const totalDistance = Math.max(Math.hypot(this.end.x - this.start.x, this.end.y - this.start.y), 1);

        this.progress = Math.max(0, Math.min(1, 1 - (distance / totalDistance)));

        if (distance <= 4) {
            this.npc.body?.setVelocity?.(0, 0);
            this.progress = 1;
            if (this.config.finishOnArrival) {
                context.helpers.end(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            }
            return;
        }

        const step = Math.min(distance, this.config.speed * (delta / 1000));
        this.npc.x += (dx / distance) * step;
        this.npc.y += (dy / distance) * step;
        this.npc.body?.reset?.(this.npc.x, this.npc.y);
    }

    damageFromEnemies(context) {
        context.groups.enemies.getChildren().forEach((enemy) => {
            if (!enemy.active) return;
            const enemyRadius = enemy.getData('radius') || enemy.radius || 10;
            const distance = Math.hypot(enemy.x - this.npc.x, enemy.y - this.npc.y);
            if (distance > this.config.radius + enemyRadius) return;

            enemy.destroy();
            this.hp = Math.max(this.hp - this.config.enemyDamage, 0);
            if (this.hp <= 0) {
                context.helpers.end(false, NODE_RESULT_REASONS.CONDITION_FAILED);
            }
        });
    }

    syncVisuals() {
        this.aura?.setPosition?.(this.npc.x, this.npc.y);
        this.label?.setPosition?.(this.npc.x, this.npc.y - this.config.radius - 14);
    }

    uninstall(context) {
        super.uninstall(context);
        this.npc?.destroy?.();
        this.aura?.destroy?.();
        this.label?.destroy?.();
        this.npc = null;
        this.aura = null;
        this.label = null;
        if (this.config.aggro) {
            context.adapter.setEnemyTargetSelector(this.previousTargetSelector);
        }
    }

    getTestState() {
        return {
            ...super.getTestState(),
            hp: this.hp,
            progress: this.progress
        };
    }
}

export { DEFAULT_CONFIG as ESCORT_NPC_DEFAULT_CONFIG };
