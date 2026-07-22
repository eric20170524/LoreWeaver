// nodes/node12.js — 终局三阶段 Boss（禁止计时通关）
import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import { ENEMY_REGISTRY } from '../js/data.js';
import { BossPhaseController } from '../runtime/BossPhaseController.js';
import NodeBridge from '../systems/NodeBridge.js';

export class Node12Scene extends Node1Scene {
    constructor() {
        super('Node12Scene');
    }

    init(data) {
        super.init(data);
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId] || ENEMY_REGISTRY.shi_yi_phantom;
        this.bossHp = enemyData.hp;
        this.maxBossHp = enemyData.hp;
        this.bossPhase = 1;
        this.bossInstance = null;
        this.lastBossAttack = 0;
        // Finale must not be won by survival timer.
        if (this.levelContract) {
            this.levelContract = { ...this.levelContract, victoryMode: 'boss_only' };
        }
        if (this.runDirector?.contract) {
            this.runDirector.contract = { ...this.runDirector.contract, victoryMode: 'boss_only' };
        }
    }

    create() {
        super.create();
        this.hudText = this.uiScene.add.text(this.width / 2, 230, '金阙君 · 阶段 1', {
            fontSize: '20px', fill: '#ff3333', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.bossBullets = this.physics.add.group();
        this.physics.add.overlap(this.player, this.bossBullets, this.onPlayerHitBullet, null, this);
        this.time.delayedCall(600, () => {
            if (!this.bossInstance?.active) this.spawnFinaleBoss();
        });
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            bossPhase: this.bossPhase || 1,
            bossHp: this.bossHp || 0,
            objective: 'defeat_finale_boss',
            victoryMode: 'boss_only',
            ...overrides
        });
    }

    spawnFinaleBoss() {
        if (this.bossInstance?.active) return this.bossInstance;
        const enemyData = ENEMY_REGISTRY[this.nodeConfig.bossId] || ENEMY_REGISTRY.shi_yi_phantom;
        const boss = this.createRuntimeEnemy(this.nodeConfig.bossId, this.width * 1.5, this.height * 1.5 - 200, {
            hp: enemyData.hp,
            speed: (enemyData.speed || 40) * 0.75,
            scaleMultiplier: 2.0,
            data: { isBoss: true, role: 'boss', isFinale: true }
        });
        boss.setData('isBoss', true);
        boss.setData('maxHp', enemyData.hp);
        this.bossInstance = boss;
        this.activeBoss = boss;
        this.bossSpawned = true;
        this.bossPhaseController = new BossPhaseController(this, boss, {
            name: enemyData.name || '金阙君',
            phases: 3,
            moves: [
                { id: 'beam', windup: 75, active: 22, recovery: 95, radius: 120, damageMul: 1.15 },
                { id: 'nova', windup: 100, active: 34, recovery: 115, radius: 190, damageMul: 1.35 },
                { id: 'charge', windup: 55, active: 44, recovery: 85, radius: 90, damageMul: 1.2 }
            ]
        });
        UIHelper.showFloatText(this.uiScene, this.width / 2, 340, '金阙君降临！三阶段终局！', '#ff3333', 2500);
        return boss;
    }

    spawnBoss() {
        // Director climax may call this; reuse finale instance.
        if (this.bossInstance?.active) return this.bossInstance;
        return this.spawnFinaleBoss();
    }

    update(time, delta) {
        if (this.isGameOver || this.isPaused) return;
        super.update(time, delta);

        if (this.bossInstance?.active) {
            this.bossHp = this.bossInstance.getData('hp');
            const maxHp = this.bossInstance.getData('maxHp') || this.maxBossHp;
            const pct = Math.max(0, Math.floor((this.bossHp / maxHp) * 100));
            const phase = this.bossInstance.getData('phase') || 1;
            if (phase !== this.bossPhase) {
                this.bossPhase = phase;
                UIHelper.showFloatText(this.uiScene, this.width / 2, 340, `终局阶段 ${phase}`, '#ff8800', 1800);
            }
            this.hudText?.setText(`金阙君 · 阶段 ${phase} · HP ${pct}%`);
            // Phase-specific bullet patterns layered on the phase controller.
            if (time - this.lastBossAttack > (phase === 1 ? 1800 : phase === 2 ? 1400 : 1000)) {
                this.lastBossAttack = time;
                this.firePhasePattern(phase);
            }
        } else if (this.bossSpawned && !this.isGameOver) {
            // Boss defeated
            this.time.delayedCall(400, () => {
                if (!this.isGameOver) this.endGame(true, null, NodeBridge.RESULT_REASONS.COMPLETED);
            });
        }
        this.publishNodeTestState();
    }

    firePhasePattern(phase) {
        const b = this.bossInstance;
        if (!b?.active) return;
        if (phase === 1) {
            this.fireBullet(b.x, b.y, this.player.x, this.player.y, 260);
        } else if (phase === 2) {
            for (let i = 0; i < 8; i++) this.fireBulletWithAngle(b.x, b.y, (i * Math.PI) / 4, 210);
        } else {
            for (let i = 0; i < 12; i++) this.fireBulletWithAngle(b.x, b.y, (i * Math.PI) / 6, 230);
        }
    }

    fireBullet(fromX, fromY, toX, toY, speed) {
        const bullet = this.add.circle(fromX, fromY, 11, 0xff3333);
        this.physics.add.existing(bullet);
        this.physics.moveTo(bullet, toX, toY, speed);
        bullet.setData('atk', Math.max(10, Math.round((this.bossInstance?.getData('atk') || 20) * 0.6)));
        this.bossBullets.add(bullet);
        this.time.delayedCall(3000, () => bullet.destroy?.());
    }

    fireBulletWithAngle(fromX, fromY, angle, speed) {
        const bullet = this.add.circle(fromX, fromY, 9, 0xff5555);
        this.physics.add.existing(bullet);
        bullet.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        bullet.setData('atk', Math.max(8, Math.round((this.bossInstance?.getData('atk') || 20) * 0.5)));
        this.bossBullets.add(bullet);
        this.time.delayedCall(3000, () => bullet.destroy?.());
    }

    onPlayerHitBullet(player, bullet) {
        const atk = bullet.getData('atk') || 12;
        bullet.destroy();
        // No unexplained instant kill — use normal damage path.
        this.combatRuntime?.onPlayerHit?.(player, { getData: (k) => (k === 'atk' ? atk : null) });
    }

    onSecondTick() {
        // Use director but ignore duration success (boss_only).
        super.onSecondTick();
    }

    endGame(success, failureReason = null, resultReason = null) {
        // Reject accidental duration victories.
        if (success && failureReason === null && resultReason === 'duration_complete') {
            return super.endGame(false, '终局须击败金阙君', 'failed');
        }
        return super.endGame(success, failureReason, resultReason);
    }
}

export default Node12Scene;
