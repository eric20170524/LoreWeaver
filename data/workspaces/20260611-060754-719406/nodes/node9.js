// nodes/node9.js
// Node 9: 天神书院护送同道场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node9Scene extends Node1Scene {
    constructor() {
        super('Node9Scene');
    }

    init(data) {
        super.init(data);
        this.npcHp = 100;
        this.bossSpawned = false;
        this.reachedDest = false;
    }

    create() {
        super.create();

        const startX = this.width * 1.2;
        const startY = this.height * 1.5;
        this.destX = this.width * 2.2;
        this.destY = this.height * 1.5;

        this.player.x = startX;
        this.player.y = startY - 100;

        this.elder = this.add.rectangle(startX, startY, 32, 32, 0x00ff00);
        this.physics.add.existing(this.elder);
        
        this.destSign = this.add.circle(this.destX, this.destY, 30, 0xffd700, 0.4);
        this.physics.add.existing(this.destSign);
        this.add.text(this.destX, this.destY - 50, '终点', { fontSize: '18px', fill: '#ffd700' }).setOrigin(0.5);

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '长老生命: 100%', {
            fontSize: '24px', fill: '#00ff00', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.physics.add.overlap(this.enemies, this.elder, this.onEnemyHitElder, null, this);
    }

    update(time, delta) {
        if (this.isGameOver || this.isPaused) return;

        super.update(time, delta);

        const distToDest = Phaser.Math.Distance.Between(this.elder.x, this.elder.y, this.destX, this.destY);
        if (distToDest > 20) {
            this.physics.moveTo(this.elder, this.destX, this.destY, 35); 
        } else {
            this.elder.body.setVelocity(0, 0);
            if (!this.reachedDest) {
                this.reachedDest = true;
                UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "顺利护送长老抵达终点！", "#00ff00", 2000);
                this.time.delayedCall(1500, () => {
                    this.endGame(true);
                });
            }
        }

        this.enemies.getChildren().forEach(enemy => {
            this.physics.moveToObject(enemy, this.elder, enemy.getData('speed'));
        });
    }

    onEnemyHitElder(elder, enemy) {
        enemy.destroy();
        this.npcHp -= 10;
        this.hudText.setText(`长老生命: ${Math.max(this.npcHp, 0)}%`);

        this.elder.setFillStyle(0xff0000);
        this.time.delayedCall(200, () => {
            if (this.elder.active) this.elder.setFillStyle(0x00ff00);
        });

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "长老受到攻击！生命-10%", "#ff0000", 1500);
        AudioManager.playHit();
        VFX.playHitEffect(this, enemy.x, enemy.y);

        if (this.npcHp <= 0) {
            this.endGame(false);
        }
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        super.onSecondTick();

        if (this.surviveTime === Math.floor(this.nodeConfig.duration * 0.8) && !this.bossSpawned) {
            this.spawnBoss();
            this.bossSpawned = true;
        }
    }

    spawnBoss() {
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId];
        this.createRuntimeEnemy(this.nodeConfig.bossId, this.elder.x + 250, this.elder.y, {
            hp: enemyData.hp,
            speed: enemyData.speed,
            exp: enemyData.exp,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.2
        });
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '异域天骄现身拦路！速去支援！', { fontSize: '28px', fill: '#ff3333', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 3000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node9Scene;
