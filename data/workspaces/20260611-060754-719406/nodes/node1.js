// nodes/node1.js
// Node 1: 荒域初试场景 - 转换为 ES Modules

import store from '../js/store.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import NodeBridge from '../systems/NodeBridge.js';
import {
    createAtlasFrameTexture,
    getRuntimeArtStatus,
    preloadImagegenAtlas,
    recordProceduralFallback
} from '../utils/RuntimeSprites.js';
import { SKILL_POOL_REGISTRY, ENEMY_REGISTRY } from '../js/data.js';
import TouchInputController from '../runtime/TouchInputController.js';
import { projectNodeResultInput } from '../runtime/run-metrics.js';
import { createRuntimeEnemy as createRuntimeEnemyFactory } from '../runtime/EnemyRuntime.js';
import {
    buildSkillExecutionPlan,
    calculateSkillDamage,
    findSkillData as findRuntimeSkillData,
    getLevelScaling as getRuntimeLevelScaling,
    getSkillCooldown as getRuntimeSkillCooldown,
    hasPerk as runtimeHasPerk
} from '../runtime/SkillRuntime.js';
import { Node1UI } from '../runtime/NodeCombatHud.js';
import { CombatRuntime } from '../runtime/CombatRuntime.js';
import { SkillExecutionRuntime } from '../runtime/SkillExecutionRuntime.js';
import PlayerActionController from '../runtime/PlayerActionController.js';
export { Node1UI } from '../runtime/NodeCombatHud.js';

export class Node1Scene extends Phaser.Scene {
    constructor(key = 'Node1Scene') {
        super(key);
    }

    init(data) {
        this.nodeConfig = data.nodeConfig;
        this.playerStats = data.playerStats;
        this.playerPerks = data.playerPerks || [];
        this.playerAbilities = data.playerAbilities || [];
        this.availableSkillPool = data.availableSkillPool || [];
        this.skillTier = data.skillTier;
        this.attemptId = data.attemptId || NodeBridge.createAttemptId(this.nodeConfig?.id || 1);
        
        this.kills = 0;
        this.surviveTime = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.isTransitioning = false; // 添加转场锁
        this.rewards = { bloodEssence: 0, suanBoneScript: 0 };
        this.lootLog = [];
        this.movementMode = 'idle';
        this.pauseReason = null;
        this.touchInput = new TouchInputController(this);
        this.combatRuntime = new CombatRuntime(this);
        this.skillExecutionRuntime = new SkillExecutionRuntime(this);
        this.playerActionController = new PlayerActionController(this);
        this.dashInvulnerable = false;
        this.touchMoveState = this.createEmptyTouchMoveState();
        this.joystickConfig = null;

        // 局内养成状态
        this.level = 1;
        this.currentExp = 0;
        this.expToNext = this.nodeConfig?.id === 1 ? 12 : 20;
        // 初始自带基础拳
        this.activeSkills = [{ id: "primordial_fist", level: 1, lastCast: 0 }];
        if (this.playerPerks.includes('perk_supreme_bone')) {
            this.activeSkills.push({ id: "supreme_bone_awaken", level: 1, lastCast: 0 });
        }
        if (this.nodeConfig.id === 12) {
            this.activeSkills.push({ id: "he_hua_projection", level: 1, lastCast: 0 });
        }

        // 玩家血量与无敌状态
        this.playerMaxHp = this.playerStats.baseHp || 100;
        this.playerHp = this.playerMaxHp;
        this.playerShield = 0;
        this.isInvulnerable = false;
        this.isTransformed = false;
        this.runSkillMilestones = new Set();
        this.firstNodeGrowth = {
            collectionSource: 'beast_essence_exp_from_enemy_defeat',
            growthTrigger: '首关累计 12 点蛮兽血气经验',
            runtimeMutation: 'activeSkills[].level / activeSkills[]',
            playerFeedback: 'HUD 技能等级、浮字、VFX、SFX 与镜头闪光',
            combatImpact: '原始真解基础拳 Lv.2 提高 projectile 伤害，后续再临阵解锁雷吼怒啸与青枝守护回春',
            triggerThreshold: 12,
            collectedEssence: 0,
            events: []
        };
        this.skillCastAnnounceAt = {};
        this.lastCastFloatAt = 0;
        this.bossSpawned = false;
    }

