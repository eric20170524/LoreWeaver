import { ENEMY_REGISTRY, ENEMY_VISUAL_DESIGN } from '../js/data.js';

export function createRuntimeEnemy(scene, enemyType, x, y, options = {}) {
    const enemyData = ENEMY_REGISTRY[enemyType] || ENEMY_REGISTRY.wild_rhino;
    const enemyVisual = ENEMY_VISUAL_DESIGN[enemyType] || {};
    const textureKey = scene.createEnemyTexture(enemyType);
    const visualScale = (enemyVisual.scale || 1.6) * (options.scaleMultiplier || 1);
    const enemy = scene.enemies.create(x, y, textureKey);
    const displaySize = Math.max(enemyData.size * visualScale, 28);
    enemy.setDisplaySize(displaySize, displaySize);
    enemy.setDepth(1);
    if (enemy.body) {
        enemy.body.setSize(enemyData.size, enemyData.size);
        enemy.body.setOffset((64 - enemyData.size) / 2, (64 - enemyData.size) / 2);
    }

    const triangleType = options.triangleType || scene.randomTriangleType?.() || 'crimson';
    let visualName = options.data?.visualName || enemyVisual.displayName || enemyData.name;
    let baseSpeed = enemyData.speed;
    let baseHp = enemyData.hp;
    if (triangleType === 'crimson') {
        visualName = `赤蛮·${visualName}`;
        enemy.setTint(0xff4444);
        baseHp = Math.round(baseHp * 1.8);
    } else if (triangleType === 'azure') {
        visualName = `苍啸·${visualName}`;
        enemy.setTint(0x4444ff);
        baseSpeed = Math.round(baseSpeed * 1.4);
    } else if (triangleType === 'emerald') {
        visualName = `碧落·${visualName}`;
        enemy.setTint(0x44ff44);
        baseSpeed = Math.round(baseSpeed * 0.8);
    }

    enemy.setData('triangleType', triangleType);
    enemy.setData('enemyType', enemyType);
    enemy.setData('visualName', visualName);
    enemy.setData('hp', baseHp);
    enemy.setData('atk', enemyData.atk);
    enemy.setData('speed', baseSpeed);
    enemy.setData('exp', enemyData.exp);
    enemy.setData('lootList', enemyData.lootList);
    for (const key of ['hp', 'atk', 'speed', 'exp', 'lootList']) {
        if (options[key] !== undefined) enemy.setData(key, options[key]);
    }
    for (const [key, value] of Object.entries(options.data || {})) enemy.setData(key, value);
    return enemy;
}
