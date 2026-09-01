const DECLARATION_SCHEMA_VERSION = 'loreweaver.runtime-determinism.v1';
const READINESS_SCHEMA_VERSION = 'loreweaver.runtime-determinism-readiness.v1';
const EVIDENCE_SCHEMA_VERSION = 'loreweaver.cross-build-determinism-evidence.v1';
const SCOPES = new Set(['adapter_state_trace', 'full_visual_frame']);
const SHA256_RE = /^[0-9a-f]{64}$/;

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
}

function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function seedPresent(value) {
    if (Number.isInteger(value)) return true;
    return typeof value === 'string' && value.trim().length > 0;
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

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function scenarioUses(scenario, type) {
    return (scenario?.steps || []).some((step) => step?.type === type);
}

function scenarioUsesWallClock(scenario) {
    return (scenario?.steps || []).some((step) => Number(step?.settleMs || 0) > 0);
}

export function validateRuntimeDeterminismDeclaration(declaration = {}) {
    const errors = [];
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
        return { valid: false, errors: ['determinism_declaration_not_object'] };
    }
    if (declaration.schemaVersion !== DECLARATION_SCHEMA_VERSION) errors.push('schema_version_invalid');
    if (!SCOPES.has(declaration.scope)) errors.push(`determinism_scope_invalid:${declaration.scope || 'missing'}`);
    if (declaration.runtimeAuthority !== 'LoreWeaverRuntimeKernel') errors.push('runtime_authority_must_be_LoreWeaverRuntimeKernel');

    const random = declaration.random || {};
    if (typeof random.controlled !== 'boolean') errors.push('random_controlled_boolean_required');
    if (!['seeded_prng', 'uncontrolled', 'none'].includes(random.source)) errors.push('random_source_invalid');
    if (!['adapter', 'runtime', 'none'].includes(random.scope)) errors.push('random_scope_invalid');

    const time = declaration.time || {};
    if (typeof time.controlled !== 'boolean') errors.push('time_controlled_boolean_required');
    if (!['exact_frame', 'semantic_event', 'host_wall_clock', 'uncontrolled'].includes(time.mode)) errors.push('time_mode_invalid');
    if (typeof time.hostWallClockSettleAllowed !== 'boolean') errors.push('host_wall_clock_settle_policy_required');

    const input = declaration.input || {};
    if (typeof input.controlled !== 'boolean') errors.push('input_controlled_boolean_required');
    if (!['semantic', 'recorded_pointer', 'uncontrolled', 'none'].includes(input.mode)) errors.push('input_mode_invalid');

    const projection = declaration.stateProjection || {};
    if (!nonEmpty(projection.id) || !/^[A-Za-z0-9._-]+$/.test(projection.id)) errors.push('state_projection_id_invalid');
    if (!Array.isArray(projection.paths) || projection.paths.length === 0 || projection.paths.some((item) => !nonEmpty(item))) {
        errors.push('state_projection_paths_required');
    }

    if (declaration.presentation !== undefined) {
        const presentation = declaration.presentation || {};
        if (typeof presentation.controlled !== 'boolean') errors.push('presentation_controlled_boolean_required');
        if (presentation.screenshotTimingControlled !== undefined && typeof presentation.screenshotTimingControlled !== 'boolean') {
            errors.push('presentation_screenshot_timing_boolean_required');
        }
    }
    return { valid: errors.length === 0, errors: unique(errors) };
}

/**
 * Evaluate whether a RuntimeScenario is eligible to produce cross-build
 * deterministic evidence. This function never controls the runtime itself; it
 * requires the caller to declare and prove that randomness, time and input are
 * already controlled by the canonical LoreWeaver runtime path.
 */
