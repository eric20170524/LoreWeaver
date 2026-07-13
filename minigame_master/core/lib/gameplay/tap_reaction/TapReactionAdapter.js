import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'rhythm_timing',
    duration: 30,
    goalValue: 15,
    spawnIntervalMs: 1200,
    orbLifetimeMs: 2500,
    damageOnMiss: 10,
    difficulty: 1,
    boss: {
        hp: 100,
        weakPointRadius: 20,
        weakPointsCount: 4,
        attackIntervalMs: 2000
    }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const output = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

export default class TapReactionAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.orbs = [];
        this.bossGroup = null;
        this.bossWeakPoints = [];
        this.bossLaser = null;
        this.deflectShield = null;
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.state = {
            hp: 100,
            elapsedSeconds: 0,
            timeRemaining: DEFAULT_CONFIG.duration,
            score: 0,
            bossSpawned: false,
            bossHp: DEFAULT_CONFIG.boss.hp,
            bossMaxHp: DEFAULT_CONFIG.boss.hp,
            attackTimer: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const nodeConfig = payload.nodeConfig || {};
        const gameplayConfig = nodeConfig.gameplay || {};
        const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));
        
        // Match duration to node config if present
        this.config.duration = nodeConfig.duration || this.config.duration;
        this.config.goalValue = nodeConfig.rewards?.score || nodeConfig.goalValue || this.config.goalValue;

        this.state.hp = payload.playerStats?.hp || 100;
        this.state.timeRemaining = this.config.duration;
        this.state.bossHp = this.config.boss.hp;
        this.state.bossMaxHp = this.config.boss.hp;
        this.state.score = 0;
        this.state.bossSpawned = false;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) {
            throw new Error('TapReactionAdapter requires Phaser in adapter context.');
        }
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();

        const width = scene.scale.width;
        const height = scene.scale.height;
        this.world = { width, height };

        this.orbs = [];
        this.bossWeakPoints = [];
        this.bossGroup = scene.add.container(width / 2, height / 2);

        this.lifecycle.addCleanup(() => {
            this.orbs.forEach(orb => orb.destroy());
            this.bossWeakPoints.forEach(wp => wp.destroy());
            this.bossGroup?.destroy();
            this.bossLaser?.destroy();
            this.deflectShield?.destroy();
        });

        this.startTimers();
        this.publishTestState();
        return this;
    }

    startTimers() {
        // Spawn normal orbs timer
        this.spawnTimerEvent = this.scene.time.addEvent({
            delay: Math.max(400, this.config.spawnIntervalMs - (this.config.difficulty - 1) * 100),
            callback: this.spawnReactionOrb,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.spawnTimerEvent);

        // Game second tick
        this.lifecycle.trackTimer(this.scene.time.addEvent({
            delay: 1000,
            callback: this.onSecondTick,
            callbackScope: this,
            loop: true
        }));
    }

    update(time, delta) {
        if (!this.isRunning()) return;

        // Rotate Boss Mandala graphic if spawned
        if (this.state.bossSpawned && this.bossGroup) {
            this.bossGroup.angle += 0.5 * (this.config.difficulty || 1);
            // Update weak points position around Boss center
            this.bossWeakPoints.forEach((wp, index) => {
                if (!wp.active) return;
                const angle = (this.bossGroup.angle + index * (360 / this.config.boss.weakPointsCount)) * (Math.PI / 180);
                wp.x = this.world.width / 2 + Math.cos(angle) * 90;
                wp.y = this.world.height / 2 + Math.sin(angle) * 90;
            });
        }
        this.publishTestState();
    }

    spawnReactionOrb() {
        if (!this.isRunning() || this.state.bossSpawned) return;

        const { width, height } = this.world;
        const x = this.Phaser.Math.Between(80, width - 80);
        const y = this.Phaser.Math.Between(220, height - 260);
        const maxRadius = this.Phaser.Math.Between(30, 48);

        // Outermost warning ring
        const outerCircle = this.scene.add.circle(x, y, maxRadius, 0x10b981, 0);
        outerCircle.setStrokeStyle(2, 0x10b981, 0.4);

        // Core interactive circle
        const coreCircle = this.scene.add.circle(x, y, maxRadius, 0x10b981, 0.25);
        coreCircle.setInteractive({ useHandCursor: true });
        
        // Group them
        const orbContainer = this.scene.add.container(0, 0, [outerCircle, coreCircle]);
        this.orbs.push(orbContainer);

        // Shrinking timer visual
        const lifetime = Math.max(1000, this.config.orbLifetimeMs - (this.config.difficulty - 1) * 200);
        const shrinkTween = this.scene.tweens.add({
            targets: outerCircle,
            radius: 5,
            duration: lifetime,
            onComplete: () => {
                // If not clicked in time, deal damage (Miss Penalty)
                if (orbContainer.active) {
                    this.damagePlayer(this.config.damageOnMiss, NODE_RESULT_REASONS.HP_ZERO);
                    this.playSynthSound('damage');
                    this.triggerScreenShake(120, 0.005);
                    this.cleanOrb(orbContainer);
                }
            }
        });

        coreCircle.on('pointerdown', () => {
            if (!this.isRunning()) return;
            this.state.score += 1;
            this.playSynthSound('loot');
            this.spawnClickParticle(x, y, 0x10b981);
            this.spawnFloatingText(x, y, '+1 灵气', '#10b981');
            shrinkTween.stop();
            this.cleanOrb(orbContainer);

            // Win condition check or Boss trigger
            if (this.state.score >= this.config.goalValue) {
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            } else if (this.state.score >= Math.floor(this.config.goalValue * 0.8) && !this.state.bossSpawned) {
                this.spawnBoss();
            }
        });
    }

    cleanOrb(orb) {
        const idx = this.orbs.indexOf(orb);
        if (idx > -1) this.orbs.splice(idx, 1);
        orb.destroy();
    }

    spawnBoss() {
        this.state.bossSpawned = true;
        if (this.spawnTimerEvent) {
            this.spawnTimerEvent.destroy();
        }

        this.triggerScreenShake(300, 0.012);
        this.playSynthSound('breakthrough');
        this.playSynthSound('boss');

        // Draw Boss Core Graphics inside container
        const themeColor = this.payload.nodeConfig.gameplay?.themeColor || 0xa855f7; // Purple Boss core
        const bossCore = this.scene.add.graphics();
        bossCore.fillStyle(themeColor, 0.2);
        bossCore.fillCircle(0, 0, 70);
        bossCore.lineStyle(3, themeColor, 0.85);
        bossCore.strokeCircle(0, 0, 70);
        bossCore.lineStyle(1.5, themeColor, 0.5);
        bossCore.strokeCircle(0, 0, 50);
        this.bossGroup.add(bossCore);

        // Boss Health Bar background & foreground
        this.bossHpGraphics = this.scene.add.graphics();
        this.updateBossHpBar();

        // Spawn weak points around Boss
        const count = this.config.boss.weakPointsCount;
        for (let i = 0; i < count; i++) {
            const angle = (i * (360 / count)) * (Math.PI / 180);
            const wx = this.world.width / 2 + Math.cos(angle) * 90;
            const wy = this.world.height / 2 + Math.sin(angle) * 90;

            const wp = this.scene.add.circle(wx, wy, this.config.boss.weakPointRadius, 0xef4444, 0.75);
            wp.setStrokeStyle(2, 0xffffff, 1);
            wp.setInteractive({ useHandCursor: true });
            
            wp.on('pointerdown', () => {
                if (!this.isRunning()) return;
                this.damageBoss(15);
                this.playSynthSound('loot');
                this.spawnClickParticle(wp.x, wp.y, 0xef4444);
                this.spawnFloatingText(wp.x, wp.y, '-15 劫力', '#ef4444');
                this.triggerScreenShake(80, 0.003);
            });

            this.bossWeakPoints.push(wp);
        }

        // Start Boss attack loop
        this.bossAttackEvent = this.scene.time.addEvent({
            delay: this.config.boss.attackIntervalMs,
            callback: this.triggerBossAttack,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.bossAttackEvent);
    }

    updateBossHpBar() {
        if (!this.bossHpGraphics || !this.state.bossSpawned) return;
        this.bossHpGraphics.clear();
        
        const width = this.world.width - 160;
        const x = 80;
        const y = 180;
        
        // Draw border container
        this.bossHpGraphics.fillStyle(0x0f172a, 0.7);
        this.bossHpGraphics.fillRect(x, y, width, 12);
        this.bossHpGraphics.lineStyle(1.5, 0xef4444, 0.8);
        this.bossHpGraphics.strokeRect(x, y, width, 12);

        // Draw fill bar
        const ratio = Math.max(0, this.state.bossHp / this.state.bossMaxHp);
        this.bossHpGraphics.fillStyle(0xef4444, 0.95);
        this.bossHpGraphics.fillRect(x + 2, y + 2, (width - 4) * ratio, 8);
    }

    damageBoss(amount) {
        this.state.bossHp = Math.max(0, this.state.bossHp - amount);
        this.updateBossHpBar();

        if (this.state.bossHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        }
    }

    triggerBossAttack() {
        if (!this.isRunning()) return;

        // Spawn a deflectable laser warning or bullet
        const roll = Math.random();
        if (roll > 0.5) {
            this.triggerLaserSweepAttack();
        } else {
            this.triggerShieldDeflectAttack();
        }
    }

    triggerLaserSweepAttack() {
        const { width, height } = this.world;
        const py = this.Phaser.Math.Between(260, height - 320);

        // Laser warning line
        const warningLine = this.scene.add.graphics();
        warningLine.lineStyle(2, 0xef4444, 0.4);
        warningLine.lineBetween(12, py, width - 12, py);

        this.playSynthSound('damage'); // warning beep

        this.scene.time.delayedCall(1000, () => {
            if (!this.isRunning()) {
                warningLine.destroy();
                return;
            }
            // Fire real laser beam
            warningLine.clear();
            warningLine.lineStyle(8, 0xffffff, 1);
            warningLine.lineBetween(12, py, width - 12, py);
            this.playSynthSound('damage'); // fire sweep
            this.triggerScreenShake(200, 0.01);
            this.damagePlayer(15, NODE_RESULT_REASONS.HP_ZERO);

            // Fade out
            this.scene.tweens.add({
                targets: warningLine,
                alpha: 0,
                duration: 300,
                onComplete: () => warningLine.destroy()
            });
        });
    }

    triggerShieldDeflectAttack() {
        const { width, height } = this.world;
        const sx = this.Phaser.Math.Between(100, width - 100);
        const sy = this.Phaser.Math.Between(260, height - 320);

        // Create a fast flashing Deflect Shield orb
        const shield = this.scene.add.circle(sx, sy, 35, 0x38bdf8, 0.1);
        shield.setStrokeStyle(3, 0x38bdf8, 1);
        shield.setInteractive({ useHandCursor: true });
        this.deflectShield = shield;

        // Label indicator
        const shieldText = this.scene.add.text(sx, sy, "🛡️ 点按防御", {
            fontFamily: "Inter, sans-serif",
            fontSize: "11px",
            fontStyle: "bold",
            color: "#38bdf8"
        }).setOrigin(0.5);

        const failTimer = this.scene.time.delayedCall(1600, () => {
            if (shield.active) {
                this.damagePlayer(20, NODE_RESULT_REASONS.HP_ZERO);
                this.playSynthSound('damage');
                this.triggerScreenShake(180, 0.008);
                shield.destroy();
                shieldText.destroy();
            }
        });

        shield.on('pointerdown', () => {
            if (!this.isRunning()) return;
            this.playSynthSound('loot');
            this.spawnClickParticle(sx, sy, 0x38bdf8);
            this.spawnFloatingText(sx, sy, '拦截雷劈！', '#38bdf8');
            failTimer.destroy();
            shield.destroy();
            shieldText.destroy();
        });
    }

    damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning()) return;
        this.state.hp = Math.max(this.state.hp - amount, 0);
        if (this.state.hp <= 0) {
            this.finish(false, failReason);
        }
    }

    onSecondTick() {
        if (!this.isRunning()) return;

        this.state.elapsedSeconds += 1;
        this.state.timeRemaining = Math.max(this.config.duration - this.state.elapsedSeconds, 0);

        if (this.state.timeRemaining <= 0) {
            // If timer expires, if boss spawned but not defeated: loss. Otherwise: check score.
            if (this.state.bossSpawned) {
                this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
            } else {
                const passed = this.state.score >= this.config.goalValue;
                this.finish(passed, passed ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.TIMER_EXPIRED);
            }
        }
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();

        if (this.bossAttackEvent) this.bossAttackEvent.destroy();
        if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();

        const rewards = {};
        if (success) {
            // Apply rewards based on spec rewards multiplier
            rewards.mainCurrency = (this.payload.nodeConfig?.rewards?.score || this.config.goalValue) * 1.5;
        }

        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED),
            rewards,
            telemetry: {
                score: this.state.score,
                elapsedSeconds: this.state.elapsedSeconds,
                bossDefeated: success && this.state.bossSpawned,
                hp: this.state.hp
            }
        });

        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    isRunning() {
        return this.status === 'running' && !this.lifecycle?.transitionLocked;
    }

    // Helper functions delegating to Synth or Scene
    playSynthSound(type) {
        const synth = typeof window !== 'undefined' ? window.synth : null;
        if (synth) {
            if (type === 'loot') synth.playLoot();
            else if (type === 'damage') synth.playDamage();
            else if (type === 'breakthrough') synth.playBreakthrough();
            else if (type === 'boss') synth.playBossTheme?.();
        }
    }

    triggerScreenShake(duration, intensity) {
        this.scene.cameras.main.shake(duration, intensity);
    }

    spawnClickParticle(x, y, color) {
        // Fallback or hook into particles emitter
        if (this.context.spawnParticles) {
            this.context.spawnParticles(x, y, color);
        }
    }

    spawnFloatingText(x, y, text, color) {
        const txt = this.scene.add.text(x, y, text, {
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
            fontStyle: "bold",
            color: color
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: txt,
            y: y - 50,
            alpha: 0,
            duration: 600,
            onComplete: () => txt.destroy()
        });
    }

    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            hp: this.state.hp,
            timer: this.state.timeRemaining,
            score: this.state.score,
            lastResult: this.result
        });
    }
}
