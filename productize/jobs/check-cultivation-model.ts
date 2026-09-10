import assert from 'node:assert/strict';
import test from 'node:test';
import { cultivationView, abilityRecorded, passivePurchaseStatus, purchasePassive } from '../../src/game/ui/cultivationModel.ts';

const state = (): any => ({ mainCurrencyCount: 500, currentRealmIndex: 3, clickPower: 2, activeMultiplier: 1,
  unlockedAbilities: ['foreign_ability'], unlockedPassives: [], unlockedNodeIds: [1], completedNodeIds: [], secondaryResources: {} });
const spec: any = { title: '测试世界', themeColor: '#b83a2d', economy: { currencyName: '真气', realms: ['武徒'] },
  characterDesignCatalog: [{ name: '石牧', role: 'player_character' }], nodes: [] };
const skill: any = { id: 'train', name: '练习', cost: 20, effects: [{ target: 'clickPower', op: 'multiply', value: 2 }], description: '测试' };

test('active manifest owns labels, character, color and empty catalogs', () => {
  const view = cultivationView(spec);
  assert.equal(view.panel, '石牧 · 修炼');
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
test('unsupported combat effects cannot charge for a no-op or partial effect', () => {
  const s = state();
  const unsupported = { ...skill, effects: [...skill.effects, { target: 'weapon_stance_cycle.meleeDamage', op: 'multiply', value: 2 }] };
  const before = structuredClone(s);
  assert.equal(purchasePassive(unsupported, s), false);
  assert.deepEqual(s, before);
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
