// nodes/node11.js — 异域：精英连战 / 侵蚀
import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node11Scene extends Node1Scene {
    constructor() {
        super('Node11Scene');
    }

    init(data) {
        super.init(data);
        this.erosion = 0;
        this.eliteClears = 0;
    }

    create() {
        super.create();
        this.hudText = this.uiScene.add.text(this.width / 2, 200, '异域侵蚀 0%', {
            fontSize: '18px', fill: '#ff5555', fontStyle: 'bold'
        }).setOrigin(0.5);
        UIHelper.showFloatText(this.uiScene, this.width / 2, 240, '精英连战开始！', '#ff5555', 2000);
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            erosion: this.erosion || 0,
            eliteClears: this.eliteClears || 0,
            objective: 'endure_erosion',
            ...overrides
        });
    }

    onCampaignSecond(t) {
        this.erosion = Math.min(100, Math.floor((t / (this.levelContract?.durationSeconds || 300)) * 100));
        this.hudText?.setText(`异域侵蚀 ${this.erosion}% · 精英击破 ${this.eliteClears}`);
        // Soft pressure: high erosion chips player slowly.
        if (this.erosion >= 80 && t % 3 === 0) {
            this.playerHp = Math.max(1, this.playerHp - 1);
            this.uiScene?.updateHp?.(this.playerHp, this.playerMaxHp);
        }
        this.publishNodeTestState();
    }

    onSecondTick() {
        super.onSecondTick();
        // Authored elite pair mid-run if director already spawned pressure.
        if (this.surviveTime === 100) this.spawnElitePair();
    }

    spawnElitePair() {
        const a = this.createRuntimeEnemy(this.nodeConfig.enemyPool[0], this.player.x + 300, this.player.y - 80, {
            scaleMultiplier: 1.5,
            data: { elite: true, role: 'elite', archetype: 'zone_control' }
        });
        const b = this.createRuntimeEnemy(this.nodeConfig.enemyPool[1] || this.nodeConfig.enemyPool[0], this.player.x + 300, this.player.y + 80, {
            scaleMultiplier: 1.5,
            data: { elite: true, role: 'elite', archetype: 'ranged_pressure' }
        });
        a?.setTint?.(0xff66aa);
        b?.setTint?.(0x66aaff);
        UIHelper.showFloatText(this.uiScene, this.width / 2, 240, '双精英组合！', '#ff88cc', 1800);
    }

    damageEnemy(enemy, dmg, skillData = null) {
        const result = super.damageEnemy(enemy, dmg, skillData);
        if (result?.defeated && enemy.getData('elite')) {
            this.eliteClears += 1;
            this.erosion = Math.max(0, this.erosion - 8);
            this.playerActionController?.addCharge?.(15, 'elite_clear');
            AudioManager.playSfx?.('wave_clear');
        }
        return result;
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '异域统帅',
            phases: 3,
            scaleMultiplier: 2.2
        });
    }
}

export default Node11Scene;
