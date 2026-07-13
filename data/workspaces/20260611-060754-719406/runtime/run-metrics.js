const cloneRewards = (rewards = {}) => ({ ...rewards });

export function snapshotRunMetrics(scene, rewards = scene.rewards) {
    return {
        duration: scene.surviveTime || 0,
        kills: scene.kills || 0,
        hp: Math.ceil(scene.playerHp || 0),
        maxHp: scene.playerMaxHp || 0,
        level: scene.level || 1,
        exp: {
            current: scene.currentExp || 0,
            toNext: scene.expToNext || 0
        },
        rewards: cloneRewards(rewards),
        buildSnapshot: {
            activeSkills: (scene.activeSkills || []).map(({ id, level }) => ({ id, level })),
            playerPerks: [...(scene.playerPerks || [])],
            playerAbilities: [...(scene.playerAbilities || [])],
            playerStats: { ...(scene.playerStats || {}) }
        }
    };
}

export function projectNodeResultInput(scene, { success, reason, rewards, failureReason } = {}) {
    const finalRewards = cloneRewards(rewards);
    return {
        resultInput: {
            success,
            reason: reason || null,
            rewards: finalRewards,
            failureReason: failureReason || null
        },
        metrics: snapshotRunMetrics(scene, finalRewards)
    };
}
