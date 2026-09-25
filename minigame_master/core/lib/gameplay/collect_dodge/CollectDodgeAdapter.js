import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'drag_collect_grid',
    duration: 40,
    goalValue: 16,
    playerHp: 100,
    maxActiveItems: 48,
    spawnIntervalMs: 700,
    itemSpeed: 280,
    hazardRate: 0.35,
    damageOnHit: 15,
    difficulty: 1,
    collectRadius: 36,
    /** Pure collect loop without boss phase — preferred for gate demos */
    skipBoss: true,
    boss: {
        hp: 100,
        speed: 150,
        attackIntervalMs: 2500
    }
});

const bounded = (value, fallback, min, max) => {
    const n = value == null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback));
};

// Swept collection: a long frame must not skip an item crossing the player.
function segmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

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
        this.random = typeof context.random === 'function' ? context.random : Math.random;
        this.itemSerial = 0;
        this.feedback = new Set();
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
        const nodeConfig = payload.nodeConfig || {};
        const gameplay = nodeConfig.gameplay || {};
        const rawKnobs = gameplay.knobs || nodeConfig.knobs || {};
        const knobs = { ...(play || {}), ...rawKnobs };
        this.config = mergeConfig(DEFAULT_CONFIG, knobs);

        this.config.duration = bounded(rawKnobs.timeLimitSec ?? rawKnobs.durationSec ?? rawKnobs.duration ?? nodeConfig.duration ?? nodeConfig.durationLimit, 40, 5, 300);
        this.config.goalValue = Math.round(bounded(rawKnobs.needAmount ?? rawKnobs.goalValue ?? rawKnobs.collectGoal ?? nodeConfig.goalValue ?? nodeConfig.rewards?.score, 16, 1, 200));
        this.config.spawnIntervalMs = bounded(knobs.spawnIntervalMs, 700, 200, 3000);
        this.config.itemSpeed = bounded(knobs.itemSpeed, 280, 80, 800);
        this.config.difficulty = Math.round(bounded(knobs.difficulty, 1, 1, 6));
        this.config.hazardRate = bounded(knobs.hazardRate, 0.35, 0, 0.9);
        this.config.damageOnHit = bounded(knobs.damageOnHit, 15, 1, 100);
        this.config.collectRadius = bounded(knobs.collectRadius, 36, 12, 64);
        this.config.maxActiveItems = Math.round(bounded(knobs.maxActiveItems, 48, 4, 256));
        this.config.playerHp = bounded(rawKnobs.playerHp ?? payload.playerStats?.hp, 100, 1, 1000);
        this.config.skipBoss = typeof knobs.skipBoss === 'boolean' ? knobs.skipBoss : DEFAULT_CONFIG.skipBoss;
        const boss = knobs.boss && typeof knobs.boss === 'object' ? knobs.boss : {};
        this.config.boss = {
            hp: bounded(boss.hp, 100, 1, 10000), speed: bounded(boss.speed, 150, 0, 600),
            attackIntervalMs: bounded(boss.attackIntervalMs, 2500, 200, 10000)
        };

        this.themePack =
            nodeConfig.themeContentPack || knobs.themeContentPack || payload.themeContentPack || null;
        this.themeLocale =
            knobs.locale || nodeConfig.locale || this.themePack?.defaultLocale || 'zh-CN';

        this.state.hp = this.config.playerHp;
        this.state.elapsedSeconds = 0;
        this.state.hazardsHit = 0;
        this.result = null;
        this.itemSerial = 0;
        this.bossDirection = 1;
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

        // Hint text (themeable)
        const hint = this.t('control_hint_inline', this.t('level.control_hint', '按住横向拖动接绿珠 · 避开红珠'));
        this.hintText = scene.add
            .text(width / 2, height - 90, hint, {
                fontFamily: 'Inter, sans-serif',
                fontSize: '16px',
                color: '#94a3b8', align: 'center', wordWrap: { width: width - 64 }
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
            for (const entry of this.feedback) { entry.tween?.remove?.(); entry.text.destroy?.(); }
            this.feedback.clear();
            this.player = this.boss = this.bossText = this.bossHpGraphics = this.hintText = null;
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
            if (!this.isRunning() || !this.player || !pointer.isDown || !Number.isFinite(pointer.x)) return;
            const targetX = this.Phaser.Math.Clamp(pointer.x, 36, this.world.width - 36);
            this.player.x = targetX;
        };
        // Drag / touch only: hovering must not change gameplay.
        this.lifecycle.trackListener(this.scene.input, 'pointermove', move);
        this.lifecycle.trackListener(this.scene.input, 'pointerdown', move);
    }

    startTimers() {
        const delay = Math.max(
            200,
            this.config.spawnIntervalMs - (this.config.difficulty - 1) * 50
        );
        this.spawnTimerEvent = this.scene.time.addEvent({
            delay,
            callback: () => this.spawnFallingItem(),
            callbackScope: this,
            loop: true
        });
        this.lifecycle.trackTimer(this.spawnTimerEvent);

        this.lifecycle.trackTimer(
            this.scene.time.addEvent({
                delay: 1000,
                callback: () => this.onSecondTick(),
                callbackScope: this,
                loop: true
            })
        );
    }

    update(_time, delta) {
        if (!this.isRunning() || !Number.isFinite(delta) || delta <= 0) return;
        const dt = delta / 1000;

        // Manual fall (reliable across Phaser versions)
        for (let i = this.fallers.length - 1; i >= 0; i--) {
            if (!this.isRunning()) break;
            const f = this.fallers[i];
            if (!f || !f.go || !f.go.active) {
                if (f) this.fallers.splice(i, 1);
                continue;
            }
            const previousX = f.go.x, previousY = f.go.y;
            if (f._vx != null || f._vy != null) {
                f.go.x += (f._vx || 0) * dt;
                f.go.y += (f._vy ?? f.speed ?? 0) * dt;
            } else {
                f.go.y += f.speed * dt;
            }
            if (f.icon && f.icon.active) {
                f.icon.x = f.go.x;
                f.icon.y = f.go.y;
            }
            // Collect / hit
            if (this.player && this.player.active) {
                const dist = segmentDistance(this.player.x, this.player.y, previousX, previousY, f.go.x, f.go.y);
                if (dist <= (f.r || 12) + this.config.collectRadius) {
                    if (f.kind === 'gem') this.collectGem(f);
                    else if (f.kind === 'hazard') this.hitHazard(f);
                    else if (f.kind === 'swordDrop') this.collectSwordDrop(f);
                    // collect/hit may finish() and clearFallers — only splice if still present
                    const idx = this.fallers.indexOf(f);
                    if (idx >= 0) this.fallers.splice(idx, 1);
                    if (!this.isRunning()) break;
                }
            }
            if (f.go.active && (f.go.y > this.world.height + 40 || f.go.x < -40 || f.go.x > this.world.width + 40)) {
                f.icon?.destroy?.(); f.go.destroy();
                const idx = this.fallers.indexOf(f);
                if (idx >= 0) this.fallers.splice(idx, 1);
            }
        }

        if (!this.isRunning()) return;
        // Projectiles upward
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (!p.go || !p.go.active) {
                this.projectiles.splice(i, 1);
                continue;
            }
            const previousY = p.go.y;
            p.go.y -= p.speed * dt;
            if (this.boss && this.boss.active) {
                const d = segmentDistance(this.boss.x, this.boss.y, p.go.x, previousY, p.go.x, p.go.y);
                if (d < 50) {
                    const { x, y } = this.boss;
                    p.go.destroy(); this.projectiles.splice(i, 1);
                    this.playSynthSound('loot');
                    this.spawnParticles(x, y, 0xef4444);
                    this.spawnFloatingText(x, y, '-12', '#ef4444');
                    this.damageBoss(12);
                    if (!this.isRunning()) return;
                }
            }
            if (p.go.active && p.go.y < -40) {
                p.go.destroy(); this.projectiles.splice(i, 1);
            }
        }

        if (this.state.bossSpawned && this.boss && this.boss.active) {
            this.boss.x += this.bossDirection * (this.config.boss.speed ?? 150) * dt;
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
        if (!this.isRunning() || this.fallers.length >= this.config.maxActiveItems) return;

        if (this.state.bossSpawned) {
            if (this.random() < 0.45) this.spawnSwordDrop();
            return;
        }

        const { width } = this.world;
        const x = 48 + this.random() * (width - 96);
        const y = 150;
        const isHazard = this.random() < this.config.hazardRate;
        const speed = this.config.itemSpeed + (this.config.difficulty - 1) * 30;

        if (isHazard) {
            const go = this.scene.add.circle(x, y, 13, 0xef4444, 0.95);
            go.setStrokeStyle(2, 0xffffff, 0.95);
            go.setDepth(10);
            this.fallers.push({ id: ++this.itemSerial, kind: 'hazard', go, speed, r: 13 });
        } else {
            const go = this.scene.add.circle(x, y, 12, 0x34d399, 0.98);
            go.setStrokeStyle(2, 0xffffff, 1);
            go.setDepth(10);
            this.fallers.push({ id: ++this.itemSerial, kind: 'gem', go, speed, r: 12 });
        }
        this.state.spawnedTotal += 1;
    }

    spawnSwordDrop() {
        if (!this.isRunning() || this.fallers.length >= this.config.maxActiveItems) return;
        const { width } = this.world;
        const x = 48 + this.random() * (width - 96);
        const y = 150;
        const speed = this.config.itemSpeed * 0.95;
        const go = this.scene.add.circle(x, y, 14, 0xf59e0b, 0.9);
        go.setStrokeStyle(2, 0xffffff, 1);
        go.setDepth(10);
        const icon = this.scene.add
            .text(x, y, '🗡️', { fontSize: '14px' })
            .setOrigin(0.5)
            .setDepth(11);
        this.fallers.push({ id: ++this.itemSerial, kind: 'swordDrop', go, icon, speed, r: 14 });
        this.state.spawnedTotal += 1;
    }

    clearFallers() {
        this.fallers.forEach((f) => {
            f.icon?.destroy?.();
            f.go?.destroy?.();
        });
        this.fallers = [];
    }

    acceptFaller(f) {
        if (!this.isRunning() || !f?.go?.active || f.consumed || !this.fallers.includes(f)) return false;
        f.consumed = true;
        return true;
    }

    collectGem(f) {
        if (!this.acceptFaller(f)) return false;
        const x = f?.go?.x ?? 0;
        const y = f?.go?.y ?? 0;
        f?.icon?.destroy?.();
        f?.go?.destroy?.();
        this.state.score += 1;
        this.playSynthSound('loot');
        this.spawnParticles(x, y, 0x10b981);
        this.spawnFloatingText(x, y, '+1', '#10b981');

        if (this.state.score >= this.config.goalValue) {
            this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
        } else if (
            !this.config.skipBoss &&
            this.state.score >= Math.max(5, Math.floor(this.config.goalValue * 0.55)) &&
            !this.state.bossSpawned
        ) {
            this.spawnBoss();
        }
    }

    hitHazard(f) {
        if (!this.acceptFaller(f)) return false;
        this.state.hazardsHit += 1;
        const x = f?.go?.x ?? 0;
        const y = f?.go?.y ?? 0;
        f?.icon?.destroy?.();
        f?.go?.destroy?.();
        this.playSynthSound('damage');
        this.triggerScreenShake(140, 0.008);
        this.spawnParticles(x, y, 0xef4444);
        this.damagePlayer(this.config.damageOnHit, NODE_RESULT_REASONS.HP_ZERO);
    }

    collectSwordDrop(f) {
        if (!this.acceptFaller(f)) return false;
        const x = f?.go?.x ?? 0;
        const y = f?.go?.y ?? 0;
        f?.icon?.destroy?.();
        f?.go?.destroy?.();
        this.playSynthSound('loot');
        this.spawnParticles(x, y, 0xf59e0b);
        this.spawnFloatingText(x, y, this.t('sword_pickup', 'Sword!'), '#f59e0b');
        if (this.player) this.shootFlyingSword(this.player.x, this.player.y - 24);
    }

    shootFlyingSword(x, y) {
        if (!this.isRunning() || this.projectiles.length >= this.config.maxActiveItems) return;
        const go = this.scene.add.circle(x, y, 7, 0xfbbf24, 1);
        go.setStrokeStyle(1.5, 0xffffff, 1);
        go.setDepth(15);
        this.projectiles.push({ go, speed: 520 });
    }

    spawnBoss() {
        if (!this.isRunning() || this.state.bossSpawned) return;
        this.state.bossSpawned = true;
        this.clearFallers();
        this.triggerScreenShake(280, 0.012);
        this.playSynthSound('breakthrough');
        this.playSynthSound('boss');

        this.boss = this.scene.add.circle(this.world.width / 2, 210, 40, 0xef4444, 0.95);
        this.boss.setStrokeStyle(3, 0xffffff, 1);
        this.boss.setDepth(12);
        this.bossText = this.scene.add
            .text(this.world.width / 2, 210, `⚡${this.t('entity.boss', 'Boss')}`, {
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
            this.hintText.setText(this.t('boss_control_hint', '接金色飞剑 · 向上射击 Boss'));
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
        if (!this.isRunning() || !this.boss?.active || !Number.isFinite(amount) || amount <= 0 || this.state.bossHp <= 0) return;
        this.state.bossHp = Math.max(0, this.state.bossHp - amount);
        this.updateBossHpBar();
        if (this.state.bossHp <= 0) {
            this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        }
    }

    triggerBossAttack() {
        if (!this.isRunning() || !this.boss) return;
        // Fan of red orbs downward
        for (let i = 0; i < 5 && this.fallers.length < this.config.maxActiveItems; i++) {
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
                id: ++this.itemSerial, kind: 'hazard',
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
        if (!this.isRunning() || !Number.isFinite(amount) || amount <= 0) return;
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
        if (success && !(this.state.score >= this.config.goalValue || (this.state.bossSpawned && this.state.bossHp <= 0))) return null;
        if (this.lifecycle && !this.lifecycle.canTransition()) return this.result;
        this.lifecycle?.beginEnd();

        if (this.bossAttackEvent) this.bossAttackEvent.destroy();
        if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();

        const rewards = {};
        if (success) {
            rewards.mainCurrency =
                (this.payload?.nodeConfig?.rewards?.score || this.config.goalValue) * 1.5;
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
            bossHp: this.state.bossHp,
            hazardsHit: this.state.hazardsHit,
            playerPosition: this.player ? { x: this.player.x, y: this.player.y } : null,
            items: this.fallers.filter(f => f.go?.active && !f.consumed).map(f => ({
                id: f.id, kind: f.kind, x: f.go.x, y: f.go.y, radius: f.r,
                vx: f._vx ?? 0, vy: f._vy ?? f.speed
            })),
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
        if (!this.isRunning() || !this.scene?.add?.text) return;
        const txt = this.scene.add
            .text(x, y, text, {
                fontFamily: 'Inter, sans-serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color
            })
            .setOrigin(0.5)
            .setDepth(30);
        const entry = { text: txt, tween: null };
        this.feedback.add(entry);
        entry.tween = this.scene.tweens?.add?.({
            targets: txt,
            y: y - 50,
            alpha: 0,
            duration: 600,
            onComplete: () => { txt.destroy(); this.feedback.delete(entry); }
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

export { DEFAULT_CONFIG as COLLECT_DODGE_DEFAULT_CONFIG };
