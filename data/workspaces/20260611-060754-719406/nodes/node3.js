// nodes/node3.js — 镜魄试炼：威压决斗 + 破绽窗口
import Node1Scene from './node1.js';
import { createAtlasFrameTexture, recordProceduralFallback } from '../utils/RuntimeSprites.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node3Scene extends Node1Scene {
    constructor() {
        super('Node3Scene');
    }

    create() {
        super.create();
        this.rivalPressure = 0;
        this.maxPressure = 100;
        this.breakWindowActive = false;
        this.bossSpawned = false;

        this.hudText = this.uiScene.add.text(this.width / 2, 200, '试炼进度 0% · 紫曜威压 0%', {
            fontSize: '18px', fill: '#c084fc', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.pressureGraphics = this.uiScene.add.graphics().setDepth(20);
        this.pressureText = this.uiScene.add.text(this.width / 2, 230, '紫曜威压: 0%', {
            fontSize: '15px', fill: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(20);

        this.events.once('shutdown', () => {
            this.hudText?.destroy?.();
            this.pressureGraphics?.destroy?.();
            this.pressureText?.destroy?.();
        });
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            rivalPressure: this.rivalPressure || 0,
            objectiveProgress: Number(Math.min(1, (this.surviveTime || 0) / 180).toFixed(3)),
            breakWindowActive: Boolean(this.breakWindowActive || this.activeBoss?.getData?.('state') === 'recovery' || this.activeBoss?.getData?.('state') === 'break'),
            bossState: this.activeBoss?.getData?.('state') || null,
            objective: 'survive_pressure',
            ...overrides
        });
    }

    drawPressureHud() {
        const p = Math.min(1, (this.rivalPressure || 0) / this.maxPressure);
        const progressPct = Math.floor(Math.min(1, (this.surviveTime || 0) / 180) * 100);
        this.pressureGraphics.clear();
        this.pressureGraphics.fillStyle(0x111111, 0.7).fillRect(this.width / 2 - 120, 246, 240, 10);
        this.pressureGraphics.fillStyle(p > 0.7 ? 0xff2244 : 0xaa66ff, 1).fillRect(this.width / 2 - 120, 246, 240 * p, 10);
        this.pressureText.setText(`紫曜威压: ${Math.floor(p * 100)}%`);
        this.hudText?.setText(`试炼进度 ${progressPct}% · 紫曜威压 ${Math.floor(p * 100)}%`);
    }

    onPlayerHit(player, enemy) {
        this.rivalPressure = Math.min(this.maxPressure, (this.rivalPressure || 0) + 8);
        this.drawPressureHud();
        if (this.rivalPressure >= this.maxPressure) {
            this.endGame(false, '威压爆表', 'failed');
            return;
        }
        return super.onPlayerHit(player, enemy);
    }

    damageEnemy(enemy, dmg, skillData = null) {
        const result = super.damageEnemy(enemy, dmg, skillData);
        // Successful hits and breaks reduce pressure. break_window SFX comes from BossPhaseController.tryBreak.
        if (enemy?.getData?.('isBoss') && (enemy.getData('state') === 'break' || skillData?.castMode === 'manual')) {
            this.rivalPressure = Math.max(0, (this.rivalPressure || 0) - 12);
            this.drawPressureHud();
        } else if (result?.defeated) {
            this.rivalPressure = Math.max(0, (this.rivalPressure || 0) - 4);
            this.drawPressureHud();
        }
        return result;
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused) return;
        this.breakWindowActive = this.activeBoss?.getData?.('interruptible') === true;
        this.publishNodeTestState();
    }

    onCampaignSecond(surviveTime) {
        if (surviveTime > 8) {
            this.rivalPressure = Math.min(this.maxPressure, (this.rivalPressure || 0) + 0.25);
            this.drawPressureHud();
            if (this.rivalPressure >= this.maxPressure) {
                this.endGame(false, '威压爆表', 'failed');
            }
        }
    }

    onSecondTick() {
        super.onSecondTick();
        this.drawPressureHud();
    }

    spawnBoss() {
        const boss = super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '玄曜虚影',
            phases: 3,
            scaleMultiplier: 2.0,
            moves: [
                { id: 'beam', windup: 80, active: 24, recovery: 100, radius: 130, damageMul: 1.15 },
                { id: 'nova', windup: 100, active: 30, recovery: 110, radius: 170, damageMul: 1.3 },
                { id: 'charge', windup: 60, active: 40, recovery: 90, radius: 85, damageMul: 1.05 }
            ]
        });
        // Fire a readable projectile volley during phase 2+ via campaign second hook.
        this.time.addEvent({
            delay: 2200,
            loop: true,
            callback: () => {
                if (!boss?.active || this.isGameOver || this.isPaused) return;
                if ((boss.getData('phase') || 1) < 2) return;
                if (!createAtlasFrameTexture(this, 'boss_projectile', 'boss_projectile')) {
                    if (!this.textures.exists('boss_projectile')) {
                        recordProceduralFallback('boss_projectile');
                        const g = this.make.graphics({ x: 0, y: 0, add: false });
                        g.fillStyle(0xaa44ff, 1);
                        g.fillCircle(12, 12, 10);
                        g.generateTexture('boss_projectile', 24, 24);
                        g.destroy();
                    }
                }
                const proj = this.enemyProjectiles.create(boss.x, boss.y, 'boss_projectile');
                if (!proj) return;
                proj.setDisplaySize(18, 18);
                proj.setData('atk', Math.max(8, Math.round((boss.getData('atk') || 20) * 0.7)));
                proj.setData('activeDamage', true);
                this.physics.moveToObject(proj, this.player, 280);
                this.time.delayedCall(2500, () => proj.destroy?.());
            }
        });
        return boss;
    }
}

export default Node3Scene;
