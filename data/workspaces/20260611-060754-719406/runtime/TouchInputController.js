const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const roundForDebug = (value) => (
    typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * 100) / 100
        : null
);

/**
 * Owns Node scene movement input. The scene remains the public compatibility
 * surface so existing node subclasses can keep using their current methods.
 */
export class TouchInputController {
    constructor(scene) {
        this.scene = scene;
        this.pointerHandlers = null;
        this.lifecycleHandlers = null;
        this.isTornDown = false;
    }

    createEmptyState() {
        return {
            active: false,
            isDown: false,
            pointerId: null,
            startX: null,
            startY: null,
            currentX: null,
            currentY: null,
            knobX: null,
            knobY: null,
            deltaX: 0,
            deltaY: 0,
            vectorX: 0,
            vectorY: 0,
            strength: 0,
            zone: 'lower_drag',
            lastStartedAt: null,
            lastUpdatedAt: null,
            lastReleaseReason: null,
            ignoredReason: null
        };
    }

    setup() {
        this.teardown({ destroyGraphics: true, releaseReason: 'reset' });
        const { scene } = this;
        scene.touchMoveState = this.createEmptyState();
        scene.joystickConfig = {
            radius: 92,
            deadZone: 14,
            defaultX: 132,
            defaultY: scene.height - 150,
            minStartY: Math.floor(scene.height * 0.34)
        };
        scene.touchJoystickBase = scene.add.graphics().setScrollFactor(0).setDepth(40);
        scene.touchJoystickThumb = scene.add.graphics().setScrollFactor(0).setDepth(41);
        this.drawJoystick();

        this.pointerHandlers = {
            down: (pointer) => this.handlePointerDown(pointer),
            move: (pointer) => this.handlePointerMove(pointer),
            up: (pointer) => this.handlePointerUp(pointer)
        };
        scene.input.on('pointerdown', this.pointerHandlers.down);
        scene.input.on('pointermove', this.pointerHandlers.move);
        scene.input.on('pointerup', this.pointerHandlers.up);
        scene.input.on('pointerupoutside', this.pointerHandlers.up);
        this.isTornDown = false;
    }

    registerLifecycleHooks() {
        this.removeLifecycleHooks();
        const { scene } = this;
        this.lifecycleHandlers = {
            shutdown: () => scene.handleNodeSceneShutdown('scene_shutdown'),
            destroy: () => scene.handleNodeSceneShutdown('scene_destroy')
        };
        scene.events.once('shutdown', this.lifecycleHandlers.shutdown);
        scene.events.once('destroy', this.lifecycleHandlers.destroy);
    }

    teardown({ destroyGraphics = true, releaseReason = 'teardown' } = {}) {
        const { scene } = this;
        if (scene.input && this.pointerHandlers) {
            scene.input.off('pointerdown', this.pointerHandlers.down);
            scene.input.off('pointermove', this.pointerHandlers.move);
            scene.input.off('pointerup', this.pointerHandlers.up);
            scene.input.off('pointerupoutside', this.pointerHandlers.up);
        }
        this.pointerHandlers = null;
        this.removeLifecycleHooks();
        this.release(releaseReason, { draw: false });

        if (destroyGraphics) {
            scene.touchJoystickBase?.destroy?.();
            scene.touchJoystickThumb?.destroy?.();
            scene.touchJoystickBase = null;
            scene.touchJoystickThumb = null;
        }
        this.isTornDown = true;
    }

    removeLifecycleHooks() {
        if (!this.lifecycleHandlers) return;
        const { scene } = this;
        scene.events?.off?.('shutdown', this.lifecycleHandlers.shutdown);
        scene.events?.off?.('destroy', this.lifecycleHandlers.destroy);
        this.lifecycleHandlers = null;
    }

    getPointerId(pointer) {
        return pointer?.id ?? pointer?.pointerId ?? 0;
    }

    getInputLockReason() {
        const { scene } = this;
        const sceneKey = scene.sys?.settings?.key;
        if (scene.isGameOver) return 'game_over';
        if (scene.isTransitioning) return 'transitioning';
        if (scene.isPaused) return scene.pauseReason || 'paused';
        if (sceneKey && scene.scene?.isPaused?.(sceneKey)) return 'scene_paused';
        if (scene.scene?.isActive?.('LevelUpScene')) return 'level_up';
        return null;
    }

    canAcceptMovementInput() {
        const { scene } = this;
        const sceneKey = scene.sys?.settings?.key;
        const sceneActive = sceneKey ? scene.scene?.isActive?.(sceneKey) !== false : true;
        const scenePaused = sceneKey ? scene.scene?.isPaused?.(sceneKey) === true : false;
        return Boolean(scene.player?.body) &&
            !scene.isGameOver &&
            !scene.isPaused &&
            !scene.isTransitioning &&
            sceneActive &&
            !scenePaused &&
            scene.scene?.isActive?.('LevelUpScene') !== true;
    }

