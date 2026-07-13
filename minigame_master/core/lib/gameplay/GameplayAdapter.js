import { createNodeResult, NODE_RESULT_REASONS } from '../contracts/NodeContracts.js';

export default class GameplayAdapter {
    constructor(context = {}) {
        this.context = context;
        this.payload = null;
        this.scene = null;
        this.status = 'idle';
        this.result = null;
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
        return this.end({
            success: false,
            reason: NODE_RESULT_REASONS.RETREATED
        });
    }

    getTestState() {
        return {
            adapter: this.constructor.name,
            status: this.status,
            nodeId: this.payload?.nodeId || null,
            lastResult: this.result
        };
    }
}
