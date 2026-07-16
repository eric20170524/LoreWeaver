// nodes/node2.js
// Node 2: 千崖秘径场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import { createAtlasFrameTexture, recordProceduralFallback } from '../utils/RuntimeSprites.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node2Scene extends Node1Scene {
    constructor() {
        super('Node2Scene');
    }

    create() {
        super.create();
        
        // 夺宝群战：生成宝箱
        this.createChestTexture();
        this.chests = this.physics.add.group();
        for(let i=0; i<this.nodeConfig.chestCount; i++) {
            const x = Phaser.Math.Between(100, this.width * 3 - 100);
            const y = Phaser.Math.Between(100, this.height * 3 - 100);
            const chest = this.chests.create(x, y, 'chest_gold');
            chest.setDisplaySize(36, 36);
            chest.setDepth(1);
        }
        
        this.channelingChest = null;
        this.channelProgress = 0;
        this.channelDuration = 2000; // 2秒开启

        // 进度条 Graphics
        this.channelBar = this.add.graphics();
        this.channelBar.setDepth(10);

        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    getChestChildrenForTest() {
        if (!this.chests) return null;

        const entries = this.chests.children?.entries;
        if (Array.isArray(entries)) return entries;

        if (typeof this.chests.getChildren === 'function') {
            try {
                const children = this.chests.getChildren();
                return Array.isArray(children) ? children : [];
            } catch (error) {
                return null;
            }
        }

        return null;
    }

    publishNodeTestState(overrides = {}) {
        const chestChildren = this.getChestChildrenForTest();
        const activeChannelChest = chestChildren && this.channelingChest?.active !== false
            ? this.channelingChest
            : null;
        const chestState = {
            isChanneling: !!activeChannelChest,
            channelProgress: activeChannelChest ? (this.channelProgress || 0) : 0,
            activeChestIndex: activeChannelChest ? chestChildren.indexOf(activeChannelChest) : -1
        };
        super.publishNodeTestState({
            chestChanneling: chestState,
            ...overrides
        });
    }

    createChestTexture() {
        if (createAtlasFrameTexture(this, 'chest_gold', 'chest_gold')) return;
        if (this.textures.exists('chest_gold')) return;
        recordProceduralFallback('chest_gold');
        
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x7c4a23, 1);
        g.fillRoundedRect(4, 4, 24, 24, 4);
        g.lineStyle(2, 0xffd700, 1);
        g.strokeRoundedRect(4, 4, 24, 24, 4);
        g.fillStyle(0xffd700, 1);
        g.fillRect(13, 12, 6, 8);
        g.fillStyle(0x000000, 1);
        g.fillCircle(16, 15, 1.5);
        
        g.generateTexture('chest_gold', 32, 32);
        g.destroy();
    }

    onPlayerHit(player, enemy) {
        const canTakeHit = !this.isGameOver && !this.isPaused && !this.isInvulnerable;
        const hpBefore = this.playerHp;
        const shieldBefore = this.playerShield || 0;
        super.onPlayerHit(player, enemy);

        const hpChanged = this.playerHp < hpBefore;
        const shieldChanged = (this.playerShield || 0) < shieldBefore;
        if (this.channelingChest && canTakeHit && (hpChanged || shieldChanged)) {
            this.interruptChanneling("受击打断");
        }
    }

    startChanneling(chest) {
        this.channelingChest = chest;
        this.channelProgress = 0;
        this.showWorldFloatText(this.player.x, this.player.y - 60, "开启宝箱中...", "#80ffea", 600);

        // 警报声效
        AudioManager.playTone(440, 0.08, 'sine', 0.15);

        // 仇恨施压：在宝箱附近生成发狂野兽
        const spawnCount = 2;
        for (let i = 0; i < spawnCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const bounds = this.physics.world.bounds;
            const rx = Phaser.Math.Clamp(chest.x + Math.cos(angle) * 150, bounds.x + 32, bounds.right - 32);
            const ry = Phaser.Math.Clamp(chest.y + Math.sin(angle) * 150, bounds.y + 32, bounds.bottom - 32);
            const enemyType = Phaser.Utils.Array.GetRandom(this.nodeConfig.enemyPool);
            const enemy = this.createRuntimeEnemy(enemyType, rx, ry);
            if (enemy && enemy.active) {
                enemy.setData('speed', Math.round(enemy.getData('speed') * 1.5));
                enemy.setTint(0xff8844); // 橙色狂暴状态
            }
        }
        this.publishNodeTestState();
    }

    interruptChanneling(reason) {
        if (!this.channelingChest) return;
        this.showWorldFloatText(this.player.x, this.player.y - 60, `${reason}!`, "#ff3333", 800);
        AudioManager.playTone(220, 0.25, 'triangle', 0.2); // 低沉嗡鸣
        
        this.channelingChest = null;
        this.channelProgress = 0;
        this.channelBar.clear();
        this.publishNodeTestState();
    }

    openChest(chest) {
        chest.destroy();
        this.channelingChest = null;
        this.channelProgress = 0;
        this.channelBar.clear();
        
        this.rewards.pureBlood = (this.rewards.pureBlood || 0) + 1;
        
        // 开启音效 (双音阶清脆声音)
        AudioManager.playTone(880, 0.1, 'sine', 0.3);
        this.time.delayedCall(100, () => {
            if (this.active || this.scene.isActive(this.sys.settings.key)) {
                AudioManager.playTone(1320, 0.15, 'sine', 0.2);
            }
        });

        VFX.playHitEffect(this, chest.x, chest.y);
        
        this.lootLog.push(`[${this.surviveTime}秒] 开启千崖宝箱获得 纯血宝血 x1`);
        this.showWorldFloatText(this.player.x, this.player.y - 60, "+1 纯血宝血", "#00ff00", 1200);
        this.publishNodeTestState();
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused) return;

        if (this.channelingChest) {
            // 检查距离
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.channelingChest.x, this.channelingChest.y);
            if (dist > 50) {
                this.interruptChanneling("离开范围");
            } else {
                this.channelProgress += delta;
                
                // 绘制进度条
                this.channelBar.clear();
                const width = 96;
                const height = 12;
                const x = this.player.x - width / 2;
                const y = this.player.y - 52;
                
                // 背景
                this.channelBar.fillStyle(0x000000, 0.72);
                this.channelBar.fillRect(x, y, width, height);
                this.channelBar.lineStyle(2, 0x80ffea, 0.9);
                this.channelBar.strokeRect(x, y, width, height);
                
                // 填充
                const progressRatio = Math.min(this.channelProgress / this.channelDuration, 1);
                this.channelBar.fillStyle(0x80ffea, 0.95);
                this.channelBar.fillRect(x + 2, y + 2, (width - 4) * progressRatio, height - 4);

                if (this.channelProgress >= this.channelDuration) {
                    this.openChest(this.channelingChest);
                } else {
                    this.publishNodeTestState();
                }
            }
        } else {
            // 查找最近的宝箱
            let closestChest = null;
            let closestDist = Infinity;
            const chestChildren = this.getChestChildrenForTest() || [];
            chestChildren.forEach(chest => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, chest.x, chest.y);
                if (dist < 40 && dist < closestDist) {
                    closestDist = dist;
                    closestChest = chest;
                }
            });
            if (closestChest) {
                this.startChanneling(closestChest);
            }
        }
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        this.surviveTime++;
        this.uiScene.updateTime(this.surviveTime, this.nodeConfig.duration);

        const spawnCount = 1 + Math.floor(this.surviveTime / 30);
        for (let i = 0; i < spawnCount; i++) {
            this.spawnEnemy();
        }

        // 90% 时间生成 Boss
        if (this.surviveTime === Math.floor(this.nodeConfig.duration * 0.9) && !this.bossSpawned) {
            this.spawnBoss();
            this.bossSpawned = true;
        }

        if (this.surviveTime >= this.nodeConfig.duration) {
            this.endGame(true);
        } else {
            this.publishNodeTestState();
        }
    }

    spawnBoss() {
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId];
        this.createRuntimeEnemy(this.nodeConfig.bossId, this.player.x + 300, this.player.y, {
            hp: enemyData.hp,
            speed: enemyData.speed,
            exp: enemyData.exp,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.2
        });
        
        // Boss 警告
        const txt = this.add.text(this.player.x, this.player.y - 100, '兽王降临！', { fontSize: '32px', fill: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 2000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node2Scene;
