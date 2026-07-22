#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import SurvivorHordeAdapter from '../../minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js';
import TreasureChestHordeModifier from '../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/TreasureChestHordeModifier.js';
import ChannelInteractionSystem from '../../minigame_master/core/lib/gameplay/survivor_horde/systems/ChannelInteractionSystem.js';
import { createMockPhaser } from '../../minigame_master/core/lib/testing/MockPhaserScene.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assertions = [];

function record(name, fn) {
    fn();
    assertions.push(name);
}

function modifierState(modifier) {
    return modifier.getTestState();
}

const channelEvents = [];
const channel = new ChannelInteractionSystem({
    leavePolicy: 'reset',
    damagePolicy: 'regress',
    damageRegressMs: 400,
    onEvent: (event) => channelEvents.push(event)
});

channel.step({ targetId: 'objective_a', durationMs: 1000, deltaMs: 600 });
record('channel_starts_and_progresses', () => {
    assert.equal(channel.getSnapshot().state, 'channeling');
    assert.equal(channel.getSnapshot().progressMs, 600);
});

channel.interrupt('damage');
record('accepted_damage_regresses_channel', () => {
    assert.equal(channel.getSnapshot().state, 'interrupted');
    assert.equal(channel.getSnapshot().progressMs, 200);
    assert.equal(channel.getSnapshot().lastInterruptReason, 'damage');
});

channel.step({ targetId: 'objective_a', durationMs: 1000, deltaMs: 500, canRun: false });
record('paused_channel_does_not_advance', () => {
    assert.equal(channel.getSnapshot().progressMs, 200);
});

channel.step({ targetId: 'objective_a', durationMs: 1000, deltaMs: 300 });
channel.step({ targetId: null });
record('leaving_range_applies_reset_policy', () => {
    assert.equal(channel.getSnapshot().state, 'interrupted');
    assert.equal(channel.getSnapshot().progressMs, 0);
    assert.equal(channel.getSnapshot().lastInterruptReason, 'left_range');
});

channel.step({ targetId: 'objective_a', durationMs: 1000, deltaMs: 1000 });
channel.step({ targetId: 'objective_a', durationMs: 1000, deltaMs: 1000 });
record('completion_is_idempotent', () => {
    assert.equal(channel.getSnapshot().state, 'completed');
    assert.equal(channelEvents.filter((event) => event.type === 'completed').length, 1);
});
channel.destroy();

const presentationEvents = [];
const publishedTestStates = [];
const mock = createMockPhaser();
const treasure = new TreasureChestHordeModifier({
    chestCount: 1,
    requiredOpenCount: 1,
    respawnIntervalMs: 0,
    interactionRadius: 90,
    damageRegressMs: 40,
    rewardScore: 8,
    riskSequence: ['high'],
    riskTiers: {
        high: {
            durationMs: 200,
            rewardMultiplier: 3,
            guardSpawnAt: 0.25,
            guardCount: 3
        }
    }
});
const adapter = new SurvivorHordeAdapter({
    Phaser: mock.Phaser,
    modifiers: [treasure],
    random: () => 0.5,
    testHooks: { update: (state) => publishedTestStates.push(state) },
    onPresentationEvent: (event) => presentationEvents.push({
        ...event,
        observedScore: adapter.state.score
    })
});

adapter.init({
    nodeId: 'channel_fixture',
    nodeConfig: {
        duration: 30,
        gameplay: {
            cardId: 'survivor_horde',
            enemies: { spawnIntervalMs: 999999, spawnCount: 0 },
            weapon: { fireIntervalMs: 999999 },
            collectibles: { enabled: false }
        }
    },
    playerStats: { hp: 100 }
});
adapter.create(mock.scene);
const chest = treasure.chests[0];

adapter.update(0, 60);
record('high_risk_threshold_spawns_guards_once', () => {
    assert.equal(modifierState(treasure).guardsSpawned, 3);
    assert.equal(mock.scene.physics.add.group != null, true);
    assert.equal(adapter.groups.enemies.getChildren().length, 3);
});

const progressBeforePause = modifierState(treasure).channel.progressMs;
adapter.pause();
mock.tick(500);
adapter.update(500, 500);
record('adapter_pause_freezes_channel', () => {
    assert.equal(modifierState(treasure).channel.progressMs, progressBeforePause);
});
adapter.resume();

