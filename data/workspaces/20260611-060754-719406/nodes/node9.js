// nodes/node9.js — 星脉书院：护送
import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node9Scene extends Node1Scene {
    constructor() {
        super('Node9Scene');
    }

    init(data) {
        super.init(data);
        this.npcHp = 100;
        this.escortMode = 'follow'; // follow | hold
    }

    create() {
        super.create();
        const startX = this.width * 1.15;
        const startY = this.height * 1.5;
        this.destX = this.width * 2.25;
        this.destY = this.height * 1.5;
        this.player.x = startX;
        this.player.y = startY - 90;

        this.escort = this.add.rectangle(startX, startY, 28, 36, 0x55ff88);
        this.physics.add.existing(this.escort);
        this.escort.body.setImmovable(false);
        this.dest = this.add.circle(this.destX, this.destY, 36, 0xffd700, 0.35).setStrokeStyle(2, 0xffee88);
        this.add.text(this.destX, this.destY - 48, '终点', { fontSize: '16px', fill: '#ffd700' }).setOrigin(0.5);

        this.hudText = this.uiScene.add.text(this.width / 2, 200, '护送 HP 100% · 模式:跟随', {
            fontSize: '16px', fill: '#88ffaa', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.physics.add.overlap(this.enemies, this.escort, this.onEnemyHitEscort, null, this);
        this.input.keyboard?.on?.('keydown-H', () => {
            this.escortMode = this.escortMode === 'follow' ? 'hold' : 'follow';
            UIHelper.showFloatText(this, this.escort.x, this.escort.y - 40,
                this.escortMode === 'hold' ? '护送达待命' : '护送跟随', '#80ffea', 900);
        });
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            npcHp: this.npcHp || 0,
            escortMode: this.escortMode,
            objective: 'escort_npc',
            ...overrides
        });
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused || !this.escort) return;

        if (this.escortMode === 'follow') {
            const dist = Phaser.Math.Distance.Between(this.escort.x, this.escort.y, this.player.x, this.player.y);
            if (dist > 70) this.physics.moveToObject(this.escort, this.player, 140);
            else this.escort.body.setVelocity(0, 0);
        } else {
            this.escort.body.setVelocity(0, 0);
        }

        // Progress toward destination when near escort and mode follow.
        if (this.escortMode === 'follow') {
            const toDest = Phaser.Math.Distance.Between(this.escort.x, this.escort.y, this.destX, this.destY);
            if (toDest > 40) {
                // Bias escort slightly toward destination while following player corridor.
                this.escort.x += (this.destX - this.escort.x) * 0.004;
            } else {
                this.campaignObjectiveComplete = true;
                UIHelper.showFloatText(this.uiScene, this.width / 2, 240, '护送抵达！', '#ffd700', 2000);
            }
        }

        // Enemies may prefer escort as target.
        (this.enemies?.getChildren?.() || []).forEach((e) => {
            if (!e.active || e.getData('isBoss')) return;
            if (Math.random() < 0.35) {
                e.setData('targeting', 'escort');
                this.physics.moveToObject(e, this.escort, e.getData('speed') || 60);
            } else {
                e.setData('targeting', 'player');
            }
        });

        this.hudText?.setText(`护送 HP ${Math.floor(this.npcHp)}% · 模式:${this.escortMode === 'hold' ? '待命' : '跟随'} (H切换)`);
        this.publishNodeTestState();
    }

    onEnemyHitEscort(enemy, escort) {
        if (!enemy.active) return;
        const now = this.time.now;
        if (now - (escort.getData('lastHit') || 0) < 600) return;
        escort.setData('lastHit', now);
        this.npcHp = Math.max(0, this.npcHp - 6);
        AudioManager.playSfx?.('escort_warn');
        UIHelper.showFloatText(this, escort.x, escort.y - 30, '-6', '#ff6666', 600);
        if (this.npcHp <= 0) this.endGame(false, '护送目标倒下', 'failed');
    }

    onSecondTick() {
        super.onSecondTick();
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '截道首领',
            phases: 3,
            data: { prefersEscort: true }
        });
    }
}

export default Node9Scene;
