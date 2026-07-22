import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'survivor_horde',
    duration: 120,
    world: {
        width: null,
        height: null
    },
    player: {
        hp: 100,
        speed: 150,
        radius: 14,
        color: 0x66fcf1,
        collisionCooldownMs: 600
    },
    visuals: {
        characterDesignCatalog: [],
        enemyDesignCatalog: []
    },
    enemies: {
        spawnIntervalMs: 1000,
        spawnRadiusRatio: 0.6,
        spawnCount: 1,
        spawnScaling: {
            everySeconds: 30,
            add: 1
        },
        pool: [
            {
                id: 'grunt',
                hp: 2,
                speed: 80,
                damage: 10,
                radius: 10,
                color: 0x888888,
                reward: { score: 1 }
            }
        ]
    },
    weapon: {
        fireIntervalMs: 1500,
        bulletSpeed: 420,
        bulletDamage: 2,
        bulletRadius: 5,
        bulletColor: 0xff4444,
        bulletLifetimeMs: 1800
    },
    collectibles: {
        enabled: true,
        radius: 6,
        color: 0x66fcf1,
        reward: { score: 1 }
    },
    boss: null,
    rewards: {},
    failRewardMultiplier: 0.5
});

const LEGACY_ENEMY_STATS = Object.freeze({
    wild_rhino: { hp: 3, speed: 60, damage: 8, radius: 13, reward: { score: 1 } },
    green_scaled_eagle: { hp: 2, speed: 110, damage: 10, radius: 10, reward: { score: 2 } },
    rock_golem: { hp: 8, speed: 38, damage: 12, radius: 16, reward: { score: 3 } },
    bandit_cultivator: { hp: 5, speed: 76, damage: 14, radius: 11, reward: { score: 2 } },
    burrow_wyrm: { hp: 6, speed: 54, damage: 15, radius: 12, reward: { score: 2 } },
    sky_predator: { hp: 4, speed: 125, damage: 18, radius: 10, reward: { score: 2 } },
    human_genius: { hp: 8, speed: 84, damage: 20, radius: 12, reward: { score: 4 } },
    genius_beast: { hp: 10, speed: 92, damage: 24, radius: 14, reward: { score: 4 } },
    huo_linger_projection: { hp: 14, speed: 86, damage: 26, radius: 13, reward: { score: 6 } },
    shi_yi_projection: { hp: 18, speed: 78, damage: 30, radius: 14, reward: { score: 8 } },
    qiongqi_cub: { hp: 40, speed: 45, damage: 22, radius: 24, reward: { score: 12 } },
    ancient_beast_king: { hp: 64, speed: 38, damage: 30, radius: 28, reward: { score: 18 } },
    shi_yi_phantom: { hp: 90, speed: 50, damage: 36, radius: 24, reward: { score: 24 } }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') patch = {};
    const output = Object.fromEntries(Object.entries(base || {}).map(([key, value]) => {
        if (Array.isArray(value)) return [key, value.map((item) => (
            item && typeof item === 'object' ? mergeConfig(item, {}) : item
        ))];
        if (value && typeof value === 'object') return [key, mergeConfig(value, {})];
        return [key, value];
    }));

    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            output[key] = value.slice();
        } else if (value && typeof value === 'object' && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }

    return output;
}

function normalizeConfig(payload = {}) {
    const nodeConfig = payload.nodeConfig || {};
    const gameplayConfig = nodeConfig.gameplay || {};
    const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
    const merged = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));
    const runtimeVisuals = normalizeRuntimeVisuals(nodeConfig, gameplayConfig, knobs);

    merged.visuals = mergeConfig(merged.visuals || {}, runtimeVisuals);

    const hasExplicitEnemyPool = Array.isArray(gameplayConfig.enemies?.pool) || Array.isArray(knobs.enemies?.pool);
    const legacyEnemyPool = Array.isArray(knobs.enemyPool)
        ? knobs.enemyPool
        : (Array.isArray(nodeConfig.enemyPool) ? nodeConfig.enemyPool : []);

    if (!hasExplicitEnemyPool && legacyEnemyPool.length) {
        merged.enemies.pool = legacyEnemyPool.map((enemyId) => createEnemyConfigFromId(enemyId));
    }

    merged.duration = nodeConfig.duration || merged.duration;
    merged.rewards = nodeConfig.rewards || merged.rewards;

    if (nodeConfig.failPenalty?.rewardMultiplier !== undefined) {
        merged.failRewardMultiplier = nodeConfig.failPenalty.rewardMultiplier;
    } else if (nodeConfig.failRewardMultiplier !== undefined) {
        merged.failRewardMultiplier = nodeConfig.failRewardMultiplier;
    }

    if (nodeConfig.boss) {
        merged.boss = mergeConfig(merged.boss || {}, nodeConfig.boss);
    }

    const legacyBossId = knobs.bossId || nodeConfig.bossId;
    if (legacyBossId && !nodeConfig.boss && !gameplayConfig.boss && !knobs.boss) {
        merged.boss = createEnemyConfigFromId(legacyBossId, {
            hp: LEGACY_ENEMY_STATS[legacyBossId]?.hp || 48,
            speed: LEGACY_ENEMY_STATS[legacyBossId]?.speed || 48,
            damage: LEGACY_ENEMY_STATS[legacyBossId]?.damage || 24,
            radius: LEGACY_ENEMY_STATS[legacyBossId]?.radius || 24,
            reward: LEGACY_ENEMY_STATS[legacyBossId]?.reward || { score: 12 }
        });
    }

    return merged;
}

