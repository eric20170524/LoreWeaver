import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'dodge_counter_boss',
    playerHp: 100,
    bossHp: 300,
    breakGaugeMax: 100,
    durationSec: 90,
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

const DODGE_HINT = '按住拖动避开红区 · 金圈亮起时点击 Boss 或按空格反击';
const positive = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
};

export default class DodgeCounterBossAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.random = typeof context.random === 'function' ? context.random : Math.random;
        this.randomMetadata = typeof context.randomMetadata === 'function' ? context.randomMetadata : null;
        this.player = null;
        this.boss = null;
        this.telegraph = null;
        this.ui = {};
        this.state = this.initialState();
    }

    initialState() {
        return {
            playerHp: this.config.playerHp, bossHp: this.config.bossHp,
            gauge: 0, phase: 'idle', phaseLeft: this.config.attackIntervalSec,
            invuln: 0, attackZone: null, hitThisAttack: false, counterUsed: false,
            score: 0, dodges: 0, counters: 0, elapsedSeconds: 0,
            timeRemaining: this.config.durationSec
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        const playability = this.readPlayabilityKnobs(payload, DEFAULT_CONFIG.id);
        this.config = { ...DEFAULT_CONFIG, ...(payload.nodeConfig?.gameplay || {}), ...knobs };
        for (const key of Object.keys(DEFAULT_CONFIG)) {
            if (typeof DEFAULT_CONFIG[key] === 'number') {
                this.config[key] = positive(this.config[key], DEFAULT_CONFIG[key]);
            }
        }
        this.config.durationSec = positive(playability.durationSec, DEFAULT_CONFIG.durationSec);
        this.state = this.initialState();
        this.result = null;
        return this;
    }

    semanticActions() {
        return [...new Set([...super.semanticActions(), 'move', 'primary'])];
    }

    movePlayer(x, y) {
        if (!this.player || !this.scene) throw new Error('semantic_move_surface_unavailable');
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('semantic_move_requires_finite_x_y');
        // Paused semantic positioning remains available for the exact-frame probe.
        if (this.status === 'ended' || this.status === 'destroyed' || this.lifecycle?.transitionLocked) return false;
        const { width, height } = this.scene.scale;
        this.player.x = Math.max(20, Math.min(width - 20, x));
        this.player.y = Math.max(height * 0.52, Math.min(height - 110, y));
        return true;
    }

    handleSemanticInput(payload = {}) {
        const action = String(payload?.action || '').trim();
        if (action === 'move') {
            const accepted = this.movePlayer(Number(payload.x), Number(payload.y));
            const result = { action, accepted, x: this.player?.x, y: this.player?.y };
            this.updateObservationState({ semanticAction: result });
            return result;
        }
        if (action === 'primary') return this.primaryAction();
        return super.handleSemanticInput(payload);
    }

    primaryAction() {
        const snapshot = () => ({
            phase: this.state.phase, bossHp: this.state.bossHp,
            gauge: this.state.gauge, counters: this.state.counters
        });
        const before = snapshot();
        const accepted = this.tryCounter();
        return { action: 'primary', accepted, before, after: snapshot() };
    }

    create(scene) {
        super.create(scene);
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;
        // The host owns y=32/100/140 and the bottom 42px. Keep adapter UI clear.
        this.ui.title = scene.add.text(width / 2, 188, '闪避 → 反击 → 破势', {
            fontFamily: 'Inter, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 218, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 72, DODGE_HINT, {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#94a3b8',
            align: 'center', wordWrap: { width: width - 48 }
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();
        this.boss = scene.add.circle(width / 2, Math.max(292, height * 0.40), 40, 0xef4444, 1)
            .setInteractive({ useHandCursor: true });
        this.player = scene.add.circle(width / 2, height * 0.72, 18, 0x66fcf1, 1);
        this.telegraph = scene.add.circle(0, 0, 50, 0xef4444, 0).setStrokeStyle(3, 0xfbbf24, 0);

        this.lifecycle.trackListener(this.boss, 'pointerdown', () => this.tryCounter());
        const move = (pointer) => {
            if (!this.isRunning() || !pointer.isDown || pointer.y < height * 0.52 || pointer.y > height - 110) return;
            this.movePlayer(Number(pointer.x), Number(pointer.y));
        };
        this.lifecycle.trackListener(scene.input, 'pointerdown', move);
        this.lifecycle.trackListener(scene.input, 'pointermove', move);
        this.lifecycle.trackListener(scene.input.keyboard, 'keydown-SPACE', (event) => {
            if (!this.isRunning() || event?.repeat) return;
            event?.preventDefault?.();
            this.tryCounter();
        });
        this.lifecycle.trackListener(scene.events, 'shutdown', () => this.destroy());
        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((object) => object?.destroy?.());
            this.boss?.destroy();
            this.player?.destroy();
            this.telegraph?.destroy();
            this.ui = {};
            this.boss = this.player = this.telegraph = null;
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    beginAttack() {
        if (!this.isRunning()) return;
        const { width, height } = this.scene.scale;
        // Preserve three seeded RNG draws per attack for replay compatibility.
        const zone = {
            x: 60 + this.random() * (width - 120),
            y: height * 0.55 + this.random() * (height * 0.25),
            r: 48 + this.random() * 24
        };
        this.state.attackZone = zone;
        this.state.hitThisAttack = false;
        this.state.counterUsed = false;
        this.state.phase = 'warning';
        this.state.phaseLeft = this.config.warningSec;
        this.telegraph.setPosition(zone.x, zone.y);
        this.telegraph.setRadius(zone.r);
        this.telegraph.setStrokeStyle(3, 0xfbbf24, 0.9);
        this.telegraph.setFillStyle(0xfbbf24, 0.15);
        this.telegraph.setAlpha(1);
    }

    tryCounter() {
        if (!this.isRunning() || this.state.phase !== 'counter' || this.state.counterUsed) return false;
        // Reserve before callbacks: each opening accepts exactly one counter.
        this.state.counterUsed = true;
        this.state.counters += 1;
        this.state.gauge = Math.min(this.config.breakGaugeMax, this.state.gauge + this.config.counterGaugeGain);
        this.state.bossHp = Math.max(0, this.state.bossHp - this.config.counterDamage);
        // Host uses score >= goalValue to end a node. Report actual break progress,
        // not an unrelated 20-point reward which used to win before full gauge.
        this.state.score = this.state.gauge;
        this.context.spawnParticles?.(this.boss.x, this.boss.y, 0xfbbf24);
        this.scene.cameras.main.shake(80, 0.006);
        if (this.state.gauge >= this.config.breakGaugeMax || this.state.bossHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
            return true; // finish destroys UI; never refresh it afterwards.
        }
        this.boss.setFillStyle(0xfafafa, 1);
        this.boss.setStrokeStyle(0);
        this.ui.hint?.setText('反击成功 · 等待下一次预警');
        this.lifecycle.trackTimer(this.scene.time.delayedCall(80, () => {
            if (this.isRunning() && this.boss?.active) this.boss.setFillStyle(0xef4444, 1);
        }));
        this.refreshHud();
        this.publishTestState();
        return true;
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta < 0) return;
        const dt = delta / 1000;
        this.state.elapsedSeconds += dt;
        this.state.timeRemaining = Math.max(0, this.config.durationSec - this.state.elapsedSeconds);
        if (this.state.timeRemaining <= 0) {
            this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
            return;
        }
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
            const zone = this.state.attackZone;
            if (zone && !this.state.hitThisAttack && this.state.invuln <= 0) {
                if (Math.hypot(this.player.x - zone.x, this.player.y - zone.y) <= zone.r + 18) {
                    this.state.hitThisAttack = true;
                    this.state.playerHp = Math.max(0, this.state.playerHp - this.config.attackDamage);
                    this.state.invuln = this.config.dodgeIFrameSec;
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
                this.boss.setStrokeStyle(4, 0xfbbf24, 1);
                this.ui.hint?.setText('反击窗口！点击 Boss 或按空格').setColor('#fbbf24');
            }
        } else if (this.state.phase === 'counter' && this.state.phaseLeft <= 0) {
            this.state.phase = 'idle';
            this.state.phaseLeft = this.config.attackIntervalSec;
            this.boss.setStrokeStyle(0);
            this.ui.hint?.setText(DODGE_HINT).setColor('#94a3b8');
        }
        this.refreshHud();
        this.publishTestState();
    }

    refreshHud() {
        if (!this.isRunning()) return;
        const { width } = this.scene.scale;
        const graphics = this.ui.bar;
        if (graphics?.active) {
            graphics.clear();
            graphics.fillStyle(0x1e293b, 0.9);
            graphics.fillRoundedRect(width * 0.2, 244, width * 0.6, 10, 5);
            graphics.fillStyle(0xfbbf24, 1);
            graphics.fillRoundedRect(width * 0.2, 244, width * 0.6 * this.state.gauge / this.config.breakGaugeMax, 10, 5);
        }
        this.ui.status?.setText(
            `HP ${Math.ceil(this.state.playerHp)} · Boss ${Math.ceil(this.state.bossHp)} · 破势 ${Math.floor(this.state.gauge)} · ${Math.ceil(this.state.timeRemaining)}s`
        );
    }

    getTestState() {
        return {
            ...super.getTestState(), adapterId: this.config.id,
            hp: this.state.playerHp, score: this.state.score,
            goalValue: this.config.breakGaugeMax, timer: this.state.timeRemaining,
            bossHp: this.state.bossHp, gauge: this.state.gauge,
            phase: this.state.phase, phaseLeft: this.state.phaseLeft,
            invuln: this.state.invuln, counterUsed: this.state.counterUsed,
            attackZone: this.state.attackZone ? { ...this.state.attackZone } : null,
            dodges: this.state.dodges, counters: this.state.counters,
            playerPosition: this.player ? { x: this.player.x, y: this.player.y } : null,
            determinism: this.randomMetadata ? { random: this.randomMetadata() } : null
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
                gauge: this.state.gauge, counters: this.state.counters, dodges: this.state.dodges,
                bossHp: this.state.bossHp, playerHp: this.state.playerHp,
                elapsedSeconds: this.state.elapsedSeconds, timeRemaining: this.state.timeRemaining
            }
        });
        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.publishTestState();
        this.context.onEnd?.(result, this);
        return result;
    }

    retreat() { return this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    pause() { super.pause(); this.lifecycle?.pause(); }
    resume() { super.resume(); this.lifecycle?.resume(); }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
    publishTestState() { this.context.testHooks?.update(this.getTestState()); }
}

export { DEFAULT_CONFIG as DODGE_COUNTER_BOSS_DEFAULT_CONFIG };
