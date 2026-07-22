import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    thresholds: [5000, 12000, 24000, 42000, 65000],
    maxLives: 6,
    recipientPolicy: 'lowest_lives'
});

/**
 * Grants an extra life when score crosses configured thresholds.
 */
export default class ScoreExtend1upModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.claimed = new Set();
        this.lastScore = 0;
    }

    install(context) {
        super.install(context);
        this.claimed = new Set();
        this.lastScore = context.state.score || 0;
        context.config.lifeStock = {
            ...(context.config.lifeStock || {}),
            enabled: true
        };
        if (context.config.lifeStock.maxLives == null) {
            context.config.lifeStock.maxLives = this.config.maxLives;
        }
    }

    update(context) {
        if (!this.installed || !context.adapter.isRunning()) return;
        const score = context.state.score || 0;
        const maxLives = Number(this.config.maxLives || context.config.lifeStock?.maxLives || 6);
        const thresholds = Array.isArray(this.config.thresholds) ? this.config.thresholds : DEFAULT_CONFIG.thresholds;

        thresholds.forEach((th) => {
            const key = String(th);
            if (this.claimed.has(key)) return;
            if (score >= th && this.lastScore < th) {
                if ((context.state.lives || 0) < maxLives) {
                    context.helpers.grantLife();
                    this.claimed.add(key);
                    context.adapter.showBanner?.(`1UP · ${th}`, '#fbbf24');
                    context.helpers.recordRouteEvent?.(`scoreExtend:${th}`);
                } else {
                    this.claimed.add(key);
                }
            }
        });
        this.lastScore = score;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            claimed: Array.from(this.claimed),
            thresholds: this.config.thresholds
        };
    }
}

export { DEFAULT_CONFIG as SCORE_EXTEND_1UP_DEFAULT_CONFIG };
