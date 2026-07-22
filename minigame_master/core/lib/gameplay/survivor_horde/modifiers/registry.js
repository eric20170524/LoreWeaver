import HazardTelegraphModifier from './HazardTelegraphModifier.js';
import DefendCoreModifier from './DefendCoreModifier.js';
import BossPhasesModifier from './BossPhasesModifier.js';
import PoisonFogModifier from './PoisonFogModifier.js';
import EscortNpcModifier from './EscortNpcModifier.js';
import LaserWarningModifier from './LaserWarningModifier.js';
import CrystalCollectionModifier from './CrystalCollectionModifier.js';
import HordeIntensityModifier from './HordeIntensityModifier.js';
import ResourcePressureModifier from './ResourcePressureModifier.js';
import DefendLineModifier from './DefendLineModifier.js';
import DebuffZoneModifier from './DebuffZoneModifier.js';
import DestroyPillarsModifier from './DestroyPillarsModifier.js';
import TreasureChestHordeModifier from './TreasureChestHordeModifier.js';
import ArenaWaveBossModifier from './ArenaWaveBossModifier.js';
import RandomRoomPortalsModifier from './RandomRoomPortalsModifier.js';
import MirrorBossModifier from './MirrorBossModifier.js';
import SelfDestructEnemyModifier from './SelfDestructEnemyModifier.js';

export const SURVIVOR_HORDE_MODIFIER_REGISTRY = Object.freeze({
    hazard_telegraph: HazardTelegraphModifier,
    defend_core: DefendCoreModifier,
    boss_phases: BossPhasesModifier,
    poison_fog: PoisonFogModifier,
    escort_npc: EscortNpcModifier,
    laser_warning: LaserWarningModifier,
    crystal_collection: CrystalCollectionModifier,
    horde_intensity: HordeIntensityModifier,
    resource_pressure: ResourcePressureModifier,
    defend_line: DefendLineModifier,
    debuff_zone: DebuffZoneModifier,
    destroy_pillars: DestroyPillarsModifier,
    treasure_chest_horde: TreasureChestHordeModifier,
    arena_wave_boss: ArenaWaveBossModifier,
    random_room_portals: RandomRoomPortalsModifier,
    mirror_boss: MirrorBossModifier,
    self_destruct_enemy: SelfDestructEnemyModifier
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
