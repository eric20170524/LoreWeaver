import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    intervalMs: 1000,
    baseDamage: 3,
    scalingStep: 1,
    scalingEverySeconds: 30,
    maxDamage: 18,
    hpDrain: 'flat',
    color: 0x22c55e,
    alpha: 0.1,
    requiresAntidoteElite: false,
    antidoteRewardKey: 'antidote',
    antidoteReliefTicks: 3,
    eliteIntervalMs: 9000,
    elite: {
        id: 'antidote_elite',
        hp: 8,
        speed: 58,
        damage: 8,
        radius: 16,
        color: 0x86efac,
        reward: { antidote: 1, score: 3 }
    }
});

export default class PoisonFogModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.overlay = null;
        this.drainTimer = null;
        this.eliteTimer = null;
        this.consumedAntidotes = 0;
        this.reliefTicks = 0;
        this.lastDamage = 0;
    }

    install(context) {
        super.install(context);
        this.overlay = context.scene.add.rectangle(
            context.adapter.world.width / 2,
            context.adapter.world.height / 2,
            context.adapter.world.width,
            context.adapter.world.height,
            this.config.color,
            this.config.alpha
        );
        this.overlay.setDepth?.(2);

        this.drainTimer = context.scene.time.addEvent({
            delay: this.config.intervalMs,
            callback: () => this.drain(context),
            loop: true
        });
        context.lifecycle.trackTimer(this.drainTimer);

        if (this.config.requiresAntidoteElite) {
            this.eliteTimer = context.scene.time.addEvent({
                delay: this.config.eliteIntervalMs,
                callback: () => this.spawnAntidoteElite(context),
                loop: true
            });
            context.lifecycle.trackTimer(this.eliteTimer);
        }
    }

    drain(context) {
        if (!context.adapter.isRunning()) return;
        this.consumeAntidotes(context);

        if (this.reliefTicks > 0) {
            this.reliefTicks -= 1;
            this.lastDamage = 0;
            context.helpers.publishTestState();
            return;
        }

        const damage = this.getDamage(context);
        this.lastDamage = damage;
        context.helpers.damagePlayer(damage, NODE_RESULT_REASONS.HP_ZERO);
        context.helpers.publishTestState();
    }

    consumeAntidotes(context) {
        if (!this.config.requiresAntidoteElite) return;
        const available = context.state.collectedRewards[this.config.antidoteRewardKey] || 0;
        if (available <= this.consumedAntidotes) return;
        this.consumedAntidotes += 1;
        this.reliefTicks += this.config.antidoteReliefTicks;
    }

    getDamage(context) {
        if (this.config.hpDrain !== 'scaling') return this.config.baseDamage;
        const steps = Math.floor((context.state.elapsedSeconds || 0) / this.config.scalingEverySeconds);
        return Math.min(this.config.baseDamage + steps * this.config.scalingStep, this.config.maxDamage);
    }

    spawnAntidoteElite(context) {
        if (!context.adapter.isRunning()) return;
        context.adapter.spawnEnemy(this.config.elite);
    }

    uninstall(context) {
        super.uninstall(context);
        this.overlay?.destroy?.();
        this.overlay = null;
        this.drainTimer?.remove?.(false);
        this.eliteTimer?.remove?.(false);
        this.drainTimer = null;
        this.eliteTimer = null;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            consumedAntidotes: this.consumedAntidotes,
            reliefTicks: this.reliefTicks,
            lastDamage: this.lastDamage
        };
    }
}

export { DEFAULT_CONFIG as POISON_FOG_DEFAULT_CONFIG };
