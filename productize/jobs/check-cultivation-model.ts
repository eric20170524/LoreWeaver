import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RewardApplier } from '../../src/utils/RewardApplier.ts';
import { createSurvivorHordeModifier } from '../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/registry.js';
import { WEAPON_STANCE_CYCLE_DEFAULT_CONFIG } from '../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/WeaponStanceCycleModifier.js';
import { OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG } from '../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/OverdriveTransformationModifier.js';
import {
  cultivationView, abilityRecorded, passivePurchaseStatus, purchasePassive,
  applyNumericOp, foldPassiveEffectsIntoKnobs, foldOwnedAbilityEffectsIntoKnobs,
  realmCombatScale, resolveCombatHp, resolveNodeCombatStats
} from '../../src/game/ui/cultivationModel.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const loadSpec = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const state = (): any => ({ mainCurrencyCount: 500, currentRealmIndex: 3, clickPower: 2, activeMultiplier: 1,
  unlockedAbilities: ['foreign_ability'], unlockedPassives: [], unlockedNodeIds: [1], completedNodeIds: [], secondaryResources: {} });
const spec: any = { title: '测试世界', themeColor: '#b83a2d', economy: { currencyName: '真气', realms: ['武徒'] },
  characterDesignCatalog: [{ name: '石牧', role: 'player' }], nodes: [] };
const skill: any = { id: 'train', name: '练习', cost: 20, effects: [{ target: 'clickPower', op: 'multiply', value: 2 }], description: '测试' };

test('active manifest owns labels, character, color and empty catalogs', () => {
  const view = cultivationView(spec);
  assert.equal(view.panel, '石牧 · 修炼');
  assert.equal(cultivationView({ ...spec, characterDesignCatalog: [{ name: '别的主角', role: 'player_character' }] }).panel, '别的主角 · 修炼');
  assert.equal(view.currency, '真气');
  assert.equal(view.color, spec.themeColor);
  assert.deepEqual(view.passivesCatalog, []);
  assert.deepEqual(view.abilitiesCatalog, []);
  assert.doesNotMatch(JSON.stringify(view), /洞天|骨文|宝术|狻猊|至尊骨|蕴能/);
});
test('UI label overrides do not require another IP-specific plugin', () => {
  const view = cultivationView({ ...spec, uiConfig: { plugin: 'cultivation', cultivation: { labels: { abilities: '刀弓图鉴', train: '锤炼体魄' } } } });
  assert.equal(view.abilities, '刀弓图鉴');
  assert.equal(view.train, '锤炼体魄');
});
test('realm advancement does not falsely unlock the whole ability catalog', () => {
  const s = state();
  const ability: any = { id: 'late_form', unlockSource: 'hybrid' };
  assert.equal(abilityRecorded(ability, s), false);
  assert.equal(abilityRecorded({ ...ability, unlockSource: 'initial' }, s), true);
  s.unlockedAbilities.push('late_form');
  assert.equal(abilityRecorded(ability, s), true);
});
test('planned skills cannot spend currency, including already purchased legacy IDs', () => {
  const s = state();
  const planned = { ...skill, runtimeStatus: 'planned' };
  const before = structuredClone(s);
  assert.equal(passivePurchaseStatus(planned, s), 'planned');
  assert.equal(purchasePassive(planned, s), false);
  assert.deepEqual(s, before);
  s.unlockedPassives.push('train');
  assert.equal(passivePurchaseStatus(planned, s), 'planned');
});
test('unknown effect targets cannot charge for a no-op or partial effect', () => {
  const s = state();
  const unsupported = { ...skill, effects: [...skill.effects, { target: 'not_a_runtime_stat', op: 'multiply', value: 2 }] };
  const before = structuredClone(s);
  assert.equal(purchasePassive(unsupported, s), false);
  assert.deepEqual(s, before);
});
test('implemented combat passives spend once and fold into stance knobs', () => {
  const s = state();
  const blade = {
    id: 'blade_speed_1', name: '疾风刀势', cost: 20, runtimeStatus: 'implemented',
    effects: [{ target: 'weapon_stance_cycle.meleeDamage', op: 'multiply', value: 1.15 }]
  };
  assert.equal(passivePurchaseStatus(blade, s), 'available');
  assert.equal(purchasePassive(blade, s), true);
  assert.equal(s.mainCurrencyCount, 480);
  assert.equal(s.clickPower, 2);
  assert.deepEqual(s.unlockedPassives, ['blade_speed_1']);
  assert.equal(foldPassiveEffectsIntoKnobs('weapon_stance_cycle', { meleeDamage: 5 }, s, [blade]).meleeDamage, 5.75);
  assert.equal(purchasePassive(blade, s), false);
});
test('planned combat passives stay inert even if a legacy save already owns them', () => {
  const s = state();
  s.unlockedPassives = ['bow_burst_1'];
  const bow = {
    id: 'bow_burst_1', runtimeStatus: 'planned',
    effects: [{ target: 'weapon_stance_cycle.rangedBurstCount', op: 'add', value: 1 }]
  };
  assert.equal(passivePurchaseStatus(bow, s), 'planned');
  assert.equal(foldPassiveEffectsIntoKnobs('weapon_stance_cycle', { rangedBurstCount: 2 }, s, [bow]).rangedBurstCount, 2);
});
test('realm, bow burst, bloodline hp and moon insight all change runtime numbers', () => {
  const s = state();
  s.currentRealmIndex = 2;
  const bow = { id: 'bow_burst_1', cost: 20, runtimeStatus: 'implemented',
    effects: [{ target: 'weapon_stance_cycle.rangedBurstCount', op: 'add', value: 1 }] };
  const blood = { id: 'bloodline_toughness', cost: 60, runtimeStatus: 'implemented',
    effects: [{ target: 'player.hp', op: 'multiply', value: 1.2 }] };
  const moon = { id: 'moon_insight_1', cost: 40, runtimeStatus: 'implemented',
    effects: [{ target: 'clickPower', op: 'multiply', value: 1.25 }, { target: 'activeMultiplier', op: 'multiply', value: 1.2 }] };
  assert.equal(purchasePassive(bow, s), true);
  assert.equal(purchasePassive(blood, s), true);
  assert.equal(purchasePassive(moon, s), true);
  assert.equal(s.clickPower, 2.5);
  assert.equal(s.activeMultiplier, 1.2);
  const combat = resolveNodeCombatStats(s, [bow, blood, moon], { hp: 120, stanceKnobs: { meleeDamage: 5, rangedBurstCount: 2 } });
  assert.equal(combat.hp, 120 * 1.24 * 1.2);
  assert.equal(combat.stanceKnobs.meleeDamage, 5 * 1.16);
  assert.equal(combat.stanceKnobs.rangedBurstCount, 3);
});

