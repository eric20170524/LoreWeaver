// nodes/node8.js — 星古遗地：分支房间/传送门
import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { ENEMY_REGISTRY } from '../js/data.js';

const ROOM_KINDS = [
    { id: 'combat', label: '战斗', color: 0xff5555, reward: 1.0, reward: 1.0 },
    { id: 'risk', label: '险途', color: 0xffaa00, diff: 1.35, reward: 1.6 },
    { id: 'recovery', label: '休整', color: 0x55ff99, diff: 0.7, reward: 0.8 },
    { id: 'treasure', label: '宝库', color: 0xffd700, diff: 1.15, reward: 2.0 }
];

export class Node8Scene extends Node1Scene {
    constructor() {
        super('Node8Scene');
    }

    init(data) {
        super.init(data);
        this.difficultyMultiplier = 1.0;
        this.rewardsMultiplier = 1.0;
        this.routeLog = [];
        this.roomsCleared = 0;
    }

    create() {
        super.create();
        this.hudText = this.uiScene.add.text(this.width / 2, 200, '路线: —', {
            fontSize: '16px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.portals = this.physics.add.group();
        this.physics.add.overlap(this.player, this.portals, this.onEnterPortal, null, this);
        this.spawnPortals();
        this.time.addEvent({ delay: 45000, callback: this.spawnPortals, callbackScope: this, loop: true });
        this.bossSpawned = false;
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            routeLog: [...(this.routeLog || [])],
            roomsCleared: this.roomsCleared || 0,
            difficultyMultiplier: this.difficultyMultiplier || 1,
            objective: 'choose_routes',
            ...overrides
        });
    }

    spawnPortals() {
        if (this.isGameOver) return;
        (this.portals.getChildren?.() || []).forEach((p) => p.destroy?.());
        const picks = Phaser.Utils.Array.Shuffle([...ROOM_KINDS]).slice(0, 3);
        picks.forEach((kind, i) => {
            const angle = (Math.PI * 2 * i) / 3 + 0.4;
            const x = this.player.x + Math.cos(angle) * 280;
            const y = this.player.y + Math.sin(angle) * 280;
            const portal = this.add.circle(x, y, 36, kind.color, 0.45).setStrokeStyle(3, 0xffffff, 0.8);
            this.physics.add.existing(portal);
            portal.setData('kind', kind);
            this.portals.add(portal);
            this.add.text(x, y - 48, kind.label, { fontSize: '14px', fill: '#fff' }).setOrigin(0.5);
        });
        UIHelper.showFloatText(this.uiScene, this.width / 2, 240, '选择下一间房间', '#80ffea', 1600);
    }

    onEnterPortal(player, portal) {
        if (!portal.active || this._portalLock) return;
        this._portalLock = true;
        const kind = portal.getData('kind');
        this.routeLog.push(kind.id);
        this.roomsCleared += 1;
        this.difficultyMultiplier = kind.diff;
        this.rewardsMultiplier = kind.reward;
        AudioManager.playSfx?.('portal');
        this.hudText?.setText(`路线: ${this.routeLog.join(' → ')} · 难度×${this.difficultyMultiplier.toFixed(2)}`);

        if (kind.id === 'recovery') {
            this.playerHp = Math.min(this.playerMaxHp, this.playerHp + Math.floor(this.playerMaxHp * 0.25));
            this.uiScene?.updateHp?.(this.playerHp, this.playerMaxHp);
        }
        if (kind.id === 'treasure') {
            this.rewards.bloodEssence = (this.rewards.bloodEssence || 0) + 40;
            this.rewards.pureBlood = (this.rewards.pureBlood || 0) + 1;
        }
        // Combat / risk rooms inject a local wave scaled by difficulty.
        if (kind.id === 'combat' || kind.id === 'risk') {
            const n = kind.id === 'risk' ? 5 : 3;
            for (let i = 0; i < n; i++) {
                this.spawnEnemy({
                    radius: 300,
                    data: { role: 'normal' }
                });
            }
        }

        (this.portals.getChildren?.() || []).forEach((p) => p.destroy?.());
        this.time.delayedCall(600, () => { this._portalLock = false; });
        this.publishNodeTestState();
    }

    createRuntimeEnemy(enemyType, x, y, options = {}) {
        const enemy = super.createRuntimeEnemy(enemyType, x, y, options);
        if (enemy && this.difficultyMultiplier && this.difficultyMultiplier !== 1) {
            enemy.setData('hp', Math.round((enemy.getData('hp') || 30) * this.difficultyMultiplier));
            enemy.setData('atk', Math.round((enemy.getData('atk') || 8) * Math.min(1.5, this.difficultyMultiplier)));
        }
        return enemy;
    }

    onSecondTick() {
        super.onSecondTick();
    }

    spawnBoss() {
        return super.spawnBoss({
            name: ENEMY_REGISTRY[this.nodeConfig.bossId]?.name || '遗地守护者',
            phases: 3,
            scaleMultiplier: 2.1 * (this.difficultyMultiplier || 1)
        });
    }

    endGame(success, failureReason = null, resultReason = null) {
        if (success && this.rewardsMultiplier > 1) {
            this.rewards.bloodEssence = Math.floor((this.rewards.bloodEssence || 0) * this.rewardsMultiplier);
        }
        return super.endGame(success, failureReason, resultReason);
    }
}

export default Node8Scene;
