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
    /** When true, pure timing loop (no boss phase) — preferred for gate demos */
    skipBoss: false,
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
        // Map Gameplay Card knob aliases → adapter config
        const aliasPatch = {};
        if (knobs.beatIntervalMs != null) aliasPatch.spawnIntervalMs = knobs.beatIntervalMs;
        if (knobs.targetProgress != null) aliasPatch.goalValue = knobs.targetProgress;
        if (knobs.durationSec != null) aliasPatch.duration = knobs.durationSec;
        if (knobs.goodWindowMs != null && knobs.orbLifetimeMs == null) {
            // Good window ~ orb lifetime heuristic for demo
            aliasPatch.orbLifetimeMs = Math.max(800, knobs.goodWindowMs * 10);
        }
        this.config = mergeConfig(
            DEFAULT_CONFIG,
            mergeConfig(gameplayConfig, mergeConfig(knobs, aliasPatch))
        );

        // Match duration / goal to node config if present
        this.config.duration =
            knobs.durationSec || nodeConfig.duration || nodeConfig.durationLimit || this.config.duration;
        this.config.goalValue =
            knobs.targetProgress ||
            knobs.goalValue ||
            nodeConfig.goalValue ||
            nodeConfig.rewards?.score ||
            this.config.goalValue;
        this.config.skipBoss = Boolean(
            knobs.skipBoss ?? gameplayConfig.skipBoss ?? this.config.skipBoss
        );

        this.themePack =
            nodeConfig.themeContentPack ||
            knobs.themeContentPack ||
            payload.themeContentPack ||
            null;
        this.themeLocale =
            knobs.locale ||
            nodeConfig.locale ||
            this.themePack?.defaultLocale ||
            'zh-CN';

        this.state.hp = payload.playerStats?.hp || 100;
        this.state.timeRemaining = this.config.duration;
        this.state.bossHp = this.config.boss.hp;
        this.state.bossMaxHp = this.config.boss.hp;
        this.state.score = 0;
        this.state.bossSpawned = false;
        this.readPlayabilityKnobs(payload, 'rhythm_timing');
        return this;
    }

    /** Resolve themed copy with generic fallbacks (no hardcoded IP). */
    t(key, fallback) {
        const pack = this.themePack;
        if (!pack) return fallback;
        const locale = this.themeLocale || pack.defaultLocale || 'zh-CN';
        const fb = pack.defaultLocale || 'zh-CN';
        if (pack.copyKeys?.[key]) {
            const v = pack.copyKeys[key];
            if (typeof v === 'object') return v[locale] || v[fb] || Object.values(v)[0] || fallback;
            if (typeof v === 'string') return v;
        }
        if (key === 'entity.boss' && pack.entities?.bosses?.boss) {
            const v = pack.entities.bosses.boss;
            return v[locale] || v[fb] || Object.values(v)[0] || fallback;
        }
        return fallback;
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
            this.orbs.forEach(orb => orb?.destroy?.());
            this.bossWeakPoints.forEach(wp => {
                wp.labelObj?.destroy?.();
                wp.destroy?.();
            });
            this.bossGroup?.destroy?.();
            this.bossLaser?.destroy?.();
            this.deflectShield?.destroy?.();
            if (this.activeLaserWarning) {
                this.activeLaserWarning.warningLine?.destroy?.();
                this.activeLaserWarning.warningText?.destroy?.();
            }
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
            const count = this.config.boss.weakPointsCount || 4;
            this.bossWeakPoints.forEach((wp, index) => {
                if (!wp || !wp.active) return;
                const angle = (this.bossGroup.angle + index * (360 / count)) * (Math.PI / 180);
                const wx = this.world.width / 2 + Math.cos(angle) * 90;
                const wy = this.world.height / 2 + Math.sin(angle) * 90;
                wp.x = wx;
                wp.y = wy;
                if (wp.labelObj && wp.labelObj.active) {
                    wp.labelObj.x = wx;
                    wp.labelObj.y = wy;
                }
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
            const gain = Math.floor(Math.random() * 5) + 1;
            this.state.score += gain;
            this.playSynthSound('loot');
            this.spawnClickParticle(x, y, 0x10b981);
            this.spawnFloatingText(x, y, `+${gain}`, '#10b981');
            shrinkTween.stop();
            this.cleanOrb(orbContainer);

            // Win condition check or Boss trigger
            if (this.state.score >= this.config.goalValue) {
                this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
            } else if (
                !this.config.skipBoss &&
                this.state.score >= Math.floor(this.config.goalValue * 0.8) &&
                !this.state.bossSpawned
            ) {
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

        // Destroy remaining orbs
        this.orbs.forEach(orb => orb?.destroy?.());
        this.orbs = [];

        // Instruction overlay banner
        this.spawnBossInstructionBanner();

        // Draw Boss Core Graphics inside container
        const themeColor = this.payload.nodeConfig.gameplay?.themeColor || 0xa855f7; // Purple Boss core
        const bossCore = this.scene.add.graphics();
        bossCore.fillStyle(themeColor, 0.25);
        bossCore.fillCircle(0, 0, 75);
        bossCore.lineStyle(3, themeColor, 0.85);
        bossCore.strokeCircle(0, 0, 75);
        bossCore.lineStyle(1.5, themeColor, 0.5);
        bossCore.strokeCircle(0, 0, 52);
        this.bossGroup.add(bossCore);

        const bossLabel = this.t('entity.boss', 'Boss');
        const bossText = this.scene.add.text(0, 0, bossLabel, {
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
            fontStyle: "bold",
            color: "#e9d5ff"
        }).setOrigin(0.5);
        this.bossGroup.add(bossText);

        // Boss Health Bar background & foreground
        this.bossHpGraphics = this.scene.add.graphics().setDepth(150);
        this.updateBossHpBar();

        // Spawn weak points around Boss
        const count = this.config.boss.weakPointsCount || 4;
        for (let i = 0; i < count; i++) {
            const angle = (i * (360 / count)) * (Math.PI / 180);
            const wx = this.world.width / 2 + Math.cos(angle) * 90;
            const wy = this.world.height / 2 + Math.sin(angle) * 90;

            const wp = this.scene.add.circle(wx, wy, this.config.boss.weakPointRadius || 22, 0xef4444, 0.85);
            wp.setStrokeStyle(3, 0xffffff, 1);
            wp.setDepth(100);
            wp.setInteractive({ useHandCursor: true });

            const wpLabel = this.t('weak_point', 'Break');
            const wpText = this.scene.add.text(wx, wy, `🎯 ${wpLabel}`, {
                fontFamily: "Inter, sans-serif",
                fontSize: "11px",
                fontStyle: "bold",
                color: "#ffffff"
            }).setOrigin(0.5).setDepth(101);
            wp.labelObj = wpText;
            
            wp.on('pointerdown', () => {
                if (!this.isRunning()) return;
                this.damageBoss(20);
                this.playSynthSound('loot');
                this.spawnClickParticle(wp.x, wp.y, 0xef4444);
                this.spawnFloatingText(wp.x, wp.y, '-20', '#ef4444');
                this.triggerScreenShake(80, 0.003);

                // Interrupt active laser warning if hit
                if (this.activeLaserWarning) {
                    this.interruptLaserSweep();
                }
            });

            this.bossWeakPoints.push(wp);
        }

        // Start Boss timer attack loop
        this.bossTimer = this.scene.time.addEvent({
            delay: 3500,
            callback: () => this.triggerBossAttack(),
            loop: true
        });
        this.lifecycle.trackTimer(this.bossTimer);
    }

    spawnBossInstructionBanner() {
        const { width, height } = this.world;
        const bannerBg = this.scene.add.graphics().setDepth(200);
        bannerBg.fillStyle(0x0f172a, 0.92);
        bannerBg.fillRect(20, height / 2 - 220, width - 40, 56);
        bannerBg.lineStyle(2, 0xa855f7, 0.9);
        bannerBg.strokeRect(20, height / 2 - 220, width - 40, 56);

        const bannerCopy = this.t(
            'boss_banner',
            'Boss phase! Break weak points, tap shields to counter!'
        );
        const bannerText = this.scene.add.text(
            width / 2, height / 2 - 192,
            `⚡ ${bannerCopy}`,
            {
                fontFamily: "Inter, sans-serif",
                fontSize: "13px",
                fontStyle: "bold",
                color: "#fbbf24",
                align: "center",
                wordWrap: { width: width - 60 }
            }
        ).setOrigin(0.5).setDepth(201);

        this.scene.tweens.add({
            targets: [bannerBg, bannerText],
            alpha: 0,
            delay: 4500,
            duration: 800,
            onComplete: () => {
                bannerBg.destroy();
                bannerText.destroy();
            }
        });
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
        const warningLine = this.scene.add.graphics().setDepth(150);
        warningLine.lineStyle(4, 0xef4444, 0.7);
        warningLine.lineBetween(12, py, width - 12, py);

        const warningText = this.scene.add.text(width / 2, py - 18, `⚡ ${this.t('laser_charge', 'Charging!')}`, {
            fontFamily: "Inter, sans-serif",
            fontSize: "13px",
            fontStyle: "bold",
            color: "#ef4444",
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            padding: { x: 8, y: 4 }
        }).setOrigin(0.5).setDepth(151);

        this.playSynthSound('damage'); // warning beep

        const warningTimer = this.scene.time.delayedCall(1500, () => {
            if (!this.isRunning() || !warningLine.active) {
                warningLine.destroy();
                warningText.destroy();
                return;
            }
            // Fire real laser beam
            warningLine.clear();
            warningLine.lineStyle(10, 0xffffff, 1);
            warningLine.lineBetween(12, py, width - 12, py);
            warningText.setText(`⚡ ${this.t('laser_fire', 'Beam fire!')}`);
            this.playSynthSound('damage'); // fire sweep
            this.triggerScreenShake(200, 0.01);
            this.damagePlayer(12, NODE_RESULT_REASONS.HP_ZERO);

            // Fade out
            this.scene.tweens.add({
                targets: [warningLine, warningText],
                alpha: 0,
                duration: 400,
                onComplete: () => {
                    warningLine.destroy();
                    warningText.destroy();
                }
            });
            this.activeLaserWarning = null;
        });

        this.activeLaserWarning = {
            warningLine,
            warningText,
            warningTimer
        };
    }

    interruptLaserSweep() {
        if (!this.activeLaserWarning) return;
        const { warningLine, warningText, warningTimer } = this.activeLaserWarning;
        this.activeLaserWarning = null;

        try { warningTimer?.destroy?.(); } catch (_) {}
        if (warningLine?.active) warningLine.destroy();
        if (warningText?.active) {
            warningText.setText(`💥 ${this.t('interrupt_ok', 'Interrupted!')}`);
            warningText.setStyle({ color: "#10b981" });
            this.scene.tweens.add({
                targets: warningText,
                y: warningText.y - 30,
                alpha: 0,
                duration: 800,
                onComplete: () => warningText.destroy()
            });
        }
        this.spawnFloatingText(
            this.world.width / 2,
            this.world.height / 2 - 120,
            `💥 ${this.t('interrupt_ok', 'Interrupted!')}`,
            "#10b981"
        );
    }

    triggerShieldDeflectAttack() {
        const { width, height } = this.world;
        const sx = this.Phaser.Math.Between(100, width - 100);
        const sy = this.Phaser.Math.Between(260, height - 320);

        // Create a fast flashing Deflect Shield orb
        const shield = this.scene.add.circle(sx, sy, 38, 0x38bdf8, 0.25).setDepth(180);
        shield.setStrokeStyle(4, 0x38bdf8, 1);
        shield.setInteractive({ useHandCursor: true });
        this.deflectShield = shield;

        // Label indicator
        const shieldText = this.scene.add.text(sx, sy, `🛡️ ${this.t('defend', 'Defend')}`, {
            fontFamily: "Inter, sans-serif",
            fontSize: "13px",
            fontStyle: "bold",
            color: "#ffffff",
            backgroundColor: "rgba(14, 165, 233, 0.8)",
            padding: { x: 6, y: 3 }
        }).setOrigin(0.5).setDepth(181);

        const failTimer = this.scene.time.delayedCall(1800, () => {
            if (shield.active) {
                this.damagePlayer(15, NODE_RESULT_REASONS.HP_ZERO);
                this.playSynthSound('damage');
                this.triggerScreenShake(180, 0.008);
                shield.destroy();
                shieldText.destroy();
            }
        });

        shield.on('pointerdown', () => {
            if (!this.isRunning()) return;
            this.playSynthSound('loot');
            this.damageBoss(10); // Counter damage!
            this.spawnClickParticle(sx, sy, 0x38bdf8);
            this.spawnFloatingText(
                sx,
                sy,
                `🛡️ ${this.t('defend_ok', 'Deflected!')} -10`,
                '#38bdf8'
            );
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

    getTestState() {
        return {
            ...super.getTestState(),
            score: this.state.score,
            hp: this.state.hp,
            timer: this.state.timeRemaining,
            bossSpawned: this.state.bossSpawned,
            bossHp: this.state.bossHp
        };
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
