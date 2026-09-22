import type { GameSpec, PlayerState, PassiveSkillSpec, AbilitySpec } from '../../types';
import { WEAPON_STANCE_CYCLE_DEFAULT_CONFIG } from '../../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/WeaponStanceCycleModifier.js';
import { OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG } from '../../../minigame_master/core/lib/gameplay/survivor_horde/modifiers/OverdriveTransformationModifier.js';

/** Shipped modifier defaults. A missing preset knob must scale from these, not from 0. */
const MODIFIER_NUMERIC_DEFAULTS: Record<string, Record<string, unknown>> = {
  weapon_stance_cycle: WEAPON_STANCE_CYCLE_DEFAULT_CONFIG,
  overdrive_transformation: OVERDRIVE_TRANSFORMATION_DEFAULT_CONFIG,
};

function positiveKnob(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function knobBase(modifierId: string, knobs: Record<string, any>, key: string): number | null {
  if (knobs[key] !== undefined && knobs[key] !== null) {
    const present = positiveKnob(knobs[key]);
    if (present !== null) return present;
  }
  return positiveKnob(MODIFIER_NUMERIC_DEFAULTS[modifierId]?.[key]);
}

/** Presentation comes from the active manifest, never from a built-in IP. */
export function cultivationView(spec: GameSpec) {
  const labels = spec.uiConfig?.cultivation?.labels || {};
  const player = spec.characterDesignCatalog?.find(item => item.role === 'player' || item.role === 'player_character');
  const text = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const currency = text(spec.economy?.currencyName?.split('/')[0], '修炼资源');
  return {
    currency,
    color: /^#[\da-f]{6}$/i.test(spec.themeColor) ? spec.themeColor : '#b45309',
    panel: text(labels.panel, player ? `${player.name} · 修炼` : '修炼面板'),
    practice: text(labels.practice, '吐纳\n修炼'),
    train: text(labels.train, '强化修炼'),
    breakthrough: text(labels.breakthrough, '突破境界'),
    passives: text(labels.passives, '武技研习'),
    abilities: text(labels.abilities, '能力图鉴'),
    income: text(labels.income, `${currency}积累`),
    passivesCatalog: Array.isArray(spec.passiveSkillCatalog) ? spec.passiveSkillCatalog : [],
    abilitiesCatalog: Array.isArray(spec.abilityCatalog) ? spec.abilityCatalog : []
  };
}

/** Catalog visibility is not proof that an ability has a combat implementation. */
export function abilityRecorded(item: AbilitySpec, state: PlayerState): boolean {
  return item.unlockSource === 'initial' || Boolean(state.unlockedAbilities?.includes(item.id));
}

type PurchaseStatus = 'available' | 'owned' | 'planned' | 'unsupported' | 'requires' | 'insufficient';
const IDLE_TARGETS = new Set(['clickPower', 'activeMultiplier']);
const COMBAT_TARGETS = new Set([
  'player.hp',
  'weapon_stance_cycle.meleeDamage',
  'weapon_stance_cycle.meleeRadius',
  'weapon_stance_cycle.rangedBurstCount',
  'weapon_stance_cycle.rangedDamageMultiplier',
  'adapter.weapon.bulletDamage',
  'overdrive_transformation.damageMultiplier',
  'overdrive_transformation.durationSec'
]);
const OPS = new Set(['add', 'multiply', 'set']);

export function isSupportedPassiveTarget(target: string): boolean {
  return IDLE_TARGETS.has(target) || COMBAT_TARGETS.has(target);
}

export function applyNumericOp(before: number, op: string, value: number): number {
  if (op === 'add') return before + value;
  if (op === 'multiply') return before * value;
  if (op === 'set') return value;
  return before;
}

function ownedImplementedPassives(state: PlayerState, catalog: PassiveSkillSpec[] = []): PassiveSkillSpec[] {
  const owned = new Set(state.unlockedPassives || []);
  return catalog.filter((item) => owned.has(item.id) && item.runtimeStatus !== 'planned');
}

/** Initial rows are owned at the start. Node rewards count only after RewardApplier writes them. */
function abilityOwned(item: AbilitySpec, state: PlayerState): boolean {
  if (!item || item.runtimeStatus === 'planned') return false;
  if (item.unlockSource === 'initial') return true;
  return Boolean(state.unlockedAbilities?.includes(item.id));
}

function combatKnobKey(modifierId: string, target: string): string | null {
  if (!COMBAT_TARGETS.has(target) || target === 'player.hp') return null;
  const prefixes = [`${modifierId}.`, `modifier.${modifierId}.`];
  const prefix = prefixes.find((entry) => target.startsWith(entry));
  return prefix ? target.slice(prefix.length) : null;
}

export function foldOwnedAbilityEffectsIntoKnobs(
  modifierId: string,
  knobs: Record<string, any>,
  state: PlayerState,
  catalog: AbilitySpec[] = []
): Record<string, any> {
  const next = { ...knobs };
  for (const item of catalog) {
    if (!abilityOwned(item, state)) continue;
    for (const effect of item.effects || []) {
      const key = combatKnobKey(modifierId, String(effect.target || ''));
      if (!key || !OPS.has(effect.op) || typeof effect.value !== 'number') continue;
      const before = knobBase(modifierId, next, key);
      if (before === null) continue;
      const after = applyNumericOp(before, effect.op, effect.value);
      if (positiveKnob(after) !== null) next[key] = after;
    }
  }
  return next;
}

export function foldOwnedAbilityHp(
  state: PlayerState,
  catalog: AbilitySpec[] = [],
  baseHp = 100
): number {
  let hp = baseHp;
  for (const item of catalog) {
    if (!abilityOwned(item, state)) continue;
    for (const effect of item.effects || []) {
      if (effect.target !== 'player.hp' || !OPS.has(effect.op) || typeof effect.value !== 'number') continue;
      const after = applyNumericOp(hp, effect.op, effect.value);
      if (Number.isFinite(after) && after >= 0) hp = after;
    }
  }
  return hp;
}

export function foldPassiveEffectsIntoKnobs(
  modifierId: string,
  knobs: Record<string, any>,
  state: PlayerState,
  catalog: PassiveSkillSpec[] = []
): Record<string, any> {
  const next = { ...knobs };
  const prefixes = [`${modifierId}.`, `modifier.${modifierId}.`];
  for (const item of ownedImplementedPassives(state, catalog)) {
    for (const effect of item.effects || []) {
      const target = String(effect.target || '');
      const prefix = prefixes.find((entry) => target.startsWith(entry));
      if (!prefix || !OPS.has(effect.op) || typeof effect.value !== 'number') continue;
      const key = target.slice(prefix.length);
      const before = Number(next[key]);
      const after = applyNumericOp(Number.isFinite(before) ? before : 0, effect.op, effect.value);
      if (Number.isFinite(after) && after >= 0) next[key] = after;
    }
  }
  return next;
}

export function resolveCombatHp(
  state: PlayerState,
  catalog: PassiveSkillSpec[] = [],
  baseHp = 100
): number {
  let hp = Number.isFinite(baseHp) && baseHp > 0 ? baseHp : 100;
  for (const item of ownedImplementedPassives(state, catalog)) {
    for (const effect of item.effects || []) {
      if (effect.target !== 'player.hp' || !OPS.has(effect.op) || typeof effect.value !== 'number') continue;
      const after = applyNumericOp(hp, effect.op, effect.value);
      if (Number.isFinite(after) && after >= 0) hp = after;
    }
  }
  return hp;
}

/** Realm index is long-term 境界: HP and melee scale before passives. */
export function realmCombatScale(realmIndex: number) {
  const realm = Math.max(0, Math.floor(Number(realmIndex) || 0));
  return {
    hpMultiplier: 1 + realm * 0.12,
    meleeDamageMultiplier: 1 + realm * 0.08
  };
}

export function resolveNodeCombatStats(
  state: PlayerState,
  catalog: PassiveSkillSpec[] = [],
  bases: { hp: number; stanceKnobs?: Record<string, any> } = { hp: 100 },
  abilities: AbilitySpec[] = []
) {
  const scale = realmCombatScale(state.currentRealmIndex);
  const baseHp = (Number.isFinite(bases.hp) && bases.hp > 0 ? bases.hp : 100) * scale.hpMultiplier;
  const stance = foldOwnedAbilityEffectsIntoKnobs(
    'weapon_stance_cycle',
    foldPassiveEffectsIntoKnobs(
      'weapon_stance_cycle',
      { ...(bases.stanceKnobs || {}) },
      state,
      catalog
    ),
    state,
    abilities
  );
  if (Number.isFinite(Number(stance.meleeDamage))) {
    stance.meleeDamage = Number(stance.meleeDamage) * scale.meleeDamageMultiplier;
  }
  return {
    hp: foldOwnedAbilityHp(state, abilities, resolveCombatHp(state, catalog, baseHp)),
    stanceKnobs: stance,
    realm: scale
  };
}

export function passivePurchaseStatus(item: PassiveSkillSpec, state: PlayerState): PurchaseStatus {
  // Old saves may have bought a planned skill. Never display that as implemented.
  if (item.runtimeStatus === 'planned') return 'planned';
  if (!Number.isFinite(item.cost) || item.cost < 0 || !Array.isArray(item.effects) || !item.effects.length) return 'unsupported';
  if (item.effects.some(effect => !isSupportedPassiveTarget(effect.target) || !OPS.has(effect.op)
      || typeof effect.value !== 'number' || !Number.isFinite(effect.value))) return 'unsupported';
  if (state.unlockedPassives?.includes(item.id)) return 'owned';
  if (item.requires && !state.unlockedPassives?.includes(item.requires)) return 'requires';
  if (!Number.isFinite(state.mainCurrencyCount) || state.mainCurrencyCount < item.cost) return 'insufficient';
  return 'available';
}

/** Validate the whole transaction before spending. Never partly apply a skill. */
export function purchasePassive(item: PassiveSkillSpec, state: PlayerState): boolean {
  if (passivePurchaseStatus(item, state) !== 'available') return false;
  const next: Record<string, number> = { clickPower: state.clickPower, activeMultiplier: state.activeMultiplier };
  for (const effect of item.effects) {
    if (!IDLE_TARGETS.has(effect.target)) continue;
    const before = next[effect.target];
    const after = applyNumericOp(before, effect.op, effect.value as number);
    if (!Number.isFinite(after) || after < 0) return false;
    next[effect.target] = after;
  }
  state.mainCurrencyCount -= item.cost;
  state.clickPower = next.clickPower;
  state.activeMultiplier = next.activeMultiplier;
  state.unlockedPassives = [...(state.unlockedPassives || []), item.id];
  return true;
}
