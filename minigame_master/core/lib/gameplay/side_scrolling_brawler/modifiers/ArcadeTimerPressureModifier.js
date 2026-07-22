import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    baseLimitSec: 78,
    chapterLimitsSec: [],
    bossBonusSec: 18,
    enemyBonusSec: 2,
    maxEnemyBonusSec: 14,
    minLimitSec: 55,
    hurryAtSec: 10,
    timeoutDamage: 14,
    timeoutPulseSec: 1.2
});

export default class ArcadeTimerPressureModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.pulseAcc = 0;
    }

    install(context) {
        super.install(context);
        context.config.arcadeTimer = { ...this.config };
        this.resetTimer(context, context.config.waveList?.[context.state.waveIndex]);
    }

    onWaveStart(context, wave) {
        this.resetTimer(context, wave);
        this.pulseAcc = 0;
    }

    resetTimer(context, wave) {
        const idx = context.state.waveIndex || 0;
        const chapter = Array.isArray(this.config.chapterLimitsSec)
            ? this.config.chapterLimitsSec[idx]
            : null;
        let limit = Number(chapter ?? this.config.baseLimitSec ?? 78);
        if (wave?.bossIntro) limit += Number(this.config.bossBonusSec || 0);
        const enemyCount = (wave?.enemies || []).length;
        const enemyBonus = Math.min(
            Number(this.config.maxEnemyBonusSec || 14),
            enemyCount * Number(this.config.enemyBonusSec || 2)
        );
        limit += enemyBonus;
        limit = Math.max(Number(this.config.minLimitSec || 0), limit);
        context.helpers.setTimer(limit);
        context.state.hurry = false;
    }

    update(context, _time, delta) {
        if (!this.installed || !context.adapter.isRunning()) return;
        if (!context.state.locked || context.state.timerSec == null) return;

        if (context.state.timerSec <= this.config.hurryAtSec) {
            context.state.hurry = true;
        }

        if (context.state.timerSec > 0) return;

        // Time over: pulse damage
        this.pulseAcc += delta / 1000;
        if (this.pulseAcc >= Number(this.config.timeoutPulseSec || 1.2)) {
            this.pulseAcc = 0;
            context.helpers.damagePlayer(
                Number(this.config.timeoutDamage || 14),
                NODE_RESULT_REASONS.TIMER_EXPIRED
            );
        }
    }

    onSecondTick(context) {
        // Base adapter already decrements timerSec; ensure hurry flag stays in sync
        if (context.state.timerSec != null && context.state.timerSec <= this.config.hurryAtSec) {
            context.state.hurry = true;
        }
    }

    getTestState() {
        return {
            ...super.getTestState(),
            baseLimitSec: this.config.baseLimitSec,
            hurryAtSec: this.config.hurryAtSec
        };
    }
}

export { DEFAULT_CONFIG as ARCADE_TIMER_PRESSURE_DEFAULT_CONFIG };
