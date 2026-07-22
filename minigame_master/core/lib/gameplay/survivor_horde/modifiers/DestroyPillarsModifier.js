import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    pillarCount: 4,
    pillarHp: 10,
    bulletDamage: 2,
    radius: 18,
    color: 0xf59e0b
});

export default class DestroyPillarsModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.pillars = [];
        this.hud = null;
    }

    install(context) {
        super.install(context);
        const w = context.adapter.world.width;
        const h = context.adapter.world.height;
        const positions = [
            { x: w * 0.2, y: h * 0.25 },
            { x: w * 0.8, y: h * 0.25 },
            { x: w * 0.2, y: h * 0.75 },
            { x: w * 0.8, y: h * 0.75 }
        ].slice(0, this.config.pillarCount);

        this.pillars = positions.map((pos, i) => {
            const sprite = context.scene.add.rectangle(pos.x, pos.y, this.config.radius * 1.6, this.config.radius * 1.6, this.config.color, 0.85)
                .setStrokeStyle(2, 0xfde68a, 0.9);
            return {
                id: `pillar_${i}`,
                x: pos.x,
                y: pos.y,
                hp: this.config.pillarHp,
                maxHp: this.config.pillarHp,
                sprite,
                alive: true
            };
        });

        this.hud = context.scene.add.text(12, 140, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#fbbf24'
        });
        this.refreshHud();
    }

    update(context) {
        if (!context.adapter.isRunning()) return;
        const bullets = context.groups.bullets?.getChildren?.() || [];
        bullets.forEach((bullet) => {
            if (!bullet.active) return;
            this.pillars.forEach((pillar) => {
                if (!pillar.alive) return;
                const d = Math.hypot(bullet.x - pillar.x, bullet.y - pillar.y);
                if (d <= this.config.radius + 6) {
                    bullet.destroy();
                    pillar.hp -= this.config.bulletDamage;
                    pillar.sprite.setFillStyle(0xfafafa, 1);
                    context.lifecycle.trackTimer(context.scene.time.delayedCall(80, () => {
                        if (pillar.alive) pillar.sprite.setFillStyle(this.config.color, 0.85);
                    }));
                    if (pillar.hp <= 0) {
                        pillar.alive = false;
                        pillar.sprite.setAlpha(0.2);
                        context.state.score = (context.state.score || 0) + 20;
                    }
                }
            });
        });
        this.refreshHud();
        if (this.pillars.length && this.pillars.every((p) => !p.alive)) {
            context.helpers.end(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        }
    }

    refreshHud() {
        const left = this.pillars.filter((p) => p.alive).length;
        this.hud?.setText(`阵基剩余 ${left}/${this.pillars.length}`);
    }

    uninstall() {
        super.uninstall();
        this.pillars.forEach((p) => p.sprite?.destroy?.());
        this.pillars = [];
        this.hud?.destroy?.();
        this.hud = null;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            pillarsAlive: this.pillars.filter((p) => p.alive).length,
            pillarCount: this.pillars.length
        };
    }
}

export { DEFAULT_CONFIG as DESTROY_PILLARS_DEFAULT_CONFIG };
