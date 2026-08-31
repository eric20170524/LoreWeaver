import { createNodeResult, NODE_RESULT_REASONS } from '../contracts/NodeContracts.js';
import { normalizePlayabilityKnobs } from '../contracts/PlayabilityContract.js';

export default class GameplayAdapter {
    constructor(context = {}) {
        this.context = context;
        this.payload = null;
        this.scene = null;
        this.status = 'idle';
        this.result = null;
        /** @type {object|null} normalized playability knobs after init */
        this.playability = null;
        this.observationControls = new Set();
    }

    /**
     * Read and normalize playability knobs from a node payload.
     * Adapters should call this from init() instead of inventing field aliases.
     */
    readPlayabilityKnobs(payload = {}, cardId = '') {
        const nodeConfig = payload.nodeConfig || {};
        const gameplay = nodeConfig.gameplay || {};
        const knobs = gameplay.knobs || nodeConfig.knobs || {};
        const card = cardId || gameplay.cardId || knobs.cardId || knobs.runtimeCardId || '';
        const node = {
            durationLimit: nodeConfig.duration ?? nodeConfig.durationLimit,
            goalValue: nodeConfig.goalValue ?? nodeConfig.rewards?.score,
            gameplay: { cardId: card }
        };
        this.playability = normalizePlayabilityKnobs(card, knobs, node);
        return this.playability;
    }

    init(payload = {}) {
        this.payload = payload;
        this.status = 'initialized';
        return this;
    }

    create(scene) {
        this.scene = scene;
        this.status = 'running';
        this.registerObservationControls();
        return this;
    }

    update(_time, _delta) {}

    pause() {
        if (this.status === 'running') {
            this.status = 'paused';
        }
    }

    resume() {
        if (this.status === 'paused') {
            this.status = 'running';
        }
    }

    observationStatePatch(extra = {}) {
        const testState = typeof this.getTestState === 'function' ? this.getTestState() : {};
        return {
            adapterId: this.constructor.name,
            status: this.status,
            ...testState,
            ...extra
        };
    }

    updateObservationState(extra = {}) {
        const hooks = this.context?.testHooks;
        if (hooks?.update) hooks.update(this.observationStatePatch(extra));
    }

    semanticActions() {
        const actions = [];
        if (this.playability?.allowQuit !== false && typeof this.retreat === 'function') {
            actions.push('retreat');
        }
        // Target-point movement is a real adapter surface used by survivor-style
        // pointer movement. Other adapters simply do not claim this action.
        if (this.targetPoint && typeof this.targetPoint === 'object') {
            actions.push('move');
        }
        if (typeof this.primaryAction === 'function') {
            actions.push('primary');
        }
        return actions;
    }

    handleSemanticInput(payload = {}) {
        const action = String(payload?.action || '').trim();
        if (!action) throw new Error('semantic_action_required');
        if (!this.semanticActions().includes(action)) {
            throw new Error(`semantic_action_unsupported:${action}`);
        }
        if (action === 'retreat') {
            return this.retreat();
        }
        if (action === 'move') {
            const x = Number(payload?.x);
            const y = Number(payload?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                throw new Error('semantic_move_requires_finite_x_y');
            }
            this.targetPoint.x = x;
            this.targetPoint.y = y;
            this.updateObservationState({ semanticAction: { action, x, y } });
            return { action, x, y };
        }
        if (action === 'primary') {
            return this.primaryAction(payload);
        }
        throw new Error(`semantic_action_unsupported:${action}`);
    }

    runtimeFrameSurface() {
        const systems = this.scene?.sys;
        const game = systems?.game || this.scene?.game;
        const loop = game?.loop;
        const valid = Boolean(
            systems &&
            typeof systems.pause === 'function' &&
            typeof systems.resume === 'function' &&
            game &&
            game.isPaused !== true &&
            loop &&
            typeof loop.sleep === 'function' &&
            typeof loop.wake === 'function' &&
            typeof loop.step === 'function' &&
            Number.isFinite(Number(loop.targetFps)) &&
            Number(loop.targetFps) > 0
        );
        return valid ? { systems, game, loop } : null;
    }

