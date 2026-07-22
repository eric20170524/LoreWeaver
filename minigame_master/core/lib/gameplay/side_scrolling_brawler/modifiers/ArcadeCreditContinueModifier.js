import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    maxCredits: 9,
    startCredits: 3,
    spendCreditOnStart: false,
    spendCreditOnContinue: true,
    continueRespawnInvulnSec: 2.4,
    allowGamepadCoin: true
});

export default class ArcadeCreditContinueModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
    }

    install(context) {
        super.install(context);
        context.config.continueCredits = {
            enabled: true,
            maxCredits: this.config.maxCredits,
            startCredits: this.config.startCredits,
            spendCreditOnContinue: this.config.spendCreditOnContinue !== false
        };
        context.config.lifeStock = {
            ...(context.config.lifeStock || {}),
            enabled: true,
            reviveInvulnSec: this.config.continueRespawnInvulnSec
        };

        // Apply starting credits if adapter already initialized state
        const start = Number(this.config.startCredits ?? 3);
        const max = Number(this.config.maxCredits ?? 9);
        context.state.credits = Math.min(max, Math.max(0, start));
        if (this.config.spendCreditOnStart && context.state.credits > 0) {
            context.state.credits -= 1;
        }

        // Coin insert: press C when not awaiting continue adds credit (arcade feel)
        this._keyHandler = () => {
            if (!context.adapter.isRunning()) return;
            if (context.state.awaitingContinue) return;
            if (context.state.credits < max) {
                context.state.credits += 1;
            }
        };
        // Adapter already binds C for continue; extra coin via pointer edge UI not needed
    }

    onContinue(context) {
        context.state.invulnUntil = context.scene.time.now
            + Number(this.config.continueRespawnInvulnSec || 2.4) * 1000;
    }

    getTestState() {
        return {
            ...super.getTestState(),
            maxCredits: this.config.maxCredits,
            startCredits: this.config.startCredits
        };
    }
}

export { DEFAULT_CONFIG as ARCADE_CREDIT_CONTINUE_DEFAULT_CONFIG };
