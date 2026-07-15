const cloneRewards = (rewards = {}) => ({ ...rewards });

export function calculateRunScore(scene) {
    let score = 0;

    // Time score (faster is better, or longer if survival)
    const timeScore = (scene.surviveTime || 0) * 10;

    // Damage taken (less is better)
    const hpPercentage = (scene.playerHp || 0) / Math.max(scene.playerMaxHp || 1, 1);
    const hpScore = Math.max(0, Math.floor(hpPercentage * 500));

    // Objective execution / Break success
    const killsScore = (scene.kills || 0) * 5;

    score += timeScore + hpScore + killsScore;
    return score;
}

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
    const score = calculateRunScore(scene);

    return {
        resultInput: {
            success,
            reason: reason || null,
            rewards: finalRewards,
            failureReason: failureReason || null,
            score
        },
        metrics: snapshotRunMetrics(scene, finalRewards)
    };
}