    toColor(value, fallback = 0xffffff) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return parseInt(value.replace('#', ''), 16);
        return fallback;
    }

    createCombatTextures() {
        this.createPlayerTexture();
        Object.keys(ENEMY_REGISTRY).forEach(enemyType => this.createEnemyTexture(enemyType));
        this.createSkillProjectileTexture();
        this.createPickupTexture();
        createAtlasFrameTexture(this, 'pickup_blood_essence', 'pickup_particle');
        createAtlasFrameTexture(this, 'vfx_effect_frame', 'particle');
        createAtlasFrameTexture(this, 'vfx_effect_frame', 'skill_particle');
        this.runtimeArtStatus = getRuntimeArtStatus();
    }

    createPickupTexture() {
        if (createAtlasFrameTexture(this, 'pickup_blood_essence', 'pickup_blood_essence')) return;
        if (this.textures.exists('pickup_blood_essence')) return;
        recordProceduralFallback('pickup_blood_essence');

        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xff2222, 0.85);
        g.fillCircle(8, 8, 6);
        g.lineStyle(1.5, 0xffffff, 0.95);
        g.strokeCircle(8, 8, 6);
        g.generateTexture('pickup_blood_essence', 16, 16);
        g.destroy();
    }

    createPlayerTexture() {
        if (createAtlasFrameTexture(this, 'shihao_young_runtime', 'shihao_young_runtime')) return;
        if (this.textures.exists('shihao_young_runtime')) return;
        recordProceduralFallback('shihao_young_runtime');

        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x38bdf8, 0.22);
        g.fillCircle(32, 34, 25);
        g.lineStyle(2, 0xfef3c7, 0.8);
        g.strokeCircle(32, 34, 25);
        g.lineStyle(2, 0xf59e0b, 0.7);
        g.strokeCircle(32, 34, 18);

        g.fillStyle(0x7c4a23, 1);
        g.fillRoundedRect(23, 27, 18, 24, 6);
        g.fillStyle(0xf5c48b, 1);
        g.fillCircle(32, 20, 9);
        g.fillStyle(0x23160c, 1);
        g.fillRoundedRect(23, 12, 18, 8, 4);
        g.fillStyle(0xfef3c7, 1);
        g.fillRect(27, 29, 10, 15);
        g.fillStyle(0x38bdf8, 1);
        g.fillCircle(32, 36, 4);
        g.fillStyle(0xfacc15, 1);
        g.fillRect(20, 36, 7, 4);
        g.fillRect(37, 36, 7, 4);
        g.fillStyle(0x111827, 1);
        g.fillRect(28, 19, 2, 2);
        g.fillRect(34, 19, 2, 2);
        g.fillStyle(0x0f172a, 0.6);
        g.fillEllipse(32, 54, 22, 7);

        g.generateTexture('shihao_young_runtime', 64, 64);
        g.destroy();
    }

    createSkillProjectileTexture() {
        if (createAtlasFrameTexture(this, 'skill_fist_projectile', 'skill_fist_projectile')) return;
        if (this.textures.exists('skill_fist_projectile')) return;
        recordProceduralFallback('skill_fist_projectile');

        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xfef3c7, 0.9);
        g.fillCircle(12, 12, 8);
        g.lineStyle(3, 0xf59e0b, 0.95);
        g.strokeCircle(12, 12, 8);
        g.lineStyle(2, 0x38bdf8, 0.75);
        g.beginPath();
        g.moveTo(4, 12);
        g.lineTo(20, 12);
        g.moveTo(12, 4);
        g.lineTo(12, 20);
        g.strokePath();
        g.generateTexture('skill_fist_projectile', 24, 24);
        g.destroy();
    }

    createEnemyTexture(enemyType) {
        const design = ENEMY_VISUAL_DESIGN[enemyType] || {};
        const textureKey = design.textureKey || `enemy_${enemyType}`;
        if (createAtlasFrameTexture(this, textureKey, textureKey)) return textureKey;
        if (this.textures.exists(textureKey)) return textureKey;
        recordProceduralFallback(textureKey);

        const body = this.toColor(design.bodyColor, 0x7f1d1d);
        const accent = this.toColor(design.accentColor, 0xfca5a5);
        const glow = this.toColor(design.glowColor, 0xffffff);
        const g = this.make.graphics({ x: 0, y: 0, add: false });

        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(32, 52, 34, 10);

        switch (design.archetype) {
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

        g.generateTexture(textureKey, 64, 64);
        g.destroy();
        return textureKey;
    }

    preload() {
        preloadImagegenAtlas(this);
    }

    create() {
        this.width = 720;
        this.height = 1280;
        this.createCombatTextures();

        // 背景
        this.add.grid(0, 0, this.width * 3, this.height * 3, 64, 64, 0x222222).setOrigin(0, 0);
        this.physics.world.setBounds(0, 0, this.width * 3, this.height * 3);

        // 玩家
        this.playerAura = this.add.circle(this.width * 1.5, this.height * 1.5, 34, 0x38bdf8, 0.14);
        this.playerAura.setStrokeStyle(2, 0xfef3c7, 0.35);
        this.player = this.physics.add.sprite(this.width * 1.5, this.height * 1.5, 'shihao_young_runtime');
        this.player.setDisplaySize(52, 52);
        this.player.setDepth(2);
        this.player.body.setSize(28, 34);
        this.player.body.setOffset(18, 18);
        this.player.body.setCollideWorldBounds(true);
        this.cameras.main.startFollow(this.player);
        this.tweens.add({
            targets: this.playerAura,
            scaleX: 1.14,
            scaleY: 1.14,
            alpha: 0.22,
            duration: 900,
            yoyo: true,
            repeat: -1
        });

        // 敌人组
        this.enemies = this.physics.add.group();
        
        // 敌方弹幕组
        this.enemyProjectiles = this.physics.add.group();
        
        // 碰撞
        this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit, null, this);
        this.physics.add.overlap(this.player, this.enemyProjectiles, this.onPlayerHitByProjectile, null, this);

        // 掉落组与拾取碰撞
        this.pickups = this.physics.add.group();
        this.physics.add.overlap(this.player, this.pickups, this.onPickupCollect, null, this);

        // 输入
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.setupTouchMovement();
        this.playerActionController.setup();
        this.registerNodeLifecycleHooks();

        // UI
        this.uiSceneKey = 'Node1UI';
        // 检查是否已经存在该 UI 场景，避免重复添加报错
        if (this.scene.get(this.uiSceneKey)) {
            this.scene.launch(this.uiSceneKey, { parent: this });
            this.uiScene = this.scene.get(this.uiSceneKey);
        } else {
            this.uiScene = this.scene.add(this.uiSceneKey, Node1UI, true, { parent: this });
        }
        this.time.delayedCall(0, () => {
            this.uiScene?.updateSkills?.(this.activeSkills);
            this.uiScene?.updateActionBar?.(this.playerActionController.getHudSnapshot());
        });

        // 定时器
        this.time.addEvent({
            delay: 1000,
            callback: this.onSecondTick,
            callbackScope: this,
            loop: true
        });

        if (this.nodeConfig.id === 1) {
            this.time.delayedCall(450, () => this.spawnOpeningWave());
        }

        this.publishNodeTestState();
    }

    createEmptyTouchMoveState() {
        return this.touchInput.createEmptyState();
    }

    setupTouchMovement() {
        return this.touchInput.setup();
    }

    teardownTouchMovementListeners() {
        return this.touchInput.teardown();
    }

    registerNodeLifecycleHooks() {
        return this.touchInput.registerLifecycleHooks();
    }

    handleNodeSceneShutdown(reason) {
        const existingState = typeof window !== 'undefined' ? window.__DAHUANG_NODE_TEST_STATE__ : null;
        if (existingState?.sceneKey === this.sys?.settings?.key && existingState?.inactiveReason) {
            this.teardownTouchMovementListeners();
            this.playerActionController?.teardown();
            this.skillExecutionRuntime?.teardown();
            this.combatRuntime?.teardown();
            return;
        }
        this.markNodeTestStateInactive(reason);
        this.teardownTouchMovementListeners();
        this.playerActionController?.teardown();
        this.skillExecutionRuntime?.teardown();
        this.combatRuntime?.teardown();
    }

    getPointerId(pointer) {
        return this.touchInput.getPointerId(pointer);
    }

    getInputLockReason() {
        return this.touchInput.getInputLockReason();
    }

    canAcceptMovementInput() {
        return this.touchInput.canAcceptMovementInput();
    }

    enterInputPause(reason = 'paused') {
        return this.touchInput.enterPause(reason);
    }

    exitInputPause(reason = 'paused') {
        return this.touchInput.exitPause(reason);
    }

    stopPlayerMovement() {
        return this.touchInput.stopPlayerMovement();
    }

    isTouchMovementZone(pointer) {
        return this.touchInput.isMovementZone(pointer);
    }

    noteIgnoredTouchPointer(pointer, reason) {
        return this.touchInput.noteIgnoredPointer(pointer, reason);
    }

    handleTouchPointerDown(pointer) {
        return this.touchInput.handlePointerDown(pointer);
    }

    handleTouchPointerMove(pointer) {
        return this.touchInput.handlePointerMove(pointer);
    }

    handleTouchPointerUp(pointer) {
        return this.touchInput.handlePointerUp(pointer);
    }

    updateTouchPointerVector(pointer) {
        return this.touchInput.updatePointerVector(pointer);
    }

    releaseTouchMovement(reason = 'pointer_up') {
        return this.touchInput.release(reason);
    }

    drawTouchJoystick() {
        return this.touchInput.drawJoystick();
    }

    getKeyboardMovementVector() {
        return this.touchInput.getKeyboardMovementVector();
    }

    getMovementVector() {
        return this.touchInput.getMovementVector();
    }

    roundForTest(value) {
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.round(value * 100) / 100
            : null;
    }

    getPointerTestState() {
        return this.touchInput.getPointerTestState();
    }

    getFirstNodeGrowthTestSummary() {
        const growth = this.firstNodeGrowth || {};
        const events = Array.isArray(growth.events) ? growth.events : [];
        const collectedEssence = growth.collectedEssence || 0;
        const triggerThreshold = growth.triggerThreshold || 0;

        return {
            collectionSource: growth.collectionSource || null,
            growthTrigger: growth.growthTrigger || null,
            runtimeMutation: growth.runtimeMutation || null,
            playerFeedback: growth.playerFeedback || null,
            combatImpact: growth.combatImpact || null,
            triggerThreshold,
            collectedEssence,
            progressPct: triggerThreshold > 0 ? this.roundForTest(Math.min(collectedEssence / triggerThreshold, 1)) : 0,
            milestones: Array.from(this.runSkillMilestones || []),
            eventCount: events.length,
            latestEvent: events.length > 0 ? events[events.length - 1] : null
        };
    }

    publishNodeTestState(overrides = {}) {
        if (typeof window === 'undefined') return;

        const sceneKey = this.sys?.settings?.key || 'Node1Scene';
        const sceneActive = this.scene?.isActive?.(sceneKey) === true;
        const scenePaused = this.scene?.isPaused?.(sceneKey) === true;
        const isActive = this.canAcceptMovementInput();
        const playerX = this.roundForTest(this.player?.x);
        const playerY = this.roundForTest(this.player?.y);
        const pointer = this.getPointerTestState();
        const state = {
            version: 1,
            nodeId: this.nodeConfig?.id ?? null,
            currentNodeId: this.nodeConfig?.id ?? null,
            sceneKey,
            isActive,
            sceneActive,
            scenePaused,
            inputLocked: !isActive,
            inputLockReason: this.getInputLockReason(),
            pauseReason: this.pauseReason || null,
            movementMode: this.movementMode || 'idle',
            pointer,
            touch: pointer,
            playerX,
            playerY,
            player: {
                x: playerX,
                y: playerY
            },
            hp: Math.ceil(this.playerHp || 0),
            maxHp: this.playerMaxHp || 0,
            kills: this.kills || 0,
            level: this.level || 1,
            exp: {
                current: this.currentExp || 0,
                toNext: this.expToNext || 0
            },
            activeSkills: (this.activeSkills || []).map(skill => ({
                id: skill.id,
                level: skill.level
            })),
            rewards: { ...(this.rewards || {}) },
            inputRuntime: this.touchInput?.getDebugState?.() || null,
            combatRuntime: this.combatRuntime?.getDebugState?.() || null,
            skillRuntime: this.skillExecutionRuntime?.getDebugState?.() || null,
            playerActions: this.playerActionController?.getTestState?.() || null,
            actionAvailability: this.playerActionController?.getTestState?.()?.actions || null,
            lastAcceptedAction: this.playerActionController?.getTestState?.()?.lastAcceptedAction ?? null,
            lastRejectedAction: this.playerActionController?.getTestState?.()?.lastRejectedAction ?? null,
            lastRejectReason: this.playerActionController?.getTestState?.()?.lastRejectReason ?? null,
            firstNodeGrowth: this.getFirstNodeGrowthTestSummary(),
            ...overrides
        };

        window.__DAHUANG_NODE_TEST_STATE__ = state;
        window.dahuangTestState = state;
    }

    markNodeTestStateInactive(reason = 'node_inactive', overrides = {}) {
        this.movementMode = 'inactive';
        this.releaseTouchMovement(reason);
        this.stopPlayerMovement();
        this.publishNodeTestState({
            isActive: false,
            inputLocked: true,
            inputLockReason: reason,
            movementMode: 'inactive',
            inactiveReason: reason,
            deactivatedAt: Math.round(this.time?.now || 0),
            ...overrides
        });
    }

    update(time, delta) {
        if (!this.canAcceptMovementInput()) {
            this.movementMode = this.isGameOver || this.isTransitioning ? 'inactive' : 'locked';
            this.releaseTouchMovement(this.getInputLockReason() || 'input_locked');
            this.stopPlayerMovement();
            this.publishNodeTestState();
            return;
        }

        // 玩家移动
        const movement = this.getMovementVector();
        const vx = movement.x;
        const vy = movement.y;
        this.movementMode = movement.mode;

        const speed = this.playerStats.baseSpeed;
        this.player.body.setVelocity(vx * speed, vy * speed);
        if (this.playerAura) {
            this.playerAura.setPosition(this.player.x, this.player.y);
        }
        this.publishNodeTestState();

        // 敌人追踪与碧落精射击
        this.enemies.getChildren().forEach(enemy => {
            this.physics.moveToObject(enemy, this.player, enemy.getData('speed'));
            
            if (enemy.getData('triangleType') === 'emerald') {
                const lastShoot = enemy.getData('lastShoot') || 0;
                if (time - lastShoot > 2500) {
                    this.fireEnemyProjectile(enemy);
                    enemy.setData('lastShoot', time);
                }
            }
        });

        // Manual agency actions (dash / active technique / charged burst).
        this.playerActionController?.update?.(time);

        // Auto-cast only for non-manual build skills. Defensive dash and burst
        // never fire silently from the cooldown loop.
        this.activeSkills.forEach(skillState => {
            const skillData = this.findSkillData(skillState.id);
            if (!skillData) return;
            if (this.playerActionController && !this.playerActionController.shouldAutoCast(skillData)) {
                return;
            }

            const cooldown = this.getSkillCooldown(skillData, skillState.level);
            if (time - skillState.lastCast >= cooldown * 1000) {
                if (this.castSkill(skillData, skillState.level)) {
                    skillState.lastCast = time;
                }
            }
        });
    }

    findSkillData(skillId) {
        return findRuntimeSkillData(this.skillTier, skillId);
    }

    getLevelScaling(skillData, key, fallback = 0) {
        return getRuntimeLevelScaling(skillData, key, fallback);
    }

    hasPerk(perkId) {
        return runtimeHasPerk(this, perkId);
    }

    getSkillCooldown(skillData, level) {
        return getRuntimeSkillCooldown(this, skillData, level);
    }

    getSkillDamage(skillData, level) {
        const { damage, critical } = calculateSkillDamage(this, skillData, level);
        if (critical) this.cameras.main.shake(80, 0.004);
        return damage;
    }

    showWorldFloatText(x, y, text, color = '#ffffff', duration = 1000) {
        UIHelper.showFloatText(this, x, y, text, color, duration);
    }

    announceSkillCast(skillData, level) {
        const now = this.time.now || 0;
        const lastForSkill = this.skillCastAnnounceAt[skillData.id] || 0;
        if (now - lastForSkill < 850) return;

        this.skillCastAnnounceAt[skillData.id] = now;
        this.uiScene?.updateLastCast?.(skillData.name, level);

        if (now - this.lastCastFloatAt > 1400) {
            UIHelper.showFloatText(this.uiScene, this.width / 2, 404, `施展 ${skillData.name}`, '#80ffea', 700);
            this.lastCastFloatAt = now;
        }
    }

    castSkill(skillData, level) {
        return this.skillExecutionRuntime.execute(skillData, level);
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        this.surviveTime++;
        // Force timeline duration for Node 1 to 90s
        const duration = this.nodeConfig.id === 1 ? 90 : this.nodeConfig.duration;
        this.uiScene.updateTime(this.surviveTime, duration);

        if (this.nodeConfig.id === 1) {
            if (this.surviveTime === 2) {
                this.showWorldFloatText(this.player.x, this.player.y - 120, '拖动摇杆移动', "#80ffea", 3000);
                this.spawnEnemy({ enemyType: 'wild_rhino', radius: 400 });
            } else if (this.surviveTime === 10) {
                this.showWorldFloatText(this.player.x, this.player.y - 120, '拾取气血精华升级', "#80ffea", 3000);
                for (let i = 0; i < 3; i++) this.spawnEnemy({ enemyType: 'wild_rhino', radius: 400 });
            } else if (this.surviveTime === 20) {
                this.showWorldFloatText(this.player.x, this.player.y - 120, '点击图标闪避攻击', "#80ffea", 3000);
                for (let i = 0; i < 4; i++) this.spawnEnemy({ enemyType: 'green_scaled_eagle', radius: 450 });
            } else if (this.surviveTime === 35) {
                this.showWorldFloatText(this.player.x, this.player.y - 120, '主动施放术法！', "#ffd700", 3000);
                for (let i = 0; i < 6; i++) this.spawnEnemy({ enemyType: 'rock_golem', radius: 450 });
            } else if (this.surviveTime === 50) {
                this.spawnEliteSilverWingedEagle();
                this.showWorldFloatText(this.player.x, this.player.y - 120, '精英凶禽来袭！', "#ff4444", 3000);
                for (let i = 0; i < 4; i++) this.spawnEnemy({ enemyType: 'wild_rhino', radius: 450 });
            } else if (this.surviveTime === 75 && !this.bossSpawned) {
                this.spawnBoss();
                this.bossSpawned = true;
            } else if (this.surviveTime > 35 && this.surviveTime < 75 && this.surviveTime % 5 === 0) {
                for (let i = 0; i < 2; i++) this.spawnEnemy({ radius: 450 });
            }

            if (this.surviveTime >= duration) {
                this.endGame(true);
            }
        } else {
            // 生成敌人 (随时间增加生成频率)
            const spawnCount = 1 + Math.floor(this.surviveTime / 30);
            for (let i = 0; i < spawnCount; i++) {
                this.spawnEnemy({
                    radius: this.nodeConfig.id === 1 && this.surviveTime <= 10 ? 360 : undefined
                });
            }

            // 60秒时生成精英怪银羽神雕
            if (this.nodeConfig.id === 1 && this.surviveTime === 60) {
                this.spawnEliteSilverWingedEagle();
            }

            // 90% 时间生成 Boss
            if (this.surviveTime === Math.floor(this.nodeConfig.duration * 0.9) && !this.bossSpawned) {
                this.spawnBoss();
                this.bossSpawned = true;
            }

            // 胜利判定
            if (this.surviveTime >= this.nodeConfig.duration) {
                this.endGame(true);
            }
        }
    }

    spawnBoss() {
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId];
        const boss = this.createRuntimeEnemy(this.nodeConfig.bossId, this.player.x, this.player.y - 300, {
            hp: enemyData.hp * 5, // make sure it takes time
            speed: enemyData.speed * 0.8,
            exp: enemyData.exp * 5,
            lootList: enemyData.lootList,
            scaleMultiplier: 2.0
        });
        
        boss.setData('isBoss', true);
        boss.setData('maxHp', enemyData.hp * 5);
        boss.setData('phase', 1);
        boss.setData('state', 'idle'); // idle, windup, active, recovery, break
        boss.setData('stateTimer', 0);

        const txt = this.add.text(this.player.x, this.player.y - 100, '穷奇幼崽降临！', { fontSize: '32px', fill: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 2000,
            onComplete: () => txt.destroy()
        });

        this.activeBoss = boss;

        // Add boss health bar
        this.bossHpBarBg = this.add.graphics().setScrollFactor(0).setDepth(200);
        this.bossHpBarBg.fillStyle(0x222222, 0.8).fillRect(this.width / 2 - 150, 60, 300, 16);
        this.bossHpBar = this.add.graphics().setScrollFactor(0).setDepth(200);
        this.bossNameText = this.add.text(this.width / 2, 40, '穷奇幼崽 (Phase 1)', { fontSize: '18px', fill: '#ff4444', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
    }

    updateBoss(boss) {
        if (!boss || !boss.active) {
            // Boss Defeated
            if (this.bossHpBarBg) {
                this.bossHpBarBg.destroy();
                this.bossHpBar.destroy();
                this.bossNameText.destroy();
                this.bossHpBarBg = null;
            }
            if (this.activeBoss) {
                this.activeBoss = null;
                // Game clear
                this.endGame(true, 'Boss Defeated', NodeBridge.RESULT_REASONS.BOSS_DEFEATED);
            }
            return;
        }

        const hp = boss.getData('hp');
        const maxHp = boss.getData('maxHp');
        const phase = boss.getData('phase');
        const state = boss.getData('state');
        let stateTimer = boss.getData('stateTimer');

        // Update HP Bar
        this.bossHpBar.clear();
        this.bossHpBar.fillStyle(0xff0000, 1).fillRect(this.width / 2 - 150, 60, 300 * Math.max(hp / maxHp, 0), 16);

        // Phase transition
        if (phase === 1 && hp < maxHp * 0.5) {
            boss.setData('phase', 2);
            this.bossNameText.setText('穷奇幼崽 (Phase 2)');
            boss.setTint(0xff8800);
            boss.setData('speed', boss.getData('speed') * 1.5);
            this.showWorldFloatText(boss.x, boss.y - 80, '进入狂暴！', '#ff8800', 2000);
        }

        // State Machine
        if (state === 'idle') {
            stateTimer++;
            boss.setData('speed', ENEMY_REGISTRY[this.nodeConfig.bossId].speed * (phase === 2 ? 1.2 : 0.8));
            if (stateTimer > 120) {
                boss.setData('state', 'windup');
                boss.setData('stateTimer', 0);
                boss.setData('speed', 0); // Stop moving to prepare attack

                // Telegraph
                boss.telegraph = this.add.circle(boss.x, boss.y, 150, 0xff0000, 0.2);
                this.tweens.add({
                    targets: boss.telegraph,
                    alpha: 0.5,
                    duration: 1500
                });
            }
        } else if (state === 'windup') {
            stateTimer++;
            if (stateTimer > 90) { // 1.5s windup
                boss.setData('state', 'active');
                boss.setData('stateTimer', 0);

                // Active attack
                if (boss.telegraph) {
                    boss.telegraph.destroy();
                    boss.telegraph = null;
                }

                const blast = this.add.circle(boss.x, boss.y, 150, 0xff0000, 0.8);
                this.tweens.add({
                    targets: blast,
                    alpha: 0,
                    scale: 1.2,
                    duration: 300,
                    onComplete: () => blast.destroy()
                });

                // Damage player if in range
                if (Phaser.Math.Distance.Between(boss.x, boss.y, this.player.x, this.player.y) <= 150) {
                    this.combatRuntime.onPlayerHit(this.player, boss);
                    this.combatRuntime.onPlayerHit(this.player, boss); // double hit for boss move
                }
            }
        } else if (state === 'active') {
            stateTimer++;
            if (stateTimer > 30) { // 0.5s active
                boss.setData('state', 'recovery');
                boss.setData('stateTimer', 0);
            }
        } else if (state === 'recovery') {
            stateTimer++;
            if (stateTimer > 120) { // 2s recovery (break window)
                boss.setData('state', 'idle');
                boss.setData('stateTimer', 0);
            }
        } else if (state === 'break') {
            stateTimer++;
            if (stateTimer > 180) { // 3s break
                boss.setData('state', 'idle');
                boss.setData('stateTimer', 0);
            }
        }

        boss.setData('stateTimer', stateTimer);
    }


    spawnOpeningWave() {
        [
            { enemyType: 'wild_rhino', angle: Math.PI * 0.1 },
            { enemyType: 'green_scaled_eagle', angle: Math.PI * 0.85 },
            { enemyType: 'rock_golem', angle: Math.PI * 1.45 }
        ].forEach(config => this.spawnEnemy({ ...config, radius: 260 }));
    }

    spawnEnemy(options = {}) {
        const angle = options.angle ?? Math.random() * Math.PI * 2;
        const radius = options.radius ?? Math.max(this.width, this.height) * 0.6;
        const x = this.player.x + Math.cos(angle) * radius;
        const y = this.player.y + Math.sin(angle) * radius;

        const enemyType = options.enemyType || Phaser.Utils.Array.GetRandom(this.nodeConfig.enemyPool);
        return this.createRuntimeEnemy(enemyType, x, y, options);
    }

    createRuntimeEnemy(enemyType, x, y, options = {}) {
        return createRuntimeEnemyFactory(this, enemyType, x, y, options);
    }

    randomTriangleType() {
        return Phaser.Utils.Array.GetRandom(['crimson', 'azure', 'emerald']);
    }

    damageEnemy(enemy, dmg, skillData = null) {
        if (enemy.getData('isBoss') && skillData && skillData.castMode === 'manual') {
            const state = enemy.getData('state');
            if (state === 'windup' || state === 'recovery') {
                enemy.setData('state', 'break');
                enemy.setData('stateTimer', 0);
                enemy.setData('speed', 0);
                if (enemy.telegraph) {
                    enemy.telegraph.destroy();
                    enemy.telegraph = null;
                }
                this.showWorldFloatText(enemy.x, enemy.y - 80, '破招！', '#00ffff', 2000);
            }
        }
        return this.combatRuntime.damageEnemy(enemy, dmg, skillData);
    }

    spawnPickup(x, y, exp, loot) {
        if (!this.pickups) return;
        const pickup = this.pickups.create(x, y, 'pickup_blood_essence');
        pickup.setDisplaySize(20, 20);
        pickup.setDepth(1);
        pickup.setData('exp', exp);
        pickup.setData('loot', loot);
        
        this.tweens.add({
            targets: pickup,
            y: y - 10,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    onPickupCollect(player, pickup) {
        if (this.isGameOver || this.isPaused) return;

        // Play chime SFX (rising tones)
        AudioManager.playTone(620, 0.07, 'sine', 0.16);
        this.time.delayedCall(70, () => {
            if (typeof AudioManager !== 'undefined' && AudioManager.playTone) {
                AudioManager.playTone(900, 0.11, 'sine', 0.12);
            }
        });

        // VFX particle feedback
        VFX.playPickupEffect(this, pickup.x, pickup.y);

        // Float text for EXP
        const exp = pickup.getData('exp') || 0;
        this.showWorldFloatText(pickup.x, pickup.y - 12, `+${exp} 气血`, "#38bdf8", 700);

        // Apply EXP
        this.gainExp(exp);

        // Apply Loot
        const lootItems = pickup.getData('loot');
        if (lootItems) {
            lootItems.forEach(loot => {
                if (Math.random() < loot.chance) {
                    this.rewards[loot.item] = (this.rewards[loot.item] || 0) + loot.count;
                    this.showWorldFloatText(player.x, player.y - 52, `获得 ${loot.item} +${loot.count}`, "#ffd700", 800);

                    // 记录掉落日志
                    const nameMap = {
                        bloodEssence: "气血精华",
                        suanBoneScript: "雷吼骨文",
                        pureBlood: "纯血宝血"
                    };
                    const displayName = nameMap[loot.item] || loot.item;
                    this.lootLog.push(`[${this.surviveTime}秒] 收集蛮兽掉落 ${displayName} x${loot.count}`);
                }
            });
        }

        pickup.destroy();
    }

    gainExp(amount) {
        this.currentExp += amount;
        this.trackFirstNodeGrowth(amount);
        if (this.currentExp >= this.expToNext) {
            this.currentExp -= this.expToNext;
            this.level++;
            this.expToNext = Math.floor(this.expToNext * 1.5);
            this.showLevelUp();
        }
        this.uiScene.updateExp(this.currentExp, this.expToNext, this.level);
        this.publishNodeTestState();
    }

    addSkillToAvailablePool(skillData) {
        if (!skillData) return;
        if (!this.availableSkillPool.some(skill => skill.id === skillData.id)) {
            this.availableSkillPool.push(skillData);
        }
    }

    trackFirstNodeGrowth(amount) {
        if (this.nodeConfig.id !== 1 || !this.firstNodeGrowth) return;

        this.firstNodeGrowth.collectedEssence += amount;
        this.firstNodeGrowth.events.push({
            type: 'collection',
            amount,
            collectedEssence: this.firstNodeGrowth.collectedEssence,
            atMs: Math.round(this.time.now || 0)
        });
        this.checkFirstNodeSkillUnlocks();
    }

    unlockRunSkill(skillId, sourceText) {
        if (this.activeSkills.some(skill => skill.id === skillId)) return false;

        const skillData = this.findSkillData(skillId);
        if (!skillData) return false;

        this.addSkillToAvailablePool(skillData);
        this.activeSkills.push({ id: skillId, level: 1, lastCast: -9999 });
        this.uiScene?.updateSkills?.(this.activeSkills);

        UIHelper.showFloatText(this.uiScene, this.width / 2, 430, `${sourceText}: ${skillData.name}`, '#ffd700', 1600);
        AudioManager.playSkillCue(skillData);
        VFX.playSkillEffect(this, skillData, this.player.x, this.player.y, { target: this.player, level: 1 });
        this.cameras.main.flash(180, 255, 215, 80);
        return true;
    }

    upgradeRunSkill(skillId, sourceText) {
        const skillData = this.findSkillData(skillId);
        if (!skillData) return false;

        let existing = this.activeSkills.find(skill => skill.id === skillId);
        if (!existing) {
            this.addSkillToAvailablePool(skillData);
            existing = { id: skillId, level: 1, lastCast: -9999 };
            this.activeSkills.push(existing);
        }

        const beforeLevel = existing.level;
        existing.level++;
        this.uiScene?.updateSkills?.(this.activeSkills);

        UIHelper.showFloatText(this.uiScene, this.width / 2, 430, `${sourceText}: ${skillData.name} Lv.${existing.level}`, '#80ffea', 1600);
        AudioManager.playSkillCue(skillData);
        VFX.playSkillEffect(this, skillData, this.player.x, this.player.y, { target: this.player, level: existing.level });
        this.cameras.main.flash(180, 128, 255, 234);
        return {
            skillId,
            beforeLevel,
            afterLevel: existing.level
        };
    }

    checkFirstNodeSkillUnlocks() {
        if (this.nodeConfig.id !== 1) return;
        const collectedEssence = this.firstNodeGrowth?.collectedEssence || 0;

        if (collectedEssence >= 12 && !this.runSkillMilestones.has('node1_primordial_fist_lv2')) {
            this.runSkillMilestones.add('node1_primordial_fist_lv2');
            const event = this.upgradeRunSkill('primordial_fist', '血气参悟');
            if (event) {
                this.firstNodeGrowth.events.push({
                    type: 'skill_level',
                    milestone: 'node1_primordial_fist_lv2',
                    runtimeMutation: 'activeSkills[primordial_fist].level',
                    combatImpact: 'projectile damage uses Lv.2 scaling on subsequent casts',
                    ...event
                });
            }
        }

        if (collectedEssence >= 18 && !this.runSkillMilestones.has('node1_suanni_roar')) {
            this.runSkillMilestones.add('node1_suanni_roar');
            if (this.unlockRunSkill('suan_ni_roar', '临阵参悟')) {
                this.firstNodeGrowth.events.push({
                    type: 'skill_unlock',
                    milestone: 'node1_suanni_roar',
                    skillId: 'suan_ni_roar',
                    runtimeMutation: 'activeSkills append',
                    combatImpact: 'adds early AoE burst for dense beast waves'
                });
            }
        }

        if (collectedEssence >= 30 && !this.runSkillMilestones.has('node1_willow_blessing')) {
            this.runSkillMilestones.add('node1_willow_blessing');
            if (this.unlockRunSkill('willow_blessing', '青枝守护护持')) {
                this.firstNodeGrowth.events.push({
                    type: 'skill_unlock',
                    milestone: 'node1_willow_blessing',
                    skillId: 'willow_blessing',
                    runtimeMutation: 'activeSkills append',
                    combatImpact: 'adds passive healing before first-node failure pressure dominates'
                });
            }
        }
    }

    getLevelUpChoices() {
        const pool = this.availableSkillPool.length > 0 ? this.availableSkillPool : (SKILL_POOL_REGISTRY[this.skillTier] || []);
        const activeIds = new Set(this.activeSkills.map(skill => skill.id));
        const activeChoices = pool.filter(skill => activeIds.has(skill.id));
        const newChoices = pool.filter(skill => !activeIds.has(skill.id));
        const choices = [];

        const shuffledActive = Phaser.Utils.Array.Shuffle([...activeChoices]);
        const shuffledNew = Phaser.Utils.Array.Shuffle([...newChoices]);
        if (shuffledActive.length > 0) choices.push(shuffledActive[0]);
        choices.push(...shuffledNew.slice(0, 2));

        if (choices.length < 3) {
            const seen = new Set(choices.map(skill => skill.id));
            const fallback = Phaser.Utils.Array.Shuffle([...pool]).filter(skill => !seen.has(skill.id));
            choices.push(...fallback.slice(0, 3 - choices.length));
        }

        return choices.slice(0, 3);
    }

    showLevelUp() {
        this.enterInputPause('level_up');
        
        // 随机选3个已悟宝术技能，候选池由 NodeBridge 按 LoreWeaver planning 生成。
        const choices = this.getLevelUpChoices();

        this.scene.pause();
        this.scene.pause(this.uiSceneKey); // 同时暂停 UI 场景
        this.scene.launch('LevelUpScene', { parent: this, choices: choices });
    }

    onSkillSelected(skillData) {
        this.exitInputPause('level_up');
        this.scene.resume(this.uiSceneKey); // 恢复 UI 场景

        if (!skillData) return;
        
        const existing = this.activeSkills.find(s => s.id === skillData.id);
        if (existing) {
            existing.level++;
            UIHelper.showFloatText(this.uiScene, this.width / 2, 430, `宝术升级: ${skillData.name} Lv.${existing.level}`, '#80ffea', 1300);
        } else {
            this.activeSkills.push({ id: skillData.id, level: 1, lastCast: this.time.now });
            this.addSkillToAvailablePool(skillData);
            UIHelper.showFloatText(this.uiScene, this.width / 2, 430, `新悟宝术: ${skillData.name}`, '#ffd700', 1300);
        }
        this.uiScene?.updateSkills?.(this.activeSkills);
        this.publishNodeTestState();
    }

    onPlayerHit(player, enemy) {
        return this.combatRuntime.onPlayerHit(player, enemy);
    }

    getEnemyAtk(enemy) {
        return this.combatRuntime.getEnemyAtk(enemy);
    }

    endGame(success, failureReason = null, resultReason = null) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        
        this.isGameOver = true;
        this.physics.pause();
        this.scene.stop(this.uiSceneKey);
        
        // 结算奖励
        let finalRewards = { ...this.rewards };
        finalRewards.bloodEssence = finalRewards.bloodEssence || 0;
        finalRewards.suanBoneScript = finalRewards.suanBoneScript || 0;
        finalRewards.pureBlood = finalRewards.pureBlood || 0;

        if (success) {
            if (this.nodeConfig.rewards) {
                for (const [key, val] of Object.entries(this.nodeConfig.rewards)) {
                    if (Array.isArray(val)) {
                        const amount = Phaser.Math.Between(val[0], val[1]);
                        finalRewards[key] = (finalRewards[key] || 0) + amount;
                    } else if (typeof val === 'number') {
                        finalRewards[key] = (finalRewards[key] || 0) + val;
                    }
                }
            }
        } else {
            const isRetreat = resultReason === NodeBridge.RESULT_REASONS.RETREATED;
            const policy = isRetreat ? (this.nodeConfig.retreatRewardPolicy || {
                bloodEssence: 0,
                suanBoneScript: 0,
                pureBlood: 0
            }) : (this.nodeConfig.failRewardPolicy || {
                bloodEssence: this.nodeConfig.failRewardMultiplier !== undefined ? this.nodeConfig.failRewardMultiplier : 0.5,
                suanBoneScript: 0,
                pureBlood: 0
            });
            for (const key of Object.keys(finalRewards)) {
                const mult = policy[key] !== undefined ? policy[key] : 0;
                finalRewards[key] = Math.floor((finalRewards[key] || 0) * mult);
            }
        }

        const projection = projectNodeResultInput(this, {
            success,
            reason: resultReason,
            rewards: finalRewards,
            failureReason: failureReason || (!success ? "历练失败" : null)
        });
        const result = NodeBridge.createNodeResult(this, projection.resultInput);

        this.markNodeTestStateInactive(success ? 'node_complete' : 'node_failed_or_retreat', {
            rewards: projection.metrics.rewards,
            finalResult: {
                success,
                duration: projection.metrics.duration,
                kills: projection.metrics.kills,
                unlockNextNode: result.unlockNextNode,
                failureReason: result.failureReason
            },
            runMetrics: projection.metrics
        });
        this.scene.start('GameOverScene', result);
    }

    spawnEliteSilverWingedEagle() {
        const angle = Math.random() * Math.PI * 2;
        const radius = 240;
        const x = this.player.x + Math.cos(angle) * radius;
        const y = this.player.y + Math.sin(angle) * radius;

        UIHelper.showFloatText(this.uiScene, this.width / 2, 120, "【警示】银羽神雕从高空俯冲袭来！", "#ff0000", 3000);

        const telegraphRing = this.add.circle(x, y, 90, 0xff0000, 0.25);
        telegraphRing.setStrokeStyle(3, 0xff0000, 0.85);

        const flashEvent = this.time.addEvent({
            delay: 200,
            callback: () => {
                if (telegraphRing.active) telegraphRing.visible = !telegraphRing.visible;
            },
            loop: true
        });

        this.time.delayedCall(1500, () => {
            flashEvent.remove();
            if (telegraphRing.active) telegraphRing.destroy();

            if (this.active || this.scene.isActive(this.sys.settings.key)) {
                const eagle = this.createRuntimeEnemy('green_scaled_eagle', x, y, {
                    hp: 300,
                    atk: 22,
                    speed: 115,
                    scaleMultiplier: 1.6,
                    triangleType: 'azure',
                    data: {
                        isElite: true,
                        visualName: '银羽神雕'
                    }
                });
                eagle.setTint(0xe0e0e0);
            }
        });
    }

    fireEnemyProjectile(enemy) {
        if (!enemy.active || this.isGameOver || this.isPaused) return;

        if (!this.textures.exists('enemy_projectile')) {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0x44ff44, 1);
            g.fillCircle(6, 6, 5);
            g.generateTexture('enemy_projectile', 12, 12);
            g.destroy();
        }

        const proj = this.enemyProjectiles.create(enemy.x, enemy.y, 'enemy_projectile');
        proj.setDisplaySize(14, 14);
        proj.setTint(0x44ff44);
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        proj.body.setVelocity(Math.cos(angle) * 160, Math.sin(angle) * 160);
        this.time.delayedCall(2200, () => { if (proj.active) proj.destroy(); });
    }

    onPlayerHitByProjectile(player, proj) {
        proj.destroy();
        this.onPlayerHit(player, { getData: (key) => key === 'atk' ? 8 : null });
    }
}

export default Node1Scene;
