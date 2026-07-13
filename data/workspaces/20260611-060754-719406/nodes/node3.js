// nodes/node3.js
// Node 3: 镜魄试炼场场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import { createAtlasFrameTexture, recordProceduralFallback } from '../utils/RuntimeSprites.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node3Scene extends Node1Scene {
    constructor() {
        super('Node3Scene');
    }

    create() {
        super.create();
        
        // 初始威压
        this.rivalPressure = 0;
        this.boss = null;
        this.bossTimer = null;
        this.bossSpawned = false;

        // 渲染威压 HUD
        this.pressureGraphics = this.add.graphics();
        this.pressureGraphics.setScrollFactor(0);
        this.pressureGraphics.setDepth(10);

        this.pressureText = this.add.text(this.width / 2, 70, `紫曜威压: 0%`, {
            fontSize: '15px',
            fill: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

        // 清理监听器
        this.events.once('shutdown', () => {
            window.dahuangTestState = null;
            if (this.bossTimer) this.bossTimer.remove();
        });
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        const bossState = !this.boss ? 'none' : (this.boss.getData('state') || 'normal');
        const breakWindowActive = this.boss ? this.boss.getData('state') === 'telegraphing' : false;
        
        super.publishNodeTestState({
            rivalPressure: {
                currentPressure: this.rivalPressure || 0,
                bossState,
                breakWindowActive
            },
            ...overrides
        });
    }

    onPlayerHit(player, enemy) {
        super.onPlayerHit(player, enemy);
        if (this.isGameOver || this.isPaused) return;

        this.rivalPressure = Math.min(this.rivalPressure + 5, 100);
        if (this.rivalPressure >= 100) {
            this.endGame(false, "紫曜威压过载败北");
        } else {
            this.publishNodeTestState();
        }
    }

    damageEnemy(enemy, dmg, skillData = null) {
        let finalDmg = dmg;
        let isCounter = false;

        if (skillData) {
            const triangleType = enemy.getData('triangleType');
            if (triangleType === 'crimson') {
                if (skillData.element === 'fire' || skillData.type === 'aoe_burst') {
                    finalDmg *= 2.0;
                    isCounter = true;
                }
            } else if (triangleType === 'azure') {
                if (enemy.getData('speed') === 0 || skillData.type === 'aoe_root') {
                    finalDmg *= 2.0;
                    isCounter = true;
                }
            } else if (triangleType === 'emerald') {
                const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
                if (this.isInvulnerable || distance <= 90 || skillData.type === 'active_dodge') {
                    finalDmg *= 2.0;
                    isCounter = true;
                }
            }
        }

        // 弱点破防状态双倍伤害
        if (enemy.getData('state') === 'weakened') {
            finalDmg *= 2.0;
        }

        let hp = enemy.getData('hp') - finalDmg;
        
        // 播放受击音效和特效
        AudioManager.playHit();
        VFX.playHitEffect(this, enemy.x, enemy.y);

        if (isCounter) {
            this.showWorldFloatText(enemy.x, enemy.y - 30, `克制 ${Math.round(finalDmg)}!`, "#ffd700", 700);
        }

        // 蓄力打断判定
        if (enemy.getData('isBoss') && enemy.getData('state') === 'telegraphing') {
            let curDmg = enemy.getData('breakDamage') || 0;
            curDmg += finalDmg;
            enemy.setData('breakDamage', curDmg);
            
            if (curDmg >= 30) {
                // Break! 进入虚弱状态
                enemy.setData('state', 'weakened');
                enemy.setData('speed', 0);
                enemy.setTint(0x00ffff); // 虚弱青蓝色
                this.showWorldFloatText(enemy.x, enemy.y - 45, "【击破】虚弱受创！", "#00ffff", 1200);
                
                this.rivalPressure = Math.max(this.rivalPressure - 10, 0); // 击破大减威压
                AudioManager.playTone(660, 0.15, 'sine', 0.25);
                this.publishNodeTestState();
                
                // 3秒后恢复
                this.time.delayedCall(3000, () => {
                    if (enemy.active && enemy.getData('state') === 'weakened') {
                        enemy.setData('state', 'normal');
                        enemy.setData('speed', ENEMY_REGISTRY[this.nodeConfig.bossId].speed);
                        enemy.setTint(0xffd700);
                        this.publishNodeTestState();
                    }
                });
            }
        }

        if (hp <= 0) {
            this.kills++;
            this.uiScene.updateKills(this.kills);
            
            // 掉落物理气血精华
            this.spawnPickup(enemy.x, enemy.y, enemy.getData('exp'), enemy.getData('lootList'));

            if (this.hasPerk('perk_lifesteal')) {
                const healAmt = Math.max(Math.floor(this.playerMaxHp * 0.02), 1);
                this.playerHp = Math.min(this.playerHp + healAmt, this.playerMaxHp);
                this.uiScene.updateHp(this.playerHp, this.playerMaxHp);
                this.showWorldFloatText(this.player.x, this.player.y - 58, `战血 +${healAmt}`, "#ff7777", 700);
            }
            
            enemy.destroy();
            if (enemy.getData('isBoss')) {
                this.boss = null;
                if (this.bossTimer) this.bossTimer.remove();
            }
            this.publishNodeTestState();
        } else {
            enemy.setData('hp', hp);
            // 闪白效果
            enemy.setTintFill(0xffffff);
            this.time.delayedCall(100, () => {
                if (enemy.active) {
                    enemy.clearTint();
                    // 恢复原本的颜色Tint
                    const state = enemy.getData('state');
                    if (enemy.getData('isBoss')) {
                        if (state === 'weakened') enemy.setTint(0x00ffff);
                        else if (state === 'telegraphing') enemy.setTint(0xff00ff);
                        else enemy.setTint(0xffd700);
                    } else {
                        const tType = enemy.getData('triangleType');
                        if (tType === 'crimson') enemy.setTint(0xff4444);
                        else if (tType === 'azure') enemy.setTint(0x4444ff);
                        else if (tType === 'emerald') enemy.setTint(0x44ff44);
                    }
                }
            });
            this.publishNodeTestState();
        }
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused) return;

        // 绘制威压 HUD 进度条
        if (this.pressureGraphics) {
            this.pressureGraphics.clear();
            const width = 240;
            const height = 14;
            const x = this.cameras.main.width / 2 - width / 2;
            const y = 92;
            
            // 背景
            this.pressureGraphics.fillStyle(0x000000, 0.5);
            this.pressureGraphics.fillRect(x, y, width, height);
            
            // 填充色根据比例变红
            const ratio = Math.min(this.rivalPressure / 100, 1);
            const color = ratio > 0.8 ? 0xff3333 : (ratio > 0.45 ? 0xffaa00 : 0x80ffea);
            
            this.pressureGraphics.fillStyle(color, 0.9);
            this.pressureGraphics.fillRect(x + 1, y + 1, (width - 2) * ratio, height - 2);

            this.pressureText.setText(`紫曜威压: ${Math.round(this.rivalPressure)}%`);
            this.pressureText.setColor(ratio > 0.8 ? '#ff3333' : '#ffffff');
        }
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        this.surviveTime++;
        this.uiScene.updateTime(this.surviveTime, this.nodeConfig.duration);

        // 威压随时间与兽群密度自然增长
        let pressureGrowth = 2.0;
        const enemyCount = this.enemies.getLength();
        pressureGrowth += enemyCount * 0.4;
        
        this.rivalPressure = Math.min(this.rivalPressure + pressureGrowth, 100);

        // 威压满 100 直接失败
        if (this.rivalPressure >= 100) {
            this.endGame(false, "紫曜威压过载败北");
            return;
        }

        // 镜魄试炼场敌人生成
        const spawnCount = 2 + Math.floor(this.surviveTime / 20);
        for (let i = 0; i < spawnCount; i++) {
            this.spawnEnemy();
        }

        // 80% 时间生成 Boss
        if (this.surviveTime === Math.floor(this.nodeConfig.duration * 0.8) && !this.bossSpawned) {
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
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId] || { hp: 500, speed: 85, exp: 100, lootList: [] };
        const boss = this.createRuntimeEnemy(this.nodeConfig.bossId, this.player.x + 250, this.player.y, {
            hp: enemyData.hp,
            speed: enemyData.speed,
            exp: enemyData.exp,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.5,
            data: {
                isBoss: true,
                visualName: '紫曜执念·玄曜',
                state: 'normal',
                breakDamage: 0
            }
        });
        boss.setTint(0xffd700); // 初始金色气场
        this.boss = boss;

        // Boss 警告
        const txt = this.add.text(this.player.x, this.player.y - 120, '【宿敌】紫曜执念玄曜降临！', { fontSize: '28px', fill: '#ff4500', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 170,
            alpha: 0,
            duration: 2500,
            onComplete: () => txt.destroy()
        });

        // 定时技能蓄力循环 (每 6 秒释放一次)
        this.bossTimer = this.time.addEvent({
            delay: 6000,
            callback: this.triggerBossTelegraph,
            callbackScope: this,
            loop: true
        });
        this.publishNodeTestState();
    }

    triggerBossTelegraph() {
        if (!this.boss || !this.boss.active || this.isGameOver || this.isPaused) return;

        this.boss.setData('state', 'telegraphing');
        this.boss.setData('breakDamage', 0);
        this.boss.setData('speed', 0);
        this.boss.setTint(0xff00ff); // 紫色蓄力色

        this.showWorldFloatText(this.boss.x, this.boss.y - 45, "紫曜开天！蓄力中...", "#ff00ff", 1200);
        this.showWorldFloatText(this.boss.x, this.boss.y - 25, "【击破破绽以打断】", "#ffd700", 1200);
        this.publishNodeTestState();

        // 红色范围预警环
        const warningCircle = this.add.circle(this.boss.x, this.boss.y, 140, 0xff00ff, 0.15);
        warningCircle.setStrokeStyle(2, 0xff00ff, 0.7);

        this.time.delayedCall(1600, () => {
            warningCircle.destroy();
            if (!this.boss || !this.boss.active || this.isGameOver || this.isPaused) return;

            if (this.boss.getData('state') === 'telegraphing') {
                // 打断失败！释放紫曜强袭，全方位发射弹幕，并造成威压暴涨
                this.boss.setData('state', 'normal');
                this.boss.setData('speed', ENEMY_REGISTRY[this.nodeConfig.bossId].speed);
                this.boss.setTint(0xffd700);

                this.showWorldFloatText(this.boss.x, this.boss.y - 45, "威压狂澜！", "#ff0000", 1000);
                
                // 8 向高速弹幕
                for (let i = 0; i < 8; i++) {
                    const angle = (Math.PI / 4) * i;
                    if (!this.textures.exists('boss_projectile')) {
                        if (!createAtlasFrameTexture(this, 'boss_projectile', 'boss_projectile')) {
                            recordProceduralFallback('boss_projectile');
                            const g = this.make.graphics({ x: 0, y: 0, add: false });
                            g.fillStyle(0xff00ff, 1);
                            g.fillCircle(8, 8, 7);
                            g.generateTexture('boss_projectile', 16, 16);
                            g.destroy();
                        }
                    }
                    const proj = this.enemyProjectiles.create(this.boss.x, this.boss.y, 'boss_projectile');
                    proj.setDisplaySize(18, 18);
                    proj.setTint(0xff00ff);
                    proj.body.setVelocity(Math.cos(angle) * 190, Math.sin(angle) * 190);
                    this.time.delayedCall(2000, () => { if (proj.active) proj.destroy(); });
                }
                
                this.rivalPressure = Math.min(this.rivalPressure + 15, 100);
                this.cameras.main.shake(200, 0.02);
                this.publishNodeTestState();
            }
        });
    }

    endGame(success, failureReason = null, resultReason = null) {
        return super.endGame(success, failureReason || (!success ? "战死沙场" : null), resultReason);
    }
}

export default Node3Scene;
