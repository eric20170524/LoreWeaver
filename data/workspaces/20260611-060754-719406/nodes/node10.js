// nodes/node10.js
// Node 10: 边荒帝关城墙防守场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node10Scene extends Node1Scene {
    constructor() {
        super('Node10Scene');
    }

    init(data) {
        super.init(data);
        this.wallHp = 100;
        this.bossSpawned = false;
        this.lastBallistaFire = 0;
    }

    create() {
        super.create();

        this.wallX = 600;

        this.player.x = this.wallX + 150;
        this.player.y = this.height * 1.5;

        const wallHeight = this.height * 3;
        this.wallGraphics = this.add.graphics();
        this.wallGraphics.fillStyle(0x555555, 0.9);
        this.wallGraphics.fillRect(this.wallX - 20, 0, 40, wallHeight);
        this.wallGraphics.lineStyle(4, 0x8b0000);
        this.wallGraphics.strokeRect(this.wallX - 20, 0, 40, wallHeight);

        this.ballistas = [
            { x: this.wallX, y: this.height * 1.0, active: false, label: null },
            { x: this.wallX, y: this.height * 1.5, active: false, label: null },
            { x: this.wallX, y: this.height * 2.0, active: false, label: null }
        ];

        this.ballistas.forEach((b, index) => {
            const circle = this.add.circle(b.x, b.y, 25, 0xffd700, 0.8);
            this.physics.add.existing(circle);
            b.circle = circle;
            b.label = this.add.text(b.x - 40, b.y - 45, `床弩 ${index+1}`, { fontSize: '16px', fill: '#ffd700' });
        });

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '城防程度: 100%', {
            fontSize: '24px', fill: '#00ff00', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.arrows = this.physics.add.group();
        this.physics.add.overlap(this.arrows, this.enemies, this.onArrowHitEnemy, null, this);
    }

    update(time, delta) {
        if (this.isGameOver || this.isPaused) return;

        super.update(time, delta);

        this.enemies.getChildren().forEach(enemy => {
            enemy.body.setVelocity(-enemy.getData('speed'), 0);

            if (enemy.x <= this.wallX) {
                enemy.destroy();
                this.wallHp -= 5;
                this.hudText.setText(`城防程度: ${Math.max(this.wallHp, 0)}%`);
                UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "城防受损！防御度-5%", "#ff0000", 1500);
                this.cameras.main.shake(100, 0.01);
                AudioManager.playHit();
                
                if (this.wallHp <= 0) {
                    this.endGame(false);
                }
            }
        });

        if (time - this.lastBallistaFire >= 1500) {
            let fired = false;
            this.ballistas.forEach(b => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
                if (dist < 100) {
                    this.fireBallista(b);
                    fired = true;
                }
            });
            if (fired) {
                this.lastBallistaFire = time;
            }
        }
    }

    fireBallista(b) {
        const arrow = this.add.rectangle(b.x + 30, b.y, 80, 16, 0xffa500);
        this.physics.add.existing(arrow);
        arrow.body.setVelocity(500, 0); 
        this.arrows.add(arrow);

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "床弩发射！破甲巨箭！", "#ffa500", 1000);
        AudioManager.playClick();

        this.time.delayedCall(2000, () => {
            if (arrow.active) arrow.destroy();
        });
    }

    onArrowHitEnemy(arrow, enemy) {
        const dmg = 80 * (this.playerStats.baseAtk / 10);
        this.damageEnemy(enemy, dmg);
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
        this.createRuntimeEnemy(this.nodeConfig.bossId, this.wallX + 800, this.height * 1.5, {
            hp: enemyData.hp * 1.5,
            speed: enemyData.speed,
            exp: enemyData.exp,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.25
        });
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '敌军统领带队冲击帝关！死守！', { fontSize: '28px', fill: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 3000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node10Scene;
