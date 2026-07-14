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

    // Map archetypes implicitly
    let archetype = 'melee';
    if (triangleType === 'emerald') archetype = 'ranged';
    else if (triangleType === 'crimson') archetype = 'charge';

    enemy.setData('triangleType', triangleType);
    enemy.setData('enemyType', enemyType);
    enemy.setData('visualName', visualName);
    enemy.setData('hp', baseHp);
    enemy.setData('atk', enemyData.atk);
    enemy.setData('speed', baseSpeed);
    enemy.setData('exp', enemyData.exp);
    enemy.setData('lootList', enemyData.lootList);
    enemy.setData('archetype', archetype);

    // State machine setup
    enemy.setData('state', 'chase');
    enemy.setData('stateTimer', 0);
    enemy.setData('attackCooldown', 0);

    for (const key of ['hp', 'atk', 'speed', 'exp', 'lootList']) {
        if (options[key] !== undefined) enemy.setData(key, options[key]);
    }
    for (const [key, value] of Object.entries(options.data || {})) enemy.setData(key, value);
    return enemy;
}

export function updateEnemyState(enemy, player, time, scene) {
    if (!enemy || !enemy.active || !player || !player.active) return;

    const state = enemy.getData('state') || 'chase';
    const archetype = enemy.getData('archetype') || 'melee';
    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);
    const speed = enemy.getData('speed') || 50;

    let attackCooldown = enemy.getData('attackCooldown') || 0;
    if (attackCooldown > 0) {
        enemy.setData('attackCooldown', attackCooldown - scene.sys.game.loop.delta);
    }

    if (state === 'chase') {
        let inRange = false;
        if (archetype === 'melee' && dist < 50) inRange = true;
        if (archetype === 'charge' && dist < 150) inRange = true;
        if (archetype === 'ranged' && dist < 250) inRange = true;

        if (inRange && attackCooldown <= 0) {
            enemy.setData('state', 'windup');
            enemy.setData('stateTimer', time);
            enemy.body.setVelocity(0, 0);

            // Telegraph setup based on archetype
            if (archetype === 'melee' || archetype === 'charge') {
                const telegraph = scene.add.circle(enemy.x, enemy.y, archetype === 'charge' ? 150 : 50, 0xff0000, 0.3);
                telegraph.setDepth(0);
                scene.tweens.add({
                    targets: telegraph,
                    alpha: 0.6,
                    duration: archetype === 'charge' ? 800 : 400,
                    onComplete: () => telegraph.destroy()
                });
            } else if (archetype === 'ranged') {
                const line = scene.add.line(0, 0, enemy.x, enemy.y, player.x, player.y, 0xff0000, 0.3);
                line.setOrigin(0,0);
                line.setDepth(0);
                scene.tweens.add({
                    targets: line,
                    alpha: 0.6,
                    duration: 600,
                    onComplete: () => line.destroy()
                });
            }
        } else {
            if (archetype === 'ranged' && dist < 200 && attackCooldown > 0) {
                // Ranged enemies try to keep distance while on cooldown
                scene.physics.moveToObject(enemy, player, -speed * 0.5);
            } else {
                scene.physics.moveToObject(enemy, player, speed);
            }
        }
    } else if (state === 'windup') {
        const timer = enemy.getData('stateTimer');
        const duration = archetype === 'charge' ? 800 : archetype === 'ranged' ? 600 : 400;

        if (time - timer >= duration) {
            enemy.setData('state', 'active');
            enemy.setData('stateTimer', time);

            if (archetype === 'charge') {
                scene.physics.moveToObject(enemy, player, speed * 3);
            }
            if (archetype === 'ranged') {
                if (scene.fireEnemyProjectile) {
                    scene.fireEnemyProjectile(enemy);
                }
            }
        }
    } else if (state === 'active') {
        const timer = enemy.getData('stateTimer');
        const duration = archetype === 'charge' ? 400 : 100;

        // Perform damage only during active frame if overlapping
        if (archetype === 'melee' || archetype === 'charge') {
             if (scene.physics.overlap(enemy, player)) {
                 if (scene.onPlayerHit) {
                     scene.onPlayerHit(enemy);
                 }
             }
        }

        if (time - timer >= duration) {
            enemy.setData('state', 'recovery');
            enemy.setData('stateTimer', time);
            enemy.body.setVelocity(0, 0);
        }
    } else if (state === 'recovery') {
        const timer = enemy.getData('stateTimer');
        if (time - timer >= 500) {
            enemy.setData('state', 'chase');
            enemy.setData('attackCooldown', 2000);
        }
    } else if (state === 'stun') {
        const timer = enemy.getData('stateTimer');
        enemy.body.setVelocity(0, 0);
        if (time - timer >= (enemy.getData('stunDuration') || 1000)) {
            enemy.setData('state', 'chase');
        }
    }
}
