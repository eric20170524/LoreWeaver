import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    intervalMs: 4200,
    warningDelayMs: 900,
    beamDurationMs: 220,
    width: 44,
    damage: 28,
    warningColor: 0xfacc15,
    beamColor: 0xf43f5e,
    alpha: 0.22,
    pattern: 'single',
    lanes: 3
});

function pointLineDistance(point, beam) {
    const dx = Math.cos(beam.angle);
    const dy = Math.sin(beam.angle);
    const relX = point.x - beam.x;
    const relY = point.y - beam.y;
    const along = relX * dx + relY * dy;
    const clamped = Math.max(-beam.length / 2, Math.min(beam.length / 2, along));
    const nearestX = beam.x + dx * clamped;
    const nearestY = beam.y + dy * clamped;
    return Math.hypot(point.x - nearestX, point.y - nearestY);
}

export default class LaserWarningModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.timer = null;
        this.activeObjects = new Set();
        this.lastPatternSize = 0;
    }

    install(context) {
        super.install(context);
        this.timer = context.scene.time.addEvent({
            delay: this.config.intervalMs,
            callback: () => this.spawnPattern(context),
            loop: true
        });
        context.lifecycle.trackTimer(this.timer);
    }

    spawnPattern(context) {
        if (!context.adapter.isRunning()) return;
        const beams = this.createBeams(context);
        this.lastPatternSize = beams.length;

        const warnings = beams.map((beam) => this.drawBeam(context, beam, this.config.warningColor, this.config.alpha));

        context.lifecycle.trackTimer(context.scene.time.delayedCall(this.config.warningDelayMs, () => {
            warnings.forEach((warning) => this.destroyObject(warning));
            this.strike(context, beams);
        }));
    }

    createBeams(context) {
        if (this.config.pattern === 'phase_barrage') {
            const beams = [];
            const lanes = Math.max(1, this.config.lanes || 3);
            for (let i = 0; i < lanes; i += 1) {
                const angle = i % 2 === 0 ? 0 : Math.PI / 2;
                const offsetRatio = (i + 1) / (lanes + 1);
                beams.push({
                    x: angle === 0 ? context.adapter.world.width / 2 : context.adapter.world.width * offsetRatio,
                    y: angle === 0 ? context.adapter.world.height * offsetRatio : context.adapter.world.height / 2,
                    angle,
                    length: angle === 0 ? context.adapter.world.width : context.adapter.world.height
                });
            }
            return beams;
        }

        const horizontal = Math.random() > 0.5;
        return [{
            x: horizontal ? context.adapter.world.width / 2 : context.player.x,
            y: horizontal ? context.player.y : context.adapter.world.height / 2,
            angle: horizontal ? 0 : Math.PI / 2,
            length: horizontal ? context.adapter.world.width : context.adapter.world.height
        }];
    }

    strike(context, beams) {
        if (!context.adapter.isRunning()) return;
        const strikes = beams.map((beam) => this.drawBeam(context, beam, this.config.beamColor, this.config.alpha * 1.8));

        const hit = beams.some((beam) => {
            const distance = pointLineDistance(context.player, beam);
            return distance <= (this.config.width / 2) + (context.config.player.radius || 0);
        });

        if (hit) {
            context.helpers.damagePlayer(this.config.damage, NODE_RESULT_REASONS.HP_ZERO);
        }

        context.lifecycle.trackTimer(context.scene.time.delayedCall(this.config.beamDurationMs, () => {
            strikes.forEach((strike) => this.destroyObject(strike));
        }));
    }

    drawBeam(context, beam, color, alpha) {
        const rect = context.scene.add.rectangle(beam.x, beam.y, beam.length, this.config.width, color, alpha)
            .setRotation(beam.angle);
        this.activeObjects.add(rect);
        return rect;
    }

    destroyObject(object) {
        object?.destroy?.();
        this.activeObjects.delete(object);
    }

    uninstall(context) {
        super.uninstall(context);
        this.timer?.remove?.(false);
        this.timer = null;
        this.activeObjects.forEach((object) => object.destroy?.());
        this.activeObjects.clear();
    }

    getTestState() {
        return {
            ...super.getTestState(),
            lastPatternSize: this.lastPatternSize
        };
    }
}

export { DEFAULT_CONFIG as LASER_WARNING_DEFAULT_CONFIG };
