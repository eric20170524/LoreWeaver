import HazardTelegraphModifier from './HazardTelegraphModifier.js';
import DefendCoreModifier from './DefendCoreModifier.js';
import BossPhasesModifier from './BossPhasesModifier.js';
import PoisonFogModifier from './PoisonFogModifier.js';
import EscortNpcModifier from './EscortNpcModifier.js';
import LaserWarningModifier from './LaserWarningModifier.js';

export const SURVIVOR_HORDE_MODIFIER_REGISTRY = Object.freeze({
    hazard_telegraph: HazardTelegraphModifier,
    defend_core: DefendCoreModifier,
    boss_phases: BossPhasesModifier,
    poison_fog: PoisonFogModifier,
    escort_npc: EscortNpcModifier,
    laser_warning: LaserWarningModifier
});

export const SURVIVOR_HORDE_SUPPORTED_MODIFIERS = Object.freeze(
    Object.keys(SURVIVOR_HORDE_MODIFIER_REGISTRY)
);

export function createSurvivorHordeModifier(entry = {}) {
    const id = typeof entry === 'string' ? entry : entry.id;
    const ModifierClass = SURVIVOR_HORDE_MODIFIER_REGISTRY[id];
    if (!ModifierClass) {
        throw new Error(`Unsupported survivor_horde modifier: ${id || 'unknown'}`);
    }

    const knobs = typeof entry === 'string'
        ? {}
        : entry.knobs || entry.config || {};
    return new ModifierClass(knobs);
}

export function createSurvivorHordeModifiers(entries = []) {
    return entries.map((entry) => createSurvivorHordeModifier(entry));
}
