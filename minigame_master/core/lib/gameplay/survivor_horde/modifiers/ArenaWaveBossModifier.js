import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    totalWaves: 5,
    interWaveDelayMs: 3000,
    bossHpBase: 40,
    bossHpScale: 0.8,
    clearSpawnDuringWave: true
});

/**
 * Converts survivor run into discrete arena waves of elite/boss packs.
 */
export default class ArenaWaveBossModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.wave = 0;
        this.waiting = false;
        this.hud = null;
        this._originalSpawnWave = null;
        this._originalOnSecond = null;
    }

    install(context) {
        super.install(context);
        this.wave = 0;
        this.waiting = false;
        this.hud = context.scene.add.text(12, 160, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#f472b6'
        });

        // Disable timer win; win by clearing all waves
        this._duration = context.config.duration;
        context.config.duration = 99999;

        this._originalSpawnWave = context.adapter.spawnWave.bind(context.adapter);
        context.adapter.spawnWave = () => {
            // only spawn during active wave via our controller
        };

        this.startNextWave(context);
    }

    startNextWave(context) {
        if (!context.adapter.isRunning()) return;
        this.wave += 1;
        this.waiting = false;
        if (this.wave > this.config.totalWaves) {
            context.helpers.end(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            return;
        }
        const hp = Math.floor(this.config.bossHpBase * (this.wave * this.config.bossHpScale));
        // spawn pack
        for (let i = 0; i < 2 + this.wave; i += 1) {
            context.adapter.spawnEnemy({
                id: `arena_elite_${this.wave}`,
                hp: 6 + this.wave * 2,
                speed: 70 + this.wave * 4,
                damage: 10 + this.wave,
                radius: 12,
                color: 0xe879f9,
                reward: { score: 4 }
            });
        }
        context.adapter.spawnEnemy({
            id: `arena_boss_${this.wave}`,
            hp,
            speed: 40,
            damage: 16 + this.wave * 2,
            radius: 22,
            color: 0xdb2777,
            reward: { score: 20 }
        });
        this.refreshHud();
    }

    update(context) {
        if (!this.installed || !context.adapter.isRunning() || this.waiting) return;
        const enemies = context.groups.enemies.getChildren().filter((e) => e.active);
        if (enemies.length === 0) {
            this.waiting = true;
            this.refreshHud('波次间歇…');
            context.lifecycle.trackTimer(context.scene.time.delayedCall(this.config.interWaveDelayMs, () => {
                this.startNextWave(context);
            }));
        } else {
            this.refreshHud();
        }
    }

    refreshHud(extra = '') {
        this.hud?.setText(`竞技波 ${Math.min(this.wave, this.config.totalWaves)}/${this.config.totalWaves}${extra ? ` · ${extra}` : ''}`);
    }

    uninstall(context) {
        super.uninstall(context);
        if (this._originalSpawnWave && context?.adapter) {
            context.adapter.spawnWave = this._originalSpawnWave;
        }
        if (context?.config && this._duration != null) {
            context.config.duration = this._duration;
        }
        this.hud?.destroy?.();
        this.hud = null;
    }

    getTestState() {
        return { ...super.getTestState(), wave: this.wave, totalWaves: this.config.totalWaves };
    }
}

export { DEFAULT_CONFIG as ARENA_WAVE_BOSS_DEFAULT_CONFIG };
