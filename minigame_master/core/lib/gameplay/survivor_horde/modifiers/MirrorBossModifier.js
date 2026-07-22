import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    cloneHp: 1000,
    cloneSpeed: 100,
    fireIntervalMs: 2000,
    bulletDamage: 15,
    playerDamageToClone: 50,
    bulletSpeed: 260,
    winOnKill: true
});

export default class MirrorBossModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.clone = null;
        this.bullets = [];
        this.fireTimer = null;
        this.hud = null;
        this.hp = 0;
    }

    install(context) {
        super.install(context);
        const w = context.adapter.world.width;
        const h = context.adapter.world.height;
        this.hp = this.config.cloneHp;
        this.clone = context.scene.add.circle(w * 0.75, h * 0.35, 22, 0xc084fc, 0.9)
            .setStrokeStyle(3, 0xe9d5ff, 0.9);
        this.hud = context.scene.add.text(12, 200, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#e9d5ff'
        });

        this.fireTimer = context.scene.time.addEvent({
            delay: this.config.fireIntervalMs,
            loop: true,
            callback: () => this.fire(context)
        });
        context.lifecycle.trackTimer(this.fireTimer);
        this.refreshHud();
    }

    fire(context) {
        if (!this.clone || !context.adapter.isRunning() || !context.player) return;
        const b = context.scene.add.circle(this.clone.x, this.clone.y, 6, 0xd8b4fe, 1);
        const dx = context.player.x - this.clone.x;
        const dy = context.player.y - this.clone.y;
        const len = Math.hypot(dx, dy) || 1;
        b.vx = (dx / len) * this.config.bulletSpeed;
        b.vy = (dy / len) * this.config.bulletSpeed;
        this.bullets.push(b);
    }

    update(context, _time, delta) {
        if (!this.clone || !context.adapter.isRunning()) return;
        const dt = delta / 1000;
        // chase player slowly
        if (context.player) {
            const dx = context.player.x - this.clone.x;
            const dy = context.player.y - this.clone.y;
            const len = Math.hypot(dx, dy) || 1;
            this.clone.x += (dx / len) * this.config.cloneSpeed * dt * 0.35;
            this.clone.y += (dy / len) * this.config.cloneSpeed * dt * 0.35;
        }

        // bullets vs player
        this.bullets = this.bullets.filter((b) => {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (context.player && Math.hypot(b.x - context.player.x, b.y - context.player.y) < 16) {
                context.helpers.damagePlayer(this.config.bulletDamage, NODE_RESULT_REASONS.HP_ZERO);
                b.destroy();
                return false;
            }
            const w = context.adapter.world.width;
            const h = context.adapter.world.height;
            if (b.x < -20 || b.y < -20 || b.x > w + 20 || b.y > h + 20) {
                b.destroy();
                return false;
            }
            return true;
        });

        // player bullets damage clone
        const bullets = context.groups.bullets?.getChildren?.() || [];
        bullets.forEach((bullet) => {
            if (!bullet.active) return;
            if (Math.hypot(bullet.x - this.clone.x, bullet.y - this.clone.y) < 28) {
                bullet.destroy();
                this.hp = Math.max(0, this.hp - this.config.playerDamageToClone);
                this.clone.setFillStyle(0xfafafa, 1);
                context.lifecycle.trackTimer(context.scene.time.delayedCall(60, () => {
                    this.clone?.setFillStyle(0xc084fc, 0.9);
                }));
                if (this.hp <= 0 && this.config.winOnKill) {
                    context.helpers.end(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
                }
            }
        });
        this.refreshHud();
    }

    refreshHud() {
        this.hud?.setText(`镜像 ${Math.ceil(this.hp)}/${this.config.cloneHp}`);
    }

    uninstall() {
        super.uninstall();
        this.fireTimer?.remove?.(false);
        this.clone?.destroy?.();
        this.bullets.forEach((b) => b.destroy?.());
        this.bullets = [];
        this.hud?.destroy?.();
    }

    getTestState() {
        return { ...super.getTestState(), cloneHp: this.hp };
    }
}

export { DEFAULT_CONFIG as MIRROR_BOSS_DEFAULT_CONFIG };
