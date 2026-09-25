import SideScrollingBrawlerAdapter from './SideScrollingBrawlerAdapter.js';

/**
 * Production-facing compatibility layer for the legacy belt-scroll runtime.
 *
 * The underlying adapter remains the source of truth for waves, life stock,
 * continues and modifiers. This layer only closes host/card contract gaps:
 * 1) score-based host objectives must never bypass all-clear settlement;
 * 2) successful settlement reports the card-owned `all_clear` reason;
 * 3) touch input provides real lane movement, not attack-only taps.
 */
export default class CertifiedSideScrollingBrawlerAdapter extends SideScrollingBrawlerAdapter {
    constructor(context = {}) {
        super(context);
        this.touchMoveTarget = null;
        this.touchPointerId = null;
    }

    setupInput() {
        super.setupInput();
        const input = this.scene?.input;
        if (!input?.on) return;

        const readPoint = (pointer = {}) => ({
            x: Number(pointer.worldX ?? pointer.x ?? 0),
            y: Number(pointer.worldY ?? pointer.y ?? 0)
        });
        const isMovementZone = (pointer = {}) => Number(pointer.y ?? pointer.worldY ?? 0) <= this.scene.scale.height * 0.75;
        const pointerId = (pointer = {}) => pointer.id ?? pointer.pointerId ?? 0;
        const isTouchPointer = (pointer = {}) => Boolean(pointer.wasTouch)
            || String(pointer.event?.pointerType || pointer.pointerType || '').toLowerCase() === 'touch';

        const isTouchControl = (currentlyOver = []) => currentlyOver.some((object) =>
            Object.entries(this.ui).some(([key, control]) => key.startsWith('touch') && control === object));
        const onDown = (pointer, currentlyOver = []) => {
            if (isTouchControl(currentlyOver)) {
                this.touchMoveTarget = null;
                this.touchPointerId = null;
                return;
            }
            if (!this.isRunning() || !isMovementZone(pointer)) return;
            this.touchPointerId = pointerId(pointer);
            this.touchMoveTarget = readPoint(pointer);
        };
        const onMove = (pointer) => {
            if (!this.isRunning() || this.touchMoveTarget == null) return;
            if (this.touchPointerId != null && pointerId(pointer) !== this.touchPointerId) return;
            if (pointer.isDown === false || !isMovementZone(pointer)) return;
            this.touchMoveTarget = readPoint(pointer);
        };
        const onUp = (pointer) => {
            if (this.touchMoveTarget == null) return;
            if (this.touchPointerId != null && pointerId(pointer) !== this.touchPointerId) return;
            if (isTouchPointer(pointer) && isMovementZone(pointer)) {
                // A real touch tap becomes a destination. Drag is still supported
                // while the finger is down; desktop mouse release stops movement.
                this.touchMoveTarget = readPoint(pointer);
                this.touchPointerId = null;
                return;
            }
            this.touchMoveTarget = null;
            this.touchPointerId = null;
        };

        input.on('pointerdown', onDown);
        input.on('pointermove', onMove);
        input.on('pointerup', onUp);
        input.on('pointerupoutside', onUp);
        this.lifecycle?.addCleanup?.(() => {
            input.off?.('pointerdown', onDown);
            input.off?.('pointermove', onMove);
            input.off?.('pointerup', onUp);
            input.off?.('pointerupoutside', onUp);
            this.touchMoveTarget = null;
            this.touchPointerId = null;
        });
    }

    handleMovement(delta) {
        if (!this.touchMoveTarget || !this.player) {
            super.handleMovement(delta);
            return;
        }

        const target = this.touchMoveTarget;
        let dx = target.x - this.player.x;
        let dy = target.y - this.player.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 6) {
            this.touchMoveTarget = null;
            this.touchPointerId = null;
            return;
        }

        dx /= distance || 1;
        dy /= distance || 1;
        this.state.facing = dx === 0 ? this.state.facing : (dx > 0 ? 1 : -1);
        this.state.lastInput.left = dx < -0.05;
        this.state.lastInput.right = dx > 0.05;
        this.state.lastInput.up = dy < -0.05;
        this.state.lastInput.down = dy > 0.05;

        const speed = Number(this.config.player?.speed || 180);
        const yScale = Number(this.lane?.ySpeedScale ?? 0.78);
        const dt = Math.max(0, Number(delta || 0)) / 1000;
        const step = Math.min(distance, speed * dt);
        let nextX = this.player.x + dx * step;
        let nextY = this.player.y + dy * step * yScale;

        const radius = Number(this.config.player?.radius || this.player.radius || 16);
        const cam = this.scene.cameras.main;
        const scrollX = Number(cam.scrollX || 0);
        const minX = this.state.locked && this.cameraLock
            ? Number(this.cameraLock.left) + radius
            : scrollX + radius;
        const maxX = this.state.locked && this.cameraLock
            ? Number(this.cameraLock.right) - radius
            : Math.min(this.world.width - radius, scrollX + this.scene.scale.width - radius);

        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(this.lane.top + radius, Math.min(this.lane.bottom - radius, nextY));
        if (!this.state.locked) {
            const nextWave = this.config.waveList[this.state.waveIndex];
            if (nextWave) nextX = Math.min(nextX, nextWave.triggerX + 40);
        }

        this.player.x = nextX;
        this.player.y = nextY;
        this.player.setScale?.(1, 0.85 + ((nextY - this.lane.top) / (this.lane.bottom - this.lane.top)) * 0.25);
    }

    refreshHud() {
        const lifecycleState = String(this.lifecycle?.state || '');
        if (
            this.status === 'ended'
            || this.status === 'destroyed'
            || lifecycleState === 'ending'
            || lifecycleState === 'ended'
            || lifecycleState === 'destroyed'
        ) {
            return;
        }
        super.refreshHud();
    }

    finish(success, reason = null) {
        if (success && reason === 'objective_met') {
            const allWavesCleared = this.state.waveIndex >= this.config.waveList.length;
            const noLivingEnemies = this.enemies.every((enemy) => !enemy.alive);
            if (!allWavesCleared || !noLivingEnemies) {
                // GameRunner has a generic score-goal fallback for numeric cards.
                // Brawler victory is contractual all-clear, so ignore that fallback.
                return this.result;
            }
            return super.finish(true, 'all_clear');
        }
        if (success && (reason == null || reason === 'completed')) {
            return super.finish(true, 'all_clear');
        }
        return super.finish(success, reason);
    }

    getTestState() {
        return {
            ...super.getTestState(),
            touchMoving: Boolean(this.touchMoveTarget)
        };
    }

    destroy() {
        this.touchMoveTarget = null;
        this.touchPointerId = null;
        super.destroy();
    }
}
