import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    zoneRadius: 100,
    moveIntervalMs: 5000,
    speedCap: 50,
    silenceWeapon: true,
    color: 0x7c3aed,
    alpha: 0.28
});

export default class DebuffZoneModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.zone = null;
        this.moveTimer = null;
        this._baseSpeed = null;
        this._baseFire = null;
        this._silenced = false;
    }

    install(context) {
        super.install(context);
        this._baseSpeed = context.config.player.speed;
        this._baseFire = context.config.weapon.fireIntervalMs;

        const w = context.adapter.world.width;
        const h = context.adapter.world.height;
        this.zone = context.scene.add.circle(
            w * 0.5,
            h * 0.5,
            this.config.zoneRadius,
            this.config.color,
            this.config.alpha
        );
        this.zone.setStrokeStyle?.(2, this.config.color, 0.7);

        this.moveTimer = context.scene.time.addEvent({
            delay: this.config.moveIntervalMs,
            loop: true,
            callback: () => {
                if (!context.adapter.isRunning() || !this.zone) return;
                this.zone.x = 60 + Math.random() * (w - 120);
                this.zone.y = 60 + Math.random() * (h - 120);
            }
        });
        context.lifecycle.trackTimer(this.moveTimer);
    }

    update(context) {
        if (!this.zone || !context.adapter.isRunning() || !context.player) return;
        const d = Math.hypot(context.player.x - this.zone.x, context.player.y - this.zone.y);
        const inside = d <= this.config.zoneRadius + (context.config.player.radius || 14);

        if (inside && !this._silenced) {
            this._silenced = true;
            context.config.player.speed = this.config.speedCap;
            if (this.config.silenceWeapon) {
                context.config.weapon.fireIntervalMs = Math.max(this._baseFire * 3, 4000);
            }
            this.zone.setFillStyle(this.config.color, this.config.alpha * 1.6);
        } else if (!inside && this._silenced) {
            this._silenced = false;
            context.config.player.speed = this._baseSpeed;
            context.config.weapon.fireIntervalMs = this._baseFire;
            this.zone.setFillStyle(this.config.color, this.config.alpha);
        }
    }

    uninstall(context) {
        super.uninstall(context);
        this.moveTimer?.remove?.(false);
        this.moveTimer = null;
        this.zone?.destroy?.();
        this.zone = null;
        if (context?.config) {
            if (this._baseSpeed != null) context.config.player.speed = this._baseSpeed;
            if (this._baseFire != null) context.config.weapon.fireIntervalMs = this._baseFire;
        }
        this._silenced = false;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            silenced: this._silenced,
            zoneRadius: this.config.zoneRadius
        };
    }
}

export { DEFAULT_CONFIG as DEBUFF_ZONE_DEFAULT_CONFIG };
