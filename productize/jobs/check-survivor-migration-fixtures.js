#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const loreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = 'docs/gameplay_cards/fixtures/survivor_horde/node2_12_capability_contracts.json';
const schemaPath = 'docs/contracts/survivor_horde_capability_fixture.schema.json';
const reportPath = path.join(loreRoot, 'capabilities/reports/survivor_migration_fixtures_latest.json');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(loreRoot, relativePath), 'utf8'));
}

function requireCondition(condition, message) {
    if (!condition) throw new Error(message);
}

function isSorted(items) {
    return items.every((item, index) => index === 0 || item.atMs >= items[index - 1].atMs);
}

const schema = readJson(schemaPath);
const suite = readJson(fixturePath);
const assertions = [];
const sourceEvidence = [];

requireCondition(schema.$id?.endsWith('survivor_horde_capability_fixture.schema.json'), 'Capability fixture schema id mismatch');
requireCondition(suite.schemaVersion === 'loreweaver.survivor-horde-capability-suite.v1', 'Capability suite schemaVersion mismatch');
requireCondition(suite.deterministicPolicy?.randomSource === 'injected', 'Capability suite must use injected random');
requireCondition(suite.deterministicPolicy?.compare === 'business_state_and_semantic_events', 'Capability suite comparison scope mismatch');
assertions.push('suite:schema_identity', 'suite:deterministic_policy');

const expectedNodeIds = Array.from({ length: 11 }, (_, index) => index + 2);
const actualNodeIds = suite.nodes.map((node) => node.nodeId);
requireCondition(JSON.stringify(actualNodeIds) === JSON.stringify(expectedNodeIds), 'Capability suite must contain Node2 through Node12 exactly once in order');
assertions.push('suite:node2_12_complete');

const defectIds = new Set(suite.knownDefects.map((defect) => defect.id));
for (const requiredDefect of [
    'node5.frame_random_retarget',
    'node8.undefined_combat_difficulty',
    'node8.duplicate_reward_field',
    'node9.frame_random_retarget',
    'shared.hardcoded_world_geometry',
    'shared.unregistered_lifecycle_handles',
    'node12.untelegraphed_pattern_bullets'
]) {
    requireCondition(defectIds.has(requiredDefect), `Known defect missing: ${requiredDefect}`);
}
assertions.push('suite:known_defects_complete');

const destinationKinds = new Set();
for (const node of suite.nodes) {
    for (const key of ['playerDecisions', 'risks', 'counters', 'testHooks', 'lifecycleResources', 'migrationClassification', 'sourceAnchors', 'inputTimeline', 'checkpoints']) {
        requireCondition(Array.isArray(node[key]) && node[key].length > 0, `Node${node.nodeId} requires non-empty ${key}`);
    }
    requireCondition(isSorted(node.inputTimeline), `Node${node.nodeId} inputTimeline must be sorted`);
    requireCondition(isSorted(node.checkpoints), `Node${node.nodeId} checkpoints must be sorted`);
    requireCondition(node.presentation?.vfxKinds?.length > 0, `Node${node.nodeId} requires VFX kinds`);
    requireCondition(node.presentation?.sfxKinds?.length > 0, `Node${node.nodeId} requires SFX kinds`);
    requireCondition(node.presentation?.calloutKinds?.length > 0, `Node${node.nodeId} requires callout kinds`);

    for (const item of node.migrationClassification) {
        destinationKinds.add(item.destination);
        if (item.destination === 'reject_migration') {
            requireCondition(defectIds.has(item.targetId), `Node${node.nodeId} rejected capability must target a known defect: ${item.targetId}`);
        }
    }
    for (const excluded of node.excludedLegacyBehavior) {
        requireCondition(defectIds.has(excluded), `Node${node.nodeId} excludes unknown defect: ${excluded}`);
    }

    const sourcePath = `data/workspaces/20260611-060754-719406/nodes/node${node.nodeId}.js`;
    const source = fs.readFileSync(path.join(loreRoot, sourcePath), 'utf8');
    for (const anchor of node.sourceAnchors) {
        const index = source.indexOf(anchor);
        requireCondition(index >= 0, `Node${node.nodeId} source anchor missing: ${anchor}`);
        sourceEvidence.push({
            nodeId: node.nodeId,
            path: sourcePath,
            line: source.slice(0, index).split(/\r?\n/).length,
            anchor
        });
    }
    assertions.push(`node${node.nodeId}:contract_complete`);
    assertions.push(`node${node.nodeId}:source_anchors`);
}

for (const requiredDestination of ['core_primitive', 'existing_modifier_enhancement', 'node_instance_config', 'reject_migration']) {
    requireCondition(destinationKinds.has(requiredDestination), `Migration destination is not represented: ${requiredDestination}`);
}
assertions.push('suite:migration_destinations_complete');

const serialized = JSON.stringify(suite);
for (const forbidden of ['pixelSnapshot', 'spritePath', 'protectedDialogue', 'characterName']) {
    requireCondition(!serialized.includes(forbidden), `Theme/pixel field is forbidden in capability fixtures: ${forbidden}`);
}
assertions.push('suite:theme_and_pixel_neutral');

const report = {
    schemaVersion: 'loreweaver.survivor-migration-fixtures-check.v1',
    status: 'passed',
    createdAt: new Date().toISOString(),
    fixturePath,
    schemaPath,
    nodeIds: actualNodeIds,
    knownDefectIds: [...defectIds],
    destinationKinds: [...destinationKinds].sort(),
    assertions,
    sourceEvidence,
    summary: {
        nodeCount: suite.nodes.length,
        fixtureCount: suite.nodes.length,
        knownDefectCount: suite.knownDefects.length,
        sourceAnchorCount: sourceEvidence.length,
        assertionCount: assertions.length
    }
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
    status: report.status,
    nodeCount: report.summary.nodeCount,
    knownDefectCount: report.summary.knownDefectCount,
    sourceAnchorCount: report.summary.sourceAnchorCount,
    report: path.relative(loreRoot, reportPath)
}, null, 2));
