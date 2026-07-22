/**
 * Cross-card playability contract (theme-agnostic).
 *
 * Hosts (GameRunner, department prep) and adapters should normalize knobs
 * through this module so card JSON + runtime share one field vocabulary.
 */

export const VICTORY_MODES = Object.freeze({
    SURVIVE: 'survive',
    BOSS_ONLY: 'boss_only',
    OBJECTIVE: 'objective'
});

/** Default victory mode by cardId (used when knobs omit victoryMode). */
export const CARD_VICTORY_MODE = Object.freeze({
    survivor_horde: VICTORY_MODES.SURVIVE,
    pressure_survival: VICTORY_MODES.SURVIVE,
    side_scrolling_brawler: VICTORY_MODES.SURVIVE,
    drag_collect_grid: VICTORY_MODES.OBJECTIVE,
    collect_dodge: VICTORY_MODES.OBJECTIVE,
    rhythm_timing: VICTORY_MODES.OBJECTIVE,
    tap_reaction: VICTORY_MODES.OBJECTIVE,
    sequence_synthesis: VICTORY_MODES.OBJECTIVE,
    sequence_puzzle_combo: VICTORY_MODES.OBJECTIVE,
    turn_based_skill_battle: VICTORY_MODES.BOSS_ONLY,
    dodge_counter_boss: VICTORY_MODES.BOSS_ONLY,
    node_iframe_microgame: VICTORY_MODES.OBJECTIVE,
    energy_balance: VICTORY_MODES.OBJECTIVE,
    qix_area_capture: VICTORY_MODES.OBJECTIVE,
    point_drag_progression: VICTORY_MODES.OBJECTIVE,
    reaction_pick: VICTORY_MODES.OBJECTIVE,
    observe_capture: VICTORY_MODES.OBJECTIVE,
    shooter_duel: VICTORY_MODES.BOSS_ONLY,
    drag_to_core: VICTORY_MODES.OBJECTIVE,
    maze_exploration_choice: VICTORY_MODES.OBJECTIVE,
    platform_escape: VICTORY_MODES.SURVIVE,
    hazard_collect_waves: VICTORY_MODES.SURVIVE,
    rhythm_then_pickup: VICTORY_MODES.OBJECTIVE,
    rune_connect_sequence: VICTORY_MODES.OBJECTIVE,
    branching_dialogue_check: VICTORY_MODES.OBJECTIVE
});

export const PLAYABLE_CARD_IDS = Object.freeze(new Set(Object.keys(CARD_VICTORY_MODE)));

/** Cards that treat goal as a collect/count target (not duration proxy). */
export const COLLECT_STYLE_CARDS = Object.freeze(
    new Set([
        'drag_collect_grid',
        'collect_dodge',
        'reaction_pick',
        'observe_capture',
        'drag_to_core',
        'qix_area_capture',
        'point_drag_progression',
        'rhythm_then_pickup'
    ])
);

/**
 * Resolve duration seconds from mixed knob / node fields.
 * Prefers card-standard timeLimitSec, then durationSec / duration.
 */