    advanceExactFrames(payload = {}) {
        const surface = this.runtimeFrameSurface();
        if (!surface) throw new Error('exact_frame_surface_unavailable');
        if (this.status !== 'paused') {
            throw new Error(`exact_frame_requires_paused_adapter:${this.status}`);
        }
        const frames = Number(payload?.frames);
        if (!Number.isInteger(frames) || frames < 1 || frames > 600) {
            throw new Error(`exact_frame_count_invalid:${payload?.frames}`);
        }

        const { systems, game, loop } = surface;
        const fps = loop.hasFpsLimit && Number(loop.fpsLimit) > 0
            ? Number(loop.fpsLimit)
            : Number(loop.targetFps);
        const deltaMs = 1000 / fps;
        const wasRunning = Boolean(loop.running);
        const previousSmoothStep = loop.smoothStep;
        const initialFrame = Number(loop.frame || 0);
        const initialLastTime = Number.isFinite(Number(loop.lastTime))
            ? Number(loop.lastTime)
            : (Number.isFinite(Number(loop.now)) ? Number(loop.now) : 0);
        let virtualTime = initialLastTime;
        let manuallyResumed = false;

        try {
            if (wasRunning) loop.sleep();
            // Use Systems directly rather than the queued ScenePlugin API. This
            // makes the pause boundary synchronous before manual TimeStep steps.
            systems.resume({ source: 'runtime_observation_exact_frame' });
            this.resume();
            manuallyResumed = true;

            // TimeStep.step normally smooths browser RAF jitter. For an exact
            // manual frame contract we temporarily disable smoothing and advance by
            // the configured engine frame interval. TimeStep.step itself updates
            // its time/frame counters and invokes the canonical Game.step callback.
            loop.smoothStep = false;
            for (let index = 0; index < frames; index += 1) {
                virtualTime += deltaMs;
                loop.step(virtualTime);
            }
        } finally {
            loop.smoothStep = previousSmoothStep;
            if (manuallyResumed && this.status === 'running') {
                systems.pause({ source: 'runtime_observation_exact_frame' });
                this.pause();
            }
            if (wasRunning && !loop.running) {
                // The target scene is paused again before waking RAF, so the
                // TimeStep wake tick cannot add an uncounted target-scene update.
                loop.wake(true);
            }
        }

        const result = {
            frames,
            fps,
            deltaMs,
            initialFrame,
            finalFrame: Number(loop.frame || initialFrame),
            initialTime: initialLastTime,
            finalTime: Number(loop.lastTime || virtualTime),
            targetSceneStatus: this.status,
            loopRestored: wasRunning ? Boolean(loop.running) : !loop.running,
            method: 'Phaser.TimeStep.step -> Phaser.Game.step'
        };
        this.updateObservationState({ exactFrameAdvance: result, paused: this.status === 'paused' });
        return result;
    }

    registerObservationControls() {
        const hooks = this.context?.testHooks;
        if (!hooks?.registerControl || !this.scene) return;
        const sceneKey = this.scene?.sys?.settings?.key || null;
        const systems = this.scene?.sys;

        if (typeof systems?.pause === 'function' && typeof systems?.resume === 'function') {
            hooks.registerControl('pause', (payload = {}) => {
                if (this.status !== 'running') {
                    throw new Error(`adapter_not_running:${this.status}`);
                }
                // Systems.pause is immediate. ScenePlugin.pause queues an operation
                // for the next SceneManager step, which is too weak for exact-frame
                // observation because another RAF could otherwise slip through.
                systems.pause(payload);
                this.pause();
                this.updateObservationState({ paused: true });
                return { sceneKey, status: this.status };
            });
            hooks.registerControl('resume', (payload = {}) => {
                if (this.status !== 'paused') {
                    throw new Error(`adapter_not_paused:${this.status}`);
                }
                systems.resume(payload);
                this.resume();
                this.updateObservationState({ paused: false });
                return { sceneKey, status: this.status };
            });
            this.observationControls.add('pause');
            this.observationControls.add('resume');
        }

        if (this.semanticActions().length > 0) {
            hooks.registerControl('semanticInput', (payload) => this.handleSemanticInput(payload || {}));
            this.observationControls.add('semanticInput');
        }

        if (this.runtimeFrameSurface()) {
            hooks.registerControl('advanceFrames', (payload) => this.advanceExactFrames(payload || {}));
            this.observationControls.add('advanceFrames');
        }
    }

    unregisterObservationControls() {
        const hooks = this.context?.testHooks;
        for (const name of this.observationControls) {
            hooks?.unregisterControl?.(name);
        }
        this.observationControls.clear();
    }

    destroy() {
        this.unregisterObservationControls();
        this.status = 'destroyed';
        this.scene = null;
    }

    end(partialResult = {}) {
        this.result = createNodeResult(partialResult);
        this.status = 'ended';
        this.updateObservationState({ lastResult: this.result });
        return this.result;
    }

    retreat() {
        // Must notify host (GameRunner) — bare end() leaves the scene stuck.
        if (typeof this.finish === 'function') {
            return this.finish(false, NODE_RESULT_REASONS.RETREATED);
        }
        const result = this.end({
            success: false,
            reason: NODE_RESULT_REASONS.RETREATED
        });
        this.context?.onEnd?.(result, this);
        return result;
    }

    getTestState() {
        return {
            adapter: this.constructor.name,
            status: this.status,
            nodeId: this.payload?.nodeId || null,
            lastResult: this.result,
            semanticActions: this.semanticActions(),
            playability: this.playability
                ? {
                      goalValue: this.playability.goalValue,
                      needAmount: this.playability.needAmount,
                      durationSec: this.playability.durationSec,
                      victoryMode: this.playability.victoryMode,
                      allowQuit: this.playability.allowQuit
                  }
                : null
        };
    }
}
