import LockedScreenWaveModifier from './LockedScreenWaveModifier.js';
import ArcadeTimerPressureModifier from './ArcadeTimerPressureModifier.js';
import ArcadeCreditContinueModifier from './ArcadeCreditContinueModifier.js';
import ElementalDirectionalComboModifier from './ElementalDirectionalComboModifier.js';
import LocalCoop4pModifier from './LocalCoop4pModifier.js';
import BranchRouteChainModifier from './BranchRouteChainModifier.js';
import ScoreExtend1upModifier from './ScoreExtend1upModifier.js';

export const SIDE_SCROLLING_BRAWLER_MODIFIER_REGISTRY = Object.freeze({
    locked_screen_wave: LockedScreenWaveModifier,
    arcade_timer_pressure: ArcadeTimerPressureModifier,
    arcade_credit_continue: ArcadeCreditContinueModifier,
    elemental_directional_combo: ElementalDirectionalComboModifier,
    local_coop_4p: LocalCoop4pModifier,
    branch_route_chain: BranchRouteChainModifier,
    score_extend_1up: ScoreExtend1upModifier
});

export const SIDE_SCROLLING_BRAWLER_SUPPORTED_MODIFIERS = Object.freeze(
    Object.keys(SIDE_SCROLLING_BRAWLER_MODIFIER_REGISTRY)
);

export function createSideScrollingBrawlerModifier(entry = {}) {
    const id = typeof entry === 'string' ? entry : entry.id;
    const ModifierClass = SIDE_SCROLLING_BRAWLER_MODIFIER_REGISTRY[id];
    if (!ModifierClass) {
        throw new Error(`Unsupported side_scrolling_brawler modifier: ${id || 'unknown'}`);
    }
    const knobs = typeof entry === 'string' ? {} : entry.knobs || entry.config || {};
    return new ModifierClass(knobs);
}

export function createSideScrollingBrawlerModifiers(entries = []) {
    return entries.map((entry) => createSideScrollingBrawlerModifier(entry));
}
