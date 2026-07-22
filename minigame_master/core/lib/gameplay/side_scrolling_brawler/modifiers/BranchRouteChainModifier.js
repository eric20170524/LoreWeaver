import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    eventSpecs: [
        { id: 'speedClear', condition: 'speedClear', score: 100 },
        { id: 'noDamage', condition: 'noDamage', score: 150 },
        { id: 'comboClear', condition: 'comboClear', score: 120 }
    ],
    conditionTypes: ['speedClear', 'noDamage', 'comboClear', 'jumpDodge', 'secretCache'],
    branchSpecs: [
        { id: 'chain_a', require: 2, rewardScore: 300, label: '军需补给' }
    ],
    promptDurationSec: 2.5,
    rewardItems: ['supply_crate'],
    supplyRoomTemplate: null
});

export default class BranchRouteChainModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.matched = new Set();
        this.branchesClaimed = new Set();
        this.banner = null;
    }

    install(context) {
        super.install(context);
        context.state.branchRouteEnabled = true;
        this.matched = new Set();
        this.branchesClaimed = new Set();
    }

    onWaveClear(context, wave) {
        const events = context.state.routeEventsCleared || [];
        const waveKey = wave?.id || String(context.state.waveIndex);
        const specs = Array.isArray(this.config.eventSpecs) ? this.config.eventSpecs : [];

        specs.forEach((spec) => {
            const hit = events.some((e) => {
                const [cond, id] = String(e).split(':');
                return cond === spec.condition && (!id || id === waveKey || String(context.state.waveIndex - 1) === id);
            }) || events.some((e) => String(e).startsWith(`${spec.condition}:`));

            // Also accept any matching condition type cleared this run
            const anyHit = events.some((e) => String(e).startsWith(`${spec.condition}`));
            if ((hit || anyHit) && !this.matched.has(spec.id)) {
                this.matched.add(spec.id);
                context.helpers.recordRouteEvent(`branchEvent:${spec.id}`);
                context.helpers.addScore(Number(spec.score || 50));
                this.prompt(context, `支线达成：${spec.id}`, '#38bdf8');
            }
        });

        this.evaluateBranches(context);
    }

    evaluateBranches(context) {
        const branches = Array.isArray(this.config.branchSpecs) ? this.config.branchSpecs : [];
        branches.forEach((branch) => {
            if (this.branchesClaimed.has(branch.id)) return;
            const need = Number(branch.require || 2);
            if (this.matched.size >= need) {
                this.branchesClaimed.add(branch.id);
                context.helpers.addScore(Number(branch.rewardScore || 300));
                context.helpers.recordRouteEvent(`branchChain:${branch.id}`);
                const items = this.config.rewardItems || [];
                items.forEach((item) => context.helpers.recordRouteEvent(`item:${item}`));
                this.prompt(context, branch.label || `路线奖励 ${branch.id}`, '#fbbf24');
            }
        });
    }

    prompt(context, text, color) {
        if (context.adapter?.showBanner) {
            context.adapter.showBanner(text, color);
            return;
        }
        const t = context.scene.add.text(context.scene.scale.width / 2, 140, text, {
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            color: color || '#f8fafc'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(120);
        context.lifecycle.trackTimer(context.scene.time.delayedCall(
            Number(this.config.promptDurationSec || 2.5) * 1000,
            () => t.destroy()
        ));
    }

    uninstall() {
        super.uninstall();
        this.matched.clear();
        this.branchesClaimed.clear();
    }

    getTestState() {
        return {
            ...super.getTestState(),
            matched: Array.from(this.matched),
            branchesClaimed: Array.from(this.branchesClaimed)
        };
    }
}

export { DEFAULT_CONFIG as BRANCH_ROUTE_CHAIN_DEFAULT_CONFIG };
