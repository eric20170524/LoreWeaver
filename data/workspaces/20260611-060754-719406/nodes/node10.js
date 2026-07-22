// nodes/node10.js — 帝关：城墙与弩炮主动防守
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
        this.ballistaAmmo = 12;
        this.selectedLane = 1;
    }

    create() {
        super.create();
        this.wallX = 700;
        this.player.x = this.wallX + 140;
        this.player.y = this.height * 1.5;

        this.wall = this.add.rectangle(this.wallX, this.height * 1.5, 36, this.height * 2.6, 0x555555, 0.95);
        this.physics.add.existing(this.wall);
        this.wall.body.setImmovable(true);

        this.lanes = [this.height * 1.05, this.height * 1.5, this.height * 1.95];
        this.ballistas = this.lanes.map((ly, i) => {
            const b = this.add.rectangle(this.wallX + 10, ly, 28, 18, 0x888866).setStrokeStyle(2, 0xffee88);
            b.setData('lane', i);
            b.setData('cooldownUntil', 0);
            return b;
        });

        this.hudText = this.uiScene.add.text(this.width / 2, 200, '城墙 100% · 弩箭 12 · 车道 2', {
            fontSize: '15px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.physics.add.overlap(this.enemies, this.wall, this.onEnemyHitWall, null, this);
        this.input.keyboard?.on?.('keydown-ONE', () => { this.selectedLane = 0; });
        this.input.keyboard?.on?.('keydown-TWO', () => { this.selectedLane = 1; });
        this.input.keyboard?.on?.('keydown-THREE', () => { this.selectedLane = 2; });
        this.input.keyboard?.on?.('keydown-F', () => this.fireBallista());
        // Touch: tap ballista to fire that lane
        this.ballistas.forEach((b) => {
            b.setInteractive({ useHandCursor: true });
            b.on('pointerdown', () => {
                this.selectedLane = b.getData('lane');
                this.fireBallista();
            });
        });
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            wallHp: this.wallHp || 0,
            ballistaAmmo: this.ballistaAmmo || 0,
            selectedLane: this.selectedLane || 0,
            objective: 'hold_wall',
            ...overrides
        });
    }

    fireBallista() {
        if (this.isGameOver || this.isPaused) return;
        if ((this.ballistaAmmo || 0) <= 0) {
            UIHelper.showFloatText(this, this.player.x, this.player.y - 40, '弩箭耗尽', '#ff8888', 700);
            return;
        }
        const lane = this.selectedLane || 0;
        const b = this.ballistas[lane];
        if (!b) return;
        if (this.time.now < (b.getData('cooldownUntil') || 0)) return;
        b.setData('cooldownUntil', this.time.now + 700);
        this.ballistaAmmo -= 1;
        AudioManager.playSfx?.('ballista');
        const bolt = this.add.rectangle(b.x + 20, b.y, 24, 6, 0xffee88);
        this.physics.add.existing(bolt);
        bolt.body.setVelocityX(520);
        this.time.delayedCall(1600, () => bolt.destroy?.());
        this.physics.add.overlap(bolt, this.enemies, (bt, enemy) => {
            if (!enemy.active) return;
            this.damageEnemy(enemy, Math.max(18, Math.floor((this.playerStats?.baseAtk || 15) * 1.8)));
            bt.destroy?.();
        });
        this.hudText?.setText(`城墙 ${Math.floor(this.wallHp)}% · 弩箭 ${this.ballistaAmmo} · 车道 ${lane + 1} (1/2/3+F)`);
        this.publishNodeTestState();
    }

    onEnemyHitWall(enemy, wall) {
        if (!enemy.active) return;
        const now = this.time.now;
        if (now - (wall.getData('lastHit') || 0) < 500) return;
        wall.setData('lastHit', now);
        this.wallHp = Math.max(0, this.wallHp - 3);
        AudioManager.playSfx?.('wall_hit');
        enemy.setData('hp', (enemy.getData('hp') || 1) - 8);
        if (enemy.getData('hp') <= 0) enemy.destroy();
        this.hudText?.setText(`城墙 ${Math.floor(this.wallHp)}% · 弩箭 ${this.ballistaAmmo} · 车道 ${(this.selectedLane || 0) + 1}`);
        if (this.wallHp <= 0) this.endGame(false, '城墙失守', 'failed');
        this.publishNodeTestState();
    }

    update(time, delta) {
        super.update(time, delta);
        // Siege enemies prefer rushing the wall x.
        (this.enemies?.getChildren?.() || []).forEach((e) => {
            if (!e.active || e.getData('isBoss')) return;
            if (e.x > this.wallX + 40) {
                e.setData('targeting', 'wall');
                this.physics.moveTo(e, this.wallX, e.y, e.getData('speed') || 70);
            }
        });
    }

    onCampaignSecond(t) {
        if (t > 0 && t % 25 === 0) this.ballistaAmmo = Math.min(20, this.ballistaAmmo + 3);
    }

    onSecondTick() {
        super.onSecondTick();
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '攻城统领',
            phases: 3,
            scaleMultiplier: 2.3
        });
    }
}

export default Node10Scene;
