import type { GameSpec, PlayerState, PassiveSkillSpec, AbilitySpec } from '../../types';

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
const TARGETS = new Set(['clickPower', 'activeMultiplier']);
const OPS = new Set(['add', 'multiply', 'set']);

export function passivePurchaseStatus(item: PassiveSkillSpec, state: PlayerState): PurchaseStatus {
  // Old saves may have bought a planned skill. Never display that as implemented.
  if (item.runtimeStatus === 'planned') return 'planned';
  if (!Number.isFinite(item.cost) || item.cost < 0 || !Array.isArray(item.effects) || !item.effects.length) return 'unsupported';
  if (item.effects.some(effect => !TARGETS.has(effect.target) || !OPS.has(effect.op)
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
    const before = next[effect.target];
    const value = effect.value as number;
    const after = effect.op === 'add' ? before + value : effect.op === 'multiply' ? before * value : value;
    if (!Number.isFinite(after) || after < 0) return false;
    next[effect.target] = after;
  }
  state.mainCurrencyCount -= item.cost;
  state.clickPower = next.clickPower;
  state.activeMultiplier = next.activeMultiplier;
  state.unlockedPassives = [...(state.unlockedPassives || []), item.id];
  return true;
}
