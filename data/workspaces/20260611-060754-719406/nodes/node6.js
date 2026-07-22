// nodes/node6.js — 药都：毒雾与解药资源战
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
        this.poison = 0;
        this.maxPoison = 100;
    }

    create() {
        super.create();
        this.fog = this.add.rectangle(0, 0, this.width, this.height, 0x22aa44, 0.12)
            .setOrigin(0, 0).setScrollFactor(0).setDepth(50);
        this.hudText = this.uiScene.add.text(this.width / 2, 200, '毒素: 0%', {
            fontSize: '18px', fill: '#66ff66', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.gems = this.physics.add.group();
        this.physics.add.overlap(this.player, this.gems, this.onCollectAntidote, null, this);
        this.safeZones = [
            this.add.circle(this.width * 1.2, this.height * 1.3, 90, 0x88ffaa, 0.12).setStrokeStyle(2, 0xaaffcc, 0.7),
            this.add.circle(this.width * 1.8, this.height * 1.7, 90, 0x88ffaa, 0.12).setStrokeStyle(2, 0xaaffcc, 0.7)
        ];
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            poison: this.poison || 0,
            objective: 'manage_poison',
            ...overrides
        });
    }

    inSafeZone() {
        return (this.safeZones || []).some((z) => Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y) < 90);
    }

    onCampaignSecond() {
        if (this.inSafeZone()) {
            this.poison = Math.max(0, (this.poison || 0) - 4);
            this.fog.setFillStyle(0x22aa44, 0.08);
        } else {
            this.poison = Math.min(this.maxPoison, (this.poison || 0) + 3);
            this.fog.setFillStyle(0x22aa44, 0.12 + (this.poison / this.maxPoison) * 0.2);
            if ((this.surviveTime || 0) % 2 === 0) AudioManager.playSfx?.('poison_tick');
        }
        this.hudText?.setText(`毒素: ${Math.floor(this.poison)}% · ${this.inSafeZone() ? '安全区' : '毒雾中'}`);
        if (this.poison >= this.maxPoison) {
            this.endGame(false, '毒素失控', 'failed');
        }
        this.publishNodeTestState();
    }

    onSecondTick() {
        super.onSecondTick();
        // Periodic antidote elite
        if (this.surviveTime > 0 && this.surviveTime % 18 === 0) {
            this.spawnAntidoteElite();
        }
    }

    spawnAntidoteElite() {
        const angle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(angle) * 360;
        const y = this.player.y + Math.sin(angle) * 360;
        const elite = this.createRuntimeEnemy('burrow_wyrm', x, y, {
            hp: 180,
            scaleMultiplier: 1.4,
            data: { elite: true, dropsAntidote: true, archetype: 'charge', role: 'elite' }
        });
        elite.setTint(0x66ff99);
        UIHelper.showFloatText(this.uiScene, this.width / 2, 230, '解药精英出现！', '#66ff99', 1600);
        return elite;
    }

    damageEnemy(enemy, dmg, skillData = null) {
        const result = super.damageEnemy(enemy, dmg, skillData);
        if (result?.defeated && enemy.getData('dropsAntidote')) {
            const gem = this.add.circle(enemy.x, enemy.y, 10, 0x66ffaa, 0.95);
            this.physics.add.existing(gem);
            this.gems.add(gem);
            this.time.delayedCall(12000, () => gem.destroy?.());
        }
        return result;
    }

    onCollectAntidote(player, gem) {
        gem.destroy();
        this.poison = Math.max(0, (this.poison || 0) - 35);
        AudioManager.playSfx?.('antidote');
        UIHelper.showFloatText(this, player.x, player.y - 40, '解毒 -35', '#66ffaa', 900);
        this.hudText?.setText(`毒素: ${Math.floor(this.poison)}%`);
        this.publishNodeTestState();
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '毒域兽王',
            phases: 3,
            moves: [
                { id: 'nova', windup: 95, active: 32, recovery: 110, radius: 180, damageMul: 1.3 },
                { id: 'slam', windup: 80, active: 28, recovery: 95, radius: 140, damageMul: 1.2 },
                { id: 'charge', windup: 60, active: 40, recovery: 90, radius: 90, damageMul: 1.1 }
            ]
        });
    }
}

export default Node6Scene;
