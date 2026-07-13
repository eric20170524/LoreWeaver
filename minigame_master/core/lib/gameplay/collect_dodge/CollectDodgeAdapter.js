import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'drag_collect_grid',
    duration: 30,
    goalValue: 15,
    spawnIntervalMs: 800,
    itemSpeed: 250,
    hazardRate: 0.45,
    damageOnHit: 15,
    difficulty: 1,
    boss: {
        hp: 100,
        speed: 150,
        attackIntervalMs: 2500
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

export default class CollectDodgeAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.groups = {};
        this.player = null;
        this.boss = null;
        this.bossHpGraphics = null;
        this.bossDirection = 1;
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.state = {
            hp: 100,
            elapsedSeconds: 0,
            timeRemaining: DEFAULT_CONFIG.duration,
            score: 0,
            bossSpawned: false,
            bossHp: DEFAULT_CONFIG.boss.hp,
            bossMaxHp: DEFAULT_CONFIG.boss.hp
        };
    }

    init(payload = {}) {
        super.init(payload);
        const nodeConfig = payload.nodeConfig || {};
        const gameplayConfig = nodeConfig.gameplay || {};
        const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));

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
            throw new Error('CollectDodgeAdapter requires Phaser in adapter context.');
        }
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();

        const width = scene.scale.width;
        const height = scene.scale.height;
        this.world = { width, height };

        // Create player avatar (Capsule shape)
        const themeColor = this.payload.nodeConfig.gameplay?.themeColor || 0x10b981;
        this.player = scene.add.circle(width / 2, height - 130, 24, themeColor);
        this.player.setStrokeStyle(2.5, 0xffffff, 1);
        scene.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);

        // Groups
        this.groups.gems = scene.physics.add.group();
        this.groups.hazards = scene.physics.add.group();
        this.groups.swords = scene.physics.add.group(); // fly upwards to shoot boss
        this.groups.drops = scene.physics.add.group();  // fly down to collect sword weapon

        this.lifecycle.addCleanup(() => {
            Object.values(this.groups).forEach(group => group?.clear(true, true));
            this.player?.destroy();
            this.boss?.destroy();
            this.bossHpGraphics?.destroy();
        });

        this.bindInput();
        this.bindCollisions();
        this.startTimers();
        this.publishTestState();
        return this;
    }

    bindInput() {
        // Drag horizontally
        this.lifecycle.trackListener(this.scene.input, 'pointermove', (pointer) => {
            if (!this.isRunning()) return;
            const targetX = this.Phaser.Math.Clamp(pointer.x, 32, this.world.width - 32);
            this.player.x = targetX;
        });
    }

    bindCollisions() {
        const { physics } = this.scene;
        physics.add.overlap(this.player, this.groups.gems, this.handleCollectGem, null, this);
        physics.add.overlap(this.player, this.groups.hazards, this.handleHitHazard, null, this);
        physics.add.overlap(this.player, this.groups.drops, this.handleCollectSwordDrop, null, this);
        
        // bullets hit boss overlap is handled directly in update check or physics overlap
    }

    startTimers() {
        // Spawn falling items
        this.spawnTimerEvent = this.scene.time.addEvent({
            delay: Math.max(300, this.config.spawnIntervalMs - (this.config.difficulty - 1) * 60),
            callback: this.spawnFallingItem,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.spawnTimerEvent);

        // Second tick
        this.lifecycle.trackTimer(this.scene.time.addEvent({
            delay: 1000,
            callback: this.onSecondTick,
            callbackScope: this,
            loop: true
        }));
    }

    update(time, delta) {
        if (!this.isRunning()) return;

        // Boss movement & target collision overlap checks
        if (this.state.bossSpawned && this.boss && this.boss.active) {
            // Horizontal ping pong movement
            this.boss.x += this.bossDirection * (this.config.boss.speed || 150) * (delta / 1000);
            if (this.boss.x >= this.world.width - 60) {
                this.boss.x = this.world.width - 60;
                this.bossDirection = -1;
            } else if (this.boss.x <= 60) {
                this.boss.x = 60;
                this.bossDirection = 1;
            }

            // Update Boss HP Bar position
            this.updateBossHpBar();

            // Collision overlap between flying swords and Boss
            this.groups.swords.getChildren().forEach(sword => {
                if (sword.active && this.Phaser.Math.Distance.Between(sword.x, sword.y, this.boss.x, this.boss.y) < 54) {
                    sword.destroy();
                    this.damageBoss(10);
                    this.playSynthSound('loot');
                    this.spawnParticles(this.boss.x, this.boss.y, 0xef4444);
                    this.spawnFloatingText(this.boss.x, this.boss.y, '-10 劫力', '#ef4444');
                    this.triggerScreenShake(80, 0.003);
                }
            });
        }

        // Auto destroy off-screen items
        this.cleanupOffscreenItems();
        this.publishTestState();
    }

    spawnFallingItem() {
        if (!this.isRunning()) return;

        // If boss spawned, drop sword weapon drops instead of normal items
        if (this.state.bossSpawned) {
            if (Math.random() < 0.4) {
                this.spawnSwordDrop();
            }
            return;
        }

        const { width } = this.world;
        const x = this.Phaser.Math.Between(40, width - 40);
        const y = 160;
        const isHazard = Math.random() < this.config.hazardRate;
        const speed = this.config.itemSpeed + (this.config.difficulty - 1) * 25;

        if (isHazard) {
            // Red warning Triangle hazard
            const hazard = this.scene.add.graphics();
            hazard.fillStyle(0xef4444, 0.95);
            hazard.fillTriangle(0, -12, -10, 8, 10, 8);
            hazard.lineStyle(1.5, 0xffffff, 0.8);
            hazard.strokeTriangle(0, -12, -10, 8, 10, 8);
            hazard.setPosition(x, y);

            this.scene.physics.add.existing(hazard);
            hazard.body.setVelocityY(speed);
            this.groups.hazards.add(hazard);
        } else {
            // Emerald Gem circle
            const gem = this.scene.add.circle(x, y, 10, 0x10b981, 0.95);
            gem.setStrokeStyle(1.5, 0xffffff, 1);

            this.scene.physics.add.existing(gem);
            gem.body.setVelocityY(speed);
            this.groups.gems.add(gem);
        }
    }

    spawnSwordDrop() {
        const { width } = this.world;
        const x = this.Phaser.Math.Between(40, width - 40);
        const y = 160;
        const speed = this.config.itemSpeed * 0.9;

        // Golden Sword drop container item
        const drop = this.scene.add.circle(x, y, 12, 0xf59e0b, 0.85);
        drop.setStrokeStyle(2, 0xffffff, 1);

        const dropIcon = this.scene.add.text(x, y, '🗡️', { fontSize: '11px' }).setOrigin(0.5);

        this.scene.physics.add.existing(drop);
        drop.body.setVelocityY(speed);
        this.groups.drops.add(drop);

        // Bind update movement to carry label with it
        this.scene.tweens.add({
            targets: dropIcon,
            y: this.world.height + 50,
            duration: (this.world.height - 100) / (speed / 1000),
            onUpdate: () => {
                if (drop.active) {
                    dropIcon.x = drop.x;
                    dropIcon.y = drop.y;
                } else {
                    dropIcon.destroy();
                }
            },
            onComplete: () => dropIcon.destroy()
        });
    }

    handleCollectGem(_player, gem) {
        if (!gem.active) return;
        this.state.score += 1;
        this.playSynthSound('loot');
        this.spawnParticles(gem.x, gem.y, 0x10b981);
        this.spawnFloatingText(gem.x, gem.y, '+1 灵气', '#10b981');
        gem.destroy();

        if (this.state.score >= this.config.goalValue) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        } else if (this.state.score >= Math.floor(this.config.goalValue * 0.8) && !this.state.bossSpawned) {
            this.spawnBoss();
        }
    }

    handleHitHazard(_player, hazard) {
        if (!hazard.active) return;
        this.damagePlayer(this.config.damageOnHit, NODE_RESULT_REASONS.HP_ZERO);
        this.playSynthSound('damage');
        this.triggerScreenShake(150, 0.008);
        this.spawnParticles(hazard.x, hazard.y, 0xef4444);
        hazard.destroy();
    }

    handleCollectSwordDrop(_player, drop) {
        if (!drop.active) return;
        this.playSynthSound('loot');
        this.spawnParticles(drop.x, drop.y, 0xf59e0b);
        this.spawnFloatingText(drop.x, drop.y, '飞仙飞剑！', '#f59e0b');
        drop.destroy();

        // Shoot a bullet flying upwards at Boss position
        this.shootFlyingSword(this.player.x, this.player.y - 20);
    }

    shootFlyingSword(x, y) {
        const sword = this.scene.add.circle(x, y, 6, 0xf59e0b, 1);
        sword.setStrokeStyle(1.5, 0xffffff, 1);
        this.scene.physics.add.existing(sword);
        sword.body.setVelocityY(-480);
        this.groups.swords.add(sword);
    }

    spawnBoss() {
        this.state.bossSpawned = true;
        if (this.spawnTimerEvent) {
            this.spawnTimerEvent.destroy();
        }

        // Clear existing items in arena
        this.groups.gems.clear(true, true);
        this.groups.hazards.clear(true, true);

        this.triggerScreenShake(300, 0.012);
        this.playSynthSound('breakthrough');
        this.playSynthSound('boss');

        // Draw Thunder Beast Boss at the top
        const themeColor = this.payload.nodeConfig.gameplay?.themeColor || 0xef4444;
        this.boss = this.scene.add.circle(this.world.width / 2, 220, 36, themeColor);
        this.boss.setStrokeStyle(3, 0xffffff, 1);
        this.scene.physics.add.existing(this.boss);

        // Title Label
        this.bossText = this.scene.add.text(this.world.width / 2, 220, '⚡', { fontSize: '24px' }).setOrigin(0.5);
        this.scene.tweens.add({
            targets: this.bossText,
            x: this.world.width + 500, // keep updating loop in check
            duration: 100000,
            onUpdate: () => {
                if (this.boss && this.boss.active) {
                    this.bossText.x = this.boss.x;
                    this.bossText.y = this.boss.y;
                } else {
                    this.bossText.destroy();
                }
            }
        });

        // Boss Health Bar graphics
        this.bossHpGraphics = this.scene.add.graphics();
        this.updateBossHpBar();

        // Spawn weapons drops loop
        this.spawnTimerEvent = this.scene.time.addEvent({
            delay: 1100,
            callback: this.spawnSwordDrop,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.spawnTimerEvent);

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
        if (!this.bossHpGraphics || !this.state.bossSpawned || !this.boss) return;
        this.bossHpGraphics.clear();
        
        const width = 120;
        const x = this.boss.x - 60;
        const y = this.boss.y - 58;
        
        // Bar border
        this.bossHpGraphics.fillStyle(0x0f172a, 0.7);
        this.bossHpGraphics.fillRect(x, y, width, 8);
        this.bossHpGraphics.lineStyle(1, 0xef4444, 0.8);
        this.bossHpGraphics.strokeRect(x, y, width, 8);

        // Fill
        const ratio = Math.max(0, this.state.bossHp / this.state.bossMaxHp);
        this.bossHpGraphics.fillStyle(0xef4444, 0.95);
        this.bossHpGraphics.fillRect(x + 1, y + 1, (width - 2) * ratio, 6);
    }

    damageBoss(amount) {
        this.state.bossHp = Math.max(0, this.state.bossHp - amount);
        if (this.bossHpGraphics) this.updateBossHpBar();

        if (this.state.bossHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        }
    }

    triggerBossAttack() {
        if (!this.isRunning() || !this.boss) return;

        const roll = Math.random();
        if (roll > 0.5) {
            this.triggerVerticalLaserAttack();
        } else {
            this.triggerRadialProjectiles();
        }
    }

    triggerVerticalLaserAttack() {
        const { height } = this.world;
        const px = this.player.x;

        // Red laser indicator track
        const warningLine = this.scene.add.graphics();
        warningLine.lineStyle(2, 0xef4444, 0.4);
        warningLine.lineBetween(px, 160, px, height - 120);

        this.playSynthSound('damage');

        this.scene.time.delayedCall(1000, () => {
            if (!this.isRunning()) {
                warningLine.destroy();
                return;
            }
            warningLine.clear();
            warningLine.lineStyle(20, 0xffffff, 1);
            warningLine.lineBetween(px, 160, px, height - 120);
            this.playSynthSound('damage');
            this.triggerScreenShake(200, 0.012);

            // Check if player is directly standing in vertical sweep range
            if (Math.abs(this.player.x - px) < 30) {
                this.damagePlayer(25, NODE_RESULT_REASONS.HP_ZERO);
            }

            this.scene.tweens.add({
                targets: warningLine,
                alpha: 0,
                duration: 350,
                onComplete: () => warningLine.destroy()
            });
        });
    }

    triggerRadialProjectiles() {
        const count = 5;
        const angleStep = Math.PI / (count - 1);
        const bx = this.boss.x;
        const by = this.boss.y;

        for (let i = 0; i < count; i++) {
            const angle = angleStep * i; // fan out downwards
            const px = bx + Math.cos(angle) * 10;
            const py = by + Math.sin(angle) * 10;

            const proj = this.scene.add.circle(px, py, 8, 0xef4444, 0.95);
            proj.setStrokeStyle(1.5, 0xffffff, 1);
            this.scene.physics.add.existing(proj);
            proj.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
            this.groups.hazards.add(proj);
        }
        this.playSynthSound('damage');
    }

    damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning()) return;
        this.state.hp = Math.max(this.state.hp - amount, 0);
        if (this.state.hp <= 0) {
            this.finish(false, failReason);
        }
    }

    cleanupOffscreenItems() {
        // Gems
        this.groups.gems.getChildren().forEach(gem => {
            if (gem.y > this.world.height + 50) gem.destroy();
        });
        // Hazards
        this.groups.hazards.getChildren().forEach(haz => {
            if (haz.y > this.world.height + 50) haz.destroy();
        });
        // Drops
        this.groups.drops.getChildren().forEach(drop => {
            if (drop.y > this.world.height + 50) drop.destroy();
        });
        // Swords
        this.groups.swords.getChildren().forEach(swd => {
            if (swd.y < -50) swd.destroy();
        });
    }

    onSecondTick() {
        if (!this.isRunning()) return;

        this.state.elapsedSeconds += 1;
        this.state.timeRemaining = Math.max(this.config.duration - this.state.elapsedSeconds, 0);

        if (this.state.timeRemaining <= 0) {
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

    spawnParticles(x, y, color) {
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
