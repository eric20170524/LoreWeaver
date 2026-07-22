import GameplayAdapter from '../GameplayAdapter.js';
import { NODE_RESULT_REASONS } from '../../contracts/NodeContracts.js';
import SceneLifecycle from '../../contracts/SceneLifecycle.js';

const DEFAULT_WAVES = Object.freeze([
    {
        id: 'wave_1',
        name: '前哨',
        triggerX: 420,
        lockX: 520,
        cameraMax: 780,
        enemies: [
            { hp: 30, speed: 55, damage: 8, x: 620, y: 0 },
            { hp: 30, speed: 50, damage: 8, x: 700, y: 20 },
            { hp: 40, speed: 45, damage: 10, x: 760, y: -10 }
        ]
    },
    {
        id: 'wave_2',
        name: '隘口',
        triggerX: 980,
        lockX: 1080,
        cameraMax: 1400,
        enemies: [
            { hp: 45, speed: 60, damage: 10, x: 1180, y: 0 },
            { hp: 45, speed: 58, damage: 10, x: 1260, y: 15 },
            { hp: 50, speed: 52, damage: 12, x: 1320, y: -15 },
            { hp: 55, speed: 48, damage: 12, x: 1380, y: 5 }
        ]
    },
    {
        id: 'wave_boss',
        name: '终局',
        triggerX: 1600,
        lockX: 1720,
        cameraMax: 2100,
        bossIntro: true,
        enemies: [
            { hp: 220, speed: 40, damage: 16, x: 1900, y: 0, isBoss: true, radius: 28 }
        ]
    }
]);

const DEFAULT_CONFIG = Object.freeze({
    id: 'side_scrolling_brawler',
    stageLengthPx: 2400,
    playersMax: 1,
    waveList: DEFAULT_WAVES.slice(),
    laneDepth: { floorTop: 250, floorBottom: 460, ySpeedScale: 0.78 },
    lockScreen: { enabled: true, cameraPaddingPx: 72 },
    arcadeTimer: null,
    lifeStock: { enabled: true, startingLives: 2, reviveInvulnSec: 2.4 },
    continueCredits: { enabled: false, maxCredits: 9 },
    player: {
        hp: 100,
        speed: 180,
        attackDamage: 18,
        attackCooldownMs: 280,
        attackRange: 54,
        radius: 16,
        color: 0x66fcf1
    },
    rewardTable: { score: 1 }
});

