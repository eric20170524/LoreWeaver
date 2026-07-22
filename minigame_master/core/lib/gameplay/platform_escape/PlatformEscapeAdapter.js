import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_CONFIG = Object.freeze({
    id: 'platform_escape',
    gravity: 1800,
    moveSpeed: 280,
    jumpV0: 720,
    levelLen: 1800,
    progressSpeed: 80,
    hazardIntervalMs: 900,
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    return { ...base, ...patch };
}

export default class PlatformEscapeAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.Phaser = context.Phaser || globalThis.Phaser;
        this.player = null;
        this.platforms = [];
        this.hazards = [];
        this.keys = null;
        this.ui = {};
        this.state = {
            x: 80, y: 0, vy: 0, onGround: false,
            progress: 0, hp: 100, score: 0, invuln: 0
        };
    }

    init(payload = {}) {
        super.init(payload);
        const knobs = payload.nodeConfig?.gameplay?.knobs || payload.nodeConfig?.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, { ...(payload.nodeConfig?.gameplay || {}), ...knobs });
        this.state = {
            x: 80, y: 0, vy: 0, onGround: false,
            progress: 0, hp: payload.playerStats?.hp || 100, score: 0, invuln: 0
        };
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) throw new Error('PlatformEscapeAdapter requires Phaser.');
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();
        const { width, height } = scene.scale;
        this.groundY = height * 0.72;

        this.ui.title = scene.add.text(width / 2, 36, '平台逃亡', {
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
        }).setOrigin(0.5);
        this.ui.status = scene.add.text(width / 2, 68, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#94a3b8'
        }).setOrigin(0.5);
        this.ui.hint = scene.add.text(width / 2, height - 36, 'A/D 移动 · W/空格 跳跃 · 躲避障碍到终点', {
            fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#64748b'
        }).setOrigin(0.5);
        this.ui.bar = scene.add.graphics();

        // ground strip
        this.ground = scene.add.rectangle(width / 2, this.groundY + 20, width * 2, 40, 0x1e293b, 1);
        this.player = scene.add.circle(80, this.groundY - 16, 14, 0x66fcf1, 1);
        this.state.y = this.groundY - 16;

        if (scene.input.keyboard) {
            this.keys = scene.input.keyboard.addKeys({
                left: 'A', right: 'D', left2: 'LEFT', right2: 'RIGHT',
                jump: 'W', jump2: 'UP', jump3: 'SPACE'
            });
        }
        scene.input.on('pointerdown', () => this.jump());

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: this.config.hazardIntervalMs, loop: true, callback: () => this.spawnHazard()
        }));

        this.lifecycle.addCleanup(() => {
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.player?.destroy();
            this.ground?.destroy();
            this.hazards.forEach((h) => h.sprite?.destroy());
        });
        this.refreshHud();
        this.publishTestState();
        return this;
    }

    jump() {
        if (!this.isRunning() || !this.state.onGround) return;
        this.state.vy = -this.config.jumpV0;
        this.state.onGround = false;
    }

    spawnHazard() {
        if (!this.isRunning()) return;
        const { width } = this.scene.scale;
        const type = Math.random() < 0.5 ? 'rock' : 'blade';
        const y = type === 'rock' ? this.groundY - 200 : this.groundY - 20;
        const sprite = this.scene.add.rectangle(
            width + 20, y, type === 'rock' ? 22 : 40, type === 'rock' ? 22 : 10,
            type === 'rock' ? 0x94a3b8 : 0xf43f5e, 0.95
        );
        this.hazards.push({
            sprite, type,
            vx: -(180 + Math.random() * 120),
            vy: type === 'rock' ? 220 : 0
        });
    }

    update(_time, delta) {
        if (!this.isRunning()) return;
        const dt = delta / 1000;
        const { width } = this.scene.scale;
        this.state.invuln = Math.max(0, this.state.invuln - dt);

        let mx = 0;
        if (this.keys?.left?.isDown || this.keys?.left2?.isDown) mx -= 1;
        if (this.keys?.right?.isDown || this.keys?.right2?.isDown) mx += 1;
        const JustDown = this.Phaser?.Input?.Keyboard?.JustDown;
        if (this.keys && JustDown) {
            if (JustDown(this.keys.jump) || JustDown(this.keys.jump2) || JustDown(this.keys.jump3)) this.jump();
        }

        this.state.x = Math.max(20, Math.min(width - 20, this.state.x + mx * this.config.moveSpeed * dt));
        this.state.vy += this.config.gravity * dt;
        this.state.y += this.state.vy * dt;
        if (this.state.y >= this.groundY - 16) {
            this.state.y = this.groundY - 16;
            this.state.vy = 0;
            this.state.onGround = true;
        }
        this.player.x = this.state.x;
        this.player.y = this.state.y;

        // auto progress
        this.state.progress = Math.min(100, this.state.progress + (this.config.progressSpeed * dt * 100) / this.config.levelLen);
        this.state.score = Math.floor(this.state.progress);

        this.hazards = this.hazards.filter((h) => {
            h.sprite.x += h.vx * dt;
            h.sprite.y += (h.vy || 0) * dt;
            if (h.type === 'rock' && h.sprite.y >= this.groundY - 12) {
                h.sprite.y = this.groundY - 12;
                h.vy = 0;
            }
            const d = Math.hypot(h.sprite.x - this.player.x, h.sprite.y - this.player.y);
            if (d < 22 && this.state.invuln <= 0) {
                this.state.hp = Math.max(0, this.state.hp - 25);
                this.state.invuln = 0.8;
                this.scene.cameras.main.shake(100, 0.01);
                if (this.state.hp <= 0) {
                    this.finish(false, NODE_RESULT_REASONS.HP_ZERO);
                }
            }
            if (h.sprite.x < -40) { h.sprite.destroy(); return false; }
            return true;
        });

        this.refreshHud();
        this.publishTestState();
        if (this.state.progress >= 100) this.finish(true, NODE_RESULT_REASONS.OBJECTIVE_MET);
    }

    refreshHud() {
        const { width } = this.scene.scale;
        const g = this.ui.bar;
        if (g) {
            g.clear();
            g.fillStyle(0x1e293b, 0.9);
            g.fillRoundedRect(width * 0.2, 90, width * 0.6, 10, 5);
            g.fillStyle(0x34d399, 1);
            g.fillRoundedRect(width * 0.2, 90, width * 0.6 * (this.state.progress / 100), 10, 5);
        }
        this.ui.status?.setText(`HP ${Math.ceil(this.state.hp)}  ·  进度 ${Math.floor(this.state.progress)}%`);
    }

    getTestState() {
        return {
            adapter: 'PlatformEscapeAdapter', status: this.status,
            hp: this.state.hp, score: this.state.score, progress: this.state.progress, lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();
        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.OBJECTIVE_MET : NODE_RESULT_REASONS.FAILED),
            rewards: success ? { ...(this.config.rewardTable || {}), score: 1 } : {},
            telemetry: { progress: this.state.progress, hp: this.state.hp }
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
            adapterId: this.config.id, status: this.status, progress: this.state.progress, lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as PLATFORM_ESCAPE_DEFAULT_CONFIG };