    enterPause(reason = 'paused') {
        const { scene } = this;
        scene.pauseReason = reason;
        scene.isPaused = true;
        scene.movementMode = 'locked';
        this.release(reason);
        this.stopPlayerMovement();
        scene.physics?.pause?.();
        scene.publishNodeTestState();
    }

    exitPause(reason = 'paused') {
        const { scene } = this;
        if (!scene.pauseReason || scene.pauseReason === reason) scene.pauseReason = null;
        scene.isPaused = false;
        this.release(`${reason}_resume`);
        this.stopPlayerMovement();
        scene.physics?.resume?.();
        scene.movementMode = 'idle';
        scene.publishNodeTestState();
    }

    stopPlayerMovement() {
        this.scene.player?.body?.setVelocity?.(0, 0);
    }

    isMovementZone(pointer) {
        const cfg = this.scene.joystickConfig;
        if (!cfg || !pointer) return false;
        // Right-thumb action cluster must never steal joystick ownership.
        if (this.scene.playerActionController?.isPointerOnActionButton?.(pointer)) return false;
        if (Array.isArray(this.scene.actionInputZones)) {
            const onAction = this.scene.actionInputZones.some((zone) => (
                pointer.x >= zone.x && pointer.x <= zone.x + zone.width &&
                pointer.y >= zone.y && pointer.y <= zone.y + zone.height
            ));
            if (onAction) return false;
        }
        // Keep movement on the lower-left two-thirds so action buttons stay free.
        const maxX = this.scene.width * 0.62;
        return pointer.x >= 0 && pointer.x <= maxX &&
            pointer.y >= cfg.minStartY && pointer.y <= this.scene.height;
    }

    noteIgnoredPointer(pointer, reason) {
        this.scene.touchMoveState = {
            ...this.createEmptyState(),
            isDown: Boolean(pointer?.isDown),
            pointerId: pointer ? this.getPointerId(pointer) : null,
            currentX: roundForDebug(pointer?.x),
            currentY: roundForDebug(pointer?.y),
            lastUpdatedAt: Math.round(this.scene.time?.now || 0),
            ignoredReason: reason
        };
        this.drawJoystick();
        this.scene.publishNodeTestState();
    }

    handlePointerDown(pointer) {
        if (!this.canAcceptMovementInput()) {
            this.noteIgnoredPointer(pointer, this.getInputLockReason() || 'input_locked');
            return;
        }
        if (this.scene.playerActionController?.isPointerOnActionButton?.(pointer)) {
            this.noteIgnoredPointer(pointer, 'action_button_zone');
            return;
        }
        if (!this.isMovementZone(pointer)) {
            this.noteIgnoredPointer(pointer, 'outside_movement_zone');
            return;
        }

        const now = Math.round(this.scene.time?.now || 0);
        const x = clamp(pointer.x, 0, this.scene.width);
        const y = clamp(pointer.y, 0, this.scene.height);
        this.scene.touchMoveState = {
            ...this.createEmptyState(),
            active: true,
            isDown: true,
            pointerId: this.getPointerId(pointer),
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            knobX: x,
            knobY: y,
            lastStartedAt: now,
            lastUpdatedAt: now
        };
        this.updatePointerVector(pointer);
        this.drawJoystick();
        this.scene.publishNodeTestState();
    }

    handlePointerMove(pointer) {
        const state = this.scene.touchMoveState;
        if (!state?.active || state.pointerId !== this.getPointerId(pointer)) return;
        if (!this.canAcceptMovementInput()) {
            this.release(this.getInputLockReason() || 'input_locked');
            this.scene.publishNodeTestState();
            return;
        }
        this.updatePointerVector(pointer);
        this.drawJoystick();
        this.scene.publishNodeTestState();
    }

    handlePointerUp(pointer) {
        const state = this.scene.touchMoveState;
        if (!state?.active || state.pointerId !== this.getPointerId(pointer)) return;
        this.release('pointer_up');
        this.scene.publishNodeTestState();
    }

    updatePointerVector(pointer) {
        const { scene } = this;
        const state = scene.touchMoveState;
        const cfg = scene.joystickConfig;
        if (!state?.active || !cfg) return;
        const x = clamp(pointer.x, 0, scene.width);
        const y = clamp(pointer.y, 0, scene.height);
        const dx = x - state.startX;
        const dy = y - state.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const clampedDistance = Math.min(distance, cfg.radius);
        const unitX = distance > 0 ? dx / distance : 0;
        const unitY = distance > 0 ? dy / distance : 0;
        const strength = distance > cfg.deadZone ? Math.min(distance / cfg.radius, 1) : 0;

        Object.assign(state, {
            isDown: true,
            currentX: x,
            currentY: y,
            knobX: state.startX + unitX * clampedDistance,
            knobY: state.startY + unitY * clampedDistance,
            deltaX: dx,
            deltaY: dy,
            vectorX: strength > 0 ? unitX * strength : 0,
            vectorY: strength > 0 ? unitY * strength : 0,
            strength,
            lastUpdatedAt: Math.round(scene.time?.now || 0),
            ignoredReason: null
        });
    }