export function evaluateRuntimeDeterminismReadiness({
    scenario,
    declaration,
    capabilities = {}
} = {}) {
    const validation = validateRuntimeDeterminismDeclaration(declaration);
    const blockers = [...validation.errors];
    const warnings = [];

    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
        blockers.push('runtime_scenario_required');
    } else if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
        blockers.push('runtime_scenario_steps_required');
    }

    const random = declaration?.random || {};
    if (random.controlled !== true) blockers.push('random_source_uncontrolled');
    if (random.source !== 'seeded_prng') blockers.push(`random_source_not_seeded_prng:${random.source || 'missing'}`);
    if (!seedPresent(random.seed)) blockers.push('deterministic_seed_missing');
    if (!['adapter', 'runtime'].includes(random.scope)) blockers.push(`random_scope_not_controlled:${random.scope || 'missing'}`);

    const time = declaration?.time || {};
    if (time.controlled !== true) blockers.push('time_source_uncontrolled');
    if (time.mode !== 'exact_frame') blockers.push(`deterministic_time_requires_exact_frame:${time.mode || 'missing'}`);
    if (time.hostWallClockSettleAllowed === true) blockers.push('host_wall_clock_settle_not_allowed_for_cross_build_evidence');
    if (scenarioUsesWallClock(scenario)) blockers.push('scenario_uses_host_wall_clock_settle');
    if (capabilities.exactFrameAdvance !== true) blockers.push('exact_frame_capability_required');

    const input = declaration?.input || {};
    if (input.controlled !== true) blockers.push('input_source_uncontrolled');
    if (input.mode !== 'semantic') blockers.push(`deterministic_input_requires_semantic_mode:${input.mode || 'missing'}`);
    if (scenarioUses(scenario, 'input') && capabilities.semanticInput !== true) blockers.push('semantic_input_capability_required');
    if (scenarioUses(scenario, 'pause') && capabilities.pause !== true) blockers.push('pause_capability_required');
    if (scenarioUses(scenario, 'resume') && capabilities.resume !== true) blockers.push('resume_capability_required');

    if (declaration?.scope === 'full_visual_frame') {
        const presentation = declaration.presentation || {};
        if (random.scope !== 'runtime') blockers.push('full_visual_frame_requires_runtime_wide_seeded_randomness');
        if (presentation.controlled !== true) blockers.push('presentation_randomness_uncontrolled');
        if (presentation.screenshotTimingControlled !== true) blockers.push('screenshot_timing_uncontrolled');
    } else if (declaration?.presentation?.controlled !== true) {
        warnings.push('presentation_not_deterministic_but_excluded_from_adapter_state_scope');
    }

    const ready = blockers.length === 0;
    return {
        schemaVersion: READINESS_SCHEMA_VERSION,
        status: ready ? 'ready' : 'blocked',
        ready,
        crossBuildDeterministicClaimAllowed: ready,
        scope: declaration?.scope || null,
        runtimeAuthority: declaration?.runtimeAuthority || null,
        scenarioId: scenario?.id || null,
        blockers: unique(blockers),
        warnings: unique(warnings),
        controls: {
            random: clone(random),
            time: clone(time),
            input: clone(input),
            stateProjection: clone(declaration?.stateProjection || null),
            presentation: clone(declaration?.presentation || null)
        },
        capabilities: clone(capabilities)
    };
}

function validateBuildRef(build, label) {
    const blockers = [];
    if (!build || typeof build !== 'object') return [`${label}_build_ref_required`];
    if (!nonEmpty(build.id)) blockers.push(`${label}_build_id_required`);
    if (!SHA256_RE.test(String(build.payloadHash || ''))) blockers.push(`${label}_payload_hash_invalid`);
    return blockers;
}

function projectedState(result, paths) {
    const state = result?.finalSnapshot?.state;
    const projection = {};
    const missing = [];
    for (const path of paths || []) {
        const resolved = getPath(state, path);
        if (!resolved.exists) missing.push(path);
        else projection[path] = clone(resolved.value);
    }
    return { projection, missing };
}

/**
 * Compare two genuinely executed RuntimeScenario results. This is evidence, not
 * a simulator: both runs must already have passed independently and share the
 * same declarative scenario identity.
 */
