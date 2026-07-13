const DEFAULT_GLOBAL_KEY = '__LW_TEST_HOOKS__';

export default class TestHooks {
    constructor(globalKey = DEFAULT_GLOBAL_KEY) {
        this.globalKey = globalKey;
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
        this.publish();
    }

    update(patch = {}) {
        this.state = {
            ...this.state,
            ...patch
        };
        this.publish();
        return this.state;
    }

    recordError(error) {
        const message = error && error.message ? error.message : String(error);
        this.state.errors = [...this.state.errors, message];
        this.publish();
    }

    publish() {
        if (typeof window !== 'undefined') {
            window[this.globalKey] = this.state;
        }
    }

    snapshot() {
        return { ...this.state, errors: [...this.state.errors] };
    }
}

export { DEFAULT_GLOBAL_KEY };
