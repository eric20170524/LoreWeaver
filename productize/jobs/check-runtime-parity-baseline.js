#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const loreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(loreRoot, 'minigame_master/capabilities/reports/runtime_parity_baseline_latest.json');

const files = {
    compiler: 'src/runtime/compileRuntimeSpec.ts',
    kernel: 'src/runtime/LoreWeaverRuntimeKernel.ts',
    playerState: 'src/runtime/playerState.ts',
    store: 'src/store.tsx',
    gameRunner: 'src/game/GameRunner.ts',
    standalone: 'productize/standalone/main.ts',
    standaloneHtml: 'productize/standalone/index.html',
    standaloneVite: 'vite.config.standalone.ts',
    exporter: 'productize/export-standalone.mjs',
    browserReport: 'minigame_master/capabilities/reports/standalone_browser_latest.json',
    fingerprintReport: 'minigame_master/capabilities/reports/runtime_host_fingerprint_latest.json',
    exportReport: 'minigame_master/capabilities/reports/export_standalone_latest.json',
    legacyNode1: 'data/workspaces/20260611-060754-719406/nodes/node1.js',
    legacyCombat: 'data/workspaces/20260611-060754-719406/runtime/CombatRuntime.js',
    legacyEnemy: 'data/workspaces/20260611-060754-719406/runtime/EnemyArchetypeRuntime.js',
    legacyBoss: 'data/workspaces/20260611-060754-719406/runtime/BossPhaseController.js',
    adapter: 'minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js',
    fixture: 'docs/gameplay_cards/fixtures/survivor_horde/node1_runtime_parity.json',
    fixtureSchema: 'docs/contracts/runtime_parity_fixture.schema.json'
};

const sourceCache = new Map();
const evidence = [];
const assertions = [];

