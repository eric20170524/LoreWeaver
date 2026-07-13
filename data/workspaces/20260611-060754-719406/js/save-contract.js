import SAVE_V2_SCHEMA from '../loreweaver/save-v2.schema.json' with { type: 'json' };
import { validateJsonSchema, validateJsonSchemaRule } from './json-schema-lite.js';

export const SAVE_VERSION = 2;
export const SAVE_SCHEMA_VERSION = 2;
export const RESULT_CONTRACT_VERSION = 2;
export const RESULT_REWARD_KEYS = Object.freeze(['bloodEssence', 'suanBoneScript', 'pureBlood', 'exp']);
export const RESULT_REASONS = Object.freeze({
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETREATED: 'retreated',
    CHALLENGE_COMPLETED: 'challenge_completed'
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const nonNegativeNumber = value => finiteNumber(value) && value >= 0 ? value : 0;

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

export function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

export function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function mergeLosslessly(defaultValue, legacyValue, path, diagnostics) {
    if (legacyValue === undefined) return clone(defaultValue);
    if (isObject(defaultValue)) {
        if (!isObject(legacyValue)) {
            diagnostics[path] = clone(legacyValue);
            return clone(defaultValue);
        }
        const merged = {};
        for (const key of new Set([...Object.keys(defaultValue), ...Object.keys(legacyValue)])) {
            merged[key] = key in defaultValue
                ? mergeLosslessly(defaultValue[key], legacyValue[key], `${path}.${key}`, diagnostics)
                : clone(legacyValue[key]);
        }
        return merged;
    }
    if (Array.isArray(defaultValue)) {
        if (!Array.isArray(legacyValue)) {
            diagnostics[path] = clone(legacyValue);
            return clone(defaultValue);
        }
        return clone(legacyValue);
    }
    if (defaultValue !== null && typeof defaultValue !== typeof legacyValue) {
        diagnostics[path] = clone(legacyValue);
        return clone(defaultValue);
    }
    return clone(legacyValue);
}

export function createSaveV2Defaults(nowIso = new Date().toISOString()) {
    return {
        schemaVersion: SAVE_SCHEMA_VERSION,
        attempts: {},
        firstClear: {},
        bestResult: {},
        stars: {},
        buildSnapshot: {},
        flags: {},
        challengeResults: {},
        settings: {
            musicEnabled: true,
            sfxEnabled: true,
            vibrationEnabled: true
        },
        appliedResultIds: {},
        appliedAttemptIds: {},
        migration: {
            sourceVersion: 0,
            backupKey: null,
            migratedAt: nowIso,
            legacyFields: {}
        }
    };
}

export function createMinimumSaveState(nowIso = new Date().toISOString()) {
    return {
        statistics: {
            totalPlaySeconds: 0,
            totalNodesCompleted: 0,
            totalMonstersKilled: 0
        },
        resources: {
            bloodEssence: 0,
            suanBoneScript: 0,
            pureBlood: 0
        },
        progression: {
            realm: 1,
            totalExp: 0
        },
        perks: {
            unlocked: [],
            pointsAvailable: 0,
            tree: {}
        },
        abilities: { unlocked: [] },
        storyFlags: [],
        unlockedNodes: [1],
        nodeResults: {},
        version: SAVE_VERSION,
        saveVersion2: createSaveV2Defaults(nowIso)
    };
}

function recordLegacyResultDiagnostic(diagnostics, key, value) {
    diagnostics[`root.nodeResults.${key}`] = clone(value);
}

function inferLegacyResults(state, diagnostics) {
    const nodeResults = isObject(state.nodeResults) ? state.nodeResults : {};
    for (const [nodeId, result] of Object.entries(nodeResults)) {
        if (!/^[1-9][0-9]*$/.test(nodeId) || !isObject(result)) {
            recordLegacyResultDiagnostic(diagnostics, nodeId, result);
            continue;
        }
        const numericNodeId = Number(nodeId);
        if (!Number.isSafeInteger(numericNodeId) || (result.nodeId !== undefined && Number(result.nodeId) !== numericNodeId)) {
            recordLegacyResultDiagnostic(diagnostics, nodeId, result);
            continue;
        }
        let normalized;
        try {
            normalized = normalizeNodeResult({ ...result, nodeId: numericNodeId });
        } catch (_error) {
            recordLegacyResultDiagnostic(diagnostics, nodeId, result);
            continue;
        }
        const key = String(numericNodeId);
        state.saveVersion2.attempts[key] = Math.max(state.saveVersion2.attempts[key] || 0, 1);
        if (result.success === true) {
            state.saveVersion2.firstClear[key] ||= clone(normalized);
            state.saveVersion2.bestResult[key] ||= clone(normalized);
            if (finiteNumber(result.stars)) state.saveVersion2.stars[key] = result.stars;
            if (isObject(normalized.buildSnapshot)) state.saveVersion2.buildSnapshot[key] = clone(normalized.buildSnapshot);
        }
    }
}

function preserveRepair(diagnostics, path, original, repaired) {
    if (stableStringify(original) !== stableStringify(repaired)) diagnostics[path] = clone(original);
    return repaired;
}

function repairResultMap(state, mapName, diagnostics) {
    const resultMap = state.saveVersion2[mapName];
    for (const [key, original] of Object.entries(resultMap)) {
        try {
            const repaired = normalizeNodeResult(original);
            if (!validateJsonSchemaRule(SAVE_V2_SCHEMA, SAVE_V2_SCHEMA.$defs.result, repaired).valid) throw new TypeError('result schema validation failed');
            resultMap[key] = preserveRepair(diagnostics, `root.saveVersion2.${mapName}.${key}`, original, repaired);
        } catch (_error) {
            diagnostics[`root.saveVersion2.${mapName}.${key}`] = clone(original);
            delete resultMap[key];
        }
    }
}

function repairPersistentState(state, diagnostics) {
    state.unlockedNodes = preserveRepair(diagnostics, 'root.unlockedNodes', state.unlockedNodes, (() => {
        try { return normalizeUnlockNodes(state.unlockedNodes); } catch (_error) { return [1]; }
    })());
    state.storyFlags = preserveRepair(diagnostics, 'root.storyFlags', state.storyFlags, (() => {
        try { return normalizeStringArray(state.storyFlags, 'storyFlags'); } catch (_error) { return []; }
    })());
    const originalAbilities = state.abilities.unlocked;
    state.abilities.unlocked = preserveRepair(diagnostics, 'root.abilities.unlocked', originalAbilities, (() => {
        try { return normalizeStringArray(originalAbilities, 'abilities.unlocked'); } catch (_error) { return []; }
    })());

    for (const [key, value] of Object.entries(state.saveVersion2.attempts)) if (!Number.isInteger(value) || value < 0) {
        diagnostics[`root.saveVersion2.attempts.${key}`] = clone(value);
        delete state.saveVersion2.attempts[key];
    }
    for (const [key, value] of Object.entries(state.saveVersion2.stars)) if (!Number.isInteger(value) || value < 0 || value > 3) {
        diagnostics[`root.saveVersion2.stars.${key}`] = clone(value);
        delete state.saveVersion2.stars[key];
    }
    for (const [key, value] of Object.entries(state.saveVersion2.flags)) if (typeof value !== 'boolean') {
        diagnostics[`root.saveVersion2.flags.${key}`] = clone(value);
        delete state.saveVersion2.flags[key];
    }

    for (const mapName of ['firstClear', 'bestResult', 'challengeResults']) repairResultMap(state, mapName, diagnostics);
    for (const [key, original] of Object.entries(state.saveVersion2.buildSnapshot)) {
        try {
            const repaired = normalizeBuildSnapshot(original);
            if (!validateJsonSchemaRule(SAVE_V2_SCHEMA, SAVE_V2_SCHEMA.$defs.buildSnapshot, repaired).valid) throw new TypeError('build schema validation failed');
            state.saveVersion2.buildSnapshot[key] = preserveRepair(diagnostics, `root.saveVersion2.buildSnapshot.${key}`, original, repaired);
        } catch (_error) {
            diagnostics[`root.saveVersion2.buildSnapshot.${key}`] = clone(original);
            delete state.saveVersion2.buildSnapshot[key];
        }
    }

    const persistedResults = [
        ...Object.values(state.saveVersion2.firstClear),
        ...Object.values(state.saveVersion2.bestResult),
        ...Object.values(state.saveVersion2.challengeResults)
    ];
    for (const [key, original] of Object.entries(state.saveVersion2.appliedResultIds)) {
        const repaired = isObject(original) ? clone(original) : null;
        if (repaired && !repaired.payloadIdentity) {
            const result = persistedResults.find(item => item.resultId === repaired.resultId || item.attemptId === repaired.attemptId);
            if (result) repaired.payloadIdentity = resultPayloadIdentity(result);
        }
        if (!repaired || !validateJsonSchemaRule(SAVE_V2_SCHEMA, SAVE_V2_SCHEMA.$defs.application, repaired).valid) {
            diagnostics[`root.saveVersion2.appliedResultIds.${key}`] = clone(original);
            delete state.saveVersion2.appliedResultIds[key];
        } else {
            state.saveVersion2.appliedResultIds[key] = preserveRepair(diagnostics, `root.saveVersion2.appliedResultIds.${key}`, original, repaired);
        }
    }
    for (const [attemptId, resultId] of Object.entries(state.saveVersion2.appliedAttemptIds)) {
        if (typeof resultId !== 'string' || resultId.length === 0 || !state.saveVersion2.appliedResultIds[resultId]) {
            diagnostics[`root.saveVersion2.appliedAttemptIds.${attemptId}`] = clone(resultId);
            delete state.saveVersion2.appliedAttemptIds[attemptId];
        }
    }
}

export function migrateSaveObject(input, { defaultState = {}, nowIso = new Date().toISOString(), backupKey = null } = {}) {
    if (!isObject(input)) throw new TypeError('Save root must be an object');
    const sourceVersion = Number.isInteger(input.version) && input.version >= 0 ? input.version : 0;
    const diagnostics = {};
    const callerDefaults = mergeLosslessly(createMinimumSaveState(nowIso), defaultState, 'defaults', {});
    const state = mergeLosslessly(callerDefaults, input, 'root', diagnostics);

    state.version = SAVE_VERSION;
    state.saveVersion2.schemaVersion = SAVE_SCHEMA_VERSION;
    state.saveVersion2.migration = {
        ...createSaveV2Defaults(nowIso).migration,
        ...(isObject(state.saveVersion2.migration) ? state.saveVersion2.migration : {}),
        sourceVersion: state.saveVersion2.migration?.sourceVersion || sourceVersion,
        backupKey: state.saveVersion2.migration?.backupKey || backupKey,
        migratedAt: state.saveVersion2.migration?.migratedAt || nowIso,
        legacyFields: {
            ...(isObject(state.saveVersion2.migration?.legacyFields) ? state.saveVersion2.migration.legacyFields : {}),
            ...diagnostics
        }
    };
    inferLegacyResults(state, state.saveVersion2.migration.legacyFields);
    repairPersistentState(state, state.saveVersion2.migration.legacyFields);
    return state;
}

export function isCanonicalSaveV2(state) {
    return validateJsonSchema(SAVE_V2_SCHEMA, state).valid;
}

export function migrateRawSave(raw, options = {}) {
    const nowIso = options.nowIso || new Date().toISOString();
    if (raw === null || raw === undefined || raw === '') {
        return {
            state: migrateSaveObject({}, { ...options, nowIso }),
            sourceVersion: 0,
            needsBackup: false,
            diagnostic: null,
            originalRaw: null
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const state = migrateSaveObject({}, { ...options, nowIso });
        state.saveVersion2.migration.recovery = { type: 'parse_error', message: error.message };
        return { state, sourceVersion: 0, needsBackup: true, diagnostic: 'parse_error', originalRaw: raw };
    }

    if (!isObject(parsed)) {
        const state = migrateSaveObject({}, { ...options, nowIso });
        state.saveVersion2.migration.recovery = { type: 'root_not_object', legacyValue: clone(parsed) };
        return { state, sourceVersion: 0, needsBackup: true, diagnostic: 'root_not_object', originalRaw: raw };
    }

    const sourceVersion = Number.isInteger(parsed.version) ? parsed.version : 1;
    const state = migrateSaveObject(parsed, { ...options, nowIso });
    const canonicalNoop = sourceVersion === SAVE_VERSION
        && parsed.saveVersion2?.schemaVersion === SAVE_SCHEMA_VERSION
        && isCanonicalSaveV2(state)
        && JSON.stringify(state) === raw;
    return {
        state,
        sourceVersion,
        needsBackup: !canonicalNoop,
        canonicalNoop,
        diagnostic: null,
        originalRaw: raw
    };
}

export function createBackupKey(saveKey, sourceVersion, raw) {
    const version = Number.isInteger(sourceVersion) ? sourceVersion : 0;
    return `${saveKey}.backup.v${version}.${hashText(raw || '')}`;
}

export function persistRawSaveMigration(storage, saveKey, options = {}) {
    const raw = storage.getItem(saveKey);
    const migration = migrateRawSave(raw, options);
    const writes = [];
    if (migration.needsBackup) {
        const backupKey = createBackupKey(saveKey, migration.sourceVersion, migration.originalRaw);
        const existing = storage.getItem(backupKey);
        if (existing !== null && existing !== migration.originalRaw) {
            throw new Error(`Save backup collision at ${backupKey}; primary save was not modified.`);
        }
        if (existing === null) {
            storage.setItem(backupKey, migration.originalRaw);
            writes.push({ kind: 'backup', key: backupKey });
        }
        migration.state.saveVersion2.migration.backupKey = backupKey;
    }
    if (!migration.canonicalNoop) {
        storage.setItem(saveKey, JSON.stringify(migration.state));
        writes.push({ kind: 'primary', key: saveKey });
    }
    return { ...migration, writes };
}

function normalizeReason(result) {
    if (Object.values(RESULT_REASONS).includes(result.reason)) return result.reason;
    if (result.success === true) return RESULT_REASONS.COMPLETED;
    return /retreat|撤退/i.test(result.failureReason || '') ? RESULT_REASONS.RETREATED : RESULT_REASONS.FAILED;
}

function normalizeRewards(rewards) {
    if (rewards === undefined || rewards === null) return {};
    if (!isObject(rewards)) throw new TypeError('Node result rewards must be an object');
    const normalized = {};
    for (const [key, amount] of Object.entries(rewards)) {
        if (!RESULT_REWARD_KEYS.includes(key)) throw new TypeError(`Unknown result reward key: ${key}`);
        if (!finiteNumber(amount) || amount < 0) throw new TypeError(`Result reward ${key} must be a finite nonnegative number`);
        normalized[key] = amount;
    }
    return normalized;
}

function normalizeStringArray(value, label, knownValues = null) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    const normalized = value.map(item => {
        if (typeof item !== 'string' || item.trim().length === 0) throw new TypeError(`${label} entries must be nonempty strings`);
        const canonical = item.trim();
        if (knownValues && !knownValues.has(canonical)) throw new TypeError(`Unknown ability unlock id: ${canonical}`);
        return canonical;
    });
    return [...new Set(normalized)].sort();
}

function normalizeUnlockNodes(value, unlockNextNode) {
    const combined = value === undefined || value === null ? [] : value;
    if (!Array.isArray(combined)) throw new TypeError('unlockNodes must be an array');
    const nodes = [...combined];
    if (unlockNextNode !== undefined && unlockNextNode !== null) nodes.push(unlockNextNode);
    for (const nodeId of nodes) if (!Number.isInteger(nodeId) || nodeId < 1) throw new TypeError('unlockNodes entries must be positive integers');
    return [...new Set(nodes)].sort((a, b) => a - b);
}

function normalizeBuildSnapshot(value) {
    if (value === undefined || value === null) return null;
    if (!isObject(value) || !Array.isArray(value.activeSkills) || !Array.isArray(value.playerPerks)
        || !Array.isArray(value.playerAbilities) || !isObject(value.playerStats)) {
        throw new TypeError('buildSnapshot must be null or contain activeSkills, playerPerks, playerAbilities, and playerStats');
    }
    const activeSkills = value.activeSkills.map(skill => {
        if (!isObject(skill) || typeof skill.id !== 'string' || skill.id.trim().length === 0 || !finiteNumber(skill.level)) {
            throw new TypeError('buildSnapshot.activeSkills entries require nonempty id and finite level');
        }
        return { id: skill.id.trim(), level: skill.level };
    }).sort((a, b) => a.id.localeCompare(b.id) || a.level - b.level);
    const playerPerks = normalizeStringArray(value.playerPerks, 'buildSnapshot.playerPerks');
    const playerAbilities = normalizeStringArray(value.playerAbilities, 'buildSnapshot.playerAbilities');
    const playerStats = {};
    for (const [key, amount] of Object.entries(value.playerStats)) {
        if (key.trim().length === 0 || !finiteNumber(amount)) throw new TypeError('buildSnapshot.playerStats entries require nonempty keys and finite numbers');
        playerStats[key] = amount;
    }
    return { activeSkills, playerPerks, playerAbilities, playerStats };
}

export function normalizeNodeResult(input, { knownAbilityIds = null } = {}) {
    if (!isObject(input)) throw new TypeError('Node result must be an object');
    const nodeId = Number(input.nodeId);
    if (!Number.isInteger(nodeId) || nodeId < 1) throw new TypeError('Node result requires a positive integer nodeId');
    const reason = normalizeReason(input);
    const success = reason === RESULT_REASONS.COMPLETED || reason === RESULT_REASONS.CHALLENGE_COMPLETED;
    const rewards = normalizeRewards(input.rewards);
    const knownAbilities = knownAbilityIds ? new Set(knownAbilityIds) : null;
    const abilityUnlocks = normalizeStringArray(input.abilityUnlocks, 'abilityUnlocks', knownAbilities);
    const flags = normalizeStringArray(input.flags, 'flags');
    const unlockNodes = normalizeUnlockNodes(input.unlockNodes, input.unlockNextNode);
    const buildSnapshot = normalizeBuildSnapshot(input.buildSnapshot);
    const normalized = {
        ...clone(input),
        contractVersion: RESULT_CONTRACT_VERSION,
        nodeId,
        reason,
        success,
        duration: nonNegativeNumber(input.duration),
        kills: Math.floor(nonNegativeNumber(input.kills)),
        rewards,
        abilityUnlocks,
        unlockNodes,
        flags
    };
    const identity = input.resultId || input.attemptId || `legacy:${hashText(stableStringify(normalized))}`;
    normalized.resultId = String(identity);
    normalized.attemptId = String(input.attemptId || identity);
    normalized.challengeId = input.challengeId ? String(input.challengeId) : null;
    normalized.stars = Math.min(3, Math.max(0, Math.floor(nonNegativeNumber(input.stars))));
    normalized.unlockNextNode = unlockNodes[0] || null;
    normalized.buildSnapshot = buildSnapshot;
    return normalized;
}

export function resultPayloadIdentity(result) {
    const semantic = clone(result);
    delete semantic.resultId;
    delete semantic.settlement;
    return hashText(stableStringify(semantic));
}

function betterResult(candidate, current) {
    if (!current) return true;
    const candidateScore = finiteNumber(candidate.score) ? candidate.score : null;
    const currentScore = finiteNumber(current.score) ? current.score : null;
    if (candidateScore !== null || currentScore !== null) return (candidateScore || 0) > (currentScore || 0);
    if (candidate.stars !== (current.stars || 0)) return candidate.stars > (current.stars || 0);
    if (candidate.success !== current.success) return candidate.success;
    if (candidate.success && candidate.duration !== current.duration) return candidate.duration < current.duration;
    return candidate.kills > (current.kills || 0);
}

function addReward(state, key, amount) {
    if (!finiteNumber(amount) || amount === 0) return;
    if (key === 'exp') {
        state.progression.totalExp = nonNegativeNumber(state.progression.totalExp) + amount;
        return;
    }
    if (!(key in state.resources)) state.resources[key] = 0;
    state.resources[key] = nonNegativeNumber(state.resources[key]) + amount;
}

export function applyResultToState(state, input, options = {}) {
    if (!isObject(state?.saveVersion2)) throw new TypeError('Result application requires a migrated Save V2 state');
    const result = normalizeNodeResult(input, options);
    const payloadIdentity = resultPayloadIdentity(result);
    const v2 = state.saveVersion2;
    const nodeKey = String(result.nodeId);
    v2.appliedAttemptIds ||= {};
    const priorResultId = v2.appliedAttemptIds[result.attemptId];
    const priorApplication = v2.appliedResultIds[result.resultId] || (priorResultId ? v2.appliedResultIds[priorResultId] : null);
    if (priorApplication) {
        if (!priorApplication.payloadIdentity || priorApplication.payloadIdentity !== payloadIdentity) {
            throw new Error(`Result identity collision for resultId=${result.resultId} attemptId=${result.attemptId}`);
        }
        v2.appliedResultIds[result.resultId] ||= clone(priorApplication);
        return {
            ...clone(priorApplication),
            resultId: result.resultId,
            canonicalResultId: priorApplication.resultId,
            replayed: true,
            result
        };
    }

    state.statistics ||= {};
    state.resources ||= {};
    state.progression ||= { totalExp: 0 };
    state.unlockedNodes = Array.isArray(state.unlockedNodes) ? state.unlockedNodes : [1];
    state.storyFlags = Array.isArray(state.storyFlags) ? state.storyFlags : [];
    state.nodeResults = isObject(state.nodeResults) ? state.nodeResults : {};
    const wasFirstClear = Boolean(v2.firstClear[nodeKey]);
    const challengeKey = result.challengeId ? `${nodeKey}:${result.challengeId}` : null;
    const challengeAlreadyCompleted = Boolean(challengeKey && v2.challengeResults[challengeKey]?.success);
    const isNormalClear = result.reason === RESULT_REASONS.COMPLETED;
    const isFirstClear = isNormalClear && !wasFirstClear;
    const rewardPolicy = result.reason === RESULT_REASONS.RETREATED
        ? 'retreat'
        : result.reason === RESULT_REASONS.FAILED
            ? 'failure'
            : result.reason === RESULT_REASONS.CHALLENGE_COMPLETED
                ? 'challenge'
                : isFirstClear ? 'first_clear' : 'repeat_clear';
    const rewardsApplied = rewardPolicy !== 'challenge' || !challengeAlreadyCompleted;

    v2.attempts[nodeKey] = Math.max(0, Math.floor(nonNegativeNumber(v2.attempts[nodeKey]))) + 1;
    state.statistics.totalAttempts = Math.max(0, Math.floor(nonNegativeNumber(state.statistics.totalAttempts))) + 1;
    state.statistics.totalMonstersKilled = Math.max(0, Math.floor(nonNegativeNumber(state.statistics.totalMonstersKilled))) + result.kills;
    if (isFirstClear) {
        state.statistics.totalNodesCompleted = Math.max(0, Math.floor(nonNegativeNumber(state.statistics.totalNodesCompleted))) + 1;
        v2.firstClear[nodeKey] = clone(result);
    }
    if (isNormalClear) state.statistics.totalSuccessfulRuns = Math.max(0, Math.floor(nonNegativeNumber(state.statistics.totalSuccessfulRuns))) + 1;
    const isBestResult = betterResult(result, v2.bestResult[nodeKey]);
    if (isBestResult) v2.bestResult[nodeKey] = clone(result);
    v2.stars[nodeKey] = Math.max(v2.stars[nodeKey] || 0, result.stars);
    if (result.buildSnapshot !== null && isBestResult) v2.buildSnapshot[nodeKey] = clone(result.buildSnapshot);
    else if (result.buildSnapshot !== null && v2.buildSnapshot[nodeKey] === undefined) v2.buildSnapshot[nodeKey] = clone(result.buildSnapshot);
    if (challengeKey) v2.challengeResults[challengeKey] = clone(result);

    if (rewardsApplied) for (const [key, amount] of Object.entries(result.rewards)) addReward(state, key, amount);
    if (isFirstClear) {
        for (const nodeId of result.unlockNodes) if (!state.unlockedNodes.includes(nodeId)) state.unlockedNodes.push(nodeId);
        for (const flag of result.flags) if (!state.storyFlags.includes(flag)) state.storyFlags.push(flag);
        state.abilities ||= { unlocked: [] };
        state.abilities.unlocked = Array.isArray(state.abilities.unlocked) ? state.abilities.unlocked : [];
        for (const abilityId of result.abilityUnlocks) if (!state.abilities.unlocked.includes(abilityId)) state.abilities.unlocked.push(abilityId);
        for (const flag of result.flags) v2.flags[flag] = true;
    }
    const previousCompatibleResult = state.nodeResults[nodeKey];
    if (result.success || !previousCompatibleResult?.success) state.nodeResults[nodeKey] = clone(result);
    const application = {
        resultId: result.resultId,
        attemptId: result.attemptId,
        payloadIdentity,
        nodeId: result.nodeId,
        reason: result.reason,
        success: result.success,
        rewardPolicy,
        rewardsApplied,
        firstClear: isFirstClear,
        replayed: false
    };
    v2.appliedResultIds[result.resultId] = clone(application);
    v2.appliedAttemptIds[result.attemptId] = result.resultId;
    return { ...application, result };
}
