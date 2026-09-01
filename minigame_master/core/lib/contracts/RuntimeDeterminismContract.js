const DECLARATION_SCHEMA_VERSION = 'loreweaver.runtime-determinism.v1';
const READINESS_SCHEMA_VERSION = 'loreweaver.runtime-determinism-readiness.v1';
const EVIDENCE_SCHEMA_VERSION = 'loreweaver.cross-build-determinism-evidence.v1';
const CROSS_BUILD_READINESS_SCHEMA_VERSION = 'loreweaver.cross-build-determinism-readiness.v1';
const SCOPES = new Set(['adapter_state_trace', 'full_visual_frame']);
const SUPPORTED_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const SUPPORTED_STATE_HANDOFF = new Set(['seed_replay', 'snapshot_restore', 'none']);
const SHA256_RE = /^[0-9a-f]{64}$/;
const DEFAULT_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

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

function normalizedBrowser(value) {
    const browser = String(value || '').trim().toLowerCase();
    if (browser === 'chrome' || browser === 'google-chrome') return 'chromium';
    return browser;
}

function validHash(value) {
    return SHA256_RE.test(String(value || ''));
}

function timestampMs(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : null;
}

function identityValue(source, field) {
    if (!source || typeof source !== 'object') return null;
    return source[field] ?? null;
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
    if (random.algorithm !== undefined && random.algorithm !== null && !nonEmpty(random.algorithm)) {
        errors.push('random_algorithm_invalid');
    }
    if (random.stateHandoff !== undefined && !SUPPORTED_STATE_HANDOFF.has(random.stateHandoff)) {
        errors.push('random_state_handoff_invalid');
    }

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

    if (declaration.engine !== undefined) {
        const engine = declaration.engine || {};
        if (!nonEmpty(engine.name)) errors.push('engine_name_required');
        if (!nonEmpty(engine.version)) errors.push('engine_version_required');
        if (engine.renderer !== undefined && engine.renderer !== null && !nonEmpty(engine.renderer)) {
            errors.push('engine_renderer_invalid');
        }
    }

    if (declaration.physics !== undefined) {
        const physics = declaration.physics || {};
        if (!nonEmpty(physics.engine)) errors.push('physics_engine_required');
        if (typeof physics.deterministic !== 'boolean') errors.push('physics_deterministic_boolean_required');
        if (typeof physics.fixedStep !== 'boolean') errors.push('physics_fixed_step_boolean_required');
        if (!Number.isFinite(Number(physics.stepMs)) || Number(physics.stepMs) <= 0) errors.push('physics_step_ms_positive_required');
        if (physics.settingsHash !== undefined && physics.settingsHash !== null && !validHash(physics.settingsHash)) {
            errors.push('physics_settings_hash_invalid');
        }
    }

    if (declaration.host !== undefined) {
        const host = declaration.host || {};
        if (!nonEmpty(host.mode)) errors.push('host_mode_required');
        if (host.version !== undefined && host.version !== null && !nonEmpty(host.version)) {
            errors.push('host_version_invalid');
        }
    }

    return { valid: errors.length === 0, errors: unique(errors) };
}

