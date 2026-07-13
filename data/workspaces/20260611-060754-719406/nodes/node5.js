// nodes/node5.js
// Node 5: 石都大战守护核心场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node5Scene extends Node1Scene {
    constructor() {
        super('Node5Scene');
    }

    init(data) {
        super.init(data);
        this.eyeHp = 100;
        this.bossSpawned = false;
    }

    create() {
        super.create();
        this.player.x = this.width * 1.5 - 100;
        this.player.y = this.height * 1.5;

        // 创建阵眼 (金色发光法阵)
        this.eye = this.add.circle(this.width * 1.5, this.height * 1.5, 50, 0xffd700, 0.4);
        this.physics.add.existing(this.eye);
        this.eye.body.setImmovable(true);

        this.eyeOuter = this.add.circle(this.width * 1.5, this.height * 1.5, 50);
        this.eyeOuter.setStrokeStyle(3, 0xffd700);

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '阵眼生命: 100%', {
            fontSize: '24px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.physics.add.overlap(this.enemies, this.eye, this.onEnemyHitEye, null, this);
    }

    update(time, delta) {
        if (this.isGameOver || this.isPaused) return;

        super.update(time, delta);

        // 重写追踪逻辑：所有敌人追踪阵眼
        this.enemies.getChildren().forEach(enemy => {
            this.physics.moveToObject(enemy, this.eye, enemy.getData('speed'));
        });
    }

    onEnemyHitEye(eye, enemy) {
        enemy.destroy();
        this.eyeHp -= 10;
        this.hudText.setText(`阵眼生命: ${Math.max(this.eyeHp, 0)}%`);

        this.eye.setFillStyle(0xff0000, 0.6);
        this.time.delayedCall(200, () => {
            if (this.eye.active) this.eye.setFillStyle(0xffd700, 0.4);
        });

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "阵眼受到攻击！生命-10%", "#ff0000", 1500);
        AudioManager.playHit();
        VFX.playHitEffect(this, enemy.x, enemy.y);

        if (this.eyeHp <= 0) {
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
        this.createRuntimeEnemy(this.nodeConfig.bossId, this.player.x + 300, this.player.y, {
            hp: enemyData.hp,
            speed: enemyData.speed,
            exp: enemyData.exp,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.2
        });
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '穷奇统领降临！目标是阵眼！', { fontSize: '28px', fill: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 3000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node5Scene;
