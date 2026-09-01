const SCHEMA_VERSION = 'loreweaver.runtime-replay-determinism.v1';

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((out, key) => {
            if (value[key] !== undefined) out[key] = stable(value[key]);
            return out;
        }, {});
    }
    return value;
}

function stableJson(value) {
    return JSON.stringify(stable(value));
}

function fnv1a32(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function readPath(root, expression) {
    const tokens = String(expression || '')
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .map((item) => item.trim())
        .filter(Boolean);
    let value = root;
    for (const token of tokens) {
        if (value == null || (typeof value !== 'object' && !Array.isArray(value)) || !(token in value)) {
            return { exists: false, value: undefined };
        }
        value = value[token];
    }
    return { exists: true, value };
}

function normalizePathSpecs(paths = []) {
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('deterministic_paths_required');
    }
    const seen = new Set();
    return paths.map((entry) => {
        const raw = typeof entry === 'string' ? { path: entry } : entry;
        const path = String(raw?.path || '').trim();
        if (!path || !/^[A-Za-z0-9_.\[\]-]+$/.test(path)) {
            throw new Error(`deterministic_path_invalid:${path || 'missing'}`);
        }
        if (seen.has(path)) throw new Error(`deterministic_path_duplicate:${path}`);
        seen.add(path);
        const tolerance = raw?.tolerance == null ? 0 : Number(raw.tolerance);
        if (!Number.isFinite(tolerance) || tolerance < 0) {
            throw new Error(`deterministic_tolerance_invalid:${path}`);
        }
        return { path, tolerance };
    });
}

export function buildRuntimeReplayProjection(result, paths) {
    if (!result || result.status !== 'passed' || result.passed !== true) {
        throw new Error('runtime_scenario_result_must_be_passed');
    }
    const specs = normalizePathSpecs(paths);
    const finalState = result.finalSnapshot?.state;
    if (!finalState || typeof finalState !== 'object') {
        throw new Error('runtime_scenario_final_state_missing');
    }
    const values = {};
    for (const spec of specs) {
        const resolved = readPath(finalState, spec.path);
        if (!resolved.exists) throw new Error(`deterministic_path_missing:${spec.path}`);
        values[spec.path] = clone(resolved.value);
    }
    const payload = {
        scenarioId: result.scenarioId,
        scenarioHash: result.scenarioHash,
        runtimeAuthority: result.runtimeAuthority,
        values
    };
    return {
        schemaVersion: SCHEMA_VERSION,
        status: 'passed',
        scenarioId: result.scenarioId,
        scenarioHash: result.scenarioHash,
        runtimeAuthority: result.runtimeAuthority,
        paths: specs,
        values,
        fingerprint: `fnv1a32:${fnv1a32(stableJson(payload))}`
    };
}

function compareValue(left, right, tolerance) {
    if (typeof left === 'number' && typeof right === 'number' && tolerance > 0) {
        return Math.abs(left - right) <= tolerance;
    }
    return stableJson(left) === stableJson(right);
}

export function compareRuntimeReplayProjections(left, right) {
    const mismatches = [];
    if (!left || !right) return { status: 'blocked', deterministic: false, reason: 'projection_missing', mismatches };
    if (left.scenarioHash !== right.scenarioHash) mismatches.push('scenario_hash_mismatch');
    if (left.runtimeAuthority !== 'LoreWeaverRuntimeKernel' || right.runtimeAuthority !== 'LoreWeaverRuntimeKernel') {
        mismatches.push('runtime_authority_mismatch');
    }
    const leftSpecs = normalizePathSpecs(left.paths || []);
    const rightSpecs = normalizePathSpecs(right.paths || []);
    if (stableJson(leftSpecs) !== stableJson(rightSpecs)) mismatches.push('projection_contract_mismatch');
    for (const spec of leftSpecs) {
        if (!(spec.path in (right.values || {}))) {
            mismatches.push(`path_missing_right:${spec.path}`);
            continue;
        }
        if (!compareValue(left.values?.[spec.path], right.values?.[spec.path], spec.tolerance)) {
            mismatches.push(`value_mismatch:${spec.path}`);
        }
    }
    return {
        schemaVersion: 'loreweaver.runtime-replay-determinism-comparison.v1',
        status: mismatches.length ? 'failed' : 'passed',
        deterministic: mismatches.length === 0,
        scenarioHash: left.scenarioHash || right.scenarioHash || null,
        leftFingerprint: left.fingerprint || null,
        rightFingerprint: right.fingerprint || null,
        mismatches
    };
}

export { SCHEMA_VERSION as RUNTIME_REPLAY_DETERMINISM_SCHEMA_VERSION };