export function resolveDurationSec(knobs = {}, node = {}) {
    const raw =
        knobs.timeLimitSec ??
        knobs.durationSec ??
        knobs.duration ??
        node.durationLimit ??
        node.duration ??
        30;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Resolve collect / objective amount.
 * Prefers card-standard needAmount, then collectGoal / goalValue.
 */
export function resolveNeedAmount(knobs = {}, node = {}, durationSec = 30) {
    let goal = Number(
        knobs.needAmount ?? knobs.collectGoal ?? knobs.goalValue ?? node.goalValue ?? 15
    );
    if (!Number.isFinite(goal) || goal <= 0) goal = 15;

    // Campaign nodes often synced goalValue == durationSec — unplayable for collect.
    if (COLLECT_STYLE_CARDS.has(String(knobs.cardId || node.gameplay?.cardId || '')) || knobs._collectStyle) {
        const maxCollect = Math.max(12, Math.floor(durationSec / 3));
        if (goal >= durationSec) {
            goal = Math.min(maxCollect, Math.max(12, Math.floor(durationSec / 5)));
        }
        goal = Math.max(8, Math.min(goal, maxCollect));
    }
    return goal;
}

/**
 * Normalize host knobs into a stable playability surface.
 *
 * @param {string} cardId
 * @param {object} knobs raw gameplay.knobs
 * @param {object} [node] node-level fields (durationLimit, goalValue, …)
 * @returns {object} normalized knobs (new object; does not mutate input)
 */
export function normalizePlayabilityKnobs(cardId, knobs = {}, node = {}) {
    const card = String(cardId || knobs.cardId || node.gameplay?.cardId || knobs.runtimeCardId || '');
    const src = knobs && typeof knobs === 'object' ? { ...knobs } : {};
    src.cardId = card || src.cardId;
    src._collectStyle = COLLECT_STYLE_CARDS.has(card);

    const durationSec = resolveDurationSec(src, node);
    const needAmount = resolveNeedAmount(src, node, durationSec);
    const victoryMode =
        src.victoryMode || CARD_VICTORY_MODE[card] || VICTORY_MODES.SURVIVE;

    const out = {
        ...src,
        // Standard aliases (card schema + legacy)
        timeLimitSec: durationSec,
        durationSec,
        duration: durationSec,
        needAmount,
        collectGoal: needAmount,
        goalValue: needAmount,
        victoryMode,
        playable: src.playable !== false && (PLAYABLE_CARD_IDS.has(card) || !card),
        clearable: src.clearable !== false,
        allowQuit: src.allowQuit !== false,
        allowPause: src.allowPause !== false,
        failOnTimeout:
            src.failOnTimeout !== undefined
                ? Boolean(src.failOnTimeout)
                : victoryMode === VICTORY_MODES.SURVIVE || victoryMode === VICTORY_MODES.OBJECTIVE,
        retreatReturnsToShell: src.retreatReturnsToShell !== false,
        shellRetreat: src.shellRetreat !== false && src.retreatReturnsToShell !== false,
        runtimeCardId: src.runtimeCardId || card || null,
        artAtlasFirst: src.artAtlasFirst !== false
    };

    // Drop internal flag
    delete out._collectStyle;
    return out;
}

/**
 * Validate playability surface for smoke / gates.
 * @returns {{ ok: boolean, issues: object[], warnings: object[] }}
 */
export function validatePlayabilityContract(cardId, knobs = {}, node = {}) {
    const issues = [];
    const warnings = [];
    const card = String(cardId || knobs.cardId || '');
    const n = normalizePlayabilityKnobs(card, knobs, node);

    if (!card) {
        issues.push({ code: 'no_cardId', owner: 'gameplay', msg: 'missing cardId' });
    } else if (!PLAYABLE_CARD_IDS.has(card) && card !== 'node_iframe_microgame') {
        issues.push({
            code: 'unknown_card',
            owner: 'gameplay',
            msg: `cardId ${card} not in PLAYABLE_CARD_IDS`
        });
    }

    if (!(n.durationSec > 0)) {
        issues.push({ code: 'no_duration', owner: 'gameplay', msg: 'missing timeLimitSec/durationSec' });
    }

    if (COLLECT_STYLE_CARDS.has(card) && n.needAmount >= n.durationSec) {
        // After normalize this should be rare; still flag raw intent
        warnings.push({
            code: 'collect_goal_high',
            owner: 'gameplay',
            msg: `needAmount ${n.needAmount} vs duration ${n.durationSec}`
        });
    }

    if (!n.envKey) {
        warnings.push({ code: 'no_envKey', owner: 'art', msg: 'missing envKey' });
    }
    if (!n.bgmKey) {
        warnings.push({ code: 'no_bgmKey', owner: 'audio', msg: 'missing bgmKey' });
    }

    return { ok: issues.length === 0, issues, warnings, normalized: n };
}

export default {
    VICTORY_MODES,
    CARD_VICTORY_MODE,
    PLAYABLE_CARD_IDS,
    COLLECT_STYLE_CARDS,
    resolveDurationSec,
    resolveNeedAmount,
    normalizePlayabilityKnobs,
    validatePlayabilityContract
};
