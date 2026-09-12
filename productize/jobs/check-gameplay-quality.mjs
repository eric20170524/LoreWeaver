#!/usr/bin/env node
// Structural coverage only. Construction is not installation/playthrough evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runtime from '../../minigame_master/core/lib/gameplay/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readCards = rel => fs.readdirSync(path.join(root, rel)).filter(f => f.endsWith('.json')).sort().map(file => ({ file, card: JSON.parse(fs.readFileSync(path.join(root, rel, file), 'utf8')) }));
const cards = readCards('minigame_master/gameplay/cards');
const modifiers = readCards('minigame_master/gameplay/cards/modifiers');
const registries = { survivor_horde: runtime.SURVIVOR_HORDE_MODIFIER_REGISTRY, side_scrolling_brawler: runtime.SIDE_SCROLLING_BRAWLER_MODIFIER_REGISTRY };
const factories = { survivor_horde: runtime.createSurvivorHordeModifier, side_scrolling_brawler: runtime.createSideScrollingBrawlerModifier };

test('catalog discovery is nonempty and ids are unique', () => {
  assert.ok(cards.length > 0); assert.ok(modifiers.length > 0);
  const ids = [...cards, ...modifiers].map(({ card }) => card.id);
  assert.equal(new Set(ids).size, ids.length);
});
for (const { file, card } of cards) test(`base card resolves through canonical exports: ${card.id}`, () => {
  assert.equal(file, `${card.id}.json`); assert.equal(card.schemaVersion, '2.0');
  const Adapter = runtime[card.runtime?.adapter];
  assert.equal(typeof Adapter, 'function');
  const instance = new Adapter();
  for (const method of ['init', 'getTestState', 'retreat', 'destroy']) assert.equal(typeof instance[method], 'function', method);
  const surface = card.id === 'node_iframe_microgame' ? 'mount' : 'create';
  assert.equal(typeof instance[surface], 'function', surface);
});
for (const { file, card } of modifiers) test(`modifier card resolves on declared bases: ${card.id}`, () => {
  assert.equal(file, `${card.id}.json`); assert.equal(card.schemaVersion, '2.0');
  assert.ok(card.modifierFor?.length);
  for (const base of card.modifierFor) {
    assert.ok(registries[base]?.[card.id], `${card.id} is not registered for ${base}`);
    const knobs = Object.fromEntries(Object.entries(card.knobs || {}).map(([key, spec]) => [key, spec.default]));
    const instance = factories[base]({ id: card.id, knobs });
    assert.equal(typeof instance.install, 'function'); assert.equal(typeof instance.uninstall, 'function');
  }
});
test('every registered modifier has a descriptor (no silent catalog omissions)', () => {
  for (const [base, registry] of Object.entries(registries)) for (const id of Object.keys(registry)) {
    assert.ok(modifiers.some(({ card }) => card.id === id && card.modifierFor.includes(base)), `${base}:${id}`);
  }
});

for (const [id, defaults] of [['weapon_stance_cycle', runtime.WEAPON_STANCE_CYCLE_DEFAULT_CONFIG], ['run_growth_milestones', runtime.RUN_GROWTH_MILESTONES_DEFAULT_CONFIG]]) test(`new descriptor defaults match implementation: ${id}`, () => {
  const card = modifiers.find(entry => entry.card.id === id).card;
  for (const [key, spec] of Object.entries(card.knobs)) assert.deepEqual(spec.default, defaults[key], key);
  assert.equal(card.exportPolicy.productionReady, false);
  assert.deepEqual(card.verifiedCombinations, []);
});