function pickWeighted(items, random = Math.random) {
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
    let cursor = random() * total;

    for (const item of items) {
        cursor -= item.weight || 1;
        if (cursor <= 0) return item;
    }

    return items[items.length - 1];
}

function addRewards(target, patch = {}) {
    for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'number') {
            target[key] = (target[key] || 0) + value;
        }
    }
    return target;
}

function normalizeRuntimeVisuals(nodeConfig = {}, gameplayConfig = {}, knobs = {}) {
    const visuals = mergeConfig(
        nodeConfig.runtimeVisuals || nodeConfig.visuals || {},
        mergeConfig(gameplayConfig.runtimeVisuals || gameplayConfig.visuals || {}, knobs.runtimeVisuals || knobs.visuals || {})
    );

    return {
        characterDesignCatalog: asArray(
            visuals.characterDesignCatalog ||
            nodeConfig.characterDesignCatalog ||
            gameplayConfig.characterDesignCatalog ||
            knobs.characterDesignCatalog
        ),
        enemyDesignCatalog: asArray(
            visuals.enemyDesignCatalog ||
            nodeConfig.enemyDesignCatalog ||
            gameplayConfig.enemyDesignCatalog ||
            knobs.enemyDesignCatalog
        )
    };
}

function asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function createEnemyConfigFromId(enemyId, patch = {}) {
    const base = LEGACY_ENEMY_STATS[enemyId] || {};
    return mergeConfig({
        id: enemyId,
        hp: base.hp || 2,
        speed: base.speed || 80,
        damage: base.damage || 10,
        radius: base.radius || 10,
        color: base.color || 0x888888,
        reward: base.reward || { score: 1 }
    }, patch);
}

function colorToNumber(value, fallback = 0xffffff) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value.replace('#', ''), 16);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}

function inferEnemyArchetype(enemyId, design = {}) {
    const read = `${enemyId || ''} ${design.name || ''} ${design.silhouette || ''}`;
    if (/eagle|predator|鹰|禽|翼|鸟/.test(read)) return 'winged_beast';
    if (/golem|rock|傀儡|岩|石/.test(read)) return 'stone_golem';
    if (/wyrm|serpent|龙|蛇|穿山/.test(read)) return 'serpent';
    if (/huo|火/.test(read)) return 'fire_elite';
    if (/shi_yi|重瞳|投影|虚影/.test(read)) return 'rival_projection';
    if (/qiongqi|king|boss|穷奇|兽王|巨兽/.test(read)) return 'boss';
    if (/human|bandit|cultivator|人形|修士|天才/.test(read)) return 'humanoid';
    return 'horned_beast';
}

function getDesignId(design) {
    return design?.runtimeEnemyId || design?.id;
}