function mergeConfig(base, patch) {
    if (!patch || typeof patch !== 'object') return { ...base };
    const output = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            output[key] = value.slice();
        } else if (value && typeof value === 'object' && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
            output[key] = mergeConfig(base[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

function normalizeWaves(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return DEFAULT_WAVES.map((w) => ({
            ...w,
            enemies: w.enemies.map((e) => ({ ...e }))
        }));
    }
    return list.map((w, i) => ({
        id: w.id || `wave_${i + 1}`,
        name: w.name || `Wave ${i + 1}`,
        triggerX: Number(w.triggerX ?? (400 + i * 500)),
        lockX: Number(w.lockX ?? w.triggerX ?? (450 + i * 500)),
        cameraMax: Number(w.cameraMax ?? (w.lockX || 0) + 300),
        bossIntro: Boolean(w.bossIntro),
        enemies: (w.enemies || []).map((e) => ({ ...e }))
    }));
}

export default class SideScrollingBrawlerAdapter extends GameplayAdapter {
    constructor(context = {}) {
        super(context);
        this.lifecycle = null;
        this.config = { ...DEFAULT_CONFIG };
        this.modifiers = Array.isArray(context.modifiers) ? context.modifiers : [];
        this.Phaser = context.Phaser || (typeof globalThis !== 'undefined' ? globalThis.Phaser : null);
        this.keys = null;
        this.player = null;
        this.enemies = [];
        this.worldGfx = null;
        this.ui = {};
        this.cameraLock = null;
        this.state = {
            hp: 100,
            maxHp: 100,
            lives: 2,
            credits: 0,
            score: 0,
            kills: 0,
            combo: 0,
            maxCombo: 0,
            damageTaken: 0,
            continuesUsed: 0,
            wavesCleared: 0,
            totalWaves: 0,
            waveIndex: 0,
            locked: false,
            invulnUntil: 0,
            attackReadyAt: 0,
            elapsedSec: 0,
            timerSec: null,
            hurry: false,
            routeEventsCleared: [],
            facing: 1,
            lastInput: { left: false, right: false, up: false, down: false, attack: false, heavy: false }
        };
        this.modifierContext = null;
    }

    init(payload = {}) {
        super.init(payload);
        const nodeConfig = payload.nodeConfig || {};
        const gameplayConfig = nodeConfig.gameplay || {};
        const knobs = gameplayConfig.knobs || nodeConfig.knobs || {};
        this.config = mergeConfig(DEFAULT_CONFIG, mergeConfig(gameplayConfig, knobs));
        this.config.waveList = normalizeWaves(this.config.waveList || knobs.waveList);

        const playerHp = Number(payload.playerStats?.hp || this.config.player.hp || 100);
        this.state.hp = playerHp;
        this.state.maxHp = playerHp;
        this.state.lives = this.config.lifeStock?.enabled === false
            ? 0
            : Number(this.config.lifeStock?.startingLives ?? 2);
        this.state.credits = this.config.continueCredits?.enabled
            ? Number(this.config.continueCredits.startCredits ?? this.config.continueCredits.maxCredits ?? 3)
            : 0;
        this.state.score = 0;
        this.state.kills = 0;
        this.state.combo = 0;
        this.state.maxCombo = 0;
        this.state.damageTaken = 0;
        this.state.continuesUsed = 0;
        this.state.wavesCleared = 0;
        this.state.totalWaves = this.config.waveList.length;
        this.state.waveIndex = 0;
        this.state.locked = false;
        this.state.invulnUntil = 0;
        this.state.attackReadyAt = 0;
        this.state.elapsedSec = 0;
        this.state.timerSec = null;
        this.state.hurry = false;
        this.state.routeEventsCleared = [];
        this.state.facing = 1;
        return this;
    }

    create(scene) {
        super.create(scene);
        if (!this.Phaser) {
            throw new Error('SideScrollingBrawlerAdapter requires Phaser in adapter context.');
        }
        this.lifecycle = new SceneLifecycle(scene);
        this.lifecycle.start();

        const { width, height } = scene.scale;
        const floorTop = this.config.laneDepth?.floorTop ?? height * 0.45;
        const floorBottom = this.config.laneDepth?.floorBottom ?? height * 0.82;
        this.lane = { top: floorTop, bottom: floorBottom, ySpeedScale: this.config.laneDepth?.ySpeedScale ?? 0.78 };
        this.world = {
            width: Math.max(Number(this.config.stageLengthPx || 2400), width + 200),
            height
        };

        this.drawStage();
        this.spawnPlayer();
        this.setupInput();
        this.drawHud();

        scene.cameras.main.setBounds(0, 0, this.world.width, height);
        scene.cameras.main.startFollow(this.player, true, 0.12, 0.12);
        scene.cameras.main.setDeadzone(width * 0.2, height * 0.3);

        this.modifierContext = this.buildModifierContext();
        this.modifiers.forEach((mod) => {
            try {
                mod.install?.(this.modifierContext);
            } catch (error) {
                console.warn('[SideScrollingBrawler] modifier install failed', error);
            }
        });

        this.lifecycle.trackTimer(scene.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => this.onSecondTick()
        }));

        this.lifecycle.addCleanup(() => {
            this.modifiers.forEach((mod) => {
                try {
                    mod.uninstall?.(this.modifierContext);
                } catch (_) { /* ignore */ }
            });
            this.enemies.forEach((e) => e.sprite?.destroy());
            this.enemies = [];
            this.player?.destroy();
            this.worldGfx?.destroy();
            Object.values(this.ui).forEach((n) => n?.destroy?.());
            this.keys = null;
        });

        this.publishTestState();
        return this;
    }

    buildModifierContext() {
        return {
            adapter: this,
            scene: this.scene,
            lifecycle: this.lifecycle,
            config: this.config,
            state: this.state,
            player: this.player,
            helpers: {
                damagePlayer: (amount, reason) => this.damagePlayer(amount, reason),
                addScore: (n) => {
                    this.state.score += n;
                },
                grantLife: () => {
                    this.state.lives += 1;
                },
                setTimer: (sec) => {
                    this.state.timerSec = sec;
                },
                clearWave: () => this.onWaveCleared(),
                spawnEnemy: (spec) => this.spawnEnemy(spec),
                getEnemies: () => this.enemies,
                isLocked: () => this.state.locked,
                lockCamera: (bounds) => this.applyCameraLock(bounds),
                unlockCamera: () => this.clearCameraLock(),
                recordRouteEvent: (id) => {
                    if (!this.state.routeEventsCleared.includes(id)) {
                        this.state.routeEventsCleared.push(id);
                    }
                },
                setFacing: (f) => {
                    this.state.facing = f;
                },
                getLastInput: () => this.state.lastInput,
                applyAttackMultiplier: (mult) => {
                    this._attackMultiplier = mult;
                }
            }
        };
    }

    drawStage() {
        const g = this.scene.add.graphics();
        // Ground belt
        g.fillStyle(0x0b1220, 1);
        g.fillRect(0, this.lane.top, this.world.width, this.lane.bottom - this.lane.top);
        g.lineStyle(2, 0x334155, 0.7);
        g.lineBetween(0, this.lane.top, this.world.width, this.lane.top);
        g.lineBetween(0, this.lane.bottom, this.world.width, this.lane.bottom);

        // Distance markers + wave triggers
        this.config.waveList.forEach((wave, i) => {
            g.lineStyle(1, 0xfbbf24, 0.35);
            g.lineBetween(wave.triggerX, this.lane.top, wave.triggerX, this.lane.bottom);
            this.scene.add.text(wave.triggerX + 6, this.lane.top + 8, `${i + 1}.${wave.name}`, {
                fontFamily: 'Inter, sans-serif',
                fontSize: '12px',
                color: '#fbbf24'
            });
        });

        // Decorative pillars
        for (let x = 120; x < this.world.width; x += 280) {
            g.fillStyle(0x1e293b, 0.55);
            g.fillRect(x, this.lane.bottom - 40, 18, 40);
        }

        this.worldGfx = g;
    }

    spawnPlayer() {
        const y = (this.lane.top + this.lane.bottom) / 2;
        const r = this.config.player.radius || 16;
        this.runtimeArt = this.payload?.runtimeArt || this.payload?.art
            || this.scene.game?.registry?.get?.('runtimeArtBinder')?.createContext?.(this.scene)
            || this.scene.game?.registry?.get?.('runtimeArt')
            || null;
        const artKey = this.runtimeArt?.resolve?.('player');
        if (artKey && this.scene.textures.exists(artKey)) {
            this.player = this.scene.add.sprite(80, y, artKey);
            this.player.setDisplaySize(r * 3.2, r * 3.2);
            this.player.setData('artSource', 'atlas');
        } else {
            this.player = this.scene.add.circle(80, y, r, this.config.player.color, 1);
            this.player.setData?.('artSource', 'primitive');
        }
        this.player.setDepth(10);
        // radius helper for collision math
        this.player.radius = r;
        this.attackFlash = this.scene.add.circle(80, y, 8, 0xffffff, 0).setDepth(11);
    }

    setupInput() {
        const keyboard = this.scene.input.keyboard;
        if (!keyboard) return;
        // Primary player: WASD + J/K/Space. Arrow keys reserved for local co-op P2.
        this.keys = keyboard.addKeys({
            left: 'A',
            right: 'D',
            up: 'W',
            down: 'S',
            attack: 'J',
            attack2: 'SPACE',
            heavy: 'K',
            continue: 'C'
        });

        // Pointer tap = attack for mobile
        this.scene.input.on('pointerdown', (pointer) => {
            if (!this.isRunning()) return;
            if (pointer.y > this.scene.scale.height * 0.75) {
                this.tryAttack(false);
            }
        });
    }

    drawHud() {
        this.ui.hp = this.scene.add.text(16, 56, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            color: '#e2e8f0'
        }).setScrollFactor(0).setDepth(100);
        this.ui.wave = this.scene.add.text(16, 76, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: '#94a3b8'
        }).setScrollFactor(0).setDepth(100);
        this.ui.banner = this.scene.add.text(this.scene.scale.width / 2, 100, '', {
            fontFamily: 'Inter, sans-serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#f8fafc'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);
        this.refreshHud();
    }

    refreshHud() {
        if (!this.ui.hp) return;
        const timerPart = this.state.timerSec != null
            ? `  ⏱ ${Math.ceil(this.state.timerSec)}${this.state.hurry ? ' HURRY' : ''}`
            : '';
        const livesPart = this.config.lifeStock?.enabled === false ? '' : `  命×${this.state.lives}`;
        const creditPart = this.config.continueCredits?.enabled ? `  币×${this.state.credits}` : '';
        this.ui.hp.setText(
            `HP ${Math.ceil(this.state.hp)}  分${this.state.score}  连击${this.state.combo}${livesPart}${creditPart}${timerPart}`
        );
        this.ui.wave.setText(
            this.state.locked
                ? `锁屏波次 ${this.state.waveIndex + 1}/${this.state.totalWaves} · 敌 ${this.enemies.filter((e) => e.alive).length}`
                : `推进中 · 下一波 ${Math.min(this.state.waveIndex + 1, this.state.totalWaves)}/${this.state.totalWaves}`
        );
    }

    showBanner(text, color = '#f8fafc') {
        if (!this.ui.banner) return;
        this.ui.banner.setText(text).setColor(color).setAlpha(1);
        this.scene.tweens.add({
            targets: this.ui.banner,
            alpha: 0,
            delay: 900,
            duration: 400
        });
    }

    onSecondTick() {
        if (!this.isRunning()) return;
        this.state.elapsedSec += 1;
        if (this.state.timerSec != null && this.state.locked) {
            this.state.timerSec = Math.max(0, this.state.timerSec - 1);
            // arcade_timer_pressure modifier handles damage; base only tracks
        }
        this.modifiers.forEach((mod) => mod.onSecondTick?.(this.modifierContext));
        this.refreshHud();
        this.publishTestState();
    }

    update(time, delta) {
        if (!this.isRunning() || !this.player) return;

        this.handleMovement(delta);
        this.handleCombatInput(time);
        this.updateEnemies(delta);
        this.checkWaveTriggers();
        this.modifiers.forEach((mod) => mod.update?.(this.modifierContext, time, delta));
        this.refreshHud();

        // Keep attack flash following player
        if (this.attackFlash) {
            this.attackFlash.x = this.player.x + this.state.facing * 28;
            this.attackFlash.y = this.player.y;
        }
    }

    handleMovement(delta) {
        if (!this.keys) return;
        const speed = this.config.player.speed;
        const yScale = this.lane.ySpeedScale;
        let vx = 0;
        let vy = 0;

        const left = Boolean(this.keys.left?.isDown);
        const right = Boolean(this.keys.right?.isDown);
        const up = Boolean(this.keys.up?.isDown);
        const down = Boolean(this.keys.down?.isDown);

        if (left) vx -= 1;
        if (right) vx += 1;
        if (up) vy -= 1;
        if (down) vy += 1;

        this.state.lastInput.left = left;
        this.state.lastInput.right = right;
        this.state.lastInput.up = up;
        this.state.lastInput.down = down;

        if (vx !== 0 || vy !== 0) {
            const len = Math.hypot(vx, vy) || 1;
            vx /= len;
            vy /= len;
        }
        if (vx !== 0) this.state.facing = vx > 0 ? 1 : -1;

        const dt = delta / 1000;
        let nextX = this.player.x + vx * speed * dt;
        let nextY = this.player.y + vy * speed * yScale * dt;

        // Camera / lock clamps
        const cam = this.scene.cameras.main;
        const pad = this.config.lockScreen?.cameraPaddingPx ?? 72;
        const minX = this.state.locked && this.cameraLock
            ? this.cameraLock.left + this.config.player.radius
            : cam.scrollX + this.config.player.radius;
        const maxX = this.state.locked && this.cameraLock
            ? this.cameraLock.right - this.config.player.radius
            : Math.min(this.world.width - this.config.player.radius, cam.scrollX + this.scene.scale.width - this.config.player.radius);

        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(this.lane.top + this.config.player.radius, Math.min(this.lane.bottom - this.config.player.radius, nextY));

        // While unlocked, don't scroll past next lock ahead of player free roam on cleared areas
        if (!this.state.locked) {
            const nextWave = this.config.waveList[this.state.waveIndex];
            if (nextWave) {
                nextX = Math.min(nextX, nextWave.triggerX + 40);
            }
        }

        this.player.x = nextX;
        this.player.y = nextY;
        this.player.setScale(1, 0.85 + ((nextY - this.lane.top) / (this.lane.bottom - this.lane.top)) * 0.25);
    }

    handleCombatInput(time) {
        if (!this.keys) return;
        const JustDown = this.Phaser?.Input?.Keyboard?.JustDown;
        const just = (key) => (key && JustDown ? JustDown(key) : false);
        const light = just(this.keys.attack) || just(this.keys.attack2);
        const heavy = just(this.keys.heavy);
        this.state.lastInput.attack = light;
        this.state.lastInput.heavy = heavy;

        if (light) this.tryAttack(false, time);
        if (heavy) this.tryAttack(true, time);

        if (this.keys.continue && just(this.keys.continue)) {
            this.tryContinue();
        }
    }

    tryAttack(heavy = false, time = this.scene?.time?.now || 0) {
        if (!this.isRunning() || !this.player) return;
        if (time < this.state.attackReadyAt) return;

        let damage = this.config.player.attackDamage * (heavy ? 1.75 : 1);
        damage *= this._attackMultiplier || 1;

        // Elemental / directional combo hook
        const combo = this.resolveDirectionalCombo(heavy);
        if (combo) {
            damage *= combo.damageMult;
            this.showBanner(combo.label, combo.color || '#fbbf24');
        }

        const cooldown = this.config.player.attackCooldownMs * (heavy ? 1.5 : 1);
        this.state.attackReadyAt = time + cooldown;

        if (this.attackFlash) {
            this.attackFlash.setFillStyle(heavy ? 0xf97316 : 0xffffff, 0.9);
            this.scene.tweens.add({
                targets: this.attackFlash,
                alpha: 0,
                scale: 2.2,
                duration: 160,
                onComplete: () => {
                    this.attackFlash.setScale(1);
                    this.attackFlash.setAlpha(0);
                }
            });
        }

        const range = this.config.player.attackRange * (heavy ? 1.25 : 1);
        let hit = false;
        this.enemies.forEach((enemy) => {
            if (!enemy.alive) return;
            const dx = enemy.sprite.x - this.player.x;
            const dy = enemy.sprite.y - this.player.y;
            const facingOk = this.state.facing > 0 ? dx >= -10 : dx <= 10;
            if (facingOk && Math.hypot(dx, dy) <= range + enemy.radius) {
                enemy.hp -= damage;
                hit = true;
                this.flashHit(enemy.sprite, enemy.isBoss ? 0xef4444 : 0x94a3b8);
                if (enemy.hp <= 0) {
                    this.killEnemy(enemy);
                }
            }
        });

        if (hit) {
            this.state.combo += 1;
            this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
            this.state.score += heavy ? 20 : 10;
        } else {
            this.state.combo = 0;
        }

        this.modifiers.forEach((mod) => mod.onPlayerAttack?.(this.modifierContext, { heavy, damage, hit, combo }));
    }

    resolveDirectionalCombo(heavy) {
        // Base has light directional flavor; elemental_directional_combo modifier can override via flag
        if (this._comboResolver) {
            return this._comboResolver(this.state.lastInput, heavy, this.state.facing);
        }
        const input = this.state.lastInput;
        if (input.up) return { label: '升龙击', damageMult: 1.35, color: '#38bdf8' };
        if (input.down) return { label: '扫堂腿', damageMult: 1.2, color: '#a78bfa' };
        if ((input.left && this.state.facing < 0) || (input.right && this.state.facing > 0)) {
            return { label: heavy ? '突进重击' : '前冲拳', damageMult: heavy ? 1.5 : 1.15, color: '#fb923c' };
        }
        return null;
    }

    checkWaveTriggers() {
        if (this.state.locked) return;
        if (this.state.waveIndex >= this.config.waveList.length) {
            // All waves done — victory if no enemies
            if (this.enemies.every((e) => !e.alive)) {
                this.finish(true, NODE_RESULT_REASONS.COMPLETED);
            }
            return;
        }
        const wave = this.config.waveList[this.state.waveIndex];
        if (this.player.x >= wave.triggerX) {
            this.startWave(wave);
        }
    }

    startWave(wave) {
        this.state.locked = Boolean(this.config.lockScreen?.enabled !== false);
        this.state.waveNoDamage = true;
        this.state.waveStartMs = this.scene.time.now;
        this.showBanner(wave.bossIntro ? `BOSS · ${wave.name}` : `WAVE · ${wave.name}`, wave.bossIntro ? '#f43f5e' : '#fbbf24');

        if (this.state.locked) {
            this.applyCameraLock({
                left: wave.lockX - (this.config.lockScreen?.cameraPaddingPx ?? 72),
                right: wave.cameraMax,
                scrollX: wave.lockX - 40
            });
        }

        (wave.enemies || []).forEach((spec) => {
            this.spawnEnemy({
                ...spec,
                x: spec.x ?? wave.lockX + 120 + Math.random() * 80,
                y: spec.y ?? (Math.random() - 0.5) * 40
            });
        });

        this.modifiers.forEach((mod) => mod.onWaveStart?.(this.modifierContext, wave));
        this.refreshHud();
        this.publishTestState();
    }

    spawnEnemy(spec = {}) {
        const baseY = (this.lane.top + this.lane.bottom) / 2 + (spec.y || 0);
        const radius = Number(spec.radius || (spec.isBoss ? 28 : 14));
        const x = spec.x || this.player.x + 200;
        const y = Math.max(this.lane.top + radius, Math.min(this.lane.bottom - radius, baseY));
        const enemyId = spec.id || (spec.isBoss ? 'qiongqi_cub' : 'wild_rhino');
        const artKey = this.runtimeArt?.resolve?.('enemy', { enemyId })
            || this.runtimeArt?.enemyKey?.(enemyId);
        let sprite;
        if (artKey && this.scene.textures.exists(artKey)) {
            sprite = this.scene.add.sprite(x, y, artKey);
            sprite.setDisplaySize(radius * 2.8, radius * 2.8);
            sprite.setData('artSource', 'atlas');
        } else {
            sprite = this.scene.add.circle(x, y, radius, spec.isBoss ? 0xef4444 : 0x94a3b8, 1);
            sprite.setData?.('artSource', 'primitive');
        }
        sprite.setDepth(9);
        const enemy = {
            alive: true,
            hp: Number(spec.hp || 30),
            maxHp: Number(spec.hp || 30),
            speed: Number(spec.speed || 50),
            damage: Number(spec.damage || 8),
            radius,
            isBoss: Boolean(spec.isBoss),
            sprite,
            hitCooldownUntil: 0
        };
        this.enemies.push(enemy);
        return enemy;
    }

    updateEnemies(delta) {
        const dt = delta / 1000;
        const now = this.scene.time.now;
        this.enemies.forEach((enemy) => {
            if (!enemy.alive || !this.player) return;
            const dx = this.player.x - enemy.sprite.x;
            const dy = this.player.y - enemy.sprite.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist > enemy.radius + this.config.player.radius) {
                enemy.sprite.x += (dx / dist) * enemy.speed * dt;
                enemy.sprite.y += (dy / dist) * enemy.speed * 0.7 * dt;
                enemy.sprite.y = Math.max(
                    this.lane.top + enemy.radius,
                    Math.min(this.lane.bottom - enemy.radius, enemy.sprite.y)
                );
            } else if (now >= enemy.hitCooldownUntil) {
                enemy.hitCooldownUntil = now + 700;
                this.damagePlayer(enemy.damage, NODE_RESULT_REASONS.HP_ZERO);
            }
        });

        if (this.state.locked && this.enemies.length > 0 && this.enemies.every((e) => !e.alive)) {
            this.onWaveCleared();
        }
    }

    killEnemy(enemy) {
        enemy.alive = false;
        enemy.sprite.setAlpha(0.2);
        this.state.kills += 1;
        this.state.score += enemy.isBoss ? 200 : 50;
        this.lifecycle.trackTimer(this.scene.time.delayedCall(200, () => enemy.sprite.destroy()));
        this.modifiers.forEach((mod) => mod.onEnemyKilled?.(this.modifierContext, enemy));
    }

    onWaveCleared() {
        if (!this.state.locked) return;
        const wave = this.config.waveList[this.state.waveIndex];
        this.state.wavesCleared += 1;
        this.state.locked = false;
        this.clearCameraLock();

        // Route event auto-checks
        if (this.state.waveNoDamage) {
            this.state.routeEventsCleared.push(`noDamage:${wave?.id || this.state.waveIndex}`);
        }
        const clearSec = (this.scene.time.now - (this.state.waveStartMs || 0)) / 1000;
        if (clearSec <= 12) {
            this.state.routeEventsCleared.push(`speedClear:${wave?.id || this.state.waveIndex}`);
        }
        if (this.state.combo >= 5) {
            this.state.routeEventsCleared.push(`comboClear:${wave?.id || this.state.waveIndex}`);
        }

        this.state.waveIndex += 1;
        this.enemies = this.enemies.filter((e) => e.alive);
        this.showBanner('波次肃清', '#34d399');
        this.modifiers.forEach((mod) => mod.onWaveClear?.(this.modifierContext, wave));

        if (this.state.waveIndex >= this.config.waveList.length) {
            this.lifecycle.trackTimer(this.scene.time.delayedCall(600, () => {
                if (this.isRunning()) this.finish(true, NODE_RESULT_REASONS.COMPLETED);
            }));
        }
        this.refreshHud();
        this.publishTestState();
    }

    applyCameraLock(bounds) {
        this.cameraLock = bounds;
        const cam = this.scene.cameras.main;
        cam.stopFollow();
        cam.setScroll(bounds.scrollX ?? bounds.left, 0);
        // Soft clamp via update movement; also set bounds tightly
        cam.setBounds(bounds.left, 0, Math.max(100, bounds.right - bounds.left), this.world.height);
    }

    clearCameraLock() {
        this.cameraLock = null;
        const cam = this.scene.cameras.main;
        cam.setBounds(0, 0, this.world.width, this.world.height);
        if (this.player) cam.startFollow(this.player, true, 0.12, 0.12);
    }

    damagePlayer(amount, reason = NODE_RESULT_REASONS.HP_ZERO) {
        if (!this.isRunning()) return;
        const now = this.scene.time.now;
        if (now < this.state.invulnUntil) return;

        this.state.hp = Math.max(0, this.state.hp - amount);
        this.state.damageTaken += amount;
        this.state.waveNoDamage = false;
        this.state.combo = 0;
        this.state.invulnUntil = now + 500;
        this.scene.cameras.main.shake(100, 0.008);
        this.flashHit(this.player, this.config.player.color);

        if (this.state.hp <= 0) {
            this.onPlayerDown(reason);
        }
        this.refreshHud();
        this.publishTestState();
    }

    onPlayerDown(reason) {
        if (this.config.lifeStock?.enabled !== false && this.state.lives > 0) {
            this.state.lives -= 1;
            this.state.hp = this.state.maxHp;
            this.state.invulnUntil = this.scene.time.now + (this.config.lifeStock?.reviveInvulnSec ?? 2.4) * 1000;
            this.showBanner(`复活 · 剩余命 ${this.state.lives}`, '#fbbf24');
            return;
        }
        if (this.config.continueCredits?.enabled && this.state.credits > 0) {
            this.showBanner('按 C 投币续关', '#f97316');
            this.state.awaitingContinue = true;
            this.state.continueDeadline = this.scene.time.now + 8000;
            this.lifecycle.trackTimer(this.scene.time.delayedCall(8000, () => {
                if (this.state.awaitingContinue && this.isRunning()) {
                    this.finish(false, reason || NODE_RESULT_REASONS.HP_ZERO);
                }
            }));
            return;
        }
        this.finish(false, reason || NODE_RESULT_REASONS.HP_ZERO);
    }

    flashHit(obj, restoreColor) {
        if (!obj) return;
        if (typeof obj.setTint === 'function' && obj.texture) {
            obj.setTint(0xffffff);
            this.lifecycle.trackTimer(this.scene.time.delayedCall(80, () => obj.clearTint?.()));
        } else if (typeof obj.setFillStyle === 'function') {
            obj.setFillStyle(0xfafafa, 1);
            this.lifecycle.trackTimer(this.scene.time.delayedCall(80, () => {
                obj.setFillStyle?.(restoreColor ?? 0x94a3b8, 1);
            }));
        }
    }

    tryContinue() {
        if (!this.state.awaitingContinue) return;
        if (!this.config.continueCredits?.enabled || this.state.credits <= 0) return;
        this.state.credits -= 1;
        this.state.continuesUsed += 1;
        this.state.awaitingContinue = false;
        this.state.hp = this.state.maxHp;
        this.state.invulnUntil = this.scene.time.now + 2400;
        this.showBanner('续关成功', '#34d399');
        this.modifiers.forEach((mod) => mod.onContinue?.(this.modifierContext));
        this.refreshHud();
    }

    getTestState() {
        return {
            adapter: 'SideScrollingBrawlerAdapter',
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            kills: this.state.kills,
            wavesCleared: this.state.wavesCleared,
            totalWaves: this.state.totalWaves,
            locked: this.state.locked,
            lives: this.state.lives,
            credits: this.state.credits,
            timerSec: this.state.timerSec,
            maxCombo: this.state.maxCombo,
            routeEventsCleared: this.state.routeEventsCleared.slice(),
            lastResult: this.result
        };
    }

    finish(success, reason = null) {
        if (this.status === 'ended' || this.status === 'destroyed') return this.result;
        if (!this.lifecycle?.canTransition()) return this.result;
        this.lifecycle.beginEnd();

        const rewards = success
            ? {
                ...(this.config.rewardTable || {}),
                score: (this.config.rewardTable?.score ?? 1) + Math.floor(this.state.score / 100)
            }
            : {};

        const result = this.end({
            success,
            reason: reason || (success ? NODE_RESULT_REASONS.COMPLETED : NODE_RESULT_REASONS.HP_ZERO),
            rewards,
            telemetry: {
                wavesCleared: this.state.wavesCleared,
                totalWaves: this.state.totalWaves,
                kills: this.state.kills,
                maxCombo: this.state.maxCombo,
                damageTaken: this.state.damageTaken,
                continuesUsed: this.state.continuesUsed,
                elapsedSec: this.state.elapsedSec,
                routeEventsCleared: this.state.routeEventsCleared.slice(),
                score: this.state.score
            }
        });

        this.lifecycle.cleanup();
        this.lifecycle.finishEnd();
        this.context.onEnd?.(result, this);
        this.publishTestState();
        return result;
    }

    retreat() {
        return this.finish(false, NODE_RESULT_REASONS.RETREATED);
    }

    isRunning() {
        return this.status === 'running' && !this.lifecycle?.transitionLocked;
    }

    destroy() {
        this.lifecycle?.cleanup();
        super.destroy();
    }

    publishTestState() {
        this.context.testHooks?.update({
            adapterId: this.config.id,
            nodeId: this.payload?.nodeId || null,
            status: this.status,
            hp: this.state.hp,
            score: this.state.score,
            wavesCleared: this.state.wavesCleared,
            locked: this.state.locked,
            lastResult: this.result
        });
    }
}

export { DEFAULT_CONFIG as SIDE_SCROLLING_BRAWLER_DEFAULT_CONFIG, DEFAULT_WAVES };
