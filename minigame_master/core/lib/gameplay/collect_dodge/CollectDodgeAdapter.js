import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'drag_collect_grid',
    duration: 30,
    goalValue: 15,
    spawnIntervalMs: 700,
    itemSpeed: 280,
    hazardRate: 0.35,
    damageOnHit: 15,
    difficulty: 1,
    collectRadius: 36,
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
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            base[key] &&
            typeof base[key] === 'object' &&
            !Array.isArray(base[key])
        ) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

/**
 * Collect / dodge arena for drag_collect_grid.
 * Uses manual kinematics (not arcade velocity alone) so drops always fall in
 * Phaser 3/4 + workbench host scenes.
 */
export default class CollectDodgeAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.player = null;
        this.boss = null;
        this.bossHpGraphics = null;
        this.bossDirection = 1;
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        /** @type {{kind:string, go:any, icon?:any, speed:number, r:number}[]} */
        this.fallers = [];
        this.projectiles = [];
        this.state = {
            hp: 100,
            elapsedSeconds: 0,
            timeRemaining: DEFAULT_CONFIG.duration,
            score: 0,
            bossSpawned: false,
            bossHp: DEFAULT_CONFIG.boss.hp,
            bossMaxHp: DEFAULT_CONFIG.boss.hp,
            spawnedTotal: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        // Shared playability surface: timeLimitSec / needAmount / allowQuit / …
        const play = this.readPlayabilityKnobs(payload, 'drag_collect_grid');
        const knobs = play || {};
        this.config = mergeConfig(DEFAULT_CONFIG, knobs);

        this.config.duration = Number(play.durationSec || DEFAULT_CONFIG.duration);
        // Card-standard needAmount (+ legacy collectGoal/goalValue via normalize)
        this.config.goalValue = Number(play.needAmount || play.collectGoal || DEFAULT_CONFIG.goalValue);

        this.config.spawnIntervalMs = Math.max(
            280,
            Number(this.config.spawnIntervalMs || DEFAULT_CONFIG.spawnIntervalMs)
        );
        this.config.itemSpeed = Math.max(
            140,
            Number(this.config.itemSpeed || DEFAULT_CONFIG.itemSpeed)
        );
        this.config.difficulty = Math.max(1, Number(this.config.difficulty || 1));
        this.config.hazardRate = Math.min(
            0.7,
            Math.max(0.12, Number(this.config.hazardRate ?? DEFAULT_CONFIG.hazardRate))
        );
        this.config.collectRadius = Number(this.config.collectRadius || DEFAULT_CONFIG.collectRadius);

        if (!this.config.boss || typeof this.config.boss !== 'object') {
            this.config.boss = { ...DEFAULT_CONFIG.boss };
        } else {
            this.config.boss = { ...DEFAULT_CONFIG.boss, ...this.config.boss };
        }

        this.state.hp = payload.playerStats?.hp || 100;
        this.state.timeRemaining = this.config.duration;
        this.state.bossHp = this.config.boss.hp;
        this.state.bossMaxHp = this.config.boss.hp;
        this.state.score = 0;
        this.state.bossSpawned = false;
        this.state.spawnedTotal = 0;
        this.fallers = [];
        this.projectiles = [];
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

        const themeColor = 0x10b981;
        this.player = scene.add.circle(width / 2, height - 140, 26, themeColor, 0.95);
        this.player.setStrokeStyle(3, 0xffffff, 1);
        this.player.setDepth(20);

        // Hint text
        this.hintText = scene.add
            .text(width / 2, height - 90, '← 左右滑动接绿珠 · 躲红雷 →', {
                fontFamily: 'Inter, sans-serif',
                fontSize: '16px',
                color: '#94a3b8'
            })
            .setOrigin(0.5)
            .setDepth(20);

        this.lifecycle.addCleanup(() => {
            this.clearFallers();
            this.projectiles.forEach((p) => p.go?.destroy?.());
            this.projectiles = [];
            this.player?.destroy?.();
            this.boss?.destroy?.();
            this.bossText?.destroy?.();
            this.bossHpGraphics?.destroy?.();
            this.hintText?.destroy?.();
        });

        this.bindInput();
        this.startTimers();
        // Immediate visible drop
        this.spawnFallingItem();
        this.spawnFallingItem();
        this.publishTestState();
        return this;
    }

    bindInput() {
        const move = (pointer) => {
            if (!this.isRunning() || !this.player) return;
            const targetX = this.Phaser.Math.Clamp(pointer.x, 36, this.world.width - 36);
            this.player.x = targetX;
        };
        // Drag / touch: follow pointer whenever it moves (and on down)
        this.lifecycle.trackListener(this.scene.input, 'pointermove', move);
        this.lifecycle.trackListener(this.scene.input, 'pointerdown', move);
    }

    startTimers() {
        const delay = Math.max(
            280,
            this.config.spawnIntervalMs - (this.config.difficulty - 1) * 50
        );
        this.spawnTimerEvent = this.scene.time.addEvent({
            delay,
            callback: this.spawnFallingItem,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.spawnTimerEvent);

        this.lifecycle.trackTimer(
            this.scene.time.addEvent({
                delay: 1000,
                callback: this.onSecondTick,
                callbackScope: this,
                loop: true
            })
        );
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = Math.min(50, Math.max(0, delta || 16.6)) / 1000;

        // Manual fall (reliable across Phaser versions)
        for (let i = this.fallers.length - 1; i >= 0; i--) {
            const f = this.fallers[i];
            if (!f.go || !f.go.active) {
                this.fallers.splice(i, 1);
                continue;
            }
            if (f._vx != null || f._vy != null) {
                f.go.x += (f._vx || 0) * dt;
                f.go.y += (f._vy || f.speed || 0) * dt;
            } else {
                f.go.y += f.speed * dt;
            }
            if (f.icon && f.icon.active) {
                f.icon.x = f.go.x;
                f.icon.y = f.go.y;
            }
            if (f.go.y > this.world.height + 40) {
                f.icon?.destroy?.();
                f.go.destroy();
                this.fallers.splice(i, 1);
                continue;
            }
            // Collect / hit
            if (this.player && this.player.active) {
                const dist = this.Phaser.Math.Distance.Between(
                    this.player.x,
                    this.player.y,
                    f.go.x,
                    f.go.y
                );
                if (dist <= (f.r || 12) + this.config.collectRadius) {
                    if (f.kind === 'gem') this.collectGem(f);
                    else if (f.kind === 'hazard') this.hitHazard(f);
                    else if (f.kind === 'swordDrop') this.collectSwordDrop(f);
                    this.fallers.splice(i, 1);
                }
            }
        }

        // Projectiles upward
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (!p.go || !p.go.active) {
                this.projectiles.splice(i, 1);
                continue;
            }
            p.go.y -= p.speed * dt;
            if (p.go.y < -40) {
                p.go.destroy();
                this.projectiles.splice(i, 1);
                continue;
            }
            if (this.boss && this.boss.active) {
                const d = this.Phaser.Math.Distance.Between(
                    p.go.x,
                    p.go.y,
                    this.boss.x,
                    this.boss.y
                );
                if (d < 50) {
                    p.go.destroy();
                    this.projectiles.splice(i, 1);
                    this.damageBoss(12);
                    this.playSynthSound('loot');
                    this.spawnParticles(this.boss.x, this.boss.y, 0xef4444);
                    this.spawnFloatingText(this.boss.x, this.boss.y, '-12', '#ef4444');
                }
            }
        }

        if (this.state.bossSpawned && this.boss && this.boss.active) {
            this.boss.x += this.bossDirection * (this.config.boss.speed || 150) * dt;
            if (this.boss.x >= this.world.width - 60) {
                this.boss.x = this.world.width - 60;
                this.bossDirection = -1;
            } else if (this.boss.x <= 60) {
                this.boss.x = 60;
                this.bossDirection = 1;
            }
            if (this.bossText && this.bossText.active) {
                this.bossText.x = this.boss.x;
                this.bossText.y = this.boss.y;
            }
            this.updateBossHpBar();
        }

        this.publishTestState();
    }

    spawnFallingItem() {
        if (!this.isRunning()) return;

        if (this.state.bossSpawned) {
            if (Math.random() < 0.45) this.spawnSwordDrop();
            return;
        }

        const { width } = this.world;
        const x = this.Phaser.Math.Between(48, width - 48);
        const y = 150;
        const isHazard = Math.random() < this.config.hazardRate;
        const speed = this.config.itemSpeed + (this.config.difficulty - 1) * 30;

        if (isHazard) {
            const go = this.scene.add.circle(x, y, 13, 0xef4444, 0.95);
            go.setStrokeStyle(2, 0xffffff, 0.95);
            go.setDepth(10);
            this.fallers.push({ kind: 'hazard', go, speed, r: 13 });
        } else {
            const go = this.scene.add.circle(x, y, 12, 0x34d399, 0.98);
            go.setStrokeStyle(2, 0xffffff, 1);
            go.setDepth(10);
            this.fallers.push({ kind: 'gem', go, speed, r: 12 });
        }
        this.state.spawnedTotal += 1;
    }

    spawnSwordDrop() {
        const { width } = this.world;
        const x = this.Phaser.Math.Between(48, width - 48);
        const y = 150;
        const speed = this.config.itemSpeed * 0.95;
        const go = this.scene.add.circle(x, y, 14, 0xf59e0b, 0.9);
        go.setStrokeStyle(2, 0xffffff, 1);
        go.setDepth(10);
        const icon = this.scene.add
            .text(x, y, '🗡️', { fontSize: '14px' })
            .setOrigin(0.5)
            .setDepth(11);
        this.fallers.push({ kind: 'swordDrop', go, icon, speed, r: 14 });
        this.state.spawnedTotal += 1;
    }

    clearFallers() {
        this.fallers.forEach((f) => {
            f.icon?.destroy?.();
            f.go?.destroy?.();
        });
        this.fallers = [];
    }

    collectGem(f) {
        f.icon?.destroy?.();
        f.go?.destroy?.();
        this.state.score += 1;
        this.playSynthSound('loot');
        this.spawnParticles(f.go.x, f.go.y, 0x10b981);
        this.spawnFloatingText(f.go.x, f.go.y, '+1', '#10b981');

        if (this.state.score >= this.config.goalValue) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        } else if (
            this.state.score >= Math.max(5, Math.floor(this.config.goalValue * 0.55)) &&
            !this.state.bossSpawned
        ) {
            this.spawnBoss();
        }
    }

    hitHazard(f) {
        f.icon?.destroy?.();
        f.go?.destroy?.();
        this.damagePlayer(this.config.damageOnHit, NODE_RESULT_REASONS.HP_ZERO);
        this.playSynthSound('damage');
        this.triggerScreenShake(140, 0.008);
        this.spawnParticles(f.go.x, f.go.y, 0xef4444);
    }

    collectSwordDrop(f) {
        f.icon?.destroy?.();
        f.go?.destroy?.();
        this.playSynthSound('loot');
        this.spawnParticles(f.go.x, f.go.y, 0xf59e0b);
        this.spawnFloatingText(f.go.x, f.go.y, '飞剑！', '#f59e0b');
        this.shootFlyingSword(this.player.x, this.player.y - 24);
    }

    shootFlyingSword(x, y) {
        const go = this.scene.add.circle(x, y, 7, 0xfbbf24, 1);
        go.setStrokeStyle(1.5, 0xffffff, 1);
        go.setDepth(15);
        this.projectiles.push({ go, speed: 520 });
    }

    spawnBoss() {
        this.state.bossSpawned = true;
        this.clearFallers();
        this.triggerScreenShake(280, 0.012);
        this.playSynthSound('breakthrough');
        this.playSynthSound('boss');

        this.boss = this.scene.add.circle(this.world.width / 2, 210, 40, 0xef4444, 0.95);
        this.boss.setStrokeStyle(3, 0xffffff, 1);
        this.boss.setDepth(12);
        this.bossText = this.scene.add
            .text(this.world.width / 2, 210, '⚡兽王', {
                fontFamily: 'Inter, sans-serif',
                fontSize: '18px',
                color: '#fff'
            })
            .setOrigin(0.5)
            .setDepth(13);

        this.bossHpGraphics = this.scene.add.graphics().setDepth(13);
        this.updateBossHpBar();

        if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();
        this.spawnTimerEvent = this.scene.time.addEvent({
            delay: 1000,
            callback: this.spawnSwordDrop,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.spawnTimerEvent);

        this.bossAttackEvent = this.scene.time.addEvent({
            delay: this.config.boss.attackIntervalMs || 2500,
            callback: this.triggerBossAttack,
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.bossAttackEvent);

        if (this.hintText) {
            this.hintText.setText('接金色飞剑 · 自动射向兽王');
        }
    }

    updateBossHpBar() {
        if (!this.bossHpGraphics || !this.boss) return;
        this.bossHpGraphics.clear();
        const width = 120;
        const x = this.boss.x - 60;
        const y = this.boss.y - 62;
        this.bossHpGraphics.fillStyle(0x0f172a, 0.75);
        this.bossHpGraphics.fillRect(x, y, width, 8);
        this.bossHpGraphics.lineStyle(1, 0xef4444, 0.9);
        this.bossHpGraphics.strokeRect(x, y, width, 8);
        const ratio = Math.max(0, this.state.bossHp / this.state.bossMaxHp);
        this.bossHpGraphics.fillStyle(0xef4444, 0.95);
        this.bossHpGraphics.fillRect(x + 1, y + 1, (width - 2) * ratio, 6);
    }

    damageBoss(amount) {
        this.state.bossHp = Math.max(0, this.state.bossHp - amount);
        this.updateBossHpBar();
        if (this.state.bossHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        }
    }

    triggerBossAttack() {
        if (!this.isRunning() || !this.boss) return;
        // Fan of red orbs downward
        for (let i = 0; i < 5; i++) {
            const t = i / 4;
            const angle = Math.PI * 0.15 + t * Math.PI * 0.7;
            const go = this.scene.add.circle(this.boss.x, this.boss.y + 20, 9, 0xef4444, 0.95);
            go.setStrokeStyle(1.5, 0xffffff, 1);
            go.setDepth(11);
            // Convert polar to faller with diagonal speed
            const speed = 220;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.fallers.push({
                kind: 'hazard',
                go,
                speed: 0,
                r: 9,
                // custom diagonal in update via speed field + extra
                _vx: vx,
                _vy: vy
            });
        }
        // Apply diagonal motion in update by patching: store vx/vy
        this.playSynthSound('damage');
    }

    damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning()) return;
        this.state.hp = Math.max(this.state.hp - amount, 0);
        this.spawnFloatingText(this.player.x, this.player.y - 30, `-${amount}`, '#f87171');
        if (this.state.hp <= 0) {
            this.finish(false, failReason);
        }
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
                this.finish(
                    passed,
                    passed ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.TIMER_EXPIRED
                );
            }
        }
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (this.lifecycle && !this.lifecycle.canTransition()) return this.result;
        this.lifecycle?.beginEnd();

        if (this.bossAttackEvent) this.bossAttackEvent.destroy();
        if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();

        const rewards = {};
        if (success) {
            rewards.mainCurrency =
                (this.payload.nodeConfig?.rewards?.score || this.config.goalValue) * 1.5;
        }

        const result = this.end({
            success,
            reason:
                reason ||
                (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.FAILED),
            rewards,
            telemetry: {
                score: this.state.score,
                elapsedSeconds: this.state.elapsedSeconds,
                bossDefeated: success && this.state.bossSpawned,
                hp: this.state.hp,
                spawnedTotal: this.state.spawnedTotal
            }
        });

        this.lifecycle?.cleanup();
        this.lifecycle?.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    retreat() {
        return this.finish(false, NODE_RESULT_REASONS.RETREATED);
    }

    getTestState() {
        return {
            adapter: this.constructor.name,
            adapterId: this.config?.id,
            status: this.status,
            nodeId: this.payload?.nodeId || null,
            hp: this.state.hp,
            score: this.state.score,
            goalValue: this.config.goalValue,
            timer: this.state.timeRemaining,
            bossSpawned: this.state.bossSpawned,
            spawnedTotal: this.state.spawnedTotal,
            fallers: this.fallers.length,
            lastResult: this.result
        };
    }

    isRunning() {
        return this.status === 'running' && !this.lifecycle?.transitionLocked;
    }

    playSynthSound(type) {
        const synth =
            typeof window !== 'undefined'
                ? window.synth || this.context?.synth
                : null;
        if (!synth) return;
        if (type === 'loot') synth.playLoot?.();
        else if (type === 'damage') synth.playDamage?.();
        else if (type === 'breakthrough') synth.playBreakthrough?.();
        else if (type === 'boss') synth.playBossTheme?.();
    }

    triggerScreenShake(duration, intensity) {
        this.scene?.cameras?.main?.shake?.(duration, intensity);
    }

    spawnParticles(x, y, color) {
        if (this.context.spawnParticles) this.context.spawnParticles(x, y, color);
    }

    spawnFloatingText(x, y, text, color) {
        if (!this.scene?.add?.text) return;
        const txt = this.scene.add
            .text(x, y, text, {
                fontFamily: 'Inter, sans-serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color
            })
            .setOrigin(0.5)
            .setDepth(30);
        this.scene.tweens?.add?.({
            targets: txt,
            y: y - 50,
            alpha: 0,
            duration: 600,
            onComplete: () => txt.destroy()
        });
    }

    publishTestState() {
        this.context.testHooks?.update?.({
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            hp: this.state.hp,
            timer: this.state.timeRemaining,
            score: this.state.score,
            goalValue: this.config.goalValue,
            spawnedTotal: this.state.spawnedTotal,
            fallers: this.fallers.length,
            lastResult: this.result
        });
    }
}
