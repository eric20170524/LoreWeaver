import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

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
        this.state.playerHp = Number(knobs.playerHp ?? this.config.playerHp ?? payload.playerStats?.hp ?? 100);
        this.state.bossHp = Number(knobs.bossHp ?? this.config.bossHp ?? this.config.enemyHp ?? 300);
        this.state.fireReadyAt = 0;
        this.state.elapsed = 0;
        this.state.score = 0;
        this.config.timeLimitSec = Number(this.config.timeLimitSec || 60);
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('ShooterDuelAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;

        this.ui.title = scene.add.text(width / 2, 36, '对决射击', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, 'A/D 移动 · J/点击射击', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);

        this.runtimeArt = this.payload?.runtimeArt || this.payload?.art
            || scene.game?.registry?.get?.('runtimeArtBinder')?.createContext?.(scene)
            || scene.game?.registry?.get?.('runtimeArt')
            || null;
        const playerKey = this.runtimeArt?.resolve?.('player');
        if (playerKey && scene.textures.exists(playerKey)) {
            this.player = scene.add.sprite(width / 2, height - 90, playerKey).setDisplaySize(48, 48);
            this.player.setData('artSource', 'atlas');
        } else {
            this.player = scene.add.circle(width / 2, height - 90, 16, 0x66fcf1, 1);
        }
        const bossKey = this.runtimeArt?.resolve?.('enemy', { enemyId: 'qiongqi_cub' })
            || this.runtimeArt?.enemyKey?.('qiongqi_cub');
        if (bossKey && scene.textures.exists(bossKey)) {
            this.boss = scene.add.sprite(width / 2, 140, bossKey).setDisplaySize(72, 72);
            this.boss.setData('artSource', 'atlas');
        } else {
            this.boss = scene.add.circle(width / 2, 140, 36, 0xef4444, 1);
        }
        this.bossVx = 120;

        if (scene.input.keyboard) {
            this.keys = scene.input.keyboard.addKeys({
                left: 'A', right: 'D', left2: 'LEFT', right2: 'RIGHT', fire: 'J', fire2: 'SPACE'
            });
        }
        scene.input.on('pointerdown', () => this.tryFire());

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
        const b = this.scene.add.circle(this.player.x, this.player.y - 18, 5, 0xfbbf24, 1);
        b.vy = -this.config.bulletSpeed;
        this.bullets.push(b);
    }

    enemyFire() {
        if (!this.isRunning() || !this.boss) return;
        const b = this.scene.add.circle(this.boss.x, this.boss.y + 30, 7, 0xf43f5e, 1);
        const dx = this.player.x - this.boss.x;
        const dy = this.player.y - this.boss.y;
        const len = Math.hypot(dx, dy) || 1;
        b.vx = (dx / len) * this.config.enemyBulletSpeed;
        b.vy = (dy / len) * this.config.enemyBulletSpeed;
        this.enemyBullets.push(b);
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = delta / 1000;
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

        const JustDown = this.Phaser?.Input?.Keyboard?.JustDown;
        if (this.keys && JustDown) {
            if (JustDown(this.keys.fire) || JustDown(this.keys.fire2)) this.tryFire();
        }

        // boss patrol
        this.boss.x += this.bossVx * dt;
        if (this.boss.x < 50 || this.boss.x > width - 50) this.bossVx *= -1;

        this.bullets = this.bullets.filter((b) => {
            b.y += b.vy * dt;
            if (Math.hypot(b.x - this.boss.x, b.y - this.boss.y) < 40) {
                this.state.bossHp = Math.max(0, this.state.bossHp - this.config.playerBulletDamage);
                this.state.score += 5;
                b.destroy();
                if (this.boss.setTint && this.boss.texture) {
                    this.boss.setTint(0xffffff);
                    this.lifecycle.trackTimer(this.scene.time.delayedCall(60, () => this.boss?.clearTint?.()));
                } else {
                    this.boss.setFillStyle?.(0xfafafa, 1);
                    this.lifecycle.trackTimer(this.scene.time.delayedCall(60, () => this.boss?.setFillStyle?.(0xef4444, 1)));
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
            adapter: 'ShooterDuelAdapter',
            status: this.status,
            hp: this.state.playerHp,
            score: this.state.score,
            bossHp: this.state.bossHp,
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

    retreat() { return this.finish(false, NODE_RESULT_REASONS.RETREATED); }
    isRunning() { return this.status === 'running' && !this.lifecycle?.transitionLocked; }
    destroy() { this.lifecycle?.cleanup(); super.destroy(); }
    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id, status: this.status,
            hp: this.state.playerHp, bossHp: this.state.bossHp, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as SHOOTER_DUEL_DEFAULT_CONFIG };
