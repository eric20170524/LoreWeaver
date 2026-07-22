import GameplayModifier from '../../GameplayModifier.js';

const DEFAULT_CONFIG = Object.freeze({
    portalIntervalMs: 12000,
    difficultyMultiplier: 1.35,
    rewardsMultiplier: 1.5,
    portalRadius: 28,
    color: 0x818cf8
});

export default class RandomRoomPortalsModifier extends GameplayModifier {
    constructor(config = {}) {
        super({ ...DEFAULT_CONFIG, ...config });
        this.portal = null;
        this.timer = null;
        this.activeRoom = false;
        this.roomLeft = 0;
        this.hud = null;
        this.baseSpawn = null;
        this.baseReward = null;
    }

    install(context) {
        super.install(context);
        this.hud = context.scene.add.text(12, 180, '', {
            fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#a5b4fc'
        });
        this.timer = context.scene.time.addEvent({
            delay: this.config.portalIntervalMs,
            loop: true,
            callback: () => this.spawnPortal(context)
        });
        context.lifecycle.trackTimer(this.timer);
    }

    spawnPortal(context) {
        if (!context.adapter.isRunning() || this.activeRoom) return;
        this.portal?.destroy?.();
        const w = context.adapter.world.width;
        const h = context.adapter.world.height;
        const x = 80 + Math.random() * (w - 160);
        const y = 80 + Math.random() * (h - 160);
        const art = context.adapter.runtimeArt;
        const portalKey = art?.propKey?.('portal_ring')
            || art?.resolve?.('portal')
            || (context.scene.textures.exists('lw_art_portal_ring') ? 'lw_art_portal_ring' : null)
            || (context.scene.textures.exists('portal_ring') ? 'portal_ring' : null);
        if (portalKey && context.scene.textures.exists(portalKey)) {
            this.portal = context.scene.add.image(x, y, portalKey)
                .setDisplaySize(this.config.portalRadius * 2.6, this.config.portalRadius * 2.6)
                .setAlpha(0.9)
                .setDepth(2);
            context.scene.tweens?.add?.({
                targets: this.portal,
                angle: 360,
                duration: 4000,
                repeat: -1
            });
        } else {
            this.portal = context.scene.add.circle(x, y, this.config.portalRadius, this.config.color, 0.35)
                .setStrokeStyle(3, this.config.color, 0.9);
        }
        this.portalX = x;
        this.portalY = y;
    }

    update(context, _time, delta) {
        if (!this.installed || !context.adapter.isRunning()) return;
        if (this.activeRoom) {
            this.roomLeft -= delta / 1000;
            this.hud?.setText(`异界房间 · 剩余 ${Math.ceil(this.roomLeft)}s · 难度×${this.config.difficultyMultiplier}`);
            if (this.roomLeft <= 0) this.exitRoom(context);
            return;
        }
        if (this.portal && context.player) {
            const d = Math.hypot(context.player.x - this.portalX, context.player.y - this.portalY);
            if (d <= this.config.portalRadius + 14) this.enterRoom(context);
            else this.hud?.setText('传送门已开启 — 靠近进入');
        } else {
            this.hud?.setText('');
        }
    }

    enterRoom(context) {
        this.activeRoom = true;
        this.roomLeft = 10;
        this.portal?.destroy?.();
        this.portal = null;
        this.baseSpawn = context.config.enemies.spawnCount;
        this.baseReward = context.config.collectibles.reward?.score;
        context.config.enemies.spawnCount = Math.ceil((this.baseSpawn || 1) * this.config.difficultyMultiplier);
        if (context.config.collectibles.reward) {
            context.config.collectibles.reward.score = Math.ceil(
                (this.baseReward || 1) * this.config.rewardsMultiplier
            );
        }
        // burst spawn
        for (let i = 0; i < 4; i += 1) context.adapter.spawnEnemy();
        context.scene.cameras.main.flash(120, 129, 140, 248);
    }

    exitRoom(context) {
        this.activeRoom = false;
        if (this.baseSpawn != null) context.config.enemies.spawnCount = this.baseSpawn;
        if (this.baseReward != null && context.config.collectibles.reward) {
            context.config.collectibles.reward.score = this.baseReward;
        }
        this.hud?.setText('已离开异界房间');
    }

    uninstall(context) {
        super.uninstall(context);
        this.timer?.remove?.(false);
        this.portal?.destroy?.();
        this.hud?.destroy?.();
        if (context && this.activeRoom) this.exitRoom(context);
    }

    getTestState() {
        return { ...super.getTestState(), activeRoom: this.activeRoom };
    }
}

export { DEFAULT_CONFIG as RANDOM_ROOM_PORTALS_DEFAULT_CONFIG };
