import RuntimeObservationPort, {
    DEFAULT_OBSERVATION_GLOBAL_KEY
} from './RuntimeObservationPort.js';

const DEFAULT_GLOBAL_KEY = '__LW_TEST_HOOKS__';

function clone(value) {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
}

/**
 * Structured runtime hooks used by browser E2E and soak tests.
 *
 * The legacy state global remains unchanged. A separate observation facade adds
 * immutable snapshots and a bounded same-session trace. Runtime controls remain
 * unsupported until the owning scene/adapter registers a real handler.
 */
export default class TestHooks {
    constructor(globalKey = DEFAULT_GLOBAL_KEY, {
        observationGlobalKey = DEFAULT_OBSERVATION_GLOBAL_KEY,
        maxTraceEntries = 256
    } = {}) {
        this.globalKey = globalKey;
        this.observation = new RuntimeObservationPort({
            globalKey: observationGlobalKey,
            sourceHooksKey: globalKey,
            maxTraceEntries,
            runtimeAuthority: 'LoreWeaverRuntimeKernel'
        });
        this.state = {
            sceneKey: null,
            nodeId: null,
            adapterId: null,
            status: 'idle',
            hp: null,
            progress: 0,
            timer: null,
            score: 0,
            lastResult: null,
            errors: []
        };
        this.publish('initialized');
    }

    update(patch = {}) {
        this.state = {
            ...this.state,
            ...patch
        };
        this.publish('state_update', { keys: Object.keys(patch || {}) });
        return this.state;
    }

    recordError(error) {
        const message = error && error.message ? error.message : String(error);
        this.state.errors = [...this.state.errors, message];
        this.publish('error', { message });
    }

    registerControl(name, handler) {
        return this.observation.registerControl(name, handler);
    }

    unregisterControl(name) {
        return this.observation.unregisterControl(name);
    }

    observationSnapshot() {
        return this.observation.snapshot();
    }

    observationTrace() {
        return this.observation.trace();
    }

    endObservation(reason = 'test_hooks_ended') {
        return this.observation.end(reason);
    }

    publish(type = 'state', detail = null) {
        if (typeof window !== 'undefined') {
            window[this.globalKey] = this.state;
        }
        this.observation.capture(this.state, { type, detail });
    }

    snapshot() {
        return clone(this.state);
    }
}

export { DEFAULT_GLOBAL_KEY, DEFAULT_OBSERVATION_GLOBAL_KEY };