// nodes/node12.js
// Node 12: 终极血战金阙 Boss场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node12Scene extends Node1Scene {
    constructor() {
        super('Node12Scene');
    }

    init(data) {
        super.init(data);
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId];
        this.bossHp = enemyData.hp;
        this.maxBossHp = enemyData.hp;
        this.bossPhase = 1;
        this.bossInstance = null;
        this.lastBossAttack = 0;
    }

    create() {
        super.create();

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '金阙君 - 阶段 1 (HP: 100%)', {
            fontSize: '22px', fill: '#ff3333', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.bossBullets = this.physics.add.group();
        this.physics.add.overlap(this.player, this.bossBullets, this.onPlayerHitBullet, null, this);

        this.spawnAnlan();
    }

    spawnAnlan() {
        const x = this.width * 1.5;
        const y = this.height * 1.5 - 200;

        const boss = this.createRuntimeEnemy('shi_yi_phantom', x, y, {
            hp: this.bossHp,
            speed: 40,
            scaleMultiplier: 1.75,
            data: { isAnlan: true }
        });

        this.bossInstance = boss;

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "金阙君降临！", "#ff3333", 3000);
        
        this.time.delayedCall(1500, () => {
            UIHelper.showFloatText(this.uiScene, this.width / 2, 100, "“哪怕身负裂天重城，我仍可踏碎群星！”", "#ff0000", 3000);
        });
    }

    update(time, delta) {
        if (this.isGameOver || this.isPaused) return;

        super.update(time, delta);

        if (this.bossInstance && this.bossInstance.active) {
            this.physics.moveToObject(this.bossInstance, this.player, this.bossInstance.getData('speed'));
            this.handleBossAttack(time);
        }
    }

    handleBossAttack(time) {
        if (time - this.lastBossAttack < (this.bossPhase === 1 ? 1500 : this.bossPhase === 2 ? 2000 : 1200)) return;
        this.lastBossAttack = time;

        const bx = this.bossInstance.x;
        const by = this.bossInstance.y;

        if (this.bossPhase === 1) {
            this.fireBullet(bx, by, this.player.x, this.player.y, 250);
        } 
        else if (this.bossPhase === 2) {
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI) / 4;
                this.fireBulletWithAngle(bx, by, angle, 200);
            }
        } 
        else if (this.bossPhase === 3) {
            for (let i = 0; i < 12; i++) {
                const angle = (i * Math.PI) / 6;
                this.fireBulletWithAngle(bx, by, angle, 220);
            }

            const line = this.add.line(0, 0, bx, by, this.player.x, this.player.y, 0xff0000, 0.5).setOrigin(0);
            this.time.delayedCall(400, () => {
                line.destroy();
                if (this.bossInstance && this.bossInstance.active) {
                    this.physics.moveToObject(this.bossInstance, this.player, 250);
                }
            });
        }
    }

    fireBullet(fromX, fromY, toX, toY, speed) {
        const bullet = this.add.circle(fromX, fromY, 12, 0xff3333);
        this.physics.add.existing(bullet);
        this.physics.moveTo(bullet, toX, toY, speed);
        this.bossBullets.add(bullet);
        this.time.delayedCall(3000, () => { if (bullet.active) bullet.destroy(); });
    }

    fireBulletWithAngle(fromX, fromY, angle, speed) {
        const bullet = this.add.circle(fromX, fromY, 10, 0xff3333);
        this.physics.add.existing(bullet);
        bullet.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        this.bossBullets.add(bullet);
        this.time.delayedCall(3000, () => { if (bullet.active) bullet.destroy(); });
    }

    onPlayerHitBullet(player, bullet) {
        bullet.destroy();
        this.onPlayerHit(player, { getData: (key) => key === 'atk' ? this.bossInstance?.getData('atk') || 20 : null });
    }

    damageEnemy(enemy, dmg) {
        const isAnlan = enemy.getData('isAnlan');
        super.damageEnemy(enemy, dmg);

        if (isAnlan) {
            this.bossHp = enemy.getData('hp');
            const pct = Math.max(Math.floor((this.bossHp / this.maxBossHp) * 100), 0);
            
            if (pct > 70) {
                this.bossPhase = 1;
            } else if (pct > 30) {
                if (this.bossPhase === 1) {
                    this.bossPhase = 2;
                    UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "金阙君：赤锋矛，玄铁盾，斩尽来敌！", "#ff0000", 3000);
                }
            } else if (pct > 0) {
                if (this.bossPhase === 2) {
                    this.bossPhase = 3;
                    UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "金阙君暴怒：万象化影也休想破局！", "#ff0000", 3000);
                    enemy.setData('speed', 65);
                }
            }

            this.hudText.setText(`金阙君 - 阶段 ${this.bossPhase} (HP: ${pct}%)`);

            if (!enemy.active || this.bossHp <= 0) {
                this.bossInstance = null;
                this.isGameOver = true;
                UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "金阙君败退！终局破晓！", "#ffd700", 3000);
                this.time.delayedCall(1500, () => {
                    this.endGame(true);
                });
            }
        }
    }
}

export default Node12Scene;
