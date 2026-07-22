import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    wallHp: 100,
    wallXRatio: 0.12,
    breachDamage: 5,
    color: 0x38bdf8,
    ballistaCooldownMs: 2500,
    ballistaDamage: 8
});

export default class DefendLineModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.wallHp = this.config.wallHp;
        this.wall = null;
        this.hud = null;
        this.ballistaTimer = null;
        this.breached = new WeakSet();
    }

    install(context) {
        super.install(context);
        this.wallHp = Number(this.config.wallHp || 100);
        const x = context.adapter.world.width * (this.config.wallXRatio ?? 0.12);
        const h = context.adapter.world.height;

        this.wallX = x;
        const art = context.adapter.runtimeArt;
        const wallKey = art?.propKey?.('wall_segment')
            || art?.resolve?.('wall')
            || (context.scene.textures.exists('lw_art_wall_segment') ? 'lw_art_wall_segment' : null)
            || (context.scene.textures.exists('wall_segment') ? 'wall_segment' : null);
        if (wallKey && context.scene.textures.exists(wallKey)) {
            this.wallParts = [];
            const segments = 6;
            for (let i = 0; i < segments; i += 1) {
                const sy = (h * 0.12) + (i + 0.5) * ((h * 0.76) / segments);
                const part = context.scene.add.image(x, sy, wallKey)
                    .setDisplaySize(28, h * 0.76 / segments + 4)
                    .setAlpha(0.9)
                    .setDepth(1);
                this.wallParts.push(part);
            }
            this.wall = { x, y: h / 2, destroy: () => this.wallParts.forEach((p) => p.destroy?.()) };
        } else {
            this.wall = context.scene.add.rectangle(x, h / 2, 10, h * 0.85, this.config.color, 0.45)
                .setStrokeStyle(2, this.config.color, 0.9);
        }
        // Ballista bolt art key cache
        this.boltKey = art?.propKey?.('ballista_bolt')
            || (context.scene.textures.exists('lw_art_ballista_bolt') ? 'lw_art_ballista_bolt' : null)
            || (context.scene.textures.exists('ballista_bolt') ? 'ballista_bolt' : null);

        this.hud = context.scene.add.text(12, 120, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#38bdf8'
        });

        this.ballistaTimer = context.scene.time.addEvent({
            delay: this.config.ballistaCooldownMs,
            loop: true,
            callback: () => this.fireBallista(context)
        });
        context.lifecycle.trackTimer(this.ballistaTimer);
        this.refreshHud();
    }

    fireBallista(context) {
        if (!context.adapter.isRunning()) return;
        const enemies = context.groups.enemies.getChildren().filter((e) => e.active);
        if (!enemies.length) return;
        // Clear nearest to wall
        enemies.sort((a, b) => a.x - b.x);
        const target = enemies[0];
        context.helpers.damageEnemy(target, this.config.ballistaDamage);
        if (this.boltKey && context.scene.textures.exists(this.boltKey)) {
            const bolt = context.scene.add.image(this.wallX, context.adapter.world.height * 0.35, this.boltKey)
                .setDisplaySize(28, 14)
                .setDepth(5);
            const angle = Math.atan2(target.y - bolt.y, target.x - bolt.x);
            bolt.setRotation(angle);
            context.scene.tweens.add({
                targets: bolt,
                x: target.x,
                y: target.y,
                duration: 140,
                onComplete: () => bolt.destroy()
            });
        } else {
            const flash = context.scene.add.line(
                0, 0,
                this.wallX, context.adapter.world.height * 0.2,
                target.x, target.y,
                0xfbbf24, 0.8
            );
            context.lifecycle.trackTimer(context.scene.time.delayedCall(120, () => flash?.destroy?.()));
        }
    }

    update(context) {
        if (!this.wall || !context.adapter.isRunning()) return;
        context.groups.enemies.getChildren().forEach((enemy) => {
            if (!enemy.active) return;
            if (enemy.x <= this.wallX + 8) {
                if (this.breached.has(enemy)) return;
                this.breached.add(enemy);
                enemy.destroy();
                this.wallHp = Math.max(0, this.wallHp - this.config.breachDamage);
                this.refreshHud();
                if (this.wallHp <= 0) {
                    context.helpers.end(false, NODE_RESULT_REASONS.CONDITION_FAILED);
                }
            }
        });
    }

    refreshHud() {
        this.hud?.setText(`城防 ${Math.ceil(this.wallHp)}/${this.config.wallHp}`);
    }

    uninstall() {
        super.uninstall();
        this.ballistaTimer?.remove?.(false);
        this.ballistaTimer = null;
        this.wallParts?.forEach((p) => p.destroy?.());
        this.wallParts = null;
        this.wall?.destroy?.();
        this.wall = null;
        this.hud?.destroy?.();
        this.hud = null;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            wallHp: this.wallHp
        };
    }
}

export { DEFAULT_CONFIG as DEFEND_LINE_DEFAULT_CONFIG };
