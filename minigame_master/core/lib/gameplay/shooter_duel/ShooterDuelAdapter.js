import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';
import VFX from '../../juice/VFX.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'shooter_duel',
    playerHp: 100,
    bossHp: 300,
    playerSpeed: 260,
    bulletSpeed: 480,
    playerFireCooldownMs: 220,
    playerBulletDamage: 12,
    enemyFireIntervalMs: 900,
    enemyBulletSpeed: 220,
    enemyBulletDamage: 14,
    timeLimitSec: 60,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class ShooterDuelAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.player = null;
        this.boss = null;
        this.bullets = [];
        this.enemyBullets = [];
        this.keys = null;
        this.hitTimer = null;
        this.ui = {};
        this.state = {
            playerHp: 100,
            bossHp: 300,
            fireReadyAt: 0,
            elapsed: 0,
            score: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        if (knobs.playerHp == null && payload.playerStats?.hp != null) this.config.playerHp = payload.playerStats.hp;
        if (knobs.bossHp == null && knobs.enemyHp != null) this.config.bossHp = knobs.enemyHp;
        const bounds = { playerHp: [1, 1000], bossHp: [12, 3000], playerSpeed: [50, 600], bulletSpeed: [100, 1200],
            playerFireCooldownMs: [80, 2000], playerBulletDamage: [1, 100], enemyFireIntervalMs: [200, 5000],
            enemyBulletSpeed: [50, 600], enemyBulletDamage: [1, 100], timeLimitSec: [3, 180] };
        for (const [key, [min, max]] of Object.entries(bounds)) {
            const value = Number(this.config[key]);
            this.config[key] = Math.max(min, Math.min(max, Number.isFinite(value) ? value : DEFAULT_CONFIG[key]));
        }
        this.state.playerHp = this.config.playerHp;
        this.state.bossHp = this.config.bossHp;
        this.state.fireReadyAt = 0;
        this.state.elapsed = 0;
        this.state.score = 0;

        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('ShooterDuelAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 188, '对决射击', {
            fontFamily: 'Inter, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 234, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '22px', color: '#e2e8f0',
            backgroundColor: 'rgba(3, 7, 18, 0.82)', padding: { x: 10, y: 5 }
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 130, 'A/D 移动 · 按住 J 射击 · 按住拖动移动并射击', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#e2e8f0',
            backgroundColor: 'rgba(3, 7, 18, 0.82)', padding: { x: 10, y: 5 },
            wordWrap: { width: width - 64, useAdvancedWrap: true }, align: 'center'
        }).setOrigin(0.5);

        this.runtimeArt = this.payload?.runtimeArt || this.payload?.art
            || scene.game?.registry?.get?.('runtimeArtBinder')?.createContext?.(scene)
            || scene.game?.registry?.get?.('runtimeArt')
            || null;
        const playerArt = this.resolveActor('player_bow', 'player');
        if (playerArt) {
            this.player = scene.add.sprite(width / 2, height - 220, playerArt.key).setDisplaySize(168, 168);
            this.player.setData('artSource', 'atlas');
            this.player.setData('artRole', playerArt.role);
            if (playerArt.role === 'player_bow') this.runtimeArt?.playClip?.(this.player, 'player_bow', 'idle');
        } else {
            this.player = scene.add.circle(width / 2, height - 200, 16, 0x66fcf1, 1);
        }
        const bossId = this.config.bossId || 'boss';
        const bossKey = this.runtimeArt?.resolve?.('enemy', { enemyId: bossId })
            || this.runtimeArt?.enemyKey?.(bossId);
        if (bossKey && scene.textures.exists(bossKey)) {
            this.boss = scene.add.sprite(width / 2, 340, bossKey).setDisplaySize(192, 192);
            this.boss.setData('artSource', 'atlas');
        } else {
            this.boss = scene.add.circle(width / 2, 340, 36, 0xef4444, 1);
        }
        this.bossVx = 120;

        if (scene.input.keyboard) {
            this.keys = scene.input.keyboard.addKeys({
                left: 'A', right: 'D', left2: 'LEFT', right2: 'RIGHT', fire: 'J', fire2: 'SPACE'
            });
        }
        this.lifecycle.trackListener(scene.input, 'pointerdown', () => this.tryFire());

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: this.config.enemyFireIntervalMs,
            loop: true,
            callback: () => this.enemyFire()
        }));

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.player?.destroy();
            this.boss?.destroy();
            this.bullets.forEach((b) => b.destroy?.());
            this.enemyBullets.forEach((b) => b.destroy?.());
            this.bullets = [];
            this.enemyBullets = [];
            this.hitTimer?.remove(false);
            this.hitTimer = null;
            this.attackReturn?.remove?.(false);
            this.attackReturn = null;
            this.player = null;
            this.boss = null;
            this.ui = {};
            for (const key of Object.values(this.keys || {})) scene.input.keyboard?.removeKey?.(key, true);
            this.keys = null;
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    tryFire() {
        if (!this.isRunning()) return;
        const now = this.scene.time.now;
        if (now < this.state.fireReadyAt) return;
        this.state.fireReadyAt = now + this.config.playerFireCooldownMs;
        this.bullets.push(this.spawnBolt(this.player.x, this.player.y - 18, 0, -this.config.bulletSpeed, 'purple_bolt', 48));
        this.context.onAudioCue?.('sfx_bow_release');
        this.playBowRelease();
    }

    resolveActor(role, fallbackRole = null) {
        const art = this.runtimeArt;
        const scene = this.scene;
        if (!art?.resolve || !scene?.textures?.exists) return null;
        const pick = (name, clip) => {
            const key = clip ? art.resolve(name, { clip }) : art.resolve(name);
            return key && scene.textures.exists(key) ? key : null;
        };
        const primary = pick(role, 'idle') || pick(role, null);
        if (primary) return { key: primary, role };
        if (!fallbackRole) return null;
        const fallback = pick(fallbackRole, 'idle') || pick(fallbackRole, null);
        return fallback ? { key: fallback, role: fallbackRole } : null;
    }

    playBowRelease() {
        const sprite = this.player;
        if (!sprite || sprite.getData?.('artRole') !== 'player_bow' || !this.runtimeArt?.playClip) return;
        const animKey = this.runtimeArt.playClip(sprite, 'player_bow', 'attack');
        if (!animKey) return;
        const back = () => {
            if (this.player !== sprite || !this.isRunning()) return;
            this.runtimeArt?.playClip?.(sprite, 'player_bow', 'idle');
        };
        if (sprite.once && this.scene?.anims?.exists?.(animKey)) {
            sprite.once(`animationcomplete-${animKey}`, back);
            return;
        }
        this.attackReturn?.remove?.(false);
        this.attackReturn = this.scene?.time?.delayedCall?.(180, back) || null;
    }

    enemyFire() {
        if (!this.isRunning() || !this.boss) return;
        const dx = this.player.x - this.boss.x;
        const dy = this.player.y - this.boss.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = this.config.enemyBulletSpeed;
        this.enemyBullets.push(this.spawnBolt(
            this.boss.x, this.boss.y + 30, (dx / len) * speed, (dy / len) * speed, 'crimson_bolt', 36
        ));
    }

    spawnBolt(x, y, vx, vy, effectId, size) {
        const bolt = VFX.spriteClip(this.scene, this.runtimeArt, effectId, x, y, {
            clip: 'loop', depth: 12, destroyOnComplete: false
        });
        if (bolt) {
            bolt.setDisplaySize?.(size, Math.round(size * 0.45));
            bolt.setRotation?.(Math.atan2(vy, vx));
            bolt.vx = vx;
            bolt.vy = vy;
            return bolt;
        }
        const radius = effectId === 'crimson_bolt' ? 7 : 5;
        const color = effectId === 'crimson_bolt' ? 0xf43f5e : 0xfbbf24;
        const fallback = this.scene.add.circle(x, y, radius, color, 1);
        fallback.vx = vx;
        fallback.vy = vy;
        return fallback;
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = Number.isFinite(delta) ? Math.max(0, delta) / 1000 : 0;
        this.state.elapsed += dt;
        const { width, height } = this.scene.scale;

        let vx = 0;
        if (this.keys?.left?.isDown || this.keys?.left2?.isDown) vx -= 1;
        if (this.keys?.right?.isDown || this.keys?.right2?.isDown) vx += 1;
        // pointer drag assist
        if (this.scene.input.activePointer?.isDown) {
            const px = this.scene.input.activePointer.x;
            if (Math.abs(px - this.player.x) > 8) vx = Math.sign(px - this.player.x);
        }
        this.player.x = Math.max(20, Math.min(width - 20, this.player.x + vx * this.config.playerSpeed * dt));

        if (this.keys?.fire?.isDown || this.keys?.fire2?.isDown || this.scene.input.activePointer?.isDown) this.tryFire();

        // boss patrol
        this.boss.x += this.bossVx * dt;
        if (this.boss.x < 50 || this.boss.x > width - 50) this.bossVx *= -1;
        this.boss.x = Math.max(50, Math.min(width - 50, this.boss.x));

        if (this.player?.getData?.('artSource') === 'atlas' && vx !== 0) {
            this.player.setFlipX?.(vx < 0);
        }
        this.bullets = this.bullets.filter((b) => {
            b.x += (b.vx || 0) * dt;
            b.y += b.vy * dt;
            if (Math.hypot(b.x - this.boss.x, b.y - this.boss.y) < 40) {
                this.state.bossHp = Math.max(0, this.state.bossHp - this.config.playerBulletDamage);
                this.state.score += 5;
                b.destroy();
                this.hitTimer?.remove(false);
                if (this.boss.setTint && this.boss.texture) {
                    this.boss.setTint(0xffffff);
                    this.hitTimer = this.scene.time.delayedCall(60, () => { this.hitTimer = null; this.boss?.clearTint?.(); });
                } else {
                    this.boss.setFillStyle?.(0xfafafa, 1);
                    this.hitTimer = this.scene.time.delayedCall(60, () => { this.hitTimer = null; this.boss?.setFillStyle?.(0xef4444, 1); });
                }
                return false;
            }
            if (b.y < -20) { b.destroy(); return false; }
            return true;
        });

        this.enemyBullets = this.enemyBullets.filter((b) => {
            b.x += (b.vx || 0) * dt;
            b.y += (b.vy || 0) * dt;
            if (Math.hypot(b.x - this.player.x, b.y - this.player.y) < 18) {
                this.state.playerHp = Math.max(0, this.state.playerHp - this.config.enemyBulletDamage);
                b.destroy();
                this.scene.cameras.main.shake(80, 0.008);
                return false;
            }
            if (b.y > height + 20 || b.x < -20 || b.x > width + 20) { b.destroy(); return false; }
            return true;
        });

        this.refreshHud();
        this.publishTestState();
        if (this.state.bossHp <= 0) this.finish(true, NODE_RESULT_REASONS.BOSS_DEFEATED);
        else if (this.state.playerHp <= 0) this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
        else if (this.state.elapsed >= this.config.timeLimitSec) this.finish(false, NODE_RESULT_REASONS.TIMER_EXPIRED);
    }

    refreshHud() {
        const left = Math.max(0, this.config.timeLimitSec - this.state.elapsed);
        this.ui.status?.setText(
            `HP ${Math.ceil(this.state.playerHp)}  ·  Boss ${Math.ceil(this.state.bossHp)}  ·  ⏱ ${left.toFixed(0)}s`
        );
    }

    getTestState() {
        return {
            ...super.getTestState(),
            adapter: 'ShooterDuelAdapter',
            status: this.status,
            hp: this.state.playerHp,
            score: this.state.score,
            bossHp: this.state.bossHp,
            goalValue: 0,
            timer: Math.max(0, this.config.timeLimitSec - this.state.elapsed),
            elapsed: this.state.elapsed,
            player: this.player ? { x: this.player.x, y: this.player.y } : null,
            boss: this.boss ? { x: this.boss.x, y: this.boss.y, vx: this.bossVx } : null,
            bulletSpeed: this.config.bulletSpeed,
            bullets: this.bullets.map(b => ({ x: b.x, y: b.y })),
            enemyBullets: this.enemyBullets.map(b => ({ x: b.x, y: b.y })),
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.BOSS_DEFEATED : NODE_RESULT_REASONS.FAILED),
            rewards: success ? { ...(this.config.rewardTable || {}), score: 1 } : {},
            telemetry: {
                bossHp: this.state.bossHp,
                playerHp: this.state.playerHp,
                elapsedSec: this.state.elapsed
            }
        });
        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    pause() { if (this.config.allowPause !== false) super.pause(); }
    retreat() { return this.config.allowQuit === false ? null : this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.destroy(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status,
            hp: this.state.playerHp, bossHp: this.state.bossHp, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as SHOOTER_DUEL_DEFAULT_CONFIG };
