// nodes/node7.js
// Node 7: 三千道州精英车轮战场景 - 转换为 ES Modules

import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node7Scene extends Node1Scene {
    constructor() {
        super('Node7Scene');
    }

    init(data) {
        super.init(data);
        this.currentWave = 1;
        this.totalWaves = 5;
        this.waveActiveBoss = null;
        this.spawningNextWave = false;
    }

    create() {
        super.create();

        // HUD
        this.hudText = this.uiScene.add.text(this.width / 2, 180, '挑战进度: 1 / 5 波', {
            fontSize: '24px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.spawnWaveBoss(1);
    }

    spawnWaveBoss(wave) {
        this.spawningNextWave = false;
        
        let bossType = "wild_rhino";
        let bossData;
        let scale = 1.0;
        let messageColor = "#ff00ff";

        if (wave === 1) {
            bossType = "wild_rhino";
            bossData = ENEMY_REGISTRY["wild_rhino"];
            scale = 1.8;
        } else if (wave === 2) {
            bossType = "green_scaled_eagle";
            bossData = ENEMY_REGISTRY["green_scaled_eagle"];
            scale = 1.8;
        } else if (wave === 3) {
            bossType = "rock_golem";
            bossData = ENEMY_REGISTRY["rock_golem"];
            scale = 2.0;
        } else if (wave === 4) {
            bossType = "bandit_cultivator";
            bossData = ENEMY_REGISTRY["bandit_cultivator"];
            scale = 1.8;
        } else {
            bossType = this.nodeConfig.bossId || "shi_yi_phantom";
            bossData = ENEMY_REGISTRY[this.nodeConfig.bossId] || ENEMY_REGISTRY["shi_yi_phantom"];
            scale = 2.2;
            messageColor = "#ffd700";
        }

        const angle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(angle) * 300;
        const y = this.player.y + Math.sin(angle) * 300;

        const boss = this.createRuntimeEnemy(bossType, x, y, {
            hp: bossData.hp * (wave * 0.8),
            speed: bossData.speed,
            exp: bossData.exp * wave,
            scaleMultiplier: scale,
            data: { isWaveBoss: true }
        });

        this.waveActiveBoss = boss;
        this.hudText.setText(`挑战进度: ${wave} / ${this.totalWaves} 波`);
        UIHelper.showFloatText(this.uiScene, this.width / 2, 220, `第 ${wave} 波天骄登场！`, messageColor, 2000);
    }

    damageEnemy(enemy, dmg) {
        const isBoss = enemy.getData('isWaveBoss');
        super.damageEnemy(enemy, dmg);

        if (!enemy.active && isBoss) {
            this.waveActiveBoss = null;
            if (this.currentWave < this.totalWaves) {
                this.spawningNextWave = true;
                this.currentWave++;
                this.time.delayedCall(3000, () => {
                    this.spawnWaveBoss(this.currentWave);
                });
            } else {
                this.endGame(true);
            }
        }
    }

    onSecondTick() {
        if (this.isGameOver || this.isPaused) return;
        
        this.surviveTime++;
        this.uiScene.updateTime(this.surviveTime, this.nodeConfig.duration);

        if (!this.waveActiveBoss && !this.spawningNextWave && !this.isGameOver) {
            this.spawnWaveBoss(this.currentWave);
        }
    }
}

export default Node7Scene;
