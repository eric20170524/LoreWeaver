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

    registerObservationControls() {
        const hooks = this.context?.testHooks;
        if (!hooks?.registerControl || !this.scene) return;
        const sceneKey = this.scene?.sys?.settings?.key || null;
        const scenePlugin = this.scene?.scene;

        if (scenePlugin?.pause && scenePlugin?.resume) {
            hooks.registerControl('pause', () => {
                if (this.status !== 'running') {
                    throw new Error(`adapter_not_running:${this.status}`);
                }
                this.pause();
                this.updateObservationState({ paused: true });
                scenePlugin.pause(sceneKey || undefined);
                return { sceneKey, status: this.status };
            });
            hooks.registerControl('resume', () => {
                if (this.status !== 'paused') {
                    throw new Error(`adapter_not_paused:${this.status}`);
                }
                scenePlugin.resume(sceneKey || undefined);
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
        // exact-frame advance is deliberately NOT registered here. It requires a
        // runtime clock that advances update + physics + timers + tweens + animation
        // deterministically as one authority; ordinary waits are not sufficient.
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
