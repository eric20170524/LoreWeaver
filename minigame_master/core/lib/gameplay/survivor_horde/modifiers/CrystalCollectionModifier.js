import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    crystalCount: 5,
    respawnIntervalMs: 3000,
    rewardScore: 5,
    radius: 10,
    color: 0x67e8f9
});

export default class CrystalCollectionModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.crystals = [];
        this.timer = null;
    }

    install(context) {
        super.install(context);
        for (let i = 0; i < this.config.crystalCount; i += 1) {
            this.spawnCrystal(context);
        }
        this.timer = context.scene.time.addEvent({
            delay: this.config.respawnIntervalMs,
            loop: true,
            callback: () => {
                if (!context.adapter.isRunning()) return;
                const alive = this.crystals.filter((c) => c.active).length;
                if (alive < this.config.crystalCount) this.spawnCrystal(context);
            }
        });
        context.lifecycle.trackTimer(this.timer);
    }

    spawnCrystal(context) {
        const w = context.adapter.world.width;
        const h = context.adapter.world.height;
        const x = 40 + Math.random() * (w - 80);
        const y = 40 + Math.random() * (h - 80);
        const crystal = context.helpers.createCircle
            ? context.helpers.createCircle(x, y, this.config.radius, this.config.color)
            : context.scene.add.circle(x, y, this.config.radius, this.config.color, 0.95);
        crystal.setData?.('reward', { score: this.config.rewardScore, souls: 100 });
        crystal.setData?.('isCrystal', true);
        if (context.groups?.collectibles?.add) {
            context.groups.collectibles.add(crystal);
        }
        this.crystals.push(crystal);
        return crystal;
    }

    uninstall() {
        super.uninstall();
        this.timer?.remove?.(false);
        this.timer = null;
        this.crystals.forEach((c) => c.destroy?.());
        this.crystals = [];
    }

    getTestState() {
        return {
            ...super.getTestState(),
            crystalCount: this.config.crystalCount,
            alive: this.crystals.filter((c) => c.active).length
        };
    }
}

export { DEFAULT_CONFIG as CRYSTAL_COLLECTION_DEFAULT_CONFIG };
