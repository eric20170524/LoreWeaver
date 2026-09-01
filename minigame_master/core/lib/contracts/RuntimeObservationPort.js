const DEFAULT_OBSERVATION_GLOBAL_KEY = '__LOREWEAVER_RUNTIME_OBSERVATION__';
const OBSERVATION_SCHEMA_VERSION = 'loreweaver.runtime-observation.v1';
const SNAPSHOT_SCHEMA_VERSION = 'loreweaver.runtime-observation-snapshot.v1';
const TRACE_SCHEMA_VERSION = 'loreweaver.runtime-observation-trace.v1';
const SUPPORTED_CONTROLS = Object.freeze([
    'activate',
    'pause',
    'resume',
    'semanticInput',
    'advanceFrames'
]);

function clone(value) {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function sessionId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `runtime-${Date.now().toString(36)}-${random}`;
}

/**
 * Read/observe contract over the authoritative LoreWeaver runtime hooks.
 *
 * Control operations are unsupported until the owning scene/adapter registers a
 * real handler. In particular, exact-frame advance stays false unless a handler
 * can advance Phaser update, timers, tweens and physics together.
 */
export default class RuntimeObservationPort {
    constructor({
        globalKey = DEFAULT_OBSERVATION_GLOBAL_KEY,
        sourceHooksKey = null,
        maxTraceEntries = 256,
        runtimeAuthority = 'LoreWeaverRuntimeKernel'
    } = {}) {
        this.globalKey = globalKey;
        this.sourceHooksKey = sourceHooksKey;
        this.maxTraceEntries = Math.max(16, Number(maxTraceEntries) || 256);
        this.runtimeAuthority = runtimeAuthority;
        this.sessionId = sessionId();
        this.sequence = 0;
        this.latestState = null;
        this.traceEntries = [];
        this.controls = new Map();
        this.ended = false;
        this.endReason = null;
        this.publish();
    }

    capabilities() {
        const registered = (name) => this.controls.has(name);
        return {
            snapshot: true,
            trace: true,
            clearTrace: true,
            activate: registered('activate'),
            pause: registered('pause'),
            resume: registered('resume'),
            semanticInput: registered('semanticInput'),
            exactFrameAdvance: registered('advanceFrames'),
            screenshot: 'host_owned',
            console: 'host_owned',
            network: 'host_owned'
        };
    }

    capture(state, { type = 'state', detail = null } = {}) {
        this.sequence += 1;
        this.latestState = clone(state);
        const entry = {
            sequence: this.sequence,
            observedAt: nowIso(),
            type,
            detail: clone(detail),
            state: clone(this.latestState)
        };
        this.traceEntries.push(entry);
        if (this.traceEntries.length > this.maxTraceEntries) {
            this.traceEntries.splice(0, this.traceEntries.length - this.maxTraceEntries);
        }
        this.publish();
        return this.snapshot();
    }

    snapshot() {
        return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            runtimeAuthority: this.runtimeAuthority,
            sessionId: this.sessionId,
            sequence: this.sequence,
            observedAt: nowIso(),
            sourceHooksKey: this.sourceHooksKey,
            ended: this.ended,
            endReason: this.endReason,
            capabilities: this.capabilities(),
            state: clone(this.latestState)
        };
    }

    trace() {
        return {
            schemaVersion: TRACE_SCHEMA_VERSION,
            runtimeAuthority: this.runtimeAuthority,
            sessionId: this.sessionId,
            sourceHooksKey: this.sourceHooksKey,
            ended: this.ended,
            endReason: this.endReason,
            entryCount: this.traceEntries.length,
            firstSequence: this.traceEntries[0]?.sequence ?? null,
            lastSequence: this.traceEntries.at(-1)?.sequence ?? null,
            entries: clone(this.traceEntries)
        };
    }

    clearTrace() {
        this.traceEntries = [];
        this.publish();
        return this.trace();
    }

    registerControl(name, handler) {
        if (!SUPPORTED_CONTROLS.includes(name)) {
            throw new Error(`Unknown runtime observation control: ${name}`);
        }
        if (typeof handler !== 'function') {
            throw new Error(`Runtime observation control '${name}' requires a function`);
        }
        this.controls.set(name, handler);
        this.capture(this.latestState, {
            type: 'control_registered',
            detail: { name }
        });
        return this.capabilities();
    }

    unregisterControl(name) {
        this.controls.delete(name);
        this.capture(this.latestState, {
            type: 'control_unregistered',
            detail: { name }
        });
        return this.capabilities();
    }

    invoke(name, payload = null) {
        if (!SUPPORTED_CONTROLS.includes(name)) {
            const result = {
                status: 'blocked',
                reason: `unknown_control:${name}`,
                control: name,
                sessionId: this.sessionId
            };
            this.capture(this.latestState, { type: 'control_blocked', detail: result });
            return result;
        }
        const handler = this.controls.get(name);
        if (!handler) {
            const result = {
                status: 'unsupported',
                reason: `control_not_registered:${name}`,
                control: name,
                sessionId: this.sessionId,
                capabilities: this.capabilities()
            };
            this.capture(this.latestState, { type: 'control_unsupported', detail: result });
            return result;
        }
        try {
            const value = handler(clone(payload));
            if (value && typeof value.then === 'function') {
                return value.then((resolved) => {
                    const result = {
                        status: 'passed',
                        control: name,
                        sessionId: this.sessionId,
                        result: clone(resolved)
                    };
                    this.capture(this.latestState, { type: 'control_passed', detail: result });
                    return result;
                }).catch((error) => {
                    const result = {
                        status: 'failed',
                        control: name,
                        sessionId: this.sessionId,
                        error: error?.message || String(error)
                    };
                    this.capture(this.latestState, { type: 'control_failed', detail: result });
                    return result;
                });
            }
            const result = {
                status: 'passed',
                control: name,
                sessionId: this.sessionId,
                result: clone(value)
            };
            this.capture(this.latestState, { type: 'control_passed', detail: result });
            return result;
        } catch (error) {
            const result = {
                status: 'failed',
                control: name,
                sessionId: this.sessionId,
                error: error?.message || String(error)
            };
            this.capture(this.latestState, { type: 'control_failed', detail: result });
            return result;
        }
    }

    end(reason = 'runtime_session_ended') {
        this.ended = true;
        this.endReason = String(reason || 'runtime_session_ended');
        this.capture(this.latestState, {
            type: 'session_ended',
            detail: { reason: this.endReason }
        });
        return this.snapshot();
    }

    publicApi() {
        return {
            schemaVersion: OBSERVATION_SCHEMA_VERSION,
            runtimeAuthority: this.runtimeAuthority,
            sessionId: this.sessionId,
            sourceHooksKey: this.sourceHooksKey,
            capabilities: () => clone(this.capabilities()),
            snapshot: () => this.snapshot(),
            trace: () => this.trace(),
            clearTrace: () => this.clearTrace(),
            activate: (payload) => this.invoke('activate', payload),
            pause: (payload) => this.invoke('pause', payload),
            resume: (payload) => this.invoke('resume', payload),
            input: (payload) => this.invoke('semanticInput', payload),
            advanceFrames: (payload) => this.invoke('advanceFrames', payload)
        };
    }

    publish() {
        if (typeof window !== 'undefined') {
            window[this.globalKey] = this.publicApi();
        }
    }
}

export {
    DEFAULT_OBSERVATION_GLOBAL_KEY,
    OBSERVATION_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION,
    TRACE_SCHEMA_VERSION,
    SUPPORTED_CONTROLS
};