/**
 * Evaluate whether a RuntimeScenario is eligible to produce cross-build
 * deterministic evidence. This is control readiness only: it never means that
 * cross-build replay has already been proven.
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
        evidenceRunAllowed: ready,
        crossBuildDeterministicClaimAllowed: false,
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
            presentation: clone(declaration?.presentation || null),
            engine: clone(declaration?.engine || null),
            physics: clone(declaration?.physics || null),
            host: clone(declaration?.host || null)
        },
        capabilities: clone(capabilities)
    };
}

function validateBuildRef(build, label) {
    const blockers = [];
    if (!build || typeof build !== 'object') return [`${label}_build_ref_required`];
    if (!nonEmpty(build.id)) blockers.push(`${label}_build_id_required`);
    if (!validHash(build.payloadHash)) blockers.push(`${label}_payload_hash_invalid`);
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
    if (!readiness || readiness.ready !== true || readiness.evidenceRunAllowed !== true) {
        blockers.push('determinism_control_readiness_not_satisfied');
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
    if (!nonEmpty(baselineResult?.sessionId) || !nonEmpty(candidateResult?.sessionId)) {
        blockers.push('independent_session_identity_required');
    } else if (baselineResult.sessionId === candidateResult.sessionId) {
        blockers.push('same_session_comparison_not_cross_build_evidence');
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
        if (!validHash(baselineScreenshot)) blockers.push('baseline_screenshot_hash_invalid');
        if (!validHash(candidateScreenshot)) blockers.push('candidate_screenshot_hash_invalid');
        visualMatches = validHash(baselineScreenshot)
            && validHash(candidateScreenshot)
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

function compareIdentity(actual, expected, blockers) {
    if (!expected || typeof expected !== 'object') {
        blockers.push('expected_runtime_identity_required');
        return;
    }
    for (const field of ['specHash', 'runtimeVersion', 'assetManifestHash']) {
        const expectedValue = identityValue(expected, field);
        if (expectedValue == null || expectedValue === '') {
            blockers.push(`expected_identity_field_required:${field}`);
            continue;
        }
        const actualValue = identityValue(actual, field);
        if (actualValue == null || actualValue === '') {
            blockers.push(`evidence_identity_field_missing:${field}`);
        } else if (String(actualValue) !== String(expectedValue)) {
            blockers.push(`evidence_identity_mismatch:${field}`);
        }
    }
}

function comparisonPassed(value) {
    return value?.status === 'passed' && value?.deterministic === true;
}

/**
 * Certify that fresh, independently executed evidence covers the requested
 * browser/build matrix. This is deliberately stricter than control readiness.
 * It is an engineering replay claim only and never grants release certification.
 */