export function createCrossBuildDeterminismEvidence({
    readiness,
    baselineResult,
    candidateResult,
    baselineBuild,
    candidateBuild
} = {}) {
    const blockers = [];
    if (!readiness || readiness.ready !== true || readiness.crossBuildDeterministicClaimAllowed !== true) {
        blockers.push('determinism_readiness_not_satisfied');
        blockers.push(...(readiness?.blockers || []));
    }
    blockers.push(...validateBuildRef(baselineBuild, 'baseline'));
    blockers.push(...validateBuildRef(candidateBuild, 'candidate'));
    if (baselineResult?.status !== 'passed' || baselineResult?.passed !== true) blockers.push('baseline_scenario_not_passed');
    if (candidateResult?.status !== 'passed' || candidateResult?.passed !== true) blockers.push('candidate_scenario_not_passed');
    if (!baselineResult?.scenarioHash || baselineResult.scenarioHash !== candidateResult?.scenarioHash) blockers.push('scenario_identity_mismatch');
    if (baselineResult?.runtimeAuthority !== 'LoreWeaverRuntimeKernel' || candidateResult?.runtimeAuthority !== 'LoreWeaverRuntimeKernel') {
        blockers.push('runtime_authority_mismatch');
    }

    const paths = readiness?.controls?.stateProjection?.paths || [];
    const baseline = projectedState(baselineResult, paths);
    const candidate = projectedState(candidateResult, paths);
    for (const path of baseline.missing) blockers.push(`baseline_projection_path_missing:${path}`);
    for (const path of candidate.missing) blockers.push(`candidate_projection_path_missing:${path}`);

    const stateMatches = baseline.missing.length === 0
        && candidate.missing.length === 0
        && stableJson(baseline.projection) === stableJson(candidate.projection);
    if (!stateMatches) blockers.push('projected_runtime_state_mismatch');

    let visualMatches = null;
    if (readiness?.scope === 'full_visual_frame') {
        const baselineScreenshot = String(baselineBuild?.screenshotSha256 || '');
        const candidateScreenshot = String(candidateBuild?.screenshotSha256 || '');
        if (!SHA256_RE.test(baselineScreenshot)) blockers.push('baseline_screenshot_hash_invalid');
        if (!SHA256_RE.test(candidateScreenshot)) blockers.push('candidate_screenshot_hash_invalid');
        visualMatches = SHA256_RE.test(baselineScreenshot)
            && SHA256_RE.test(candidateScreenshot)
            && baselineScreenshot === candidateScreenshot;
        if (!visualMatches) blockers.push('visual_frame_hash_mismatch');
    }

    const deterministic = blockers.length === 0;
    return {
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        status: deterministic ? 'passed' : 'failed',
        deterministic,
        scope: readiness?.scope || null,
        runtimeAuthority: 'LoreWeaverRuntimeKernel',
        scenarioId: baselineResult?.scenarioId || candidateResult?.scenarioId || null,
        scenarioHash: baselineResult?.scenarioHash || candidateResult?.scenarioHash || null,
        projectionId: readiness?.controls?.stateProjection?.id || null,
        blockers: unique(blockers),
        comparison: {
            stateMatches,
            visualMatches,
            baseline: {
                build: clone(baselineBuild || null),
                sessionId: baselineResult?.sessionId || null,
                projection: baseline.projection
            },
            candidate: {
                build: clone(candidateBuild || null),
                sessionId: candidateResult?.sessionId || null,
                projection: candidate.projection
            }
        }
    };
}

export {
    DECLARATION_SCHEMA_VERSION as RUNTIME_DETERMINISM_SCHEMA_VERSION,
    READINESS_SCHEMA_VERSION as RUNTIME_DETERMINISM_READINESS_SCHEMA_VERSION,
    EVIDENCE_SCHEMA_VERSION as CROSS_BUILD_DETERMINISM_EVIDENCE_SCHEMA_VERSION
};
