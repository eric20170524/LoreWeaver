import GameplayModifier from '../../GameplayModifier.js';
import { NODE_RESULT_REASONS } from '../../../contracts/NodeContracts.js';

const DEFAULT_CONFIG = Object.freeze({
    bossName: 'Phase Boss',
    phases: 3,
    finalBossAtSecondsLeft: 30,
    spawnIfMissing: true,
    baseBoss: {
        id: 'phase_boss',
        hp: 120,
        speed: 48,
        damage: 18,
        radius: 30,
        color: 0xef4444,
        reward: { score: 20 }
    },
    phaseColors: [0xef4444, 0xf97316, 0xa855f7],
    phaseSpeedMultipliers: [1, 1.15, 1.3],
    phaseDamageMultipliers: [1, 1.2, 1.45],
    finishOnBossDefeat: true
});

function clampPhase(value, total) {
    return Math.max(1, Math.min(total, value));
}

export default class BossPhasesModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.boss = null;
        this.phase = 0;
        this.spawnAtElapsed = 0;
    }

    install(context) {
        super.install(context);
        const duration = context.config.duration || 0;
        const secondsLeft = Number.isFinite(this.config.finalBossAtSecondsLeft)
            ? this.config.finalBossAtSecondsLeft
            : 30;
        this.spawnAtElapsed = Math.max(0, duration - secondsLeft);

        if (!context.config.boss && this.config.spawnIfMissing) {
            context.config.boss = { ...this.config.baseBoss };
        }

        if (context.config.boss && context.config.boss.spawnAt === undefined) {
            context.config.boss.spawnAt = this.spawnAtElapsed;
        }
    }

    update(context) {
        if (!context.adapter.isRunning()) return;

        this.boss = this.findBoss(context) || this.boss;

        if (!this.boss && context.state.elapsedSeconds >= this.spawnAtElapsed) {
            this.boss = context.adapter.spawnBoss();
        }

        if (this.boss && !this.boss.active) {
            if (this.config.finishOnBossDefeat) {
                context.helpers.end(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
            }
            return;
        }

        if (!this.boss) return;
        this.updatePhase(context, this.boss);
    }

    findBoss(context) {
        return context.groups.enemies.getChildren().find((enemy) => {
            if (!enemy.active) return false;
            const id = enemy.getData('id') || '';
            return id === context.config.boss?.id || id === this.config.baseBoss.id || id.includes('boss');
        }) || null;
    }

    updatePhase(context, boss) {
        const totalPhases = Math.max(1, this.config.phases || 1);
        const maxHp = boss.getData('maxHp') || boss.getData('hp') || 1;
        const hp = Math.max(boss.getData('hp') || 0, 0);
        const lostRatio = 1 - (hp / maxHp);
        const nextPhase = clampPhase(Math.floor(lostRatio * totalPhases) + 1, totalPhases);

        if (nextPhase === this.phase) return;
        this.phase = nextPhase;
        boss.setData('phase', nextPhase);

        const index = nextPhase - 1;
        const color = this.config.phaseColors[index] ?? this.config.phaseColors[this.config.phaseColors.length - 1];
        const speedMultiplier = this.config.phaseSpeedMultipliers[index] ?? 1;
        const damageMultiplier = this.config.phaseDamageMultipliers[index] ?? 1;
        const baseSpeed = context.config.boss?.speed || this.config.baseBoss.speed;
        const baseDamage = context.config.boss?.damage || this.config.baseBoss.damage;

        boss.setFillStyle?.(color, 1);
        boss.setData('speed', Math.round(baseSpeed * speedMultiplier));
        boss.setData('damage', Math.round(baseDamage * damageMultiplier));
        context.helpers.publishTestState();
    }

    getTestState() {
        return {
            ...super.getTestState(),
            phase: this.phase,
            spawnAtElapsed: this.spawnAtElapsed,
            bossActive: Boolean(this.boss?.active)
        };
    }
}

export { DEFAULT_CONFIG as BOSS_PHASES_DEFAULT_CONFIG };
