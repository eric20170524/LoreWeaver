import GameplayModifier from '../../GameplayModifier.js';
import VFX from '../../../juice/VFX.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    intervalMs: 3000,
    warningDelayMs: 1000,
    strikeDurationMs: 180,
    radius: 50,
    damage: 20,
    warningColor: 0xffcc00,
    strikeColor: 0xff3333,
    alpha: 0.24,
    target: 'player'
});

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function pickPositive(primary, secondary, fallback) {
    const value = Number(primary ?? secondary);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default class HazardTelegraphModifier extends GameplayModifier {
    constructor(config = {}) {
        super({
            ...DEFAULT_CONFIG,
            ...config,
            warningDelayMs: pickPositive(config.warningMs, config.warningDelayMs, DEFAULT_CONFIG.warningDelayMs),
            strikeDurationMs: pickPositive(config.activeMs, config.strikeDurationMs, DEFAULT_CONFIG.strikeDurationMs)
        });
        this.timer = null;
        this.activeObjects = new Set();
    }

    install(context) {
        super.install(context);
        this.timer = context.scene.time.addEvent({
            delay: this.config.intervalMs,
            callback: () => this.spawnHazard(context),
            loop: true
        });
        context.lifecycle.trackTimer(this.timer);
    }

    spawnHazard(context) {
        if (!context.adapter.isRunning()) return;

        const point = this.pickPoint(context);
        const diameter = Math.round(this.config.radius * 2.4);
        let warning = VFX.spriteClip(context.scene, context.adapter?.runtimeArt, 'hazard_mark', point.x, point.y, {
            clip: 'loop',
            depth: 4,
            destroyOnComplete: false
        });
        if (warning) {
            warning.setDisplaySize?.(diameter, diameter);
        } else {
            warning = context.scene.add.circle(point.x, point.y, this.config.radius, this.config.warningColor, this.config.alpha);
            warning.setStrokeStyle?.(2, this.config.warningColor, 0.8);
        }
        this.activeObjects.add(warning);

        context.lifecycle.trackTimer(context.scene.time.delayedCall(this.config.warningDelayMs, () => {
            warning.destroy();
            this.activeObjects.delete(warning);
            this.strike(context, point);
        }));
    }

    pickPoint(context) {
        if (this.config.target === 'random') {
            return {
                x: Math.random() * context.adapter.world.width,
                y: Math.random() * context.adapter.world.height
            };
        }

        return {
            x: context.player.x,
            y: context.player.y
        };
    }

    strike(context, point) {
        if (!context.adapter.isRunning()) return;

        const strike = context.scene.add.circle(point.x, point.y, this.config.radius, this.config.strikeColor, this.config.alpha * 1.6);
        this.activeObjects.add(strike);

        if (distance(point, context.player) <= this.config.radius + context.config.player.radius) {
            context.helpers.damagePlayer(this.config.damage, NODE_RESULT_REASONS.HP_ZERO);
        }

        context.lifecycle.trackTimer(context.scene.time.delayedCall(this.config.strikeDurationMs, () => {
            strike.destroy();
            this.activeObjects.delete(strike);
        }));
    }

    uninstall(context) {
        super.uninstall(context);
        this.timer?.remove?.(false);
        this.timer = null;
        this.activeObjects.forEach((object) => object.destroy?.());
        this.activeObjects.clear();
    }
}

export { DEFAULT_CONFIG as HAZARD_TELEGRAPH_DEFAULT_CONFIG };
