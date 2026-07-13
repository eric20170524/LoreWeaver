import { SKILL_POOL_REGISTRY } from '../js/data.js';

export const POWER_BUDGET_VERSION = 'loreweaver.power-budget.v1';

const nodeRows = [
    [1, 150, 15, 500, 1, 0],
    [2, 270, 30, 900, 0, 1],
    [3, 450, 55, 1500, 0, 2],
    [4, 750, 95, 2400, 1, 3],
    [5, 1200, 150, 4000, 1, 4],
    [6, 1800, 240, 7000, 0, 6],
    [7, 2700, 370, 12000, 0, 9],
    [8, 4000, 560, 20000, 1, 13],
    [9, 6000, 820, 33000, 1, 18],
    [10, 8500, 1150, 54000, 1, 25],
    [11, 12000, 1550, 88000, 1, 35],
    [12, 16500, 2100, 140000, 2, 50]
];

export const NODE_POWER_BUDGETS = Object.freeze(Object.fromEntries(nodeRows.map(([nodeId, hp, atk, bloodEssence, suanBoneScript, pureBlood]) => [nodeId, Object.freeze({
    nodeId,
    player: Object.freeze({ hp, atk, critRate: 0.05, critDmg: 1.5 }),
    normal: Object.freeze({ ttkSeconds: 1.25, hitsToKill: 16 }),
    elite: Object.freeze({ ttkSeconds: 3.5, hitsToKill: 12 }),
    boss: Object.freeze({ ttkSeconds: 24, hitsToKill: 9, projectileHitsToKill: 6 }),
    rewards: Object.freeze({ bloodEssence, suanBoneScript, pureBlood })
})])));

const caveCosts = [100, 150, 200, 180, 220, 260, 320, 400, 500, 650, 800, 1000, 1250, 1550, 1900, 2300, 2800, 3400, 4100, 5000, 6100, 7400, 9000, 10800, 13000];
const realmCosts = {
    2: { bloodEssence: 600 },
    3: { bloodEssence: 1100 },
    4: { bloodEssence: 1800 },
    5: { bloodEssence: 3000, suanBoneScript: 1 },
    6: { bloodEssence: 5000, suanBoneScript: 1 },
    7: { bloodEssence: 8000, pureBlood: 2 },
    8: { bloodEssence: 13000, pureBlood: 3 },
    9: { bloodEssence: 22000, pureBlood: 5, suanBoneScript: 1 },
    10: { bloodEssence: 36000, pureBlood: 8, suanBoneScript: 1 },
    11: { bloodEssence: 58000, pureBlood: 12, suanBoneScript: 1 },
    12: { bloodEssence: 92000, pureBlood: 20, suanBoneScript: 1 }
};

export function getNodePowerBudget(nodeId) {
    const budget = NODE_POWER_BUDGETS[nodeId];
    if (!budget) throw new Error(`Missing ${POWER_BUDGET_VERSION} node budget for Node${nodeId}.`);
    return budget;
}

export function getCaveCost(index) {
    const cost = caveCosts[index - 1];
    if (!cost) throw new Error(`Missing ${POWER_BUDGET_VERSION} cave cost for cave ${index}.`);
    return cost;
}

export function getBreakthroughCost(realmId) {
    const cost = realmCosts[realmId];
    if (!cost) return { bloodEssence: 0, suanBoneScript: 0, pureBlood: 0 };
    return { bloodEssence: 0, suanBoneScript: 0, pureBlood: 0, ...cost };
}

export function resolveNodeRewards(nodeId) {
    const rewards = getNodePowerBudget(nodeId).rewards;
    return {
        bloodEssence: rewards.bloodEssence,
        ...(rewards.suanBoneScript > 0 ? { suanBoneScript: rewards.suanBoneScript } : {}),
        ...(rewards.pureBlood > 0 ? { pureBlood: rewards.pureBlood } : {})
    };
}

