import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'dodge_counter_boss',
    playerHp: 100,
    bossHp: 300,
    breakGaugeMax: 100,
    attackIntervalSec: 2.2,
    warningSec: 0.7,
    activeSec: 0.45,
    attackDamage: 18,
    counterWindowSec: 0.55,
    counterGaugeGain: 18,
    counterDamage: 35,
    dodgeIFrameSec: 0.35,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class DodgeCounterBossAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.player = null;
        this.boss = null;
        this.telegraph = null;
        this.ui = {};
        this.state = {
            playerHp: 100,
            bossHp: 300,
            gauge: 0,
            phase: 'idle', // idle | warning | active | counter
            phaseLeft: 0,
            invuln: 0,
            attackZone: null,
            score: 0,
            dodges: 0,
            counters: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.state.playerHp = Number(knobs.playerHp ?? this.config.playerHp ?? payload.playerStats?.hp ?? 100);
        this.state.bossHp = Number(knobs.bossHp ?? this.config.bossHp ?? 300);
        this.state.gauge = 0;
        this.state.phase = 'idle';
        this.state.phaseLeft = Number(this.config.attackIntervalSec || 2.2);
        this.state.invuln = 0;
        this.state.score = 0;
        this.state.dodges = 0;
        this.state.counters = 0;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('DodgeCounterBossAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 36, '闪避反击', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 40, '拖动闪避红区 · 反击窗点 Boss 积攒破势', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        this.boss = scene.add.circle(width / 2, height * 0.32, 40, 0xef4444, 1)
            .setInteractive({ useHandCursor: true });
        this.player = scene.add.circle(width / 2, height * 0.72, 18, 0x66fcf1, 1);
        this.telegraph = scene.add.circle(0, 0, 50, 0xef4444, 0).setStrokeStyle(3, 0xfbbf24, 0);

        this.boss.on('pointerdown', () => this.tryCounter());
        scene.input.on('pointermove', (p) => {
            if (!this.isRunning()) return;
            if (p.isDown || true) {
                // smooth follow pointer for mobile-friendly dodge
                this.player.x += (p.x - this.player.x) * 0.2;
                this.player.y += (p.y - this.player.y) * 0.2;
                this.player.x = Math.max(20, Math.min(width - 20, this.player.x));
                this.player.y = Math.max(height * 0.45, Math.min(height - 60, this.player.y));
            }
        });

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.boss?.destroy();
            this.player?.destroy();
            this.telegraph?.destroy();
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    beginAttack() {
        const { width, height } = this.scene.scale;
        // pick attack zone near player or random
        const zone = {
            x: 60 + Math.random() * (width - 120),
            y: height * 0.55 + Math.random() * (height * 0.25),
            r: 48 + Math.random() * 24
        };
        this.state.attackZone = zone;
        this.state.hitThisAttack = false;
        this.state.phase = 'warning';
        this.state.phaseLeft = this.config.warningSec;
        this.telegraph.setPosition(zone.x, zone.y);
        this.telegraph.setRadius(zone.r);
        this.telegraph.setStrokeStyle(3, 0xfbbf24, 0.9);
        this.telegraph.setFillStyle(0xfbbf24, 0.15);
        this.telegraph.setAlpha(1);
    }

    tryCounter() {
        if (!this.isRunning()) return;
        if (this.state.phase !== 'counter') return;
        this.state.counters += 1;
        this.state.gauge = Math.min(this.config.breakGaugeMax, this.state.gauge + this.config.counterGaugeGain);
        this.state.bossHp = Math.max(0, this.state.bossHp - this.config.counterDamage);
        this.state.score += 20;
        this.context.spawnParticles?.(this.boss.x, this.boss.y, 0xfbbf24);
        this.scene.cameras.main.shake(80, 0.006);
        this.boss.setFillStyle(0xfafafa, 1);
        this.lifecycle.trackTimer(this.scene.time.delayedCall(80, () => this.boss?.setFillStyle(0xef4444, 1)));

        if (this.state.gauge >= this.config.breakGaugeMax || this.state.bossHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        }
        this.refreshHud();
        this.publishTestState();
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = delta / 1000;
        this.state.invuln = Math.max(0, this.state.invuln - dt);
        this.state.phaseLeft -= dt;

        if (this.state.phase === 'idle') {
            if (this.state.phaseLeft <= 0) this.beginAttack();
        } else if (this.state.phase === 'warning') {
            this.telegraph.setAlpha(0.5 + Math.sin(this.scene.time.now / 50) * 0.3);
            if (this.state.phaseLeft <= 0) {
                this.state.phase = 'active';
                this.state.phaseLeft = this.config.activeSec;
                this.telegraph.setFillStyle(0xef4444, 0.45);
                this.telegraph.setStrokeStyle(3, 0xef4444, 1);
            }
        } else if (this.state.phase === 'active') {
            const z = this.state.attackZone;
            if (z && this.state.invuln <= 0) {
                const d = Math.hypot(this.player.x - z.x, this.player.y - z.y);
                if (d <= z.r + 16) {
                    this.state.playerHp = Math.max(0, this.state.playerHp - this.config.attackDamage);
                    this.state.invuln = this.config.dodgeIFrameSec;
                    this.state.hitThisAttack = true;
                    this.scene.cameras.main.shake(120, 0.012);
                    if (this.state.playerHp <= 0) {
                        this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
                        return;
                    }
                }
            }
            if (this.state.phaseLeft <= 0) {
                if (!this.state.hitThisAttack) this.state.dodges += 1;
                this.state.phase = 'counter';
                this.state.phaseLeft = this.config.counterWindowSec;
                this.telegraph.setAlpha(0);
                this.boss.setStrokeStyle?.(4, 0xfbbf24, 1);
                this.ui.hint?.setText('反击窗口！点击 Boss').setColor('#fbbf24');
            }
        } else if (this.state.phase === 'counter') {
            if (this.state.phaseLeft <= 0) {
                this.state.phase = 'idle';
                this.state.phaseLeft = this.config.attackIntervalSec;
                this.boss.setStrokeStyle?.(0);
                this.ui.hint?.setText('拖动闪避红区 · 反击窗点 Boss 积攒破势').setColor('#64748b');
            }
        }

        this.refreshHud();
        this.publishTestState();
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (g) {
            const ratio = this.state.gauge / this.config.breakGaugeMax;
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.2, 96, width * 0.6, 10, 5);
            g.fillStyle(0xfbbf24, 1);
            g.fillRoundedRect(width * 0.2, 96, width * 0.6 * ratio, 10, 5);
        }
        this.ui.status?.setText(
            `HP ${Math.ceil(this.state.playerHp)}  ·  Boss ${Math.ceil(this.state.bossHp)}  ·  破势 ${Math.floor(this.state.gauge)}  ·  ${this.state.phase}`
        );
    }

    getTestState() {
        return {
            adapter: 'DodgeCounterBossAdapter',
            status: this.status,
            hp: this.state.playerHp,
            score: this.state.score,
            bossHp: this.state.bossHp,
            gauge: this.state.gauge,
            phase: this.state.phase,
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.BOSS_DEFEATED : NODE_RESULT_REASONS.HP_ZERO),
            rewards: success ? { ...(this.config.rewardTable || {}), score: 1 } : {},
            telemetry: {
                gauge: this.state.gauge,
                counters: this.state.counters,
                dodges: this.state.dodges,
                bossHp: this.state.bossHp,
                playerHp: this.state.playerHp
            }
        });
        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    retreat() { return this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.cleanup(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status,
            hp: this.state.playerHp, gauge: this.state.gauge, phase: this.state.phase, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as DODGE_COUNTER_BOSS_DEFAULT_CONFIG };
