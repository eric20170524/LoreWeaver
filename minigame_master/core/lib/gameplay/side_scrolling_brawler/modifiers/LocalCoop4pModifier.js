import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    playersMax: 2,
    keyboardLayoutCount: 2,
    gamepadSlots: 2,
    touchVirtualControls: true,
    perPlayerInventory: false,
    sharedCamera: true,
    edgeTriggeredActions: true
});

const P2_COLORS = [0xf472b6, 0xa78bfa, 0xfacc15];

/**
 * Local co-op: spawns additional players controlled by secondary keyboard layouts.
 * P1: WASD + J/K · P2: arrows + numpad 1/2 (or U/I)
 */
export default class LocalCoop4pModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.extraPlayers = [];
        this.extraKeys = [];
    }

    install(context) {
        super.install(context);
        const max = Math.min(4, Math.max(1, Number(this.config.playersMax || 2)));
        context.config.playersMax = max;
        context.state.coopPlayers = max;

        if (max <= 1) return;

        const keyboard = context.scene.input.keyboard;
        if (!keyboard) return;

        // Spawn P2..Pn as simple escorts that auto-follow and can attack
        for (let i = 1; i < max; i += 1) {
            const color = P2_COLORS[(i - 1) % P2_COLORS.length];
            const sprite = context.scene.add.circle(
                context.player.x - 40 * i,
                context.player.y + 10 * i,
                context.config.player.radius * 0.9,
                color,
                1
            );
            sprite.setDepth(10);
            this.extraPlayers.push({
                index: i,
                sprite,
                hp: context.state.maxHp,
                facing: 1,
                attackReadyAt: 0
            });

            if (i === 1) {
                const keys = keyboard.addKeys({
                    left: 'LEFT',
                    right: 'RIGHT',
                    up: 'UP',
                    down: 'DOWN',
                    attack: 'NUMPAD_ONE',
                    attackAlt: 'U',
                    heavy: 'NUMPAD_TWO',
                    heavyAlt: 'I'
                });
                this.extraKeys.push(keys);
            }
        }

        context.state.extraPlayers = this.extraPlayers;
    }

    update(context, time, delta) {
        if (!this.installed || !context.adapter.isRunning()) return;
        const dt = delta / 1000;
        const speed = context.config.player.speed;
        const lane = context.adapter.lane;
        const JustDown = context.adapter.Phaser?.Input?.Keyboard?.JustDown;
        const just = (key) => (key && JustDown ? JustDown(key) : false);

        this.extraPlayers.forEach((p, idx) => {
            if (!p.sprite) return;
            const keys = this.extraKeys[idx];
            let vx = 0;
            let vy = 0;

            if (keys) {
                if (keys.left?.isDown) vx -= 1;
                if (keys.right?.isDown) vx += 1;
                if (keys.up?.isDown) vy -= 1;
                if (keys.down?.isDown) vy += 1;
            } else {
                // AI assist: follow P1
                const dx = context.player.x - 36 * (idx + 1) - p.sprite.x;
                const dy = context.player.y - p.sprite.y;
                if (Math.abs(dx) > 8) vx = Math.sign(dx);
                if (Math.abs(dy) > 8) vy = Math.sign(dy);
            }

            if (vx !== 0) p.facing = vx > 0 ? 1 : -1;
            p.sprite.x += vx * speed * dt;
            p.sprite.y += vy * speed * 0.78 * dt;
            p.sprite.y = Math.max(lane.top + 12, Math.min(lane.bottom - 12, p.sprite.y));

            // Clamp into camera lock if any
            if (context.state.locked && context.adapter.cameraLock) {
                const lock = context.adapter.cameraLock;
                p.sprite.x = Math.max(lock.left + 12, Math.min(lock.right - 12, p.sprite.x));
            }

            const attack = keys && (just(keys.attack) || just(keys.attackAlt) || just(keys.heavy) || just(keys.heavyAlt));
            if (attack && time >= p.attackReadyAt) {
                p.attackReadyAt = time + context.config.player.attackCooldownMs;
                this.partnerAttack(context, p, just(keys?.heavy) || just(keys?.heavyAlt));
            }
        });
    }

    partnerAttack(context, p, heavy) {
        const damage = context.config.player.attackDamage * (heavy ? 1.75 : 1);
        const range = context.config.player.attackRange * (heavy ? 1.25 : 1);
        context.helpers.getEnemies().forEach((enemy) => {
            if (!enemy.alive) return;
            const dx = enemy.sprite.x - p.sprite.x;
            const dy = enemy.sprite.y - p.sprite.y;
            if (Math.hypot(dx, dy) <= range + enemy.radius) {
                enemy.hp -= damage;
                if (enemy.hp <= 0) {
                    context.adapter.killEnemy(enemy);
                }
            }
        });
    }

    uninstall(context) {
        super.uninstall(context);
        this.extraPlayers.forEach((p) => p.sprite?.destroy());
        this.extraPlayers = [];
        this.extraKeys = [];
    }

    getTestState() {
        return {
            ...super.getTestState(),
            playersMax: this.config.playersMax,
            activeExtra: this.extraPlayers.length
        };
    }
}

export { DEFAULT_CONFIG as LOCAL_COOP_4P_DEFAULT_CONFIG };
