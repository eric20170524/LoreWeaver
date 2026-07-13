// nodes/node6.js
// Node 6: 药都风云全屏毒雾场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node6Scene extends Node1Scene {
    constructor() {
        super('Node6Scene');
    }

    init(data) {
        super.init(data);
        this.poisonResist = 100;
        this.bossSpawned = false;
    }

    create() {
        super.create();

        this.fog = this.add.rectangle(0, 0, this.width, this.height, 0x00ff00, 0.15)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(99);

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '毒素抗性: 100%', {
            fontSize: '24px', fill: '#00ff00', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.gems = this.physics.add.group();
        this.physics.add.overlap(this.player, this.gems, this.onPlayerCollectGem, null, this);

        this.time.addEvent({
            delay: 15000,
            callback: this.spawnAntidoteElite,
            callbackScope: this,
            loop: true
        });
    }

    spawnAntidoteElite() {
        const angle = Math.random() * Math.PI * 2;
        const dist = 300;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        this.createRuntimeEnemy('burrow_wyrm', x, y, {
            hp: 150,
            speed: 80,
            exp: 50,
            scaleMultiplier: 1.1,
            data: { isAntidoteElite: true }
        });

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "避毒宝兽出现！击杀可得解药！", "#00ff00", 2000);
    }

    damageEnemy(enemy, dmg) {
        const ex = enemy.x;
        const ey = enemy.y;
        const isElite = enemy.getData('isAntidoteElite');

        super.damageEnemy(enemy, dmg);

        if (!enemy.active && isElite) {
            this.spawnAntidoteGem(ex, ey);
        }
    }

    spawnAntidoteGem(x, y) {
        const gem = this.gems.create(x, y, null);
        gem.setDisplaySize(20, 20);
        gem.setTint(0x00ff00); 

        this.tweens.add({
            targets: gem,
            alpha: 0.4,
            yoyo: true,
            repeat: -1,
            duration: 300
        });
    }

    onPlayerCollectGem(player, gem) {
        gem.destroy();
        this.poisonResist = Math.min(this.poisonResist + 40, 100);
        this.hudText.setText(`毒素抗性: ${this.poisonResist}%`).setFill('#00ff00');
        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "服下解药！毒素抗性恢复", "#00ff00", 1500);
        AudioManager.playClick();
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        super.onSecondTick();

        this.poisonResist -= 4;
        if (this.poisonResist <= 0) {
            this.poisonResist = 0;
            this.hudText.setText('毒素抗性: 0%').setFill('#ff0000');
            this.endGame(false);
            return;
        }

        if (this.poisonResist < 30) {
            this.hudText.setText(`警告！毒素抗性: ${this.poisonResist}%`).setFill('#ff0000');
            this.cameras.main.flash(200, 255, 0, 0, true);
        } else {
            this.hudText.setText(`毒素抗性: ${this.poisonResist}%`).setFill('#00ff00');
        }

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
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '药谷守护兽降临！速战速决！', { fontSize: '28px', fill: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 3000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node6Scene;
