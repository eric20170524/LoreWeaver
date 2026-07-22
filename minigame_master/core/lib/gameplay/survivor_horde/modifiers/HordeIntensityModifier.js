import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    spawnMultiplier: 3,
    eliteChance: 0.15,
    eliteHp: 15,
    eliteSpeed: 40,
    eliteScale: 2.2,
    eliteDamage: 18,
    eliteColor: 0xb45309
});

export default class HordeIntensityModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this._originalSpawnWave = null;
    }

    install(context) {
        super.install(context);
        const adapter = context.adapter;
        this._originalSpawnWave = adapter.spawnWave.bind(adapter);
        const mult = Math.max(1, Number(this.config.spawnMultiplier || 3));
        const self = this;

        adapter.spawnWave = function patchedSpawnWave() {
            if (!adapter.isRunning()) return;
            for (let i = 0; i < mult; i += 1) {
                self._originalSpawnWave();
            }
            // Extra elite chance once per wave tick
            if (Math.random() < self.config.eliteChance) {
                adapter.spawnEnemy({
                    id: 'elite_brute',
                    hp: self.config.eliteHp,
                    speed: self.config.eliteSpeed,
                    damage: self.config.eliteDamage,
                    radius: 16 * (self.config.eliteScale || 1),
                    color: self.config.eliteColor,
                    reward: { score: 8 }
                });
            }
        };
    }

    uninstall(context) {
        super.uninstall(context);
        if (this._originalSpawnWave && context?.adapter) {
            context.adapter.spawnWave = this._originalSpawnWave;
        }
        this._originalSpawnWave = null;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            spawnMultiplier: this.config.spawnMultiplier,
            eliteChance: this.config.eliteChance
        };
    }
}

export { DEFAULT_CONFIG as HORDE_INTENSITY_DEFAULT_CONFIG };
