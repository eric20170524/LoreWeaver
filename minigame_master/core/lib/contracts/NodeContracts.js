export const NODE_RESULT_REASONS = Object.freeze({
    COMPLETED: 'completed',
    RETREATED: 'retreated',
    FAILED: 'failed',
    TIMER_EXPIRED: 'timer_expired',
    HP_ZERO: 'hp_zero',
    BOSS_DEFEATED: 'boss_defeated',
    OBJECTIVE_MET: 'objective_met',
    CONDITION_FAILED: 'condition_failed'
});

export function createNodePayload(input = {}) {
    const nodeId = input.nodeId || input.id || 'node_unknown';

    return {
        nodeId,
        nodeIndex: input.nodeIndex ?? input.id ?? null,
        nodeConfig: input.nodeConfig || {},
        playerStats: input.playerStats || input.baseStats || {},
        playerPerks: input.playerPerks || input.perks || [],
        inventory: input.inventory || {},
        storyFlags: input.storyFlags || input.flags || [],
        runSeed: input.runSeed || null,
        source: {
            workspaceId: input.source?.workspaceId || input.workspaceId || null,
            projectId: input.source?.projectId || input.projectId || null,
            engine: input.source?.engine || input.engine || 'phaser'
        }
    };
}

export function createNodeResult(input = {}) {
    const success = Boolean(input.success);
    const rewards = input.rewards || {};
    const flags = input.flags || input.storyFlags || [];

    return {
        success,
        reason: input.reason || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED),
        rewards,
        penalties: input.penalties || {},
        unlocks: {
            nodes: input.unlocks?.nodes || input.unlockNodes || [],
            ages: input.unlocks?.ages || input.unlockAges || [],
            flags: input.unlocks?.flags || flags,
            gallery: input.unlocks?.gallery || input.gallery || []
        },
        telemetry: input.telemetry || {}
    };
}

export function normalizeLegacyReward(reward = {}, success = true, reason = null) {
    const rewards = {};
    const unlockFlags = [];

    if (reward.qi !== undefined) rewards.qi = reward.qi;
    if (reward.xp !== undefined) rewards.xp = reward.xp;
    if (reward.skill) {
        rewards.skill = reward.skill;
        rewards.skillUp = reward.skillUp ?? 1;
    }
    if (reward.relic) rewards.relic = reward.relic;
    if (reward.flag) unlockFlags.push(reward.flag);

    return createNodeResult({
        success,
        reason: reason || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED),
        rewards,
        unlockAges: reward.unlockAges || [],
        flags: unlockFlags,
        telemetry: reward.telemetry || {}
    });
}

export default {
    NODE_RESULT_REASONS,
    createNodePayload,
    createNodeResult,
    normalizeLegacyReward
};
