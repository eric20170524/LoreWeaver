/**
 * Proven LevelContract surface extracted from the mature campaign workspace (LW-050).
 * Theme-agnostic: no game-specific names or balance constants.
 */
export const BEAT_KINDS = Object.freeze([
    'intro', 'teach', 'pressure', 'elite', 'climax', 'resolution'
]);

export const VICTORY_MODES = Object.freeze({
    SURVIVE: 'survive',
    BOSS_ONLY: 'boss_only',
    OBJECTIVE: 'objective'
});

/**
 * @param {object} input
 * @returns {object} normalized level contract
 */
export function createLevelContract(input = {}) {
    const nodeId = Number(input.nodeId) || 1;
    const durationSeconds = Math.max(1, Number(input.durationSeconds) || 90);
    const budgets = {
        maxActiveEnemies: Number(input.budgets?.maxActiveEnemies) || 18,
        maxActiveProjectiles: Number(input.budgets?.maxActiveProjectiles) || 40,
        maxActivePickups: Number(input.budgets?.maxActivePickups) || 30,
        maxParticles: Number(input.budgets?.maxParticles) || 48
    };
    const beats = Array.isArray(input.beats)
        ? input.beats.map((beat, index) => normalizeBeat(beat, index))
        : [];
    return Object.freeze({
        version: input.version || 'loreweaver.level-contract.v1',
        nodeId,
        durationSeconds,
        seed: input.seed ?? null,
        victoryMode: input.victoryMode || VICTORY_MODES.SURVIVE,
        budgets: Object.freeze(budgets),
        beats: Object.freeze(beats),
        objectives: Object.freeze(Array.isArray(input.objectives) ? input.objectives : []),
        metadata: Object.freeze(input.metadata || {})
    });
}

function normalizeBeat(beat = {}, index = 0) {
    const kind = BEAT_KINDS.includes(beat.kind) ? beat.kind : 'pressure';
    return Object.freeze({
        id: String(beat.id || `beat_${index + 1}`),
        kind,
        atSecond: Math.max(0, Number(beat.atSecond) || 0),
        callout: beat.callout || null,
        spawns: Object.freeze(Array.isArray(beat.spawns) ? beat.spawns.map(normalizeSpawn) : []),
        boss: Boolean(beat.boss),
        completeWhen: beat.completeWhen || 'spawned',
        teach: Object.freeze(Array.isArray(beat.teach) ? beat.teach : [])
    });
}

function normalizeSpawn(spawn = {}) {
    return Object.freeze({
        enemyType: spawn.enemyType || 'generic_foe',
        count: Math.max(1, Number(spawn.count) || 1),
        radius: Number(spawn.radius) || 400,
        archetype: spawn.archetype || 'chase_melee',
        elite: Boolean(spawn.elite)
    });
}

export function validateLevelContract(contract) {
    const reasons = [];
    if (!contract || contract.version !== 'loreweaver.level-contract.v1') {
        reasons.push('version must be loreweaver.level-contract.v1');
    }
    if (!Number.isInteger(contract?.nodeId) || contract.nodeId < 1) {
        reasons.push('nodeId must be a positive integer');
    }
    if (!(contract?.durationSeconds > 0)) reasons.push('durationSeconds must be > 0');
    if (!contract?.budgets) reasons.push('budgets required');
    if (!Array.isArray(contract?.beats)) reasons.push('beats must be an array');
    return { valid: reasons.length === 0, reasons };
}

export default {
    BEAT_KINDS,
    VICTORY_MODES,
    createLevelContract,
    validateLevelContract
};