export default class SurvivorHordeAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = normalizeConfig();
        this.modifiers = context.modifiers || [];
        this.groups = {};
        this.player = null;
        this.playerAura = null;
        this.targetPoint = null;
        this.enemyTargetSelector = null;
        this.enemyVisualDesigns = new Map();
        this.runtimeArt = context.runtimeArt || context.art || null;
        this.random = typeof context.random === 'function' ? context.random : Math.random;
        this.runtimeEventListeners = new Map();
        this.runtimeEventHistory = [];
        this.runtimeEventSequence = 0;
        this.artStats = { player: 'pending', enemies: {}, projectiles: 'pending', pickups: 'pending' };
        this.state = {
            hp: DEFAULT_CONFIG.player.hp,
            elapsedSeconds: 0,
            timeRemaining: DEFAULT_CONFIG.duration,
            kills: 0,
            score: 0,
            collectedRewards: {},
            lastPlayerHitAt: -Infinity,
            bossSpawned: false
        };
    }

    init(payload = {}) {
        super.init(payload);
        this.config = normalizeConfig(payload);
        this.runtimeArt = payload.runtimeArt || payload.art || this.runtimeArt || this.context.runtimeArt || null;
        this.enemyVisualDesigns = new Map(
            (this.config.visuals?.enemyDesignCatalog || [])
                .map((design) => [getDesignId(design), design])
                .filter(([id]) => Boolean(id))
        );
        this.state.hp = payload.playerStats?.hp || payload.playerStats?.baseHp || this.config.player.hp;
        this.state.timeRemaining = this.config.duration;
        return this;
    }

    create(scene) {
        super.create(scene);
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();

        // Rebind art context to this scene (Boot installs textures globally on the game)
        if (!this.runtimeArt && scene.game?.registry?.get) {
            const binder = scene.game.registry.get('runtimeArtBinder');
            if (binder?.createContext) this.runtimeArt = binder.createContext(scene);
            else this.runtimeArt = scene.game.registry.get('runtimeArt') || null;
        } else if (this.runtimeArt?.binder && scene) {
            this.runtimeArt = this.runtimeArt.binder.createContext(scene);
        }

        const width = this.config.world.width || scene.scale.width;
        const height = this.config.world.height || scene.scale.height;
        this.world = { width, height };
        this.targetPoint = { x: width / 2, y: height / 2 };

        if (scene.physics?.world?.setBounds) {
            scene.physics.world.setBounds(0, 0, width, height);
        }

        // Environment background (atlas env_bg_* + ground/landmarks)
        const envKey = this.config.visuals?.envKey
            || this.config.knobs?.envKey
            || this.payload?.nodeConfig?.gameplay?.knobs?.envKey
            || null;
        const nodeId = this.payload?.nodeId || this.payload?.nodeIndex || this.config.id;
        this.background = this.runtimeArt?.createBackground?.({
            width,
            height,
            nodeId,
            prefer: envKey ? [envKey] : null,
            depth: -20
        }) || null;
        this.artStats.env = this.background?.getData?.('envKey') || 'none';

        this.player = this.createPlayerAvatar(width / 2, height / 2);
        this.player.body?.setCollideWorldBounds?.(true);
        this.playerClip = 'idle';
        this.runtimeArt?.playClip?.(this.player, 'player', 'idle', { repeat: -1, frameRate: 4 });

        this.groups.enemies = scene.physics.add.group();
        this.groups.bullets = scene.physics.add.group();
        this.groups.collectibles = scene.physics.add.group();

        this.lifecycle.addCleanup(() => {
            Object.values(this.groups).forEach((group) => group?.clear?.(true, true));
            this.playerAura?.destroy?.();
            this.player?.destroy?.();
            this.background?.destroy?.();
        });

        this.bindInput();
        this.bindCollisions();
        this.startTimers();
        this.installModifiers();
        this.publishTestState();

        return this;
    }

    bindInput() {
        const onPointer = (pointer) => {
            this.targetPoint.x = pointer.x;
            this.targetPoint.y = pointer.y;
        };

        this.lifecycle.trackListener(this.scene.input, 'pointerdown', onPointer);
        this.lifecycle.trackListener(this.scene.input, 'pointermove', (pointer) => {
            if (pointer.isDown) onPointer(pointer);
        });
    }

    bindCollisions() {
        const { physics } = this.scene;
        physics.add.overlap(this.player, this.groups.enemies, this.handlePlayerEnemyOverlap, null, this);
        physics.add.overlap(this.groups.bullets, this.groups.enemies, this.handleBulletEnemyOverlap, null, this);
        physics.add.overlap(this.player, this.groups.collectibles, this.handleCollectibleOverlap, null, this);
    }

    startTimers() {
        this.lifecycle.trackTimer(this.scene.time.addEvent({
            delay: this.config.enemies.spawnIntervalMs,
            callback: this.spawnWave,
            callbackScope: this,
            loop: true
        }));

        this.lifecycle.trackTimer(this.scene.time.addEvent({
            delay: this.config.weapon.fireIntervalMs,
            callback: this.fireAtNearestEnemy,
            callbackScope: this,
            loop: true
        }));

        this.lifecycle.trackTimer(this.scene.time.addEvent({
            delay: 1000,
            callback: this.onSecondTick,
            callbackScope: this,
            loop: true
        }));
    }

    installModifiers() {
        const context = this.createRuntimeContext();
        this.modifiers.forEach((modifier) => modifier.install(context));
    }

    addModifier(modifier) {
        this.modifiers.push(modifier);
        if (this.status === 'running') {
            modifier.install(this.createRuntimeContext());
        }
        return modifier;
    }

    onRuntimeEvent(type, listener) {
        if (!type || typeof listener !== 'function') return () => {};
        const listeners = this.runtimeEventListeners.get(type) || new Set();
        listeners.add(listener);
        this.runtimeEventListeners.set(type, listeners);
        return () => {
            listeners.delete(listener);
            if (!listeners.size) this.runtimeEventListeners.delete(type);
        };
    }

    emitRuntimeEvent(type, payload = {}) {
        if (!type) return null;
        const event = {
            sequence: ++this.runtimeEventSequence,
            type,
            atMs: Number.isFinite(this.scene?.time?.now)
                ? this.scene.time.now
                : Math.round((this.state.elapsedSeconds || 0) * 1000),
            ...payload
        };
        this.runtimeEventHistory.push(event);
        if (this.runtimeEventHistory.length > 40) this.runtimeEventHistory.shift();

        const notify = (listeners) => {
            [...(listeners || [])].forEach((listener) => listener(event));
        };
        notify(this.runtimeEventListeners.get(type));
        notify(this.runtimeEventListeners.get('*'));
        this.context.onRuntimeEvent?.(event, this);
        if (type === 'presentation') this.context.onPresentationEvent?.(event, this);
        return event;
    }

    createRuntimeContext() {
        return {
            adapter: this,
            scene: this.scene,
            lifecycle: this.lifecycle,
            config: this.config,
            state: this.state,
            groups: this.groups,
            player: this.player,
            random: this.random,
            events: {
                on: (...args) => this.onRuntimeEvent(...args),
                emit: (...args) => this.emitRuntimeEvent(...args)
            },
            helpers: {
                createCircle: (...args) => this.createCircle(...args),
                damagePlayer: (...args) => this.damagePlayer(...args),
                damageEnemy: (...args) => this.damageEnemy(...args),
                end: (...args) => this.finish(...args),
                emitPresentation: (payload) => this.emitRuntimeEvent('presentation', payload),
                publishTestState: () => this.publishTestState()
            }
        };
    }

    update(time, delta) {
        if (!this.isRunning()) return;

        this.updatePlayerMovement();
        this.renderPlayerAura(time);
        this.updateEnemies();
        this.cleanupBullets(time);

        const context = this.createRuntimeContext();
        this.modifiers.forEach((modifier) => modifier.update(context, time, delta));
        this.publishTestState();
    }

    updatePlayerMovement() {
        if (!this.player?.body || !this.targetPoint) return;

        const dx = this.targetPoint.x - this.player.x;
        const dy = this.targetPoint.y - this.player.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= 5) {
            this.player.body.setVelocity(0, 0);
            if (this.playerClip !== 'idle') {
                this.playerClip = 'idle';
                this.runtimeArt?.playClip?.(this.player, 'player', 'idle', { repeat: -1, frameRate: 4 });
            }
            return;
        }

        const speed = this.config.player.speed;
        this.player.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        if (this.player.setFlipX) this.player.setFlipX(dx < 0);
        if (this.playerClip !== 'walk') {
            this.playerClip = 'walk';
            this.runtimeArt?.playClip?.(this.player, 'player', 'walk', { repeat: -1, frameRate: 8 });
        }
    }

    updateEnemies() {
        this.groups.enemies.getChildren().forEach((enemy) => {
            if (!enemy.active) return;
            const target = this.selectEnemyTarget(enemy);
            const speed = enemy.getData('speed') || this.config.enemies.pool[0]?.speed || 80;
            this.scene.physics.moveToObject(enemy, target, speed);
        });
    }

    selectEnemyTarget(enemy) {
        if (this.enemyTargetSelector) {
            return this.enemyTargetSelector(enemy, this.createRuntimeContext()) || this.player;
        }
        return this.player;
    }

    setEnemyTargetSelector(selector) {
        this.enemyTargetSelector = selector;
    }

    spawnWave() {
        if (!this.isRunning()) return;

        const scaling = this.config.enemies.spawnScaling || {};
        const everySeconds = scaling.everySeconds || 0;
        const extra = everySeconds > 0 ? Math.floor(this.state.elapsedSeconds / everySeconds) * (scaling.add || 0) : 0;
        const count = (this.config.enemies.spawnCount || 1) + extra;

        for (let i = 0; i < count; i += 1) {
            this.spawnEnemy();
        }
    }

    spawnEnemy(patch = {}) {
        const enemyConfig = mergeConfig(pickWeighted(this.config.enemies.pool, this.random) || {}, patch);
        const angle = this.random() * Math.PI * 2;
        const radius = Math.max(this.world.width, this.world.height) * this.config.enemies.spawnRadiusRatio;
        const x = this.player.x + Math.cos(angle) * radius;
        const y = this.player.y + Math.sin(angle) * radius;
        const enemy = this.createEnemyAvatar(x, y, enemyConfig);

        enemy.setData('id', enemyConfig.id || 'enemy');
        enemy.setData('hp', enemyConfig.hp || 1);
        enemy.setData('maxHp', enemyConfig.hp || 1);
        enemy.setData('radius', enemyConfig.radius || 10);
        enemy.setData('speed', enemyConfig.speed || 80);
        enemy.setData('damage', enemyConfig.damage || 10);
        enemy.setData('reward', enemyConfig.reward || {});
        this.groups.enemies.add(enemy);

        return enemy;
    }

    spawnBoss() {
        if (!this.config.boss || this.state.bossSpawned) return null;
        this.state.bossSpawned = true;
        return this.spawnEnemy({
            id: this.config.boss.id || 'boss',
            hp: this.config.boss.hp || 100,
            speed: this.config.boss.speed || 50,
            damage: this.config.boss.damage || 20,
            radius: this.config.boss.radius || 28,
            color: this.config.boss.color || 0xff3333,
            reward: this.config.boss.reward || {}
        });
    }

    fireAtNearestEnemy() {
        if (!this.isRunning()) return;

        const target = this.findNearestEnemy();
        if (!target) return;

        // Brief attack pose on player when firing
        this.runtimeArt?.playClip?.(this.player, 'player', 'attack', { repeat: 0, frameRate: 10 });
        this.lifecycle.trackTimer(this.scene.time.delayedCall(280, () => {
            if (!this.isRunning() || !this.player) return;
            const moving = this.player.body && (Math.hypot(this.player.body.velocity.x, this.player.body.velocity.y) > 10);
            this.playerClip = moving ? 'walk' : 'idle';
            this.runtimeArt?.playClip?.(this.player, 'player', this.playerClip, { repeat: -1, frameRate: moving ? 8 : 4 });
        }));

        const bullet = this.createProjectile(this.player.x, this.player.y);
        bullet.setData('damage', this.config.weapon.bulletDamage);
        bullet.setData('createdAt', this.scene.time.now);
        this.groups.bullets.add(bullet);
        this.scene.physics.moveToObject(bullet, target, this.config.weapon.bulletSpeed);
    }

    createProjectile(x, y) {
        const radius = this.config.weapon.bulletRadius || 5;
        const artKey = this.runtimeArt?.resolve?.('projectile')
            || this.runtimeArt?.projectileKey?.();
        if (artKey && this.scene.textures.exists(artKey)) {
            this.artStats.projectiles = artKey;
            const sprite = this.scene.add.sprite(x, y, artKey);
            this.scene.physics.add.existing(sprite);
            sprite.setDisplaySize(radius * 3.2, radius * 3.2);
            sprite.setDepth(3);
            sprite.body?.setCircle?.(radius);
            sprite.setData('artSource', 'atlas');
            return sprite;
        }
        this.artStats.projectiles = this.artStats.projectiles === 'pending' ? 'procedural' : this.artStats.projectiles;
        return this.createCircle(x, y, radius, this.config.weapon.bulletColor);
    }

    findNearestEnemy() {
        let nearest = null;
        let nearestDistance = Infinity;

        this.groups.enemies.getChildren().forEach((enemy) => {
            if (!enemy.active) return;
            const distance = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
            if (distance < nearestDistance) {
                nearest = enemy;
                nearestDistance = distance;
            }
        });

        return nearest;
    }

    handleBulletEnemyOverlap(bullet, enemy) {
        if (!bullet.active || !enemy.active) return;
        const damage = bullet.getData('damage') || this.config.weapon.bulletDamage;
        bullet.destroy();
        this.damageEnemy(enemy, damage);
    }

    damageEnemy(enemy, damage) {
        if (!enemy?.active || !Number.isFinite(damage) || damage <= 0) return false;
        const beforeHp = enemy.getData('hp') || 0;
        const hp = beforeHp - damage;
        enemy.setData('hp', hp);

        const enemyId = enemy.getData('enemyId') || enemy.getData('id') || 'enemy';
        this.emitRuntimeEvent('enemy-damaged', {
            enemyId,
            amount: damage,
            beforeHp,
            hp: Math.max(0, hp)
        });
        if (hp <= 0) {
            this.runtimeArt?.playClip?.(enemy, 'enemy', 'death', {
                enemyId,
                repeat: 0,
                frameRate: 8
            });
            const reward = enemy.getData('reward') || {};
            this.state.kills += 1;
            this.emitRuntimeEvent('enemy-defeated', { enemyId, reward });
            if (this.config.collectibles.enabled) {
                this.spawnCollectible(enemy.x, enemy.y, reward);
            } else {
                addRewards(this.state.collectedRewards, reward);
                this.state.score += reward.score || 1;
            }
            this.lifecycle.trackTimer(this.scene.time.delayedCall(120, () => {
                if (enemy?.active) enemy.destroy();
            }));
        } else {
            this.runtimeArt?.playClip?.(enemy, 'enemy', 'hurt', {
                enemyId,
                repeat: 0,
                frameRate: 8
            });
            this.lifecycle.trackTimer(this.scene.time.delayedCall(180, () => {
                if (enemy?.active) {
                    this.runtimeArt?.playClip?.(enemy, 'enemy', 'walk', {
                        enemyId,
                        repeat: -1,
                        frameRate: 6
                    });
                }
            }));
        }
        return true;
    }

    handlePlayerEnemyOverlap(_player, enemy) {
        const now = this.scene.time.now;
        if (now - this.state.lastPlayerHitAt < this.config.player.collisionCooldownMs) return;
        this.state.lastPlayerHitAt = now;
        this.damagePlayer(enemy.getData('damage') || 10, NODE_RESULT_REASONS.HP_ZERO);
    }

    damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning() || !Number.isFinite(amount) || amount <= 0) return false;
        const beforeHp = this.state.hp;
        this.state.hp = Math.max(beforeHp - amount, 0);
        this.emitRuntimeEvent('player-damaged', {
            amount,
            beforeHp,
            hp: this.state.hp,
            reason: failReason
        });
        if (this.state.hp <= 0) {
            this.finish(false, failReason);
        }
        return true;
    }

    spawnCollectible(x, y, reward = {}) {
        if (!this.config.collectibles.enabled) return null;
        const radius = this.config.collectibles.radius || 6;
        const artKey = this.runtimeArt?.resolve?.('pickup')
            || this.runtimeArt?.pickupKey?.();
        let collectible;
        if (artKey && this.scene.textures.exists(artKey)) {
            this.artStats.pickups = artKey;
            collectible = this.scene.add.sprite(x, y, artKey);
            this.scene.physics.add.existing(collectible);
            collectible.setDisplaySize(radius * 3.5, radius * 3.5);
            collectible.setDepth(2);
            collectible.body?.setCircle?.(radius);
            collectible.setData('artSource', 'atlas');
        } else {
            this.artStats.pickups = this.artStats.pickups === 'pending' ? 'procedural' : this.artStats.pickups;
            collectible = this.createCircle(x, y, radius, this.config.collectibles.color);
        }
        collectible.setData('reward', reward);
        this.groups.collectibles.add(collectible);
        return collectible;
    }

    handleCollectibleOverlap(_player, collectible) {
        const reward = collectible.getData('reward') || this.config.collectibles.reward || {};
        addRewards(this.state.collectedRewards, reward);
        this.state.score += reward.score || 1;
        collectible.destroy();
    }

    cleanupBullets(time) {
        this.groups.bullets.getChildren().forEach((bullet) => {
            const createdAt = bullet.getData('createdAt') || time;
            const expired = time - createdAt > this.config.weapon.bulletLifetimeMs;
            const outOfBounds = bullet.x < -50 || bullet.y < -50 || bullet.x > this.world.width + 50 || bullet.y > this.world.height + 50;
            if (expired || outOfBounds) bullet.destroy();
        });
    }

    onSecondTick() {
        if (!this.isRunning()) return;

        this.state.elapsedSeconds += 1;
        this.state.timeRemaining = Math.max(this.config.duration - this.state.elapsedSeconds, 0);

        if (this.config.boss?.spawnAt !== undefined && this.state.elapsedSeconds === this.config.boss.spawnAt) {
            this.spawnBoss();
        }

        if (this.state.timeRemaining <= 0) {
            this.finish(true, NODE_RESULT_REASONS.TIMER_EXPIRED);
        }
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();

        const rewards = { ...this.state.collectedRewards };
        if (success) {
            addRewards(rewards, this.config.rewards);
        } else {
            for (const key of Object.keys(rewards)) {
                rewards[key] = Math.floor(rewards[key] * this.config.failRewardMultiplier);
            }
        }

        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED),
            rewards,
            telemetry: this.getTelemetry()
        });

        const context = this.createRuntimeContext();
        this.modifiers.forEach((modifier) => modifier.uninstall(context));
        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();

        return result;
    }

    retreat() {
        return this.finish(false, NODE_RESULT_REASONS.RETREATED);
    }

    pause() {
        super.pause();
        this.lifecycle?.pause();
        this.scene?.physics?.pause?.();
    }

    resume() {
        super.resume();
        this.lifecycle?.resume();
        this.scene?.physics?.resume?.();
    }

    destroy() {
        const context = this.createRuntimeContext();
        this.modifiers.forEach((modifier) => modifier.uninstall(context));
        this.lifecycle?.destroy();
        this.runtimeEventListeners.clear();
        super.destroy();
    }

    isRunning() {
        return this.status === 'running' && !this.lifecycle?.transitionLocked;
    }

    getPlayerVisualDesign() {
        const catalog = this.config.visuals?.characterDesignCatalog || [];
        return catalog.find((item) => item.role === 'player_character')
            || catalog.find((item) => /player|hero|avatar|protagonist|main_?character|xing_?xiao/i.test(`${item.id || ''} ${item.name || ''}`))
            || null;
    }

    ensurePlayerTexture() {
        // Atlas-first: RuntimeArtBinder semantic player keys
        const artKey = this.runtimeArt?.resolve?.('player')
            || this.runtimeArt?.playerKey?.();
        if (artKey && this.scene.textures.exists(artKey)) {
            this.artStats.player = artKey;
            return artKey;
        }
        for (const candidate of [
            'lw_runtime_player_shihao',
            'lw_runtime_player_idle',
            'lw_runtime_player_avatar',
            'shihao_young_runtime',
            'player_idle'
        ]) {
            if (this.scene.textures.exists(candidate)) {
                this.artStats.player = candidate;
                return candidate;
            }
        }

        const visual = this.getPlayerVisualDesign();
        const palette = visual?.visualDesign?.palette || [];
        const key = 'lw_runtime_player_avatar';
        if (this.scene.textures.exists(key)) return key;
        this.artStats.player = 'procedural';

        const main = colorToNumber(palette[0], this.config.player.color || 0xf59e0b);
        const glow = colorToNumber(palette[1], 0xfef3c7);
        const aura = colorToNumber(palette[2], 0x38bdf8);
        const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

        g.fillStyle(aura, 0.2);
        g.fillCircle(40, 42, 34);
        g.lineStyle(2, glow, 0.78);
        g.strokeCircle(40, 42, 34);
        g.lineStyle(2, main, 0.72);
        g.strokeCircle(40, 42, 24);
        for (let i = 0; i < 8; i += 1) {
            const angle = (Math.PI * 2 * i) / 8;
            const x = 40 + Math.cos(angle) * 30;
            const y = 42 + Math.sin(angle) * 30;
            g.lineStyle(1, main, 0.4);
            g.lineBetween(40, 42, x, y);
            g.fillStyle(glow, 0.88);
            g.fillCircle(x, y, 2);
        }

        g.fillStyle(0x7c4a23, 1);
        g.fillRoundedRect(29, 35, 22, 29, 7);
        g.fillStyle(0xf7c98f, 1);
        g.fillCircle(40, 25, 11);
        g.fillStyle(0x201208, 1);
        g.fillRoundedRect(29, 15, 22, 10, 5);
        g.fillStyle(glow, 1);
        g.fillRect(34, 38, 12, 17);
        g.fillStyle(aura, 1);
        g.fillCircle(40, 46, 5);
        g.fillStyle(main, 1);
        g.fillRect(25, 46, 9, 4);
        g.fillRect(46, 46, 9, 4);
        g.fillStyle(0x111827, 1);
        g.fillRect(35, 24, 2, 2);
        g.fillRect(43, 24, 2, 2);
        g.fillStyle(0x0f172a, 0.55);
        g.fillEllipse(40, 68, 30, 8);

        g.generateTexture(key, 80, 80);
        g.destroy();
        return key;
    }

    createPlayerAvatar(x, y) {
        const textureKey = this.ensurePlayerTexture();
        this.playerAura = this.scene.add.graphics();
        this.playerAura.setDepth(0);

        const sprite = this.scene.add.sprite(x, y, textureKey);
        this.scene.physics.add.existing(sprite);
        sprite.setDisplaySize((this.config.player.radius || 14) * 4, (this.config.player.radius || 14) * 4);
        sprite.setDepth(2);
        sprite.body?.setSize?.((this.config.player.radius || 14) * 2, (this.config.player.radius || 14) * 2.4);
        sprite.body?.setOffset?.(40 - (this.config.player.radius || 14), 40 - (this.config.player.radius || 14));
        this.renderPlayerAura(0, sprite);
        return sprite;
    }

    renderPlayerAura(time = 0, target = this.player) {
        if (!this.playerAura || !target?.active) return;

        const visual = this.getPlayerVisualDesign();
        const palette = visual?.visualDesign?.palette || [];
        const main = colorToNumber(palette[0], this.config.player.color || 0xf59e0b);
        const glow = colorToNumber(palette[1], 0xfef3c7);
        const aura = colorToNumber(palette[2], 0x38bdf8);
        const radius = (this.config.player.radius || 14) * 2.6;
        const pulse = Math.sin(time / 240) * 3;
        const spin = time / 900;

        this.playerAura.clear();
        this.playerAura.lineStyle(2, aura, 0.32);
        this.playerAura.strokeCircle(target.x, target.y, radius + pulse);
        this.playerAura.lineStyle(1.5, glow, 0.45);
        this.playerAura.strokeCircle(target.x, target.y, radius * 0.72 - pulse * 0.25);
        this.playerAura.lineStyle(1, main, 0.42);

        for (let i = 0; i < 10; i += 1) {
            const angle = spin + (Math.PI * 2 * i) / 10;
            const x = target.x + Math.cos(angle) * (radius + pulse);
            const y = target.y + Math.sin(angle) * (radius + pulse);
            this.playerAura.strokeCircle(x, y, 2.5);
        }
    }

    getEnemyVisual(enemyConfig = {}) {
        const design = this.enemyVisualDesigns.get(enemyConfig.id) || this.enemyVisualDesigns.get(enemyConfig.runtimeEnemyId);
        const palette = design?.palette || [];
        return {
            textureKey: `lw_enemy_${enemyConfig.id || 'enemy'}`,
            archetype: enemyConfig.archetype || inferEnemyArchetype(enemyConfig.id, design),
            bodyColor: colorToNumber(palette[0], enemyConfig.color || 0x888888),
            accentColor: colorToNumber(palette[1], 0xfca5a5),
            glowColor: colorToNumber(palette[2], 0xffffff),
            displayName: design?.name || enemyConfig.name || enemyConfig.id || 'enemy',
            scale: /boss|king|qiongqi|phantom|穷奇|兽王|虚影/.test(`${enemyConfig.id || ''} ${design?.name || ''}`) ? 1.18 : 1
        };
    }

    ensureEnemyTexture(enemyConfig = {}) {
        const visual = this.getEnemyVisual(enemyConfig);
        const enemyId = enemyConfig.id || enemyConfig.runtimeEnemyId || 'enemy';

        // Atlas-first via RuntimeArtBinder
        const artKey = this.runtimeArt?.resolve?.('enemy', { enemyId })
            || this.runtimeArt?.enemyKey?.(enemyId);
        if (artKey && this.scene.textures.exists(artKey)) {
            this.artStats.enemies[enemyId] = artKey;
            return artKey;
        }
        for (const candidate of [
            visual.textureKey,
            `lw_enemy_${enemyId}`,
            `enemy_${enemyId}`,
            `enemy_${enemyId}_idle`
        ]) {
            if (candidate && this.scene.textures.exists(candidate)) {
                this.artStats.enemies[enemyId] = candidate;
                return candidate;
            }
        }

        if (this.scene.textures.exists(visual.textureKey)) return visual.textureKey;
        this.artStats.enemies[enemyId] = 'procedural';

        const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
        const body = visual.bodyColor;
        const accent = visual.accentColor;
        const glow = visual.glowColor;

        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(32, 52, 34, 10);

        switch (visual.archetype) {
            case 'horned_beast':
                g.fillStyle(body, 1);
                g.fillEllipse(32, 34, 38, 24);
                g.fillEllipse(18, 31, 18, 16);
                g.fillStyle(accent, 1);
                g.fillTriangle(9, 22, 18, 8, 19, 24);
                g.fillTriangle(19, 22, 31, 10, 27, 26);
                g.fillStyle(glow, 1);
                g.fillRect(13, 28, 4, 3);
                break;
            case 'winged_beast':
                g.fillStyle(body, 1);
                g.fillTriangle(31, 20, 9, 46, 34, 39);
                g.fillTriangle(33, 20, 56, 46, 30, 39);
                g.fillStyle(accent, 1);
                g.fillEllipse(32, 34, 18, 24);
                g.fillTriangle(32, 15, 25, 30, 39, 30);
                g.fillStyle(glow, 1);
                g.fillRect(30, 27, 4, 3);
                break;
            case 'stone_golem':
                g.fillStyle(body, 1);
                g.fillRoundedRect(18, 22, 28, 28, 5);
                g.fillStyle(accent, 1);
                g.fillRoundedRect(22, 15, 20, 14, 4);
                g.fillRoundedRect(10, 30, 12, 16, 3);
                g.fillRoundedRect(42, 30, 12, 16, 3);
                g.fillStyle(glow, 1);
                g.fillRect(28, 23, 8, 4);
                break;
            case 'humanoid':
                g.fillStyle(body, 1);
                g.fillCircle(32, 19, 8);
                g.fillRoundedRect(23, 28, 18, 22, 5);
                g.lineStyle(4, accent, 1);
                g.lineBetween(41, 30, 52, 21);
                g.lineStyle(2, glow, 0.8);
                g.strokeCircle(32, 32, 18);
                break;
            case 'serpent':
                g.fillStyle(body, 1);
                g.fillEllipse(20, 43, 26, 14);
                g.fillEllipse(31, 34, 28, 14);
                g.fillEllipse(43, 39, 24, 13);
                g.fillStyle(accent, 1);
                g.fillCircle(45, 34, 7);
                g.fillStyle(glow, 1);
                g.fillRect(47, 32, 3, 2);
                break;
            case 'fire_elite':
                g.fillStyle(body, 1);
                g.fillCircle(32, 19, 8);
                g.fillRoundedRect(22, 29, 20, 22, 6);
                g.fillStyle(accent, 0.9);
                g.fillTriangle(18, 48, 32, 11, 46, 48);
                g.lineStyle(2, glow, 0.8);
                g.strokeCircle(32, 34, 23);
                break;
            case 'rival_projection':
                g.fillStyle(body, 0.92);
                g.fillCircle(32, 19, 8);
                g.fillRoundedRect(23, 28, 18, 24, 6);
                g.lineStyle(2, accent, 0.9);
                g.strokeCircle(32, 32, 24);
                g.fillStyle(glow, 1);
                g.fillRect(25, 18, 5, 3);
                g.fillRect(34, 18, 5, 3);
                break;
            case 'boss':
                g.fillStyle(body, 1);
                g.fillEllipse(32, 36, 48, 30);
                g.fillEllipse(17, 29, 22, 20);
                g.fillStyle(accent, 1);
                g.fillTriangle(7, 20, 17, 4, 20, 23);
                g.fillTriangle(20, 20, 35, 6, 31, 25);
                g.fillTriangle(42, 17, 50, 4, 51, 24);
                g.fillStyle(glow, 1);
                g.fillRect(12, 28, 5, 3);
                g.lineStyle(3, glow, 0.55);
                g.strokeEllipse(32, 36, 52, 34);
                break;
            default:
                g.fillStyle(body, 1);
                g.fillCircle(32, 32, 20);
                g.lineStyle(3, accent, 0.85);
                g.strokeCircle(32, 32, 22);
                g.fillStyle(glow, 1);
                g.fillCircle(32, 26, 3);
                break;
        }

        g.generateTexture(visual.textureKey, 64, 64);
        g.destroy();
        return visual.textureKey;
    }

    createEnemyAvatar(x, y, enemyConfig = {}) {
        const textureKey = this.ensureEnemyTexture(enemyConfig);
        const visual = this.getEnemyVisual(enemyConfig);
        const radius = enemyConfig.radius || 10;
        const displaySize = Math.max(radius * 2.8 * visual.scale, 28);
        const sprite = this.scene.add.sprite(x, y, textureKey);
        this.scene.physics.add.existing(sprite);
        sprite.setDisplaySize(displaySize, displaySize);
        sprite.setDepth(1);
        sprite.body?.setSize?.(radius * 2, radius * 2);
        sprite.body?.setOffset?.(32 - radius, 32 - radius);
        sprite.setData('visualName', visual.displayName);
        sprite.setData('enemyId', enemyConfig.id || 'enemy');
        // Start walk clip when atlas multi/single frames exist
        this.runtimeArt?.playClip?.(sprite, 'enemy', 'walk', {
            enemyId: enemyConfig.id || 'enemy',
            repeat: -1,
            frameRate: 6
        });
        return sprite;
    }

    createCircle(x, y, radius, color, alpha = 1) {
        const circle = this.scene.add.circle(x, y, radius, color, alpha);
        this.scene.physics.add.existing(circle);
        return circle;
    }

    getTelemetry() {
        return {
            art: { ...this.artStats, pipeline: this.runtimeArt?.status?.() || null },
            elapsedSeconds: this.state.elapsedSeconds,
            timeRemaining: this.state.timeRemaining,
            kills: this.state.kills,
            score: this.state.score,
            hp: this.state.hp,
            bossSpawned: this.state.bossSpawned
        };
    }

    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            hp: this.state.hp,
            timer: this.state.timeRemaining,
            score: this.state.score,
            runtimeEvents: this.runtimeEventHistory.slice(-12),
            modifiers: this.modifiers.map((modifier) => (
                modifier.getTestState?.() || { modifier: modifier.constructor.name }
            )),
            lastResult: this.result
        });
    }

    getTestState() {
        return {
            ...super.getTestState(),
            configId: this.config.id,
            hp: this.state.hp,
            timer: this.state.timeRemaining,
            kills: this.state.kills,
            score: this.state.score,
            runtimeEvents: this.runtimeEventHistory.slice(-12),
            modifiers: this.modifiers.map((modifier) => modifier.getTestState?.() || { modifier: modifier.constructor.name })
        };
    }
}

export { DEFAULT_CONFIG as SURVIVOR_HORDE_DEFAULT_CONFIG };
