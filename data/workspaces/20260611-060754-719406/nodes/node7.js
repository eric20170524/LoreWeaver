// nodes/node7.js — 三千星州：车轮战精英回合
import Node1Scene from './node1.js';
import UIHelper from '../utils/UIHelper.js';
import AudioManager from '../utils/AudioManager.js';
import { BossPhaseController } from '../runtime/BossPhaseController.js';

const WAVE_ROSTER = [
    { type: 'human_genius', name: '初代天才', scale: 1.3, hpMul: 1.2 },
    { type: 'genius_beast', name: '战兽挑战者', scale: 1.4, hpMul: 1.4 },
    { type: 'shi_yi_projection', name: '玄曜投影', scale: 1.5, hpMul: 1.6 },
    { type: 'huo_linger_projection', name: '焰翎投影', scale: 1.5, hpMul: 1.7 },
    { type: 'shi_yi_phantom', name: '终局对手', scale: 1.8, hpMul: 2.2, final: true }
];

export class Node7Scene extends Node1Scene {
    constructor() {
        super('Node7Scene');
    }

    init(data) {
        super.init(data);
        this.currentWave = 0;
        this.totalWaves = WAVE_ROSTER.length;
        this.waveBoss = null;
        this.betweenWaves = false;
    }

    create() {
        super.create();
        // Tournament: no ambient director filler — waves only.
        if (this.runDirector) this.runDirector.contract = {
            ...this.runDirector.contract,
            filler: null,
            victoryMode: 'objective'
        };
        this.hudText = this.uiScene.add.text(this.width / 2, 200, '车轮战 0 / 5', {
            fontSize: '20px', fill: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.time.delayedCall(800, () => this.spawnNextWave());
        this.publishNodeTestState();
    }

    publishNodeTestState(overrides = {}) {
        super.publishNodeTestState({
            currentWave: this.currentWave || 0,
            totalWaves: this.totalWaves || 5,
            objective: 'clear_waves',
            ...overrides
        });
    }

    spawnNextWave() {
        if (this.isGameOver || this.betweenWaves) return;
        if (this.currentWave >= this.totalWaves) {
            this.campaignObjectiveComplete = true;
            return;
        }
        const spec = WAVE_ROSTER[this.currentWave];
        this.currentWave += 1;
        this.hudText?.setText(`车轮战 ${this.currentWave} / ${this.totalWaves} · ${spec.name}`);
        UIHelper.showFloatText(this.uiScene, this.width / 2, 240, `第 ${this.currentWave} 战：${spec.name}`, '#ff66ff', 2000);

        const pool = this.nodeConfig.enemyPool || [];
        const type = pool.find((id) => id.includes(spec.type.replace(/_node\d+$/, '')) || id.startsWith(spec.type))
            || this.nodeConfig.bossId
            || spec.type;

        const enemyData = { hp: 200 * spec.hpMul };
        const boss = this.createRuntimeEnemy(type, this.player.x + 260, this.player.y, {
            hp: Math.round((this.playerMaxHp || 150) * 0.9 * spec.hpMul),
            scaleMultiplier: spec.scale,
            data: { isBoss: true, role: 'boss', waveIndex: this.currentWave, final: Boolean(spec.final) }
        });
        boss.setData('isBoss', true);
        boss.setData('maxHp', boss.getData('hp'));
        this.waveBoss = boss;
        this.activeBoss = boss;
        this.bossPhaseController = new BossPhaseController(this, boss, {
            name: spec.name,
            phases: spec.final ? 3 : 2,
            moves: [
                { id: 'slam', windup: 70, active: 26, recovery: 90, radius: 130, damageMul: 1.15 },
                { id: 'charge', windup: 55, active: 40, recovery: 80, radius: 85, damageMul: 1.05 },
                { id: 'nova', windup: 90, active: 30, recovery: 100, radius: 170, damageMul: 1.3 }
            ]
        });
        this.publishNodeTestState();
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.isGameOver || this.isPaused) return;
        if (this.waveBoss && !this.waveBoss.active && !this.betweenWaves) {
            this.betweenWaves = true;
            const finished = this.currentWave >= this.totalWaves;
            AudioManager.playSfx?.('wave_clear');
            UIHelper.showFloatText(this.uiScene, this.width / 2, 240,
                finished ? '车轮战全胜！' : '波次胜利 · 休整', '#80ffea', 1500);
            this.time.delayedCall(1200, () => {
                this.betweenWaves = false;
                if (finished) {
                    this.campaignObjectiveComplete = true;
                } else {
                    // Brief recovery choice: heal or charge.
                    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + Math.floor(this.playerMaxHp * 0.2));
                    this.uiScene?.updateHp?.(this.playerHp, this.playerMaxHp);
                    this.playerActionController?.addCharge?.(40, 'wave_clear');
                    this.spawnNextWave();
                }
            });
        }
    }

    onSecondTick() {
        // Still advance timer / director resolution beat, but disable generic filler.
        super.onSecondTick();
        this.hudText?.setText(`车轮战 ${this.currentWave} / ${this.totalWaves}`);
    }

    spawnBoss() {
        // Final wave is the climax boss; director climax may call this.
        if (this.currentWave < this.totalWaves) {
            this.currentWave = this.totalWaves - 1;
            this.spawnNextWave();
            return this.waveBoss;
        }
        return this.waveBoss;
    }
}

export default Node7Scene;
