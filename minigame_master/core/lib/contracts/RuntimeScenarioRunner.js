const SCHEMA_VERSION = 'loreweaver.runtime-scenario.v1';
const RESULT_VERSION = 'loreweaver.runtime-scenario-result.v1';
const STEP_TYPES = new Set(['input', 'pause', 'resume', 'advance_frames', 'assert']);
const ASSERT_OPERATORS = new Set(['exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes']);
const CAPABILITY_BY_STEP = Object.freeze({
    input: 'semanticInput',
    pause: 'pause',
    resume: 'resume',
    advance_frames: 'exactFrameAdvance'
});

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function fnv1a32(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function scenarioHash(scenario) {
    return `fnv1a32:${fnv1a32(stableJson(scenario))}`;
}

function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function validateRuntimeScenario(scenario = {}) {
    const errors = [];
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
        return { valid: false, errors: ['scenario_not_object'] };
    }
    if (scenario.schemaVersion !== SCHEMA_VERSION) errors.push('schema_version_invalid');
    if (!nonEmpty(scenario.id) || !/^[A-Za-z0-9._-]+$/.test(scenario.id)) errors.push('scenario_id_invalid');
    if (!nonEmpty(scenario.title)) errors.push('scenario_title_required');
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) errors.push('scenario_steps_required');

    const ids = new Set();
    for (const [index, step] of (scenario.steps || []).entries()) {
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            errors.push(`step_not_object:${index}`);
            continue;
        }
        const id = String(step.id || '').trim();
        if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) errors.push(`step_id_invalid:${index}`);
        else if (ids.has(id)) errors.push(`step_id_duplicate:${id}`);
        else ids.add(id);
        if (!STEP_TYPES.has(step.type)) errors.push(`step_type_invalid:${id || index}:${step.type || 'missing'}`);
        if (step.type === 'input' && (!step.payload || typeof step.payload !== 'object')) {
            errors.push(`input_payload_required:${id || index}`);
        }
        if (step.type === 'advance_frames' && (!Number.isInteger(step.frames) || step.frames < 1 || step.frames > 600)) {
            errors.push(`advance_frames_invalid:${id || index}`);
        }
        if (step.settleMs !== undefined && (!Number.isInteger(step.settleMs) || step.settleMs < 0 || step.settleMs > 10000)) {
            errors.push(`settle_ms_invalid:${id || index}`);
        }
        if (step.assertions !== undefined && !Array.isArray(step.assertions)) {
            errors.push(`assertions_must_be_array:${id || index}`);
        }
        for (const [assertIndex, assertion] of (step.assertions || []).entries()) {
            if (!assertion || typeof assertion !== 'object') {
                errors.push(`assertion_not_object:${id || index}:${assertIndex}`);
                continue;
            }
            if (!nonEmpty(assertion.path)) errors.push(`assertion_path_required:${id || index}:${assertIndex}`);
            if (!ASSERT_OPERATORS.has(assertion.operator)) {
                errors.push(`assertion_operator_invalid:${id || index}:${assertIndex}:${assertion.operator || 'missing'}`);
            }
        }
    }

    const required = scenario.requiredCapabilities || [];
    if (!Array.isArray(required)) errors.push('required_capabilities_must_be_array');
    else {
        for (const capability of required) {
            if (!['pause', 'resume', 'semanticInput', 'exactFrameAdvance'].includes(capability)) {
                errors.push(`required_capability_invalid:${capability}`);
            }
        }
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function getPath(root, pathExpression) {
    const tokens = String(pathExpression || '')
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .map((token) => token.trim())
        .filter(Boolean);
    let value = root;
    for (const token of tokens) {
        if (value == null || (typeof value !== 'object' && !Array.isArray(value))) {
            return { exists: false, value: undefined };
        }
        if (!(token in value)) return { exists: false, value: undefined };
        value = value[token];
    }
    return { exists: true, value };
}

function evaluateAssertion(state, assertion) {
    const resolved = getPath(state, assertion.path);
    const expected = assertion.value;
    const actual = resolved.value;
    let passed = false;
    switch (assertion.operator) {
        case 'exists': passed = resolved.exists; break;
        case 'eq': passed = resolved.exists && actual === expected; break;
        case 'neq': passed = !resolved.exists || actual !== expected; break;
        case 'gt': passed = resolved.exists && actual > expected; break;
        case 'gte': passed = resolved.exists && actual >= expected; break;
        case 'lt': passed = resolved.exists && actual < expected; break;
        case 'lte': passed = resolved.exists && actual <= expected; break;
        case 'includes':
            passed = resolved.exists && (
                (Array.isArray(actual) && actual.includes(expected)) ||
                (typeof actual === 'string' && actual.includes(String(expected)))
            );
            break;
        default: passed = false;
    }
    return {
        path: assertion.path,
        operator: assertion.operator,
        expected: clone(expected),
        actual: clone(actual),
        exists: resolved.exists,
        passed
    };
}

function requiredCapabilities(scenario) {
    const required = new Set(scenario.requiredCapabilities || []);
    for (const step of scenario.steps || []) {
        const capability = CAPABILITY_BY_STEP[step.type];
        if (capability) required.add(capability);
    }
    return [...required];
}

function failResult(base, status, reason, extra = {}) {
    return {
        ...base,
        status,
        passed: false,
        reason,
        ...extra
    };
}

/**
 * Run a replayable semantic scenario against an already-published
 * RuntimeObservationPort public API. This runner owns no clock, scene, physics or
 * input implementation; it only invokes capabilities honestly exposed by the
 * canonical runtime observation surface.
 */
export async function runRuntimeScenario({ scenario, observation, settle = null }) {
    const validation = validateRuntimeScenario(scenario);
    const base = {
        schemaVersion: RESULT_VERSION,
        scenarioId: scenario?.id || null,
        scenarioHash: scenario && typeof scenario === 'object' ? scenarioHash(scenario) : null,
        runtimeAuthority: observation?.runtimeAuthority || null,
        replayable: true,
        steps: []
    };
    if (!validation.valid) {
        return failResult(base, 'blocked', 'scenario_invalid', { validationErrors: validation.errors });
    }
    if (!observation || typeof observation.snapshot !== 'function' || typeof observation.trace !== 'function') {
        return failResult(base, 'blocked', 'runtime_observation_required');
    }
    if (observation.runtimeAuthority !== 'LoreWeaverRuntimeKernel') {
        return failResult(base, 'blocked', 'runtime_authority_mismatch');
    }

    const capabilities = observation.capabilities?.() || {};
    const missingCapabilities = requiredCapabilities(scenario).filter((name) => capabilities[name] !== true);
    if (missingCapabilities.length) {
        return failResult(base, 'blocked', 'required_runtime_capability_missing', {
            missingCapabilities,
            capabilities: clone(capabilities)
        });
    }

    const initialSnapshot = observation.snapshot();
    const initialTrace = observation.trace();
    const sessionId = initialSnapshot?.sessionId || null;
    if (!sessionId || initialTrace?.sessionId !== sessionId) {
        return failResult(base, 'failed', 'initial_runtime_session_identity_invalid');
    }

    const stepResults = [];
    let timingMode = 'semantic_event';
    for (const step of scenario.steps) {
        let control = null;
        if (step.type === 'input') control = observation.input(clone(step.payload || {}));
        else if (step.type === 'pause') control = observation.pause(clone(step.payload || {}));
        else if (step.type === 'resume') control = observation.resume(clone(step.payload || {}));
        else if (step.type === 'advance_frames') {
            timingMode = 'runtime_frame_clock';
            control = observation.advanceFrames({ frames: step.frames });
        }

        if (control && control.status !== 'passed') {
            return failResult(base, control.status === 'unsupported' ? 'blocked' : 'failed', `scenario_step_control_${control.status}`, {
                sessionId,
                timingMode,
                steps: stepResults,
                failedStepId: step.id,
                control: clone(control)
            });
        }

        if ((step.settleMs || 0) > 0) {
            if (typeof settle !== 'function') {
                return failResult(base, 'blocked', 'host_settle_callback_required', {
                    sessionId,
                    timingMode: 'host_wall_clock',
                    steps: stepResults,
                    failedStepId: step.id
                });
            }
            timingMode = timingMode === 'runtime_frame_clock' ? timingMode : 'host_wall_clock';
            await settle(step.settleMs);
        }

        const snapshot = observation.snapshot();
        if (snapshot?.sessionId !== sessionId) {
            return failResult(base, 'failed', 'runtime_session_changed_during_scenario', {
                sessionId,
                observedSessionId: snapshot?.sessionId || null,
                steps: stepResults,
                failedStepId: step.id
            });
        }
        const assertionResults = (step.assertions || []).map((assertion) =>
            evaluateAssertion(snapshot.state, assertion)
        );
        const failedAssertions = assertionResults.filter((item) => !item.passed);
        const result = {
            id: step.id,
            type: step.type,
            control: clone(control),
            snapshotSequence: snapshot.sequence,
            assertions: assertionResults,
            passed: failedAssertions.length === 0
        };
        stepResults.push(result);
        if (failedAssertions.length) {
            return failResult(base, 'failed', 'scenario_assertion_failed', {
                sessionId,
                timingMode,
                steps: stepResults,
                failedStepId: step.id,
                failedAssertions
            });
        }
    }

    const finalSnapshot = observation.snapshot();
    const finalTrace = observation.trace();
    if (finalSnapshot?.sessionId !== sessionId || finalTrace?.sessionId !== sessionId) {
        return failResult(base, 'failed', 'final_runtime_session_identity_invalid', {
            sessionId,
            steps: stepResults
        });
    }
    const startSequence = initialTrace.entries?.[0]?.sequence ?? initialSnapshot.sequence;
    const endSequence = finalTrace.entries?.at?.(-1)?.sequence ?? finalSnapshot.sequence;
    return {
        ...base,
        status: 'passed',
        passed: true,
        reason: null,
        sessionId,
        runtimeAuthority: observation.runtimeAuthority,
        timingMode,
        capabilities: clone(capabilities),
        initialSnapshot: clone(initialSnapshot),
        finalSnapshot: clone(finalSnapshot),
        traceRange: {
            startSequence,
            endSequence,
            finalEntryCount: finalTrace.entryCount
        },
        steps: stepResults
    };
}

export { SCHEMA_VERSION as RUNTIME_SCENARIO_SCHEMA_VERSION, RESULT_VERSION as RUNTIME_SCENARIO_RESULT_VERSION };