test('player.hp passives change the node payload hp and leave idle stats alone', () => {
  const s = state();
  const toughness = {
    id: 'bloodline_toughness', cost: 60, runtimeStatus: 'implemented',
    effects: [{ target: 'player.hp', op: 'multiply', value: 1.2 }]
  };
  s.mainCurrencyCount = 60;
  assert.equal(purchasePassive(toughness, s), true);
  assert.equal(s.activeMultiplier, 1);
  assert.equal(resolveCombatHp(s, [toughness], 120), 144);
});
test('purchases apply multiply/set/add correctly and remain idempotent', () => {
  const s = state();
  assert.equal(purchasePassive(skill, s), true);
  assert.equal(s.clickPower, 4);
  assert.equal(s.mainCurrencyCount, 480);
  assert.equal(purchasePassive(skill, s), false);
  assert.equal(s.mainCurrencyCount, 480);
  assert.equal(purchasePassive({ ...skill, id: 'set', effects: [{ target: 'activeMultiplier', op: 'set', value: 4 }] }, s), true);
  assert.equal(s.activeMultiplier, 4);
  assert.equal(purchasePassive({ ...skill, id: 'add', effects: [{ target: 'activeMultiplier', op: 'add', value: 2 }] }, s), true);
  assert.equal(s.activeMultiplier, 6);
});
function freshMainline(): any {
  return {
    mainCurrencyCount: 0, currentRealmIndex: 0, clickPower: 1.5, activeMultiplier: 1,
    unlockedAbilities: [], unlockedPassives: [], unlockedNodeIds: [1], completedNodeIds: [],
    secondaryResources: {}, storyFlags: []
  };
}

function hostSuccess(node: any): any {
  return {
    success: true,
    rewards: {
      unlockedAbilities: [...(node.planning?.rewardUnlocks || [])],
      unlockNextNode: true
    }
  };
}

