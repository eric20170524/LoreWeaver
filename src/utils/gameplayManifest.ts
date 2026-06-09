import {
  GameSpec,
  GameplayAssignment,
  GameplayModifierSpec,
  ManifestPatch,
  RevisionRecord
} from "../types";

export interface GameplayCardOption {
  id: string;
  title: string;
  titleEn?: string;
  category: "base" | "container" | "modifier";
  adapter: string;
}

export const GAMEPLAY_CARD_OPTIONS: GameplayCardOption[] = [
  { id: "node_iframe_microgame", title: "HTML 单页玩法容器", titleEn: "HTML single-page container", category: "container", adapter: "iframe" },
  { id: "survivor_horde", title: "割草生存", titleEn: "Survivor horde", category: "base", adapter: "phaser" },
  { id: "turn_based_skill_battle", title: "回合制技能战斗", titleEn: "Turn-based skill battle", category: "base", adapter: "iframe" },
  { id: "rhythm_timing", title: "节奏判定", titleEn: "Rhythm timing", category: "base", adapter: "iframe" },
  { id: "drag_collect_grid", title: "拖拽采集网格", titleEn: "Drag collect grid", category: "base", adapter: "iframe" },
  { id: "sequence_synthesis", title: "顺序合成", titleEn: "Sequence synthesis", category: "base", adapter: "iframe" },
  { id: "hazard_telegraph", title: "危险区预警", titleEn: "Hazard telegraph", category: "modifier", adapter: "phaser" },
  { id: "defend_core", title: "防守核心", titleEn: "Defend core", category: "modifier", adapter: "phaser" },
  { id: "escort_npc", title: "护送 NPC", titleEn: "Escort NPC", category: "modifier", adapter: "phaser" },
  { id: "boss_phases", title: "Boss 多阶段", titleEn: "Boss phases", category: "modifier", adapter: "phaser" },
  { id: "poison_fog", title: "毒雾缩圈", titleEn: "Poison fog", category: "modifier", adapter: "phaser" },
  { id: "laser_warning", title: "激光预警", titleEn: "Laser warning", category: "modifier", adapter: "phaser" }
];

const LEGACY_MECHANICS_TO_CARD: Record<string, string> = {
  tap_reaction: "rhythm_timing",
  collect_dodge: "drag_collect_grid",
  memory_sequence: "sequence_synthesis"
};

export function defaultGameplayForMechanics(mechanics: string): GameplayAssignment {
  const cardId = LEGACY_MECHANICS_TO_CARD[mechanics] || "survivor_horde";
  const card = GAMEPLAY_CARD_OPTIONS.find((item) => item.id === cardId);
  return {
    adapter: card?.adapter || "phaser",
    cardId,
    modifiers: [],
    knobs: {},
    patchLevel: "L2"
  };
}

export function ensureGameplayManifest(spec: GameSpec): GameSpec {
  const gameplayCards = Array.from(new Set([
    ...(spec.gameplayCards || []),
    ...GAMEPLAY_CARD_OPTIONS.map((item) => item.id)
  ]));

  return {
    ...spec,
    gameplayCards,
    nodes: spec.nodes.map((node) => ({
      ...node,
      gameplay: node.gameplay || defaultGameplayForMechanics(node.mechanics)
    })),
    workbench: {
      patches: spec.workbench?.patches || [],
      revisions: spec.workbench?.revisions || [],
      artifactStatus: {
        manifest: "fresh",
        gameplayCards: "fresh",
        demo: "fresh",
        ...(spec.workbench?.artifactStatus || {})
      }
    }
  };
}

export function createGameplayPatch(
  spec: GameSpec,
  nodeId: number,
  nextGameplay: GameplayAssignment,
  reason = "Gameplay card selection changed"
): ManifestPatch {
  const node = spec.nodes.find((item) => item.id === nodeId);
  const before = node?.gameplay || defaultGameplayForMechanics(node?.mechanics || "survivor_horde");

  return {
    id: `patch_${Date.now()}_${nodeId}`,
    target: `nodes.${nodeId}.gameplay`,
    operation: "replace",
    before,
    after: nextGameplay,
    reason,
    invalidates: [
      `node:${nodeId}`,
      `adapter:${nextGameplay.adapter}`,
      "gate:build",
      "gate:e2e"
    ],
    patchLevel: "L2",
    status: "proposed",
    createdAt: new Date().toISOString()
  };
}

export function applyManifestPatch(spec: GameSpec, patch: ManifestPatch): GameSpec {
  const normalized = ensureGameplayManifest(spec);
  const nodeId = Number(patch.target.split(".")[1]);
  const appliedPatch: ManifestPatch = {
    ...patch,
    status: "applied"
  };

  const nextSpec: GameSpec = {
    ...normalized,
    nodes: normalized.nodes.map((node) => (
      node.id === nodeId
        ? { ...node, gameplay: patch.after }
        : node
    )),
    workbench: {
      patches: [...(normalized.workbench?.patches || []), appliedPatch],
      revisions: normalized.workbench?.revisions || [],
      artifactStatus: {
        ...(normalized.workbench?.artifactStatus || {}),
        [`node:${nodeId}`]: "stale",
        "gate:build": "stale",
        "gate:e2e": "stale"
      }
    }
  };

  const revision: RevisionRecord = {
    id: `rev_${Date.now()}`,
    createdAt: new Date().toISOString(),
    patches: [appliedPatch.id],
    manifestSnapshot: nextSpec,
    gateResults: {
      build: "pending",
      e2e: "pending"
    },
    artifactStatus: "stale"
  };

  return {
    ...nextSpec,
    workbench: {
      ...(nextSpec.workbench || { patches: [], revisions: [], artifactStatus: {} }),
      revisions: [...(nextSpec.workbench?.revisions || []), revision]
    }
  };
}

export function toggleModifier(modifiers: GameplayModifierSpec[], modifierId: string): GameplayModifierSpec[] {
  if (modifiers.some((item) => item.id === modifierId)) {
    return modifiers.filter((item) => item.id !== modifierId);
  }
  return [...modifiers, { id: modifierId, knobs: {} }];
}
