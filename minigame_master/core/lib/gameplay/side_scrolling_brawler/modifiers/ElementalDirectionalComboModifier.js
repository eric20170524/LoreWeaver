import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    directions: ['forward', 'back', 'up', 'down'],
    strengths: ['light', 'heavy'],
    elementTags: ['fire', 'ice', 'thunder', 'wind'],
    axisThreshold: 0.35,
    lightLockSec: 0.18,
    heavyLockSec: 0.32,
    rangedHeroOverrides: {}
});

const ELEMENT_COLORS = {
    fire: '#f97316',
    ice: '#38bdf8',
    thunder: '#a855f7',
    wind: '#2dd4bf'
};

export default class ElementalDirectionalComboModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.elementIndex = 0;
    }

    install(context) {
        super.install(context);
        const elements = Array.isArray(this.config.elementTags) && this.config.elementTags.length
            ? this.config.elementTags
            : ['fire', 'ice', 'thunder', 'wind'];

        context.adapter._comboResolver = (input, heavy, facing) => {
            const dir = this.resolveDirection(input, facing);
            if (!this.config.directions.includes(dir) && dir !== 'neutral') {
                return null;
            }
            const element = elements[this.elementIndex % elements.length];
            this.elementIndex += 1;
            const mult = heavy ? 1.65 : 1.3;
            const labels = {
                up: '升龙',
                down: '坠地',
                forward: '突进',
                back: '反击',
                neutral: '直拳'
            };
            return {
                label: `${labels[dir] || dir}·${element}`,
                damageMult: mult,
                color: ELEMENT_COLORS[element] || '#fbbf24',
                element,
                direction: dir,
                heavy
            };
        };

        // Slightly extend attack lock via cooldown scale
        const baseCd = context.config.player.attackCooldownMs || 280;
        context.config.player.attackCooldownMs = baseCd;
        context.state.elementalComboEnabled = true;
    }

    resolveDirection(input, facing) {
        if (input.up) return 'up';
        if (input.down) return 'down';
        if (facing > 0 && input.right) return 'forward';
        if (facing < 0 && input.left) return 'forward';
        if (facing > 0 && input.left) return 'back';
        if (facing < 0 && input.right) return 'back';
        return 'neutral';
    }

    uninstall(context) {
        super.uninstall(context);
        if (context?.adapter) {
            context.adapter._comboResolver = null;
        }
    }

    getTestState() {
        return {
            ...super.getTestState(),
            elementTags: this.config.elementTags,
            directions: this.config.directions
        };
    }
}

export { DEFAULT_CONFIG as ELEMENTAL_DIRECTIONAL_COMBO_DEFAULT_CONFIG };
