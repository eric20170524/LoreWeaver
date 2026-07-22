import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    triggerX: null,
    lockX: null,
    cameraMax: null,
    enemySpawns: [],
    bossIntro: false,
    clearDrops: true,
    forceLock: true
});

/**
 * Ensures wave lock-screen behavior is enabled and can inject/override wave geometry.
 */
export default class LockedScreenWaveModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.drops = [];
    }

    install(context) {
        super.install(context);
        context.config.lockScreen = {
            ...(context.config.lockScreen || {}),
            enabled: this.config.forceLock !== false,
            cameraPaddingPx: context.config.lockScreen?.cameraPaddingPx ?? 72
        };

        // Optional single-wave override knobs from card
        if (this.config.triggerX != null && Array.isArray(context.config.waveList) && context.config.waveList[0]) {
            const w = context.config.waveList[0];
            if (this.config.triggerX != null) w.triggerX = this.config.triggerX;
            if (this.config.lockX != null) w.lockX = this.config.lockX;
            if (this.config.cameraMax != null) w.cameraMax = this.config.cameraMax;
            if (this.config.bossIntro) w.bossIntro = true;
            if (Array.isArray(this.config.enemySpawns) && this.config.enemySpawns.length) {
                w.enemies = this.config.enemySpawns.map((e) => ({ ...e }));
            }
        }

        context.state.lockScreenModifier = true;
    }

    onWaveClear(context, wave) {
        if (!this.config.clearDrops || !context?.player) return;
        const drop = context.scene.add.circle(context.player.x + 30, context.player.y, 8, 0xfbbf24, 1);
        this.drops.push(drop);
        context.helpers.addScore(25);
        context.lifecycle.trackTimer(context.scene.time.delayedCall(800, () => {
            drop.destroy();
        }));
    }

    uninstall(context) {
        super.uninstall(context);
        this.drops.forEach((d) => d.destroy?.());
        this.drops = [];
    }

    getTestState() {
        return { ...super.getTestState(), forceLock: this.config.forceLock };
    }
}

export { DEFAULT_CONFIG as LOCKED_SCREEN_WAVE_DEFAULT_CONFIG };