export function evaluateCrossBuildDeterminismReadiness({
    controlReadiness,
    evidence,
    expectedIdentity = null,
    requiredBrowsers = ['chromium', 'firefox'],
    requiredBuildCount = 2,
    maxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS,
    now = new Date(),
    waivers = []
} = {}) {
    const blockers = [];
    const warnings = [];
    const normalizedRequiredBrowsers = unique((requiredBrowsers || []).map(normalizedBrowser))
        .filter((browser) => SUPPORTED_BROWSERS.has(browser));
    const requiredBuilds = Math.max(2, Number(requiredBuildCount) || 2);
    const nowMs = now instanceof Date ? now.getTime() : timestampMs(now);

    if (!controlReadiness || controlReadiness.ready !== true || controlReadiness.evidenceRunAllowed !== true) {
        blockers.push('determinism_control_readiness_not_satisfied');
        blockers.push(...(controlReadiness?.blockers || []));
    }
    if (controlReadiness?.crossBuildDeterministicClaimAllowed === true) {
        warnings.push('legacy_control_readiness_claim_flag_ignored');
    }

    const random = controlReadiness?.controls?.random || {};
    if (!nonEmpty(random.algorithm)) blockers.push('random_algorithm_identity_required');
    if (!SUPPORTED_STATE_HANDOFF.has(random.stateHandoff) || random.stateHandoff === 'none') {
        blockers.push('random_state_handoff_required');
    }

    const physics = controlReadiness?.controls?.physics || {};
    if (!nonEmpty(physics.engine)) blockers.push('physics_engine_identity_required');
    if (physics.deterministic !== true) blockers.push('physics_determinism_not_declared');
    if (physics.fixedStep !== true) blockers.push('physics_fixed_step_required');
    if (!Number.isFinite(Number(physics.stepMs)) || Number(physics.stepMs) <= 0) {
        blockers.push('physics_step_ms_required');
    }
    if (!validHash(physics.settingsHash)) blockers.push('physics_settings_hash_required');

    if (!normalizedRequiredBrowsers.length) blockers.push('required_browser_matrix_empty');
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        blockers.push('cross_build_determinism_evidence_required');
    } else {
        if (evidence.status !== 'passed' || evidence.deterministic !== true) {
            blockers.push('cross_build_determinism_evidence_not_passed');
        }
        if (evidence.fixture === true) blockers.push('fixture_determinism_evidence_forbidden');
        if (evidence.synthetic === true) blockers.push('synthetic_determinism_evidence_forbidden');
        if (evidence.stale === true || evidence.freshness === 'stale' || evidence.status === 'stale') {
            blockers.push('stale_determinism_evidence_forbidden');
        }
        if (evidence.runtimeAuthority !== 'LoreWeaverRuntimeKernel') blockers.push('runtime_authority_mismatch');
        if (evidence.scope !== controlReadiness?.scope) blockers.push('determinism_scope_mismatch');
        if (evidence.scenarioId !== controlReadiness?.scenarioId) blockers.push('scenario_id_mismatch');
        if (!nonEmpty(evidence.scenarioHash)) blockers.push('scenario_hash_required');
        if (evidence.projectionId !== controlReadiness?.controls?.stateProjection?.id) blockers.push('state_projection_identity_mismatch');

        const createdAtMs = timestampMs(evidence.createdAt);
        if (createdAtMs === null) {
            blockers.push('determinism_evidence_created_at_required');
        } else if (!Number.isFinite(nowMs)) {
            blockers.push('determinism_evidence_now_invalid');
        } else {
            if (createdAtMs > nowMs + FUTURE_CLOCK_SKEW_MS) blockers.push('determinism_evidence_timestamp_in_future');
            if (!Number.isFinite(Number(maxAgeMs)) || Number(maxAgeMs) <= 0) {
                blockers.push('determinism_evidence_max_age_invalid');
            } else if (nowMs - createdAtMs > Number(maxAgeMs)) {
                blockers.push('determinism_evidence_expired');
            }
        }

        const effectiveWaivers = unique([...(waivers || []), ...(evidence.waivers || [])]);
        if (effectiveWaivers.length) blockers.push('determinism_evidence_waivers_forbidden');

        compareIdentity(evidence.identity, expectedIdentity, blockers);

        const cells = Array.isArray(evidence.matrix?.cells) ? evidence.matrix.cells : [];
        if (!cells.length) blockers.push('determinism_evidence_matrix_cells_required');
        const coveredBrowsers = unique(cells.map((cell) => normalizedBrowser(cell?.browser)));
        const coveredBuildIds = unique(cells.map((cell) => String(cell?.buildId || '').trim()));
        if (coveredBuildIds.length < requiredBuilds) blockers.push('determinism_build_matrix_incomplete');
        for (const browser of normalizedRequiredBrowsers) {
            if (!coveredBrowsers.includes(browser)) blockers.push(`determinism_browser_missing:${browser}`);
        }

        const selectedBuildIds = coveredBuildIds.slice(0, requiredBuilds);
        const sessionIds = [];
        for (const cell of cells) {
            const browser = normalizedBrowser(cell?.browser);
            const buildId = String(cell?.buildId || '').trim();
            if (cell?.status !== 'passed') blockers.push(`determinism_matrix_cell_not_passed:${browser || 'unknown'}:${buildId || 'unknown'}`);
            if (!SUPPORTED_BROWSERS.has(browser)) blockers.push(`determinism_matrix_browser_unsupported:${browser || 'missing'}`);
            if (!nonEmpty(cell?.browserVersion)) blockers.push(`determinism_browser_version_required:${browser || 'unknown'}`);
            if (!nonEmpty(cell?.engineVersion)) blockers.push(`determinism_engine_version_required:${browser || 'unknown'}`);
            if (!nonEmpty(buildId)) blockers.push('determinism_matrix_build_id_required');
            if (!nonEmpty(cell?.sessionId)) blockers.push(`determinism_matrix_session_id_required:${browser || 'unknown'}:${buildId || 'unknown'}`);
            else sessionIds.push(cell.sessionId);
            if (!validHash(cell?.payloadHash)) blockers.push(`determinism_matrix_payload_hash_invalid:${buildId || 'unknown'}`);
            if (!validHash(cell?.artifactSha256)) blockers.push(`determinism_matrix_artifact_hash_invalid:${buildId || 'unknown'}`);
            for (const field of ['specHash', 'runtimeVersion', 'assetManifestHash']) {
                if (!nonEmpty(String(cell?.[field] ?? ''))) blockers.push(`determinism_matrix_identity_missing:${field}:${buildId || 'unknown'}`);
            }
            if (!validHash(cell?.stateFingerprint)) blockers.push(`determinism_state_fingerprint_invalid:${browser || 'unknown'}:${buildId || 'unknown'}`);
        }
        if (unique(sessionIds).length !== sessionIds.length) blockers.push('determinism_matrix_sessions_not_independent');

        for (const browser of normalizedRequiredBrowsers) {
            for (const buildId of selectedBuildIds) {
                const matches = cells.filter((cell) =>
                    normalizedBrowser(cell?.browser) === browser
                    && String(cell?.buildId || '').trim() === buildId
                    && cell?.status === 'passed'
                );
                if (matches.length !== 1) blockers.push(`determinism_matrix_cell_required_once:${browser}:${buildId}`);
            }
        }

        for (const buildId of selectedBuildIds) {
            const buildCells = cells.filter((cell) => String(cell?.buildId || '').trim() === buildId);
            for (const field of ['payloadHash', 'artifactSha256', 'specHash', 'runtimeVersion', 'assetManifestHash']) {
                const values = unique(buildCells.map((cell) => String(cell?.[field] ?? '')));
                if (values.length !== 1) blockers.push(`determinism_build_identity_inconsistent:${buildId}:${field}`);
            }
        }

        const perBrowser = Array.isArray(evidence.comparisons?.perBrowser) ? evidence.comparisons.perBrowser : [];
        for (const browser of normalizedRequiredBrowsers) {
            const comparison = perBrowser.find((item) => normalizedBrowser(item?.browser) === browser);
            if (!comparisonPassed(comparison)) blockers.push(`determinism_per_browser_comparison_missing_or_failed:${browser}`);
        }

        const crossBrowser = Array.isArray(evidence.comparisons?.crossBrowser) ? evidence.comparisons.crossBrowser : [];
        for (const buildId of selectedBuildIds) {
            const comparison = crossBrowser.find((item) => String(item?.buildId || '').trim() === buildId);
            if (!comparisonPassed(comparison)) blockers.push(`determinism_cross_browser_comparison_missing_or_failed:${buildId}`);
        }

        if (controlReadiness?.scope === 'adapter_state_trace') {
            warnings.push('visual_frame_determinism_not_claimed');
            if (evidence.headless === true) warnings.push('headless_engineering_evidence_not_physical_device_evidence');
        }
    }

    const replayReady = blockers.length === 0;
    return {
        schemaVersion: CROSS_BUILD_READINESS_SCHEMA_VERSION,
        status: replayReady ? 'ready' : 'blocked',
        ready: replayReady,
        replayReady,
        crossBuildDeterministicClaimAllowed: replayReady,
        releaseEligible: false,
        claim: replayReady
            ? (controlReadiness?.scope === 'full_visual_frame'
                ? 'full_visual_cross_build'
                : 'adapter_state_cross_build')
            : null,
        scope: controlReadiness?.scope || evidence?.scope || null,
        runtimeAuthority: 'LoreWeaverRuntimeKernel',
        scenarioId: controlReadiness?.scenarioId || evidence?.scenarioId || null,
        expectedIdentity: clone(expectedIdentity),
        matrix: {
            requiredBrowsers: normalizedRequiredBrowsers,
            requiredBuildCount: requiredBuilds,
            coveredBrowsers: unique((evidence?.matrix?.cells || []).map((cell) => normalizedBrowser(cell?.browser))),
            coveredBuildIds: unique((evidence?.matrix?.cells || []).map((cell) => String(cell?.buildId || '').trim())),
            complete: replayReady
        },
        evidence: evidence ? {
            schemaVersion: evidence.schemaVersion || null,
            createdAt: evidence.createdAt || null,
            fixture: evidence.fixture === true,
            synthetic: evidence.synthetic === true,
            headless: evidence.headless === true,
            status: evidence.status || null,
            deterministic: evidence.deterministic === true
        } : null,
        blockers: unique(blockers),
        warnings: unique(warnings)
    };
}

export {
    DECLARATION_SCHEMA_VERSION as RUNTIME_DETERMINISM_SCHEMA_VERSION,
    READINESS_SCHEMA_VERSION as RUNTIME_DETERMINISM_READINESS_SCHEMA_VERSION,
    EVIDENCE_SCHEMA_VERSION as CROSS_BUILD_DETERMINISM_EVIDENCE_SCHEMA_VERSION,
    CROSS_BUILD_READINESS_SCHEMA_VERSION,
    DEFAULT_EVIDENCE_MAX_AGE_MS as CROSS_BUILD_DETERMINISM_DEFAULT_MAX_AGE_MS
};
