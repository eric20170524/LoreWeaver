import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    totalWaves: 5,
    interWaveDelayMs: 3000,
    bossHpBase: 40,
    bossHpScale: 0.8,
    clearSpawnDuringWave: true,
    arenaSpawnRadiusRatio: 0.36,
    waveStartAudioCue: null,
    waveClearAudioCue: null
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
            fontFamily: 'Inter, sans-serif', fontSize: '18px', fontStyle: 'bold',
            color: '#fce7f3', backgroundColor: 'rgba(15, 23, 42, 0.84)',
            padding: { x: 8, y: 5 }
        });

        // Wave clearance is the only win condition; the authored clock is a loss limit.
        this._arenaWaveTimeoutIsFailure = context.config.arenaWaveTimeoutIsFailure;
        context.config.arenaWaveTimeoutIsFailure = true;

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
        // Arena waves suppress the regular spawn timer. Apply the existing
        // horde density to each finite pack so the two modifiers still compose.
        const horde = context.adapter.modifiers.find((modifier) => modifier.id === 'horde_intensity' && modifier.installed);
        const hordeMultiplier = Math.max(1, Math.floor(Number(horde?.config.spawnMultiplier) || 1));
        const eliteCount = (2 + this.wave) * hordeMultiplier;
        const packCount = eliteCount + 1;
        const phase = context.adapter.random() * Math.PI * 2;
        for (let i = 0; i < eliteCount; i += 1) {
            const enemy = context.adapter.spawnEnemy({
                id: `arena_elite_${this.wave}`,
                hp: 6 + this.wave * 2,
                speed: 70 + this.wave * 4,
                damage: 10 + this.wave,
                radius: 12,
                color: 0xe879f9,
                reward: { score: 4 }
            });
            this.placeInArena(context, enemy, i, packCount, phase);
        }
        const boss = context.adapter.spawnEnemy({
            id: `arena_boss_${this.wave}`,
            hp,
            speed: 40,
            damage: 16 + this.wave * 2,
            radius: 22,
            color: 0xdb2777,
            reward: { score: 20 }
        });
        this.placeInArena(context, boss, eliteCount, packCount, phase);
        if (this.config.waveStartAudioCue) {
            context.helpers.emitPresentation({
                kind: 'arena-wave-started',
                wave: this.wave,
                totalWaves: this.config.totalWaves,
                packCount,
                audioCue: this.config.waveStartAudioCue
            });
        }
        this.refreshHud();
    }

    placeInArena(context, enemy, ordinal, count, phase) {
        if (!enemy) return;
        const { width, height } = context.adapter.world;
        const margin = 32;
        const radius = Math.min(width, height)
            * Math.max(0.1, Math.min(0.45, Number(this.config.arenaSpawnRadiusRatio) || 0.36));
        const angle = phase + ordinal * Math.PI * 2 / count;
        const x = Math.max(margin, Math.min(width - margin, width / 2 + Math.cos(angle) * radius));
        const y = Math.max(margin, Math.min(height - margin, height / 2 + Math.sin(angle) * radius));
        enemy.setPosition?.(x, y);
        enemy.body?.reset?.(x, y);
    }

    update(context) {
        if (!this.installed || !context.adapter.isRunning() || this.waiting) return;
        const enemies = context.groups.enemies.getChildren().filter((e) => e.active);
        if (enemies.length === 0) {
            this.waiting = true;
            this.refreshHud('波次间歇…');
            if (this.config.waveClearAudioCue) {
                context.helpers.emitPresentation({
                    kind: 'arena-wave-cleared',
                    wave: this.wave,
                    totalWaves: this.config.totalWaves,
                    audioCue: this.config.waveClearAudioCue
                });
            }
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
        if (context?.config) {
            context.config.arenaWaveTimeoutIsFailure = this._arenaWaveTimeoutIsFailure;
        }
        this.hud?.destroy?.();
        this.hud = null;
    }

    getTestState() {
        return { ...super.getTestState(), wave: this.wave, totalWaves: this.config.totalWaves };
    }
}

export { DEFAULT_CONFIG as ARENA_WAVE_BOSS_DEFAULT_CONFIG };