test('first-clear reward apply folds black_blade_flame into the next stance melee stat', () => {
  const specs = [
    loadSpec('data/presets/xuanjiezhimen_fangame_preset.json'),
    loadSpec('productize/fixtures/xuanjie-shimu-contract.json')
  ];
  for (const spec of specs) {
    const node3 = spec.nodes.find((node: any) => node.id === 3);
    const node1 = spec.nodes.find((node: any) => node.id === 1);
    const stance = node3.gameplay.modifiers.find((item: any) => item.id === 'weapon_stance_cycle').knobs;
    const ability = spec.abilityCatalog.find((item: any) => item.id === 'black_blade_flame');
    const effects = (ability.effects || []).filter((effect: any) =>
      effect.target === 'weapon_stance_cycle.meleeDamage' || effect.target === 'weapon_stance_cycle.meleeRadius');
    assert.ok(effects.length >= 1, 'catalog row without a melee effect does not count');
    assert.deepEqual(node3.planning.rewardUnlocks, ['black_blade_flame']);

    const ownedCatalogOnly = freshMainline();
    const before = resolveNodeCombatStats(ownedCatalogOnly, spec.passiveSkillCatalog, {
      hp: node3.gameplay.knobs.player.hp, stanceKnobs: stance
    }, spec.abilityCatalog);
    const realm = realmCombatScale(ownedCatalogOnly.currentRealmIndex).meleeDamageMultiplier;
    for (const effect of effects) {
      const key = effect.target.split('.').pop();
      const presetValue = Number(stance[key]);
      const expectedBefore = key === 'meleeDamage' ? presetValue * realm : presetValue;
      assert.equal(before.stanceKnobs[key], expectedBefore);
    }
    assert.equal(foldOwnedAbilityEffectsIntoKnobs('weapon_stance_cycle', { ...stance }, ownedCatalogOnly, [{
      ...ability, effects: []
    }]).meleeDamage, stance.meleeDamage);

    const failed = RewardApplier.apply(freshMainline(), node3, { success: false, reason: 'hp_zero' });
    const retreated = RewardApplier.apply(freshMainline(), node3, { success: false, reason: 'retreated' });
    for (const skipped of [failed, retreated]) {
      assert.deepEqual(skipped.completedNodeIds, []);
      assert.deepEqual(skipped.unlockedAbilities, []);
    }

    const cleared = RewardApplier.apply(freshMainline(), node3, hostSuccess(node3));
    assert.ok(cleared.completedNodeIds.includes(3));
    assert.ok(cleared.unlockedAbilities.includes('black_blade_flame'));
    const after = resolveNodeCombatStats(cleared, spec.passiveSkillCatalog, {
      hp: node3.gameplay.knobs.player.hp, stanceKnobs: stance
    }, spec.abilityCatalog);
    for (const effect of effects) {
      const key = effect.target.split('.').pop();
      const folded = applyNumericOp(Number(stance[key]), effect.op, effect.value);
      const expected = key === 'meleeDamage' ? folded * realm : folded;
      assert.equal(after.stanceKnobs[key], expected);
      assert.notEqual(after.stanceKnobs[key], before.stanceKnobs[key]);
    }

    const node1Clear = RewardApplier.apply(freshMainline(), node1, hostSuccess(node1));
    assert.ok(node1Clear.completedNodeIds.includes(1));
    assert.equal(node1Clear.unlockedAbilities.includes('black_blade_flame'), false);
    assert.deepEqual(node1Clear.unlockedAbilities, node1.planning.rewardUnlocks);
  }
});