record('rejected_damage_emits_no_event_or_interrupt', () => {
    const damageEventsBefore = adapter.runtimeEventHistory.filter((event) => event.type === 'player-damaged').length;
    assert.equal(adapter.damagePlayer(0), false);
    assert.equal(adapter.runtimeEventHistory.filter((event) => event.type === 'player-damaged').length, damageEventsBefore);
    assert.equal(modifierState(treasure).channel.state, 'channeling');
});

record('player_damage_is_accepted', () => {
    assert.equal(adapter.damagePlayer(5), true);
    assert.equal(adapter.state.hp, 95);
});
record('player_damage_event_interrupts_modifier', () => {
    const state = modifierState(treasure);
    assert.equal(state.channel.state, 'interrupted');
    assert.equal(state.channel.progressMs, 20);
    assert.equal(state.lastInterruptReason, 'damage');
});

adapter.player.setPosition(0, 0);
adapter.update(560, 20);
record('modifier_leave_range_resets_progress', () => {
    const state = modifierState(treasure);
    assert.equal(state.channel.progressMs, 0);
    assert.equal(state.lastInterruptReason, 'left_range');
});

adapter.player.setPosition(chest.x, chest.y);
adapter.targetPoint = { x: chest.x, y: chest.y };
for (let index = 0; index < 4; index += 1) {
    mock.tick(50);
    adapter.update(580 + index * 50, 50);
}

record('completed_chest_awards_risk_scaled_reward_once', () => {
    const state = modifierState(treasure);
    assert.equal(state.openedCount, 1);
    assert.equal(state.highRiskOpened, 1);
    assert.equal(state.totalReward.score, 24);
    assert.equal(adapter.state.score, 24);
    assert.equal(adapter.state.collectedRewards.score, 24);
});
record('success_presentation_follows_accepted_completion', () => {
    const opened = presentationEvents.filter((event) => event.action === 'treasure_opened');
    assert.equal(opened.length, 1);
    assert.equal(opened[0].accepted, true);
    assert.deepEqual(opened[0].reward, { score: 24 });
    assert.equal(opened[0].observedScore, 24);
});
record('duplicate_open_cannot_reward_or_present', () => {
    assert.equal(treasure.openChest(adapter.createRuntimeContext(), chest), false);
    assert.equal(adapter.state.score, 24);
    assert.equal(presentationEvents.filter((event) => event.action === 'treasure_opened').length, 1);
});
record('guard_threshold_is_idempotent', () => {
    assert.equal(modifierState(treasure).guardsSpawned, 3);
});
record('test_hooks_expose_channel_business_state', () => {
    const treasureState = publishedTestStates.at(-1)?.modifiers?.find(
        (state) => state.modifier === 'TreasureChestHordeModifier'
    );
    assert.equal(treasureState?.openedCount, 1);
    assert.equal(treasureState?.highRiskOpened, 1);
    assert.equal(treasureState?.guardsSpawned, 3);
    assert.equal(treasureState?.totalReward?.score, 24);
});

adapter.destroy();
record('shutdown_cleans_channel_resources', () => {
    assert.equal(adapter.status, 'destroyed');
    assert.equal(treasure.installed, false);
    assert.equal(treasure.interaction, null);
    assert.equal(treasure.chests.length, 0);
});

const out = {
    schemaVersion: 'loreweaver.survivor-channel-interaction-check.v1',
    status: 'passed',
    createdAt: new Date().toISOString(),
    source: 'minigame_master/core/lib/gameplay/survivor_horde',
    fixture: {
        seedMode: 'injected_constant_random',
        targetRisk: 'high',
        durationMs: 200,
        damageRegressMs: 40,
        expectedRewardScore: 24
    },
    assertions,
    runtimeEvidence: {
        presentationActions: presentationEvents.map((event) => event.action),
        runtimeEventTypes: adapter.runtimeEventHistory.map((event) => event.type)
    }
};
const reportPath = path.join(root, 'minigame_master/capabilities/reports/survivor_channel_interaction_latest.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(out, null, 2)}\n`);
console.log('Survivor channel interaction check passed:', reportPath);
