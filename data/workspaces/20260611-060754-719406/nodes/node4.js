// nodes/node4.js — 天潮巢：潮汐/漩涡机动关
import Node1Scene from './node1.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node4Scene extends Node1Scene {
    constructor() {
        super('Node4Scene');
    }

    init(data) {
        super.init(data);
        this.whirlHits = 0;
        this.safeLaneBonus = 0;
    }

    create() {
        super.create();
        this.statusText = this.uiScene.add.text(this.width / 2, 200, '状态: 正常航道', {
            fontSize: '18px', fill: '#66ffcc', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.whirlpools = this.physics.add.group();
        this.physics.add.overlap(this.player, this.whirlpools, this.onPlayerWhirlpool, null, this);
        this.time.addEvent({ delay: 3500, callback: this.spawnWhirlpool, callbackScope: this, loop: true });
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            whirlHits: this.whirlHits || 0,
            objective: 'avoid_whirlpools',
            ...overrides
        });
    }

    spawnWhirlpool() {
        if (this.isGameOver || this.isPaused) return;
        // Telegraph first — readable before displacement.
        const x = this.player.x + Phaser.Math.Between(-280, 280);
        const y = this.player.y + Phaser.Math.Between(-280, 280);
        const warn = this.add.circle(x, y, 70, 0x3388ff, 0.2).setStrokeStyle(3, 0x66ccff, 0.9);
        this.tweens.add({
            targets: warn, alpha: 0.5, duration: 700, yoyo: true, repeat: 1,
            onComplete: () => {
                warn.destroy();
                if (this.isGameOver) return;
                const pool = this.add.circle(x, y, 64, 0x2266aa, 0.45);
                this.physics.add.existing(pool);
                pool.body.setCircle(64);
                pool.setData('pull', true);
                this.whirlpools.add(pool);
                this.time.delayedCall(4500, () => pool.destroy?.());
            }
        });
    }

    onPlayerWhirlpool(player, pool) {
        if (!pool.active) return;
        // Displacement, not free damage — pull toward center then small chip.
        const angle = Math.atan2(pool.y - player.y, pool.x - player.x);
        player.x += Math.cos(angle) * 6;
        player.y += Math.sin(angle) * 6;
        if (!pool.getData('chipped')) {
            pool.setData('chipped', true);
            this.whirlHits += 1;
            this.statusText.setText(`状态: 卷入潮漩 (x${this.whirlHits})`);
            AudioManager.playSfx?.('whirl_pull');
            this.combatRuntime?.onPlayerHit?.(player, { getData: (k) => (k === 'atk' ? 6 : null) });
            this.time.delayedCall(900, () => pool.setData('chipped', false));
        }
    }

    onSecondTick() {
        super.onSecondTick();
        // Safe-lane pulse: away from whirlpools restores a tiny shield feel.
        const pools = this.whirlpools?.getChildren?.() || [];
        const near = pools.some((p) => p.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < 120);
        this.statusText?.setText(near ? '状态: 危险水域' : '状态: 正常航道');
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '潮主',
            phases: 3,
            moves: [
                { id: 'nova', windup: 90, active: 30, recovery: 100, radius: 160, damageMul: 1.2 },
                { id: 'charge', windup: 55, active: 45, recovery: 80, radius: 90, damageMul: 1.1 },
                { id: 'slam', windup: 100, active: 28, recovery: 110, radius: 200, damageMul: 1.35 }
            ]
        });
    }
}

export default Node4Scene;