function read(relativePath) {
    if (!sourceCache.has(relativePath)) {
        const absolutePath = path.join(loreRoot, relativePath);
        if (!fs.existsSync(absolutePath)) throw new Error(`Missing parity source: ${relativePath}`);
        sourceCache.set(relativePath, fs.readFileSync(absolutePath, 'utf8'));
    }
    return sourceCache.get(relativePath);
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function capture(id, relativePath, anchor) {
    const source = read(relativePath);
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error(`Evidence anchor not found: ${relativePath} :: ${anchor}`);
    const line = source.slice(0, index).split(/\r?\n/).length;
    const item = {
        id,
        path: relativePath,
        line,
        anchor,
        sourceLine: source.split(/\r?\n/)[line - 1].trim(),
        fileSha256: crypto.createHash('sha256').update(source).digest('hex')
    };
    evidence.push(item);
    assertions.push(`evidence:${id}`);
    return id;
}

function assertSameIdentity(...reports) {
    const identities = reports.map((report) => `${report.runtimeVersion}|${report.specHash}`);
    if (new Set(identities).size !== 1) {
        throw new Error(`Runtime identity drift: ${identities.join(', ')}`);
    }
    const [runtimeVersion, specHash] = identities[0].split('|');
    if (runtimeVersion !== '2.0.0' || !/^sha256:[a-f0-9]{64}$/.test(specHash)) {
        throw new Error('Runtime identity must contain production runtime 2.0.0 and a sha256 specHash');
    }
    assertions.push('reports:same_runtime_identity');
    return { runtimeVersion, specHash };
}

const fixture = readJson(files.fixture);
readJson(files.fixtureSchema);
if (fixture.schemaVersion !== 'loreweaver.runtime-parity-fixture.v1'
    || fixture.determinism?.randomSource !== 'injected'
    || fixture.determinism?.clock?.mode !== 'fixed_step') {
    throw new Error('Canonical parity fixture must preserve its injected random/fixed-step contract');
}
assertions.push('fixture:determinism_contract');

const browserReport = readJson(files.browserReport);
const fingerprintReport = readJson(files.fingerprintReport);
const exportReport = readJson(files.exportReport);
if (browserReport.status !== 'passed' || browserReport.zeroApiRequests !== true) {
    throw new Error('Standalone browser report must pass and prove zero /api requests');
}
if (fingerprintReport.status !== 'passed' || fingerprintReport.sameRuntimeIdentity !== true) {
    throw new Error('IDE/standalone runtime fingerprint report must pass');
}
if (exportReport.status !== 'passed' || exportReport.releaseEligible !== true) {
    throw new Error('Export report must be release eligible');
}
assertions.push('browser:standalone_main_path');
assertions.push('browser:ide_export_fingerprint');
assertions.push('export:release_eligible');
const runtimeIdentity = assertSameIdentity(browserReport, fingerprintReport.ide, fingerprintReport.standalone, exportReport);

const refs = {
    compiler: capture('canonical_compiler', files.compiler, 'export function compileRuntimeSpec('),
    compilerHash: capture('canonical_spec_hash', files.compiler, 'const specHash = `sha256:${sha256Hex(stableStringify({'),
    kernel: capture('shared_kernel_entry', files.kernel, 'export function startLoreWeaverRuntime('),
    kernelRunner: capture('shared_kernel_game_runner', files.kernel, 'const game = initializePhaserGame('),
    kernelMetadata: capture('shared_kernel_diagnostics', files.kernel, 'adapterRegistryVersion: "loreweaver.adapter-registry.v2"'),
    sharedPlayerState: capture('shared_player_state', files.playerState, 'export const PLAYER_STATE_SCHEMA'),
    ideImport: capture('ide_kernel_import', files.store, 'import { startLoreWeaverRuntime } from "./runtime/LoreWeaverRuntimeKernel";'),
    ideCall: capture('ide_kernel_call', files.store, 'const runtime = startLoreWeaverRuntime('),
    standaloneImport: capture('standalone_kernel_import', files.standalone, 'import { startLoreWeaverRuntime, LoreWeaverRuntimeHandle }'),
    standaloneCall: capture('standalone_kernel_call', files.standalone, 'runtime = startLoreWeaverRuntime(resolvedSpec, {'),
    standaloneState: capture('standalone_shared_state', files.standalone, 'import { INITIAL_PLAYER_STATE, normalizePlayerState }'),
    standaloneSpec: capture('standalone_embedded_spec', files.standaloneHtml, 'id="loreweaver-runtime-spec"'),
    exporterCompiler: capture('exporter_canonical_compiler', files.exporter, 'import { compileRuntimeSpec }'),
    exporterBuild: capture('exporter_shared_shell_build', files.exporter, '["build", "--config", "vite.config.standalone.ts"]'),
    exporterBrowserGate: capture('exporter_browser_gate', files.exporter, 'validateBrowserReport(browserReportArg, resolvedSpec)'),
    viteSpec: capture('vite_embedded_resolved_spec', files.standaloneVite, 'LOREWEAVER_RUNTIME_SPEC_PATH'),
    legacySkills: capture('legacy_skill_runtime', files.legacyNode1, 'upgradeRunSkill(skillId, sourceText)'),
    legacyCombat: capture('legacy_combat_runtime', files.legacyNode1, 'this.combatRuntime = new CombatRuntime(this);'),
    legacyShield: capture('legacy_shield_resolution', files.legacyCombat, 'resolveShieldAbsorption(scene.playerShield, damage)'),
    legacyEnemy: capture('legacy_enemy_runtime', files.legacyNode1, 'this.enemyArchetypeRuntime = new EnemyArchetypeRuntime(this);'),
    legacyBoss: capture('legacy_boss_runtime', files.legacyNode1, 'this.bossPhaseController = new BossPhaseController(this, boss, {'),
    adapterEnemy: capture('adapter_enemy_spawn', files.adapter, 'spawnEnemy(patch = {})'),
    adapterDamage: capture('adapter_player_damage', files.adapter, 'damagePlayer(amount, failReason = NODE_RESULT_REASONS.HP_ZERO)'),
    adapterResult: capture('adapter_result', files.adapter, 'finish(success, reason = null)'),
    adapterCleanup: capture('adapter_cleanup', files.adapter, 'this.lifecycle?.destroy();'),
    adapterTestState: capture('adapter_test_state', files.adapter, 'getTestState()')
};

if (/js\/main\.js/.test(JSON.stringify(exportReport.buildAssertions)) || exportReport.buildAssertions?.legacyEntryAbsent !== true) {
    throw new Error('Release report must explicitly prove the legacy entry is absent');
}
assertions.push('topology:legacy_product_entry_absent');

const capabilityMatrix = [
    ['pointer_movement', 'legacy present', 'shared adapter present', 'input host port'],
    ['keyboard_or_active_input', 'legacy PlayerActionController', 'shared adapter partial', 'typed input action map'],
    ['automatic_ability', 'legacy leveled auto skills', 'shared adapter leveled projectile', 'typed auto slots'],
    ['active_ability_execution', 'legacy rich execution runtime', 'shared adapter partial', 'ability execution service'],
    ['run_skill_upgrade', 'legacy observable upgrades', 'shared adapter Node1 growth supported', 'seeded progression service'],
    ['damage_shield_heal_status', 'legacy CombatRuntime rich', 'shared adapter damage-first partial', 'combat resolver'],
    ['enemy_archetypes_moves', 'legacy explicit archetypes', 'shared adapter weighted chase/contact', 'enemy move state machine'],
    ['ranged_enemy_attacks', 'legacy present', 'shared adapter incomplete', 'enemy projectile executor'],
    ['boss_phase_move_pool', 'legacy BossPhaseController', 'shared adapter stats/spawn partial', 'boss phase controller'],
    ['drops_collection', 'legacy present', 'shared adapter present', 'drop rule service'],
    ['vfx_sfx_callout', 'legacy distributed rich effects', 'shared adapter semantic partial', 'accepted event presentation'],
    ['node_result_save', 'legacy NodeBridge/store', 'shared kernel host save/result', 'single save/result contract'],
    ['lifecycle_cleanup', 'legacy explicit partial', 'shared SceneLifecycle', 'kernel lifecycle registry'],
    ['test_hooks', 'legacy rich scene state', 'shared adapter test state', 'stable test-state contract']
].map(([capability, legacyNode1, sharedRuntime, migrationTarget]) => ({
    capability,
    legacyNode1,
    sharedRuntime,
    migrationTarget
}));

const resolvedDivergences = [
    'runtime_entry_split',
    'gameplay_spec_split',
    'workbench_patch_materialization_missing',
    'production_spec_hash_missing',
    'file_presence_export_smoke'
];
const remainingBlockers = [
    {
        id: 'deterministic_trace_not_replayed_in_both_hosts',
        ownerTask: 'LW-065',
        detail: 'The same seed, fixed-step clock and authored input timeline have not yet produced a machine-diffed business-state trace in both hosts.'
    },
    {
        id: 'multi_card_parity_coverage_incomplete',
        ownerTask: 'LW-065',
        detail: 'Node1 main path is browser-proven, but a modifier composition and a non-survivor card are not yet covered by the differential gate.'
    },
    {
        id: 'adapter_registry_modular_extraction_incomplete',
        ownerTask: 'LW-061',
        detail: 'Both hosts share one GameRunner dispatch today, but the growing card factory chain still needs extraction into its own registry module.'
    },
    {
        id: 'rich_legacy_combat_capabilities_incomplete',
        ownerTask: 'LW-057-LW-060',
        detail: 'Active skills, shield/heal/status, explicit enemy moves, ranged attacks and full Boss move pools remain migration work, not Solution B topology work.'
    },
    {
        id: 'independent_antigravity_review_unavailable',
        ownerTask: 'LW-061-LW-065',
        detail: 'Codex implemented and self-tested under explicit human override; collaboration policy still requires independent Antigravity adoption/review before verified status.'
    }
];

const report = {
    schemaVersion: 'loreweaver.runtime-parity-baseline.v2',
    captureStatus: 'passed',
    solutionBCutoverStatus: 'main_path_passed',
    runtimeParityGate: 'failed',
    createdAt: new Date().toISOString(),
    runtimeIdentity,
    architectureDecision: {
        decision: 'solution_b_single_runtime',
        pipeline: ['compileRuntimeSpec', 'LoreWeaverRuntimeKernel', 'shared GameRunner/adapter dispatch', 'host ports'],
        rule: 'IDE and standalone may adapt container, save, logging and assets; neither owns a separate gameplay implementation.'
    },
    runtimeTopology: {
        ide: { spec: refs.compiler, kernel: refs.ideCall, hostKind: 'ide' },
        standalone: { spec: refs.viteSpec, kernel: refs.standaloneCall, hostKind: 'standalone' },
        shared: { compiler: refs.compiler, kernel: refs.kernel, runner: refs.kernelRunner, playerState: refs.sharedPlayerState },
        productionExport: { compiler: refs.exporterCompiler, shellBuild: refs.exporterBuild, browserGate: refs.exporterBrowserGate, legacyEntryAbsent: true }
    },
    fixture: {
        path: files.fixture,
        fixtureId: fixture.fixtureId,
        declaredSpecHash: fixture.specHash,
        seed: fixture.determinism.seed,
        fixedDeltaMs: fixture.determinism.clock.fixedDeltaMs
    },
    browserEvidence: {
        standalone: files.browserReport,
        hostFingerprint: files.fingerprintReport,
        release: files.exportReport
    },
    capabilityMatrix,
    resolvedDivergences,
    remainingBlockers,
    evidence,
    assertions,
    summary: {
        evidenceCount: evidence.length,
        capabilityCount: capabilityMatrix.length,
        resolvedDivergenceCount: resolvedDivergences.length,
        blockingDivergenceCount: remainingBlockers.length,
        parityClaimAllowed: false,
        solutionBMainPathClaimAllowed: true
    }
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
    captureStatus: report.captureStatus,
    solutionBCutoverStatus: report.solutionBCutoverStatus,
    runtimeParityGate: report.runtimeParityGate,
    runtimeIdentity: report.runtimeIdentity,
    resolvedDivergenceCount: report.summary.resolvedDivergenceCount,
    blockingDivergenceCount: report.summary.blockingDivergenceCount,
    report: path.relative(loreRoot, reportPath)
}, null, 2));