export function applyPowerBudgetToNodeConfig(nodeConfig) {
    return { ...nodeConfig, rewards: resolveNodeRewards(nodeConfig.id), powerBudgetVersion: POWER_BUDGET_VERSION };
}

export function resolvePlayerCombatStats(nodeId, rawStats = {}, perks = []) {
    const player = getNodePowerBudget(nodeId).player;
    const unlocked = new Set(perks);
    return {
        ...rawStats,
        baseHp: Math.round(player.hp * (unlocked.has('perk_hp_1') ? 1.25 : 1)),
        baseAtk: player.atk,
        baseCritRate: player.critRate + (unlocked.has('perk_crit_1') ? 0.05 : 0),
        baseCritDmg: player.critDmg
    };
}

export function resolveExpectedSkillDps(playerStats, perks = []) {
    const skill = SKILL_POOL_REGISTRY.tier1.find((entry) => entry.id === 'primordial_fist');
    const unlocked = new Set(perks);
    let damage = skill.baseDamage * (playerStats.baseAtk / 10);
    if (unlocked.has('perk_suan_dmg_1')) damage *= 1.15;
    if (unlocked.has('perk_suan_dmg_2')) damage *= 1.25;
    const projectileCount = unlocked.has('perk_extra_projectile') ? 2 : 1;
    const cooldown = skill.cooldown * (unlocked.has('perk_cdr') ? 0.85 : 1);
    const expectedCritMultiplier = 1 + playerStats.baseCritRate * (playerStats.baseCritDmg - 1);
    return {
        skillId: skill.id,
        skillLevel: 1,
        baseDamage: skill.baseDamage,
        damageBeforeExpectedCrit: Number(damage.toFixed(4)),
        cooldownSeconds: Number(cooldown.toFixed(4)),
        projectileCount,
        expectedCritMultiplier: Number(expectedCritMultiplier.toFixed(4)),
        representativeDps: Number(((damage * projectileCount * expectedCritMultiplier) / cooldown).toFixed(4))
    };
}

const enemyModifiers = Object.freeze({
    wild_rhino: [1.15, 1.1], green_scaled_eagle: [0.8, 0.9], rock_golem: [1.45, 1.2],
    bandit_cultivator: [1, 1], burrow_wyrm: [1.1, 1], sky_predator: [0.75, 1.05],
    human_genius: [1.15, 1.15], genius_beast: [1.25, 1.2], huo_linger_projection: [1.7, 1.25],
    shi_yi_projection: [1.9, 1.35], qiongqi_cub: [1, 1], ancient_beast_king: [1, 1], shi_yi_phantom: [1, 1]
});

export function resolveRuntimeEnemyStats({ nodeId, playerStats, playerPerks = [], enemyType, role = 'normal', phaseMultiplier = 1 }) {
    const budget = getNodePowerBudget(nodeId);
    const dps = resolveExpectedSkillDps(playerStats, playerPerks).representativeDps;
    const [healthModifier, damageModifier] = enemyModifiers[enemyType] || [1, 1];
    const roleBudget = role === 'boss' ? budget.boss : role === 'elite' ? budget.elite : budget.normal;
    const hp = Math.max(1, Math.round(dps * roleBudget.ttkSeconds * healthModifier * phaseMultiplier));
    const atk = Math.max(1, Math.round((playerStats.baseHp / roleBudget.hitsToKill) * damageModifier));
    return { hp, atk, expectedDps: dps, role, budgetVersion: POWER_BUDGET_VERSION };
}

export function resolveNodeProjectileDamage(nodeId, playerMaxHp) {
    return Math.max(1, Math.ceil(playerMaxHp / getNodePowerBudget(nodeId).boss.projectileHitsToKill));
}

export function formatCombatNumber(value) {
    const absolute = Math.abs(Number(value) || 0);
    if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (absolute >= 1_000) return `${(value / 1_000).toFixed(absolute >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
    return `${Math.round(value)}`;
}