test('clearing nodes 1 through 12 writes the campaign and later rewards change the next fight', () => {
  const spec = loadSpec('data/presets/xuanjiezhimen_fangame_preset.json');
  let state = freshMainline();
  const completed: number[] = [];
  const nodes = [...spec.nodes].sort((a: any, b: any) => a.id - b.id);
  for (const node of nodes) {
    assert.equal(node.id, completed.length + 1);
    const skipped = RewardApplier.apply(state, node, { success: false, reason: 'retreated' });
    assert.deepEqual(skipped.completedNodeIds, completed);
    state = RewardApplier.apply(state, node, hostSuccess(node));
    completed.push(node.id);
    assert.deepEqual([...state.completedNodeIds], completed);
    if (node.id < 12) assert.ok(state.unlockedNodeIds.includes(node.id + 1));
  }
  assert.deepEqual(completed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(state.unlockedAbilities.includes('black_blade_flame'));
  assert.ok(state.unlockedAbilities.includes('swallow_moon'));
  assert.ok(state.unlockedAbilities.includes('white_ape_overdrive'));

  const node11 = spec.nodes.find((node: any) => node.id === 11);
  const stance = node11.gameplay.modifiers.find((item: any) => item.id === 'weapon_stance_cycle').knobs;
  const overdrive = node11.gameplay.modifiers.find((item: any) => item.id === 'overdrive_transformation').knobs;
  const before = freshMainline();
  const afterStance = resolveNodeCombatStats(state, spec.passiveSkillCatalog, { hp: 180, stanceKnobs: stance }, spec.abilityCatalog);
  const beforeStance = resolveNodeCombatStats(before, spec.passiveSkillCatalog, { hp: 180, stanceKnobs: stance }, spec.abilityCatalog);
  const meleeEffect = spec.abilityCatalog.find((item: any) => item.id === 'black_blade_flame').effects
    .find((effect: any) => effect.target === 'weapon_stance_cycle.meleeDamage');
  const rangedEffect = spec.abilityCatalog.find((item: any) => item.id === 'swallow_moon').effects
    .find((effect: any) => effect.target === 'weapon_stance_cycle.rangedDamageMultiplier');
  const realm = realmCombatScale(0).meleeDamageMultiplier;
  assert.equal(afterStance.stanceKnobs.meleeDamage, applyNumericOp(stance.meleeDamage, meleeEffect.op, meleeEffect.value) * realm);
  assert.notEqual(afterStance.stanceKnobs.meleeDamage, beforeStance.stanceKnobs.meleeDamage);
  assert.equal(afterStance.stanceKnobs.rangedDamageMultiplier, applyNumericOp(stance.rangedDamageMultiplier, rangedEffect.op, rangedEffect.value));
  const foldedOverdrive = foldOwnedAbilityEffectsIntoKnobs('overdrive_transformation', { ...overdrive }, state, spec.abilityCatalog);
  const damageEffect = spec.abilityCatalog.find((item: any) => item.id === 'white_ape_overdrive').effects
    .find((effect: any) => effect.target === 'overdrive_transformation.damageMultiplier');
  const durationEffect = spec.abilityCatalog.find((item: any) => item.id === 'white_ape_overdrive').effects
    .find((effect: any) => effect.target === 'overdrive_transformation.durationSec');
  assert.equal(foldedOverdrive.damageMultiplier, applyNumericOp(overdrive.damageMultiplier, damageEffect.op, damageEffect.value));
  assert.equal(foldedOverdrive.durationSec, applyNumericOp(overdrive.durationSec, durationEffect.op, durationEffect.value));
  assert.equal(foldOwnedAbilityEffectsIntoKnobs('overdrive_transformation', { ...overdrive }, before, spec.abilityCatalog).damageMultiplier, overdrive.damageMultiplier);
});

test('missing preset knobs scale from the shipped modifier default, not from zero', () => {
  const spec = loadSpec('data/presets/xuanjiezhimen_fangame_preset.json');
  const nodeById = (id: number) => spec.nodes.find((node: any) => node.id === id);
  const knobsOf = (node: any, modifierId: string) => node.gameplay.modifiers.find((item: any) => item.id === modifierId).knobs;
  let state = freshMainline();
  state = RewardApplier.apply(state, nodeById(6), hostSuccess(nodeById(6)));
  state = RewardApplier.apply(state, nodeById(10), hostSuccess(nodeById(10)));
  assert.ok(state.unlockedAbilities.includes('swallow_moon'));
  assert.ok(state.unlockedAbilities.includes('white_ape_overdrive'));

  const node8Stance = knobsOf(nodeById(8), 'weapon_stance_cycle');
  const node9Stance = knobsOf(nodeById(9), 'weapon_stance_cycle');
  assert.equal(node8Stance.rangedDamageMultiplier, undefined);
  assert.equal(node9Stance.rangedDamageMultiplier, undefined);
  const rangedEffect = spec.abilityCatalog.find((item: any) => item.id === 'swallow_moon').effects
    .find((effect: any) => effect.target === 'weapon_stance_cycle.rangedDamageMultiplier');
  const expectedRanged = applyNumericOp(
    WEAPON_STANCE_CYCLE_DEFAULT_CONFIG.rangedDamageMultiplier,
    rangedEffect.op,
    rangedEffect.value
  );
  const resolved = resolveNodeCombatStats(state, spec.passiveSkillCatalog, {
    hp: 120,
    stanceKnobs: node8Stance
  }, spec.abilityCatalog);
  assert.equal(resolved.stanceKnobs.rangedDamageMultiplier, expectedRanged);
  assert.notEqual(resolved.stanceKnobs.rangedDamageMultiplier, 0);
  const node9Resolved = resolveNodeCombatStats(state, spec.passiveSkillCatalog, {
    hp: 120,
    stanceKnobs: node9Stance
  }, spec.abilityCatalog);
  assert.equal(node9Resolved.stanceKnobs.rangedDamageMultiplier, expectedRanged);
  const node9StanceModifier = createSurvivorHordeModifier({
    id: 'weapon_stance_cycle',
    knobs: node9Resolved.stanceKnobs
  });
  assert.equal(node9StanceModifier.config.rangedDamageMultiplier, expectedRanged);

  const stance = createSurvivorHordeModifier({
    id: 'weapon_stance_cycle',
    knobs: { ...resolved.stanceKnobs, runGrowth: false }
  });
  assert.equal(stance.config.rangedDamageMultiplier, expectedRanged);
  const bulletDamage = 3;
  let firedDamage = 0;
  const stanceAdapter: any = {
    status: 'running',
    state: { elapsedSeconds: 0 },
    config: { weapon: { bulletDamage } },
    modifiers: [stance],
    isRunning: () => true,
    fireAtNearestEnemy() { firedDamage = stanceAdapter.config.weapon.bulletDamage; },
    semanticActions: () => [],
    handleSemanticInput: () => ({})
  };
  const stanceContext = {
    adapter: stanceAdapter,
    scene: { scale: { width: 720, height: 1280 }, add: {}, input: {} },
    player: { x: 0, y: 0 },
    groups: {},
    events: { emit() {} }
  };
  stance.install(stanceContext);
  stance.toggleStance(stanceContext);
  stance._rangedSwapShots = 0;
  stanceAdapter.fireAtNearestEnemy();
  assert.equal(firedDamage, bulletDamage * expectedRanged);
  assert.notEqual(firedDamage, bulletDamage);
  stance.uninstall(stanceContext);

  const node3Overdrive = knobsOf(nodeById(3), 'overdrive_transformation');
  assert.equal(node3Overdrive.damageMultiplier, undefined);
  const damageEffect = spec.abilityCatalog.find((item: any) => item.id === 'white_ape_overdrive').effects
    .find((effect: any) => effect.target === 'overdrive_transformation.damageMultiplier');
  const expectedDamage = applyNumericOp(
    OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG.damageMultiplier,
    damageEffect.op,
    damageEffect.value
  );
  const folded = foldOwnedAbilityEffectsIntoKnobs(
    'overdrive_transformation',
    { ...node3Overdrive },
    state,
    spec.abilityCatalog
  );
  assert.equal(folded.damageMultiplier, expectedDamage);
  assert.notEqual(folded.damageMultiplier, 0);
  assert.notEqual(folded.damageMultiplier, OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG.damageMultiplier);

  const overdrive = createSurvivorHordeModifier({ id: 'overdrive_transformation', knobs: folded });
  assert.equal(overdrive.config.damageMultiplier, expectedDamage);
  const overdriveAdapter: any = {
    status: 'running',
    state: { elapsedSeconds: 1, hp: 80 },
    config: { player: { speed: 100 } },
    payload: {
      inventory: {
        unlockedPassives: overdrive.config.requiresPassive ? [overdrive.config.requiresPassive] : [],
        unlockedAbilities: state.unlockedAbilities
      }
    },
    modifiers: [],
    isRunning: () => true,
    damageEnemy: (_enemy: unknown, damage: number) => damage,
    damagePlayer: (amount: number) => amount
  };
  const overdriveContext = {
    adapter: overdriveAdapter,
    scene: { add: {}, input: {} },
    player: { x: 0, y: 0 },
    events: { emit() {} }
  };
  overdrive.install(overdriveContext);
  assert.equal(overdrive.tryActivate(overdriveContext).accepted, true);
  assert.equal(overdriveAdapter.damageEnemy({}, 10), 10 * expectedDamage);
  assert.notEqual(overdriveAdapter.damageEnemy({}, 10), 10);
  assert.notEqual(overdriveAdapter.damageEnemy({}, 10), 10 * OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG.damageMultiplier);
  overdrive.uninstall(overdriveContext);
});

test('prerequisites, affordability and invalid results are checked before spending', () => {
  const s = state();
  const before = structuredClone(s);
  assert.equal(purchasePassive({ ...skill, requires: 'missing' }, s), false);
  assert.equal(purchasePassive({ ...skill, cost: 999 }, s), false);
  assert.equal(purchasePassive({ ...skill, effects: [{ target: 'clickPower', op: 'set', value: -1 }] }, s), false);
  assert.equal(purchasePassive({ ...skill, cost: -1 }, s), false);
  assert.equal(purchasePassive({ ...skill, effects: [] }, s), false);
  assert.deepEqual(s, before);
});