    release(reason = 'pointer_up', { draw = true } = {}) {
        this.scene.touchMoveState = {
            ...this.createEmptyState(),
            lastUpdatedAt: Math.round(this.scene.time?.now || 0),
            lastReleaseReason: reason
        };
        if (String(this.scene.movementMode || '').startsWith('touch')) this.scene.movementMode = 'idle';
        if (draw) this.drawJoystick();
    }

    drawJoystick() {
        const { scene } = this;
        const cfg = scene.joystickConfig;
        if (!scene.touchJoystickBase || !scene.touchJoystickThumb || !cfg) return;
        const state = scene.touchMoveState || this.createEmptyState();
        const baseX = state.active ? state.startX : cfg.defaultX;
        const baseY = state.active ? state.startY : cfg.defaultY;
        const knobX = state.active ? (state.knobX ?? baseX) : baseX;
        const knobY = state.active ? (state.knobY ?? baseY) : baseY;
        const baseAlpha = state.active ? 0.42 : 0.18;
        const strokeAlpha = state.active ? 0.78 : 0.38;
        const thumbAlpha = state.active ? 0.72 : 0.34;

        scene.touchJoystickBase.clear();
        scene.touchJoystickBase.fillStyle(0x071316, baseAlpha);
        scene.touchJoystickBase.fillCircle(baseX, baseY, cfg.radius);
        scene.touchJoystickBase.lineStyle(3, 0x80ffea, strokeAlpha);
        scene.touchJoystickBase.strokeCircle(baseX, baseY, cfg.radius);
        scene.touchJoystickBase.lineStyle(1, 0xffffff, 0.18);
        scene.touchJoystickBase.strokeCircle(baseX, baseY, cfg.deadZone);
        scene.touchJoystickThumb.clear();
        scene.touchJoystickThumb.fillStyle(0x80ffea, thumbAlpha);
        scene.touchJoystickThumb.fillCircle(knobX, knobY, 30);
        scene.touchJoystickThumb.lineStyle(2, 0xffffff, state.active ? 0.72 : 0.28);
        scene.touchJoystickThumb.strokeCircle(knobX, knobY, 30);
    }

    getKeyboardMovementVector() {
        const { cursors, wasd } = this.scene;
        let x = 0;
        let y = 0;
        if (cursors?.left?.isDown || wasd?.left?.isDown) x = -1;
        else if (cursors?.right?.isDown || wasd?.right?.isDown) x = 1;
        if (cursors?.up?.isDown || wasd?.up?.isDown) y = -1;
        else if (cursors?.down?.isDown || wasd?.down?.isDown) y = 1;
        return { x, y, active: x !== 0 || y !== 0 };
    }

    getMovementVector() {
        const keyboard = this.getKeyboardMovementVector();
        let x = keyboard.x;
        let y = keyboard.y;
        let mode = keyboard.active ? 'keyboard' : 'idle';
        const touch = this.scene.touchMoveState;
        if (!keyboard.active && touch?.active) {
            x = touch.vectorX;
            y = touch.vectorY;
            mode = touch.strength > 0 ? 'touch-drag' : 'touch-hold';
        }
        if (x !== 0 && y !== 0) {
            const length = Math.sqrt(x * x + y * y);
            x /= length;
            y /= length;
        }
        return { x, y, mode };
    }

    getPointerTestState() {
        const state = this.scene.touchMoveState || this.createEmptyState();
        return {
            active: Boolean(state.active),
            isDown: Boolean(state.isDown),
            pointerId: state.pointerId,
            zone: state.zone,
            start: { x: roundForDebug(state.startX), y: roundForDebug(state.startY) },
            current: { x: roundForDebug(state.currentX), y: roundForDebug(state.currentY) },
            delta: { x: roundForDebug(state.deltaX), y: roundForDebug(state.deltaY) },
            vector: { x: roundForDebug(state.vectorX), y: roundForDebug(state.vectorY) },
            strength: roundForDebug(state.strength) || 0,
            lastStartedAt: state.lastStartedAt,
            lastUpdatedAt: state.lastUpdatedAt,
            lastReleaseReason: state.lastReleaseReason,
            ignoredReason: state.ignoredReason
        };
    }

    getDebugState() {
        return {
            listenersRegistered: Boolean(this.pointerHandlers),
            lifecycleHooksRegistered: Boolean(this.lifecycleHandlers),
            tornDown: this.isTornDown,
            inputLockReason: this.getInputLockReason(),
            pointer: this.getPointerTestState()
        };
    }
}

export default TouchInputController;
