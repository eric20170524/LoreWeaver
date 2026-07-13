// nodes/node11.js
// Node 11: 异域大战混合精英场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node11Scene extends Node1Scene {
    constructor() {
        super('Node11Scene');
    }

    init(data) {
        super.init(data);
        this.bossSpawned = false;
        this.erosion = 0;
    }

    create() {
        super.create();

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '异域侵蚀度: 0%', {
            fontSize: '24px', fill: '#ff3333', fontStyle: 'bold'
        }).setOrigin(0.5);

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "进入异域大本营！敌袭强度翻倍！", "#ff3333", 3000);
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        
        this.surviveTime++;
        this.uiScene.updateTime(this.surviveTime, this.nodeConfig.duration);

        this.erosion = Math.min(Math.floor(this.surviveTime / (this.nodeConfig.duration / 100)), 100);
        this.hudText.setText(`异域侵蚀度: ${this.erosion}%`);

        const spawnCount = 2 + Math.floor(this.surviveTime / 15);
        for (let i = 0; i < spawnCount; i++) {
            this.spawnEnemy();
        }

        if (this.surviveTime % 30 === 0 && this.surviveTime < this.nodeConfig.duration) {
            this.spawnMiniBoss();
        }

        if (this.surviveTime === Math.floor(this.nodeConfig.duration * 0.9) && !this.bossSpawned) {
            this.spawnBoss();
            this.bossSpawned = true;
        }

        if (this.surviveTime >= this.nodeConfig.duration) {
            this.endGame(true);
        }
    }

    spawnEnemy() {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(this.width, this.height) * 0.6;
        const x = this.player.x + Math.cos(angle) * radius;
        const y = this.player.y + Math.sin(angle) * radius;

        const enemyType = Phaser.Utils.Array.GetRandom(this.nodeConfig.enemyPool);
        const enemyData = ENEMY_REGISTRY[enemyType];

        this.createRuntimeEnemy(enemyType, x, y, {
            hp: enemyData.hp * 2.2,
            speed: enemyData.speed * 1.2,
            exp: enemyData.exp * 2.0,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.25
        });
    }

    spawnMiniBoss() {
        const miniBossType = "ancient_beast_king";
        const enemyData = ENEMY_REGISTRY[miniBossType];
        
        const angle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(angle) * 300;
        const y = this.player.y + Math.sin(angle) * 300;

        this.createRuntimeEnemy(miniBossType, x, y, {
            hp: enemyData.hp * 0.8,
            speed: enemyData.speed * 1.1,
            exp: enemyData.exp,
            scaleMultiplier: 1.2
        });
        
        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "异域督军出现！", "#ff3333", 2000);
    }

    spawnBoss() {
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId];
        this.createRuntimeEnemy(this.nodeConfig.bossId, this.player.x + 300, this.player.y, {
            hp: enemyData.hp * 2.0,
            speed: enemyData.speed,
            exp: enemyData.exp,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.3
        });
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '不朽守卫降临！死战求生！', { fontSize: '28px', fill: '#ff3333', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 3000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node11Scene;
