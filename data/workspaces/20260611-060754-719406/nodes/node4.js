// nodes/node4.js
// Node 4: 天潮巢海面漩涡场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node4Scene extends Node1Scene {
    constructor() {
        super('Node4Scene');
    }

    init(data) {
        super.init(data);
        this.isSlowed = false;
        this.slowTimer = 0;
    }

    create() {
        super.create();
        
        // 挂载特定的 HUD
        this.statusText = this.uiScene.add.text(this.width / 2, 180, '状态: 正常', {
            fontSize: '24px', fill: '#00ff00', fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // 创建漩涡组
        this.whirlpools = this.physics.add.group();
        
        // 定期生成漩涡 (每 4 秒生成一个)
        this.time.addEvent({
            delay: 4000,
            callback: this.spawnWhirlpool,
            callbackScope: this,
            loop: true
        });

        // 碰撞/重叠
        this.physics.add.overlap(this.player, this.whirlpools, this.onPlayerWhirlpool, null, this);
        this.bossSpawned = false;
    }

    spawnWhirlpool() {
        const angle = Math.random() * Math.PI * 2;
        const dist = Phaser.Math.Between(150, 400);
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        const w = this.add.circle(x, y, 80, 0x00aaff, 0.3);
        this.physics.add.existing(w);
        w.body.setCircle(80);
        this.whirlpools.add(w);

        w.setScale(0);
        this.tweens.add({
            targets: w,
            scaleX: 1,
            scaleY: 1,
            duration: 1000,
            onComplete: () => {
                this.time.delayedCall(3000, () => {
                    this.tweens.add({
                        targets: w,
                        alpha: 0,
                        duration: 1000,
                        onComplete: () => {
                            if (w.active) w.destroy();
                        }
                    });
                });
            }
        });
    }

    onPlayerWhirlpool(player, whirlpool) {
        if (!this.isSlowed) {
            this.isSlowed = true;
            this.statusText.setText('状态: 减速中！').setFill('#ff0000');
            UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "陷入漩涡！移速降低 70%", "#ff0000", 1500);
            
            this.originalSpeed = this.playerStats.baseSpeed;
            this.playerStats.baseSpeed = this.originalSpeed * 0.3;

            this.time.delayedCall(3000, () => {
                this.playerStats.baseSpeed = this.originalSpeed;
                this.isSlowed = false;
                if (this.statusText.active) {
                    this.statusText.setText('状态: 正常').setFill('#00ff00');
                }
            });
        }
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        super.onSecondTick();

        if (this.surviveTime === Math.floor(this.nodeConfig.duration * 0.85) && !this.bossSpawned) {
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
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '潮影兽王降临！', { fontSize: '32px', fill: '#00aaff', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 2000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node4Scene;
