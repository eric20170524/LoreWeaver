import { SKILL_POOL_REGISTRY } from '../js/data.js';

export function findSkillData(skillTier, skillId) {
    const currentPool = SKILL_POOL_REGISTRY[skillTier] || [];
    const currentSkill = currentPool.find((skill) => skill.id === skillId);
    if (currentSkill) return currentSkill;
    for (const pool of Object.values(SKILL_POOL_REGISTRY)) {
        const skill = pool.find((candidate) => candidate.id === skillId);
        if (skill) return skill;
    }
    return null;
}

export function getLevelScaling(skillData, key, fallback = 0) {
    return skillData?.levelScaling?.[key] === undefined ? fallback : skillData.levelScaling[key];
}

export function hasPerk(scene, perkId) {
    return Array.isArray(scene.playerPerks) && scene.playerPerks.includes(perkId);
}

export function getSkillCooldown(scene, skillData, level) {
    const base = skillData.cooldown ?? skillData.interval ?? skillData.tickInterval ?? 1;
    let cooldown = base + (level - 1) * getLevelScaling(skillData, 'cooldown', getLevelScaling(skillData, 'interval', 0));
    if (hasPerk(scene, 'perk_cdr')) cooldown *= 0.85;
    if (hasPerk(scene, 'perk_kunpeng') && skillData.id === 'kunpeng_dodge') cooldown *= 0.75;
    return Math.max(cooldown, 0.1);
}

export function calculateSkillDamage(scene, skillData, level, random = Math.random) {
    const baseDamage = skillData.baseDamage || 0;
    const scaledDamage = baseDamage + (level - 1) * getLevelScaling(skillData, 'damage', 0);
    let damage = scaledDamage * (scene.playerStats.baseAtk / 10);
    if (hasPerk(scene, 'perk_suan_dmg_1')) damage *= 1.15;
    if (hasPerk(scene, 'perk_suan_dmg_2')) damage *= 1.25;
    if (hasPerk(scene, 'perk_thunder_god') && skillData.element === 'thunder') damage *= 1.2;
    if (hasPerk(scene, 'perk_supreme_bone') && skillData.rarity === 'legendary') damage *= 1.5;
    const critical = random() < (scene.playerStats.baseCritRate || 0);
    if (critical) damage *= scene.playerStats.baseCritDmg || 1.5;
    return { damage, critical };
}

export function findChainTarget(candidates, from, struck, range, distanceBetween) {
    let next = null;
    let nextDistance = range;
    candidates.forEach((candidate) => {
        if (candidate === from || struck.has(candidate)) return;
        const distance = distanceBetween(from, candidate);
        if (distance < nextDistance) { next = candidate; nextDistance = distance; }
    });
    return next;
}

export function isInsideCone(origin, point, angle, radius, halfArc, phaser) {
    const distance = phaser.Math.Distance.Between(origin.x, origin.y, point.x, point.y);
    if (distance > radius) return false;
    const pointAngle = phaser.Math.Angle.Between(origin.x, origin.y, point.x, point.y);
    return Math.abs(phaser.Math.Angle.Wrap(pointAngle - angle)) <= halfArc;
}

export function isInsideLaser(origin, point, angle, length, width, phaser) {
    const deltaX = point.x - origin.x;
    const deltaY = point.y - origin.y;
    const forwardX = Math.cos(angle);
    const forwardY = Math.sin(angle);
    const projection = deltaX * forwardX + deltaY * forwardY;
    if (projection < 0 || projection > length) return false;
    const projectionX = origin.x + forwardX * projection;
    const projectionY = origin.y + forwardY * projection;
    return phaser.Math.Distance.Between(point.x, point.y, projectionX, projectionY) <= width;
}

export function buildSkillExecutionPlan(scene, skillData, level, { phaser, random = Math.random } = {}) {
    // Self-centered / player-buff skills may cast without a living target.
    const noTargetTypes = new Set([
        'passive_heal',
        'passive_shield',
        'aoe_burst',
        'aura',
        'screen_clear',
        'transform',
        'active_dodge'
    ]);
    const enemies = scene.enemies?.getChildren?.() || [];
    if (enemies.length === 0 && !noTargetTypes.has(skillData.type)) {
        return { canCast: false, reason: 'no_target', target: null, distance: Infinity, damage: 0, critical: false };
    }
    let target = null;
    let distance = Infinity;
    for (const enemy of enemies) {
        const candidateDistance = phaser.Math.Distance.Between(scene.player.x, scene.player.y, enemy.x, enemy.y);
        if (candidateDistance < distance) {
            target = enemy;
            distance = candidateDistance;
        }
    }
    const { damage, critical } = calculateSkillDamage(scene, skillData, level, random);
    return { canCast: true, reason: null, target, distance, damage, critical };
}
