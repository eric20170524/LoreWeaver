// nodes/node2.js — 千崖秘径：夺宝风险路线 + 专属 Boss
import Node1Scene from './node1.js';
import AudioManager from '../utils/AudioManager.js';
import { createAtlasFrameTexture, recordProceduralFallback } from '../utils/RuntimeSprites.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node2Scene extends Node1Scene {
    constructor() {
        super('Node2Scene');
    }

    create() {
        super.create();
        this.createChestTexture();
        this.chests = this.physics.add.group();
        this.chestsOpened = 0;
        this.chestsTotal = this.nodeConfig.chestCount || 6;
        this.highRiskOpened = 0;

        for (let i = 0; i < this.chestsTotal; i++) {
            const x = Phaser.Math.Between(120, this.width * 3 - 120);
            const y = Phaser.Math.Between(120, this.height * 3 - 120);
            const risk = i % 3 === 0 ? 'high' : i % 3 === 1 ? 'mid' : 'safe';
            const chest = this.chests.create(x, y, 'chest_gold');
            chest.setDisplaySize(risk === 'high' ? 42 : 34, risk === 'high' ? 42 : 34);
            chest.setDepth(1);
            chest.setData('risk', risk);
            chest.setData('openTime', risk === 'high' ? 3.2 : risk === 'mid' ? 2.4 : 1.6);
            chest.setData('rewardMul', risk === 'high' ? 3 : risk === 'mid' ? 2 : 1);
            chest.setTint(risk === 'high' ? 0xff6644 : risk === 'mid' ? 0xffdd66 : 0xaaddff);
            chest.setData('guardsSpawned', false);
        }

        this.channelingChest = null;
        this.channelProgress = 0;
        this.channelBar = this.add.graphics().setDepth(10);
        this.objectiveText = this.uiScene.add.text(this.width / 2, 200, `宝箱 0/${this.chestsTotal}`, {
            fontSize: '18px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    createChestTexture() {
        if (createAtlasFrameTexture(this, 'chest_gold', 'chest_gold')) return;
        if (this.textures.exists('chest_gold')) return;
        recordProceduralFallback('chest_gold');
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xca8a04, 1);
        g.fillRoundedRect(8, 16, 48, 36, 4);
        g.fillStyle(0xfde047, 1);
        g.fillRect(8, 16, 48, 12);
        g.fillStyle(0xb45309, 1);
        g.fillCircle(32, 34, 5);
        g.generateTexture('chest_gold', 64, 64);
        g.destroy();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            chestChanneling: Boolean(this.channelingChest),
            chestProgress: this.channelProgress || 0,
            chestsOpened: this.chestsOpened || 0,
            chestsTotal: this.chestsTotal || 0,
            highRiskOpened: this.highRiskOpened || 0,
            objective: 'open_chests',
            ...overrides
        });
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused) return;

        this.channelBar.clear();
        let nearest = null;
        let nearestDist = 90;
        const kids = this.chests?.getChildren?.() || [];
        for (const chest of kids) {
            if (!chest.active || chest.getData('opened')) continue;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, chest.x, chest.y);
            if (d < nearestDist) {
                nearest = chest;
                nearestDist = d;
            }
        }

        if (nearest) {
            if (this.channelingChest !== nearest) {
                this.channelingChest = nearest;
                this.channelProgress = 0;
            }
            const need = (nearest.getData('openTime') || 2) * 1000;
            this.channelProgress += delta;
            const p = Math.min(1, this.channelProgress / need);
            this.channelBar.fillStyle(0x000000, 0.5).fillRect(nearest.x - 30, nearest.y - 40, 60, 8);
            this.channelBar.fillStyle(0xffd700, 1).fillRect(nearest.x - 30, nearest.y - 40, 60 * p, 8);

            // High-risk chest summons guards once while channeling.
            if (nearest.getData('risk') === 'high' && !nearest.getData('guardsSpawned') && p > 0.25) {
                nearest.setData('guardsSpawned', true);
                for (let i = 0; i < 3; i++) {
                    this.spawnEnemy({ enemyType: 'bandit_cultivator', radius: 160, angle: (Math.PI * 2 * i) / 3 });
                }
                this.showWorldFloatText(nearest.x, nearest.y - 60, '守卫被惊动！', '#ff6644', 1500);
            }

            if (this.channelProgress >= need) {
                this.openChest(nearest);
            }
        } else {
            this.channelingChest = null;
            this.channelProgress = 0;
        }

        // Taking damage interrupts channel.
        this.publishNodeTestState();
    }

    openChest(chest) {
        if (!chest?.active || chest.getData('opened')) return;
        chest.setData('opened', true);
        chest.setTint(0x555555);
        this.chestsOpened += 1;
        const mul = chest.getData('rewardMul') || 1;
        if (chest.getData('risk') === 'high') this.highRiskOpened += 1;
        const gain = 8 * mul;
        this.rewards.bloodEssence = (this.rewards.bloodEssence || 0) + gain;
        if (mul >= 2) this.rewards.pureBlood = (this.rewards.pureBlood || 0) + 1;
        this.showWorldFloatText(chest.x, chest.y - 30, `宝箱 +${gain} 气血`, '#ffd700', 1200);
        AudioManager.playSfx?.('chest_open');
        this.objectiveText?.setText(`宝箱 ${this.chestsOpened}/${this.chestsTotal}`);
        if (this.chestsOpened >= Math.ceil(this.chestsTotal * 0.5)) {
            // Mid objective: enough treasure secured — still need boss/time.
            this.showWorldFloatText(this.player.x, this.player.y - 100, '半数宝箱已得！', '#80ffea', 1800);
        }
        this.channelingChest = null;
        this.channelProgress = 0;
        this.publishNodeTestState();
    }

    onPlayerHit(player, enemy) {
        // Damage interrupts channeling (risk-reward).
        if (this.channelingChest) {
            this.channelProgress = Math.max(0, this.channelProgress - 400);
            this.showWorldFloatText(this.player.x, this.player.y - 50, '开箱被打断', '#ff8888', 700);
        }
        return super.onPlayerHit(player, enemy);
    }

    onSecondTick() {
        // Director owns spawn/boss; keep chest objective HUD refreshed.
        super.onSecondTick();
        this.objectiveText?.setText(`宝箱 ${this.chestsOpened}/${this.chestsTotal}`);
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '千崖兽王',
            phases: 3,
            scaleMultiplier: 2.2,
            moves: [
                { id: 'slam', windup: 85, active: 28, recovery: 95, radius: 150, damageMul: 1.25 },
                { id: 'charge', windup: 65, active: 42, recovery: 85, radius: 90, damageMul: 1.1 },
                { id: 'nova', windup: 95, active: 32, recovery: 105, radius: 190, damageMul: 1.4 }
            ]
        });
    }
}

export default Node2Scene;
