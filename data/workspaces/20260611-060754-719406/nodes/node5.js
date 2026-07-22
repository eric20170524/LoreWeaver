// nodes/node5.js — 石都大战：多阵眼/核心防守
import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

export class Node5Scene extends Node1Scene {
    constructor() {
        super('Node5Scene');
    }

    init(data) {
        super.init(data);
        this.cores = [];
    }

    create() {
        super.create();
        const cx = this.width * 1.5;
        const cy = this.height * 1.5;
        this.player.x = cx - 80;
        this.player.y = cy;

        // Three cores / lanes for prioritization.
        const offsets = [
            { x: 0, y: 0, name: '中枢' },
            { x: -220, y: 140, name: '左阵' },
            { x: 220, y: 140, name: '右阵' }
        ];
        this.cores = offsets.map((o, idx) => {
            const core = this.add.circle(cx + o.x, cy + o.y, 42, 0xffd700, 0.35);
            this.physics.add.existing(core);
            core.body.setImmovable(true);
            core.setStrokeStyle(3, 0xffaa00);
            core.setData('hp', 100);
            core.setData('maxHp', 100);
            core.setData('lane', idx);
            core.setData('name', o.name);
            this.add.text(cx + o.x, cy + o.y - 55, o.name, {
                fontSize: '14px', fill: '#ffd700'
            }).setOrigin(0.5);
            return core;
        });

        this.hudText = this.uiScene.add.text(this.width / 2, 200, '阵眼: 100% | 100% | 100%', {
            fontSize: '16px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.physics.add.overlap(this.enemies, this.cores, this.onEnemyHitCore, null, this);
        this.repairCharges = 3;
        this.input.keyboard?.on?.('keydown-R', () => this.tryRepairNearestCore());
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            cores: (this.cores || []).map((c) => ({
                name: c.getData('name'),
                hp: c.getData('hp'),
                lane: c.getData('lane')
            })),
            repairCharges: this.repairCharges || 0,
            objective: 'defend_eye',
            ...overrides
        });
    }

    updateCoreHud() {
        const parts = (this.cores || []).map((c) => `${Math.max(0, Math.floor(c.getData('hp')))}%`);
        this.hudText?.setText(`阵眼: ${parts.join(' | ')} · 修复×${this.repairCharges}`);
    }

    onEnemyHitCore(enemy, core) {
        if (!enemy.active || !core.active) return;
        // Enemies target cores: mark and chip.
        enemy.setData('targetingCore', core.getData('lane'));
        const now = this.time.now;
        if (now - (core.getData('lastHitAt') || 0) < 500) return;
        core.setData('lastHitAt', now);
        const hp = Math.max(0, (core.getData('hp') || 0) - 4);
        core.setData('hp', hp);
        core.setFillStyle(hp < 30 ? 0xff3333 : 0xffd700, 0.35);
        AudioManager.playSfx?.('core_hit');
        this.updateCoreHud();
        if (hp <= 0) {
            this.endGame(false, `${core.getData('name')}阵眼崩溃`, 'failed');
        }
    }

    tryRepairNearestCore() {
        if (this.isGameOver || this.isPaused || (this.repairCharges || 0) <= 0) return;
        let nearest = null;
        let best = 120;
        for (const core of this.cores || []) {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, core.x, core.y);
            if (d < best) {
                best = d;
                nearest = core;
            }
        }
        if (!nearest) return;
        this.repairCharges -= 1;
        const hp = Math.min(100, (nearest.getData('hp') || 0) + 28);
        nearest.setData('hp', hp);
        nearest.setFillStyle(0xffd700, 0.35);
        UIHelper.showFloatText(this, nearest.x, nearest.y - 40, '阵眼修复', '#80ffea', 900);
        this.updateCoreHud();
        this.publishNodeTestState();
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused) return;
        // Bias enemy pathing toward lowest-HP core.
        const cores = (this.cores || []).filter((c) => (c.getData('hp') || 0) > 0);
        if (!cores.length) return;
        cores.sort((a, b) => a.getData('hp') - b.getData('hp'));
        const target = cores[0];
        (this.enemies?.getChildren?.() || []).forEach((enemy) => {
            if (!enemy.active || enemy.getData('isBoss')) return;
            if (Math.random() < 0.4) this.physics.moveToObject(enemy, target, enemy.getData('speed') || 60);
        });
        this.publishNodeTestState();
    }

    onSecondTick() {
        super.onSecondTick();
        this.updateCoreHud();
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '破阵首领',
            phases: 3,
            moves: [
                { id: 'slam', windup: 85, active: 30, recovery: 100, radius: 150, damageMul: 1.25 },
                { id: 'nova', windup: 100, active: 32, recovery: 110, radius: 190, damageMul: 1.4 },
                { id: 'charge', windup: 60, active: 42, recovery: 90, radius: 90, damageMul: 1.1 }
            ]
        });
    }
}

export default Node5Scene;
