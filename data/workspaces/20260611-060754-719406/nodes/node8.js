// nodes/node8.js
// Node 8: 仙古遗地随机传送场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node8Scene extends Node1Scene {
    constructor() {
        super('Node8Scene');
    }

    init(data) {
        super.init(data);
        this.difficultyMultiplier = 1.0;
        this.rewardsMultiplier = 1.0;
        this.dimensionName = "正常";
        this.bossSpawned = false;
    }

    create() {
        super.create();

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '空间法则: 正常', {
            fontSize: '24px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.portals = this.physics.add.group();
        this.physics.add.overlap(this.player, this.portals, this.onPlayerEnterPortal, null, this);

        this.time.addEvent({
            delay: 60000,
            callback: this.spawnPortals,
            callbackScope: this,
            loop: true
        });

        this.spawnPortals();
    }

    spawnPortals() {
        this.portals.clear(true, true);

        const px = this.player.x;
        const py = this.player.y;

        const redPortal = this.add.circle(px - 150, py - 100, 40, 0xff0000, 0.5);
        this.physics.add.existing(redPortal);
        redPortal.setData('type', 'danger');
        this.portals.add(redPortal);
        this.add.text(px - 150, py - 160, '狂暴门', { fontSize: '18px', fill: '#ff0000' }).setOrigin(0.5);

        const bluePortal = this.add.circle(px + 150, py + 100, 40, 0x00aaff, 0.5);
        this.physics.add.existing(bluePortal);
        bluePortal.setData('type', 'safe');
        this.portals.add(bluePortal);
        this.add.text(px + 150, py + 40, '安全门', { fontSize: '18px', fill: '#00aaff' }).setOrigin(0.5);

        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "空间法则松动！选择你的传送门！", "#ffffff", 2500);
    }

    onPlayerEnterPortal(player, portal) {
        const type = portal.getData('type');
        this.portals.clear(true, true);
        
        if (type === 'danger') {
            this.difficultyMultiplier = 2.0;
            this.rewardsMultiplier = 2.0;
            this.dimensionName = "狂暴";
            this.hudText.setText('空间法则: 狂暴 (双倍怪物/双倍掉落)').setFill('#ff0000');
            UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "进入狂暴空间！怪物加强，掉落双倍！", "#ff0000", 2000);
        } else {
            this.difficultyMultiplier = 0.8;
            this.rewardsMultiplier = 1.0;
            this.dimensionName = "宁静";
            this.hudText.setText('空间法则: 宁静 (安全生存)').setFill('#00aaff');
            UIHelper.showFloatText(this.uiScene, this.width / 2, 220, "进入宁静空间！怪物削弱，掉落正常。", "#00aaff", 2000);
        }
        AudioManager.playClick();
    }

    spawnEnemy() {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(this.width, this.height) * 0.6;
        const x = this.player.x + Math.cos(angle) * radius;
        const y = this.player.y + Math.sin(angle) * radius;

        const enemyType = Phaser.Utils.Array.GetRandom(this.nodeConfig.enemyPool);
        const enemyData = ENEMY_REGISTRY[enemyType];

        this.createRuntimeEnemy(enemyType, x, y, {
            hp: enemyData.hp * this.difficultyMultiplier,
            speed: enemyData.speed * (this.dimensionName === "狂暴" ? 1.3 : 0.8),
            exp: enemyData.exp * this.rewardsMultiplier,
            lootList: enemyData.lootList,
            scaleMultiplier: this.dimensionName === "狂暴" ? 1.15 : 0.95
        });
    }

    damageEnemy(enemy, dmg) {
        const lootItems = enemy.getData('lootList');

        super.damageEnemy(enemy, dmg);

        if (!enemy.active && lootItems && this.rewardsMultiplier > 1.0) {
            lootItems.forEach(loot => {
                if (Math.random() < loot.chance) {
                    this.rewards[loot.item] = (this.rewards[loot.item] || 0) + loot.count;
                }
            });
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
            hp: enemyData.hp * this.difficultyMultiplier,
            speed: enemyData.speed,
            exp: enemyData.exp * this.rewardsMultiplier,
            lootList: enemyData.lootList,
            scaleMultiplier: 1.2
        });
        
        const txt = this.add.text(this.player.x, this.player.y - 100, '仙古守护兽降临！', { fontSize: '28px', fill: '#ff00ff', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({
            targets: txt,
            y: this.player.y - 150,
            alpha: 0,
            duration: 3000,
            onComplete: () => txt.destroy()
        });
    }
}

export default Node8Scene;
