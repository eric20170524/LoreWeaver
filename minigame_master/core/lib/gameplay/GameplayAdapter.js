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

    destroy() {
        this.status = 'destroyed';
        this.scene = null;
    }

    end(partialResult = {}) {
        this.result = createNodeResult(partialResult);
        this.status = 'ended';
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
