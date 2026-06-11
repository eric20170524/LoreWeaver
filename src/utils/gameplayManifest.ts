import {
  GameSpec,
  AbilitySpec,
  GameplayAssignment,
  GameplayModifierSpec,
  ManifestPatch,
  NodePlanningSpec,
  RevisionRecord
} from "../types";

export interface GameplayCardOption {
  id: string;
  title: string;
  titleEn?: string;
  category: "base" | "container" | "modifier";
  adapter: string;
  
  // Relational metadata
  modifierFor?: string[];
  effectSummary?: string;
  effectSummaryEn?: string;
  changes?: string;
  changesEn?: string;
  requires?: string[];
  conflicts?: string[];
  implementationStatus?: "implemented" | "design_only";
  
  // Base card specific metadata
  victory?: string;
  victoryEn?: string;
  failure?: string;
  failureEn?: string;
}

export const GAMEPLAY_CARD_OPTIONS: GameplayCardOption[] = [
  { id: "node_iframe_microgame", title: "HTML 单页玩法容器", titleEn: "HTML single-page container", category: "container", adapter: "iframe" },
  {
    id: "survivor_horde",
    title: "割草生存",
    titleEn: "Survivor horde",
    category: "base",
    adapter: "phaser",
    victory: "存活至倒计时结束",
    victoryEn: "Survive until timer ends",
    failure: "玩家角色死亡 (HP <= 0)",
    failureEn: "Player dies (HP <= 0)",
    requires: ["Movement", "Spawner", "Timer", "Combat"]
  },
  { id: "turn_based_skill_battle", title: "回合制技能战斗", titleEn: "Turn-based skill battle", category: "base", adapter: "iframe" },
  {
    id: "rhythm_timing",
    title: "快速聚灵",
    titleEn: "Spiritual tap reaction",
    category: "base",
    adapter: "phaser",
    victory: "吸收到达目标灵力值并战胜阵眼首领",
    victoryEn: "Reach target energy and defeat Mandala Boss",
    failure: "玩家生命值归零 (HP <= 0) 或雷劫超时",
    failureEn: "Player dies (HP <= 0) or timer runs out",
    requires: ["TapController", "ShrinkingTimer", "MandalaBoss", "Timer"]
  },
  {
    id: "drag_collect_grid",
    title: "虚空飞渡",
    titleEn: "Void collect and dodge",
    category: "base",
    adapter: "phaser",
    victory: "收集灵珠到达目标值并击败雷兽首领",
    victoryEn: "Collect target gems and defeat Thunder Beast Boss",
    failure: "玩家生命值归零 (HP <= 0) 或雷劫超时",
    failureEn: "Player dies (HP <= 0) or timer runs out",
    requires: ["DragController", "CascadePhysics", "ThunderBeastBoss", "Timer"]
  },
  { id: "sequence_synthesis", title: "顺序合成", titleEn: "Sequence synthesis", category: "base", adapter: "iframe" },
  
  // Modifiers
  {
    id: "hazard_telegraph",
    title: "危险区预警",
    titleEn: "Hazard telegraph",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "在地图上生成红色预警区域，延迟后对玩家造成伤害",
    effectSummaryEn: "Generates red warning zones that deal damage to player after a delay",
    changes: "地图危险, 伤害机制",
    changesEn: "Map Hazard, Damage Mechanism",
    requires: ["TelegraphRenderer", "Collision", "Timer"],
    conflicts: [],
    implementationStatus: "implemented"
  },
  {
    id: "defend_core",
    title: "防守核心",
    titleEn: "Defend core",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "在地图中心添加防守目标，目标血量归零则关卡失败",
    effectSummaryEn: "Adds a core objective at the center; mission fails if its HP reaches zero",
    changes: "失败条件, 防守目标",
    changesEn: "Failure Condition, Defense Objective",
    requires: ["ObjectiveHp", "EnemyTargeting"],
    conflicts: ["escort_npc"],
    implementationStatus: "implemented"
  },
  {
    id: "escort_npc",
    title: "护送 NPC",
    titleEn: "Escort NPC",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "保护移动的友好 NPC 到达终点，NPC 死亡则关卡失败",
    effectSummaryEn: "Protect a moving friendly NPC to the destination; fails if NPC dies",
    changes: "失败条件, 胜利条件, 友军 HP",
    changesEn: "Failure/Victory Condition, Ally HP",
    requires: ["NPCAI", "ObjectiveHp"],
    conflicts: ["defend_core"],
    implementationStatus: "design_only"
  },
  {
    id: "boss_phases",
    title: "Boss 多阶段",
    titleEn: "Boss phases",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "首领怪拥有多个血量阶段与不同的弹幕招式",
    effectSummaryEn: "Boss monster has multiple HP stages and different bullet patterns",
    changes: "Boss 行为, 胜利条件",
    changesEn: "Boss Behavior, Victory Condition",
    requires: ["BossState", "PhaseBulletPatterns"],
    conflicts: [],
    implementationStatus: "design_only"
  },
  {
    id: "poison_fog",
    title: "毒雾缩圈",
    titleEn: "Poison fog",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "随时间缩小安全区域，处于迷雾中持续扣除生命值",
    effectSummaryEn: "Shrinks safe zone over time; standing in fog drains player HP",
    changes: "地图危险, 持续扣血",
    changesEn: "Map Hazard, HP Drain",
    requires: ["FogRenderer", "SafeZoneCollision"],
    conflicts: [],
    implementationStatus: "design_only"
  },
  {
    id: "laser_warning",
    title: "激光预警",
    titleEn: "Laser warning",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "横跨屏幕的激光束预警，短暂延迟后发射造成致命伤害",
    effectSummaryEn: "Screen-wide laser beam warnings that fire after a short delay",
    changes: "地图危险, 伤害机制",
    changesEn: "Map Hazard, Damage Mechanism",
    requires: ["LaserRenderer", "LineCollision"],
    conflicts: [],
    implementationStatus: "design_only"
  }
];

const LEGACY_MECHANICS_TO_CARD: Record<string, string> = {
  tap_reaction: "rhythm_timing",
  collect_dodge: "drag_collect_grid",
  memory_sequence: "sequence_synthesis"
};

function uniqueList(values: string[] | undefined, fallback: string[] = []): string[] {
  const source = Array.isArray(values) ? values : fallback;
  return Array.from(new Set(source.map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizeAbility(ability: AbilitySpec): AbilitySpec {
  return {
    ...ability,
    gameplayTags: uniqueList(ability.gameplayTags),
    runtimeSkillIds: uniqueList(ability.runtimeSkillIds),
    affectedNodeIds: Array.from(new Set((ability.affectedNodeIds || []).map(Number).filter(Boolean)))
  };
}

function normalizeNodePlanning(node: GameSpec["nodes"][number]): NodePlanningSpec {
  return {
    mainlineHooks: uniqueList(node.planning?.mainlineHooks),
    rewardUnlocks: uniqueList(node.planning?.rewardUnlocks),
    runSkillPool: uniqueList(node.planning?.runSkillPool),
    notes: node.planning?.notes || ""
  };
}

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

  const progressionSystems = (spec.progressionSystems || []).map((system) => ({
    ...system,
    unlocks: uniqueList(system.unlocks)
  }));

  const abilityCatalog = (spec.abilityCatalog || []).map(normalizeAbility);

  const nodes = spec.nodes.map((node) => {
    const gameplay = node.gameplay || defaultGameplayForMechanics(node.mechanics);
    const nodeWithGameplay = { ...node, gameplay };
    return {
      ...nodeWithGameplay,
      planning: normalizeNodePlanning(nodeWithGameplay)
    };
  });

  return {
    ...spec,
    progressionSystems,
    abilityCatalog,
    gameplayCards,
    nodes,
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
  const appliedPatch: ManifestPatch = {
    ...patch,
    status: "applied"
  };

  let nextSpec: GameSpec = { ...normalized };
  const target = patch.target;

  if (target === "themeColor") {
    nextSpec.themeColor = patch.after;
  } else if (target.startsWith("nodes.")) {
    const parts = target.split(".");
    const nodeId = Number(parts[1]);
    const field = parts[2];
    
    nextSpec.nodes = nextSpec.nodes.map((node) => {
      if (node.id === nodeId) {
        if (!field) {
          return { ...node, gameplay: patch.after };
        }
        if (field === "gameplay") {
          if (parts[3] === "knobs") {
            const currentGameplay = node.gameplay || defaultGameplayForMechanics(node.mechanics || "survivor_horde");
            return {
              ...node,
              gameplay: {
                ...currentGameplay,
                knobs: patch.after
              }
            };
          }
          return { ...node, gameplay: patch.after };
        }
        return { ...node, [field]: patch.after };
      }
      return node;
    });
  }

  const nodeIdMatch = target.match(/nodes\.(\d+)/);
  const nodeId = nodeIdMatch ? Number(nodeIdMatch[1]) : null;

  const newArtifactStatus = {
    ...(normalized.workbench?.artifactStatus || {}),
    "gate:build": "stale" as const,
    "gate:e2e": "stale" as const
  };
  if (nodeId !== null) {
    newArtifactStatus[`node:${nodeId}`] = "stale" as const;
  }

  nextSpec.workbench = {
    patches: [...(normalized.workbench?.patches || []), appliedPatch],
    revisions: normalized.workbench?.revisions || [],
    artifactStatus: newArtifactStatus
  };

  const { workbench: _, ...snapshotSpec } = nextSpec;
  const revision: RevisionRecord = {
    id: `rev_${Date.now()}`,
    createdAt: new Date().toISOString(),
    patches: [appliedPatch.id],
    manifestSnapshot: snapshotSpec,
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

export function getSpecValueByPath(spec: GameSpec, path: string): any {
  if (path === "themeColor") return spec.themeColor;
  if (path.startsWith("nodes.")) {
    const parts = path.split(".");
    const nodeId = Number(parts[1]);
    const field = parts[2];
    const node = spec.nodes.find(n => n.id === nodeId);
    if (!node) return undefined;
    if (field === "gameplay") {
      if (parts[3] === "knobs") {
        return node.gameplay?.knobs;
      }
      return node.gameplay;
    }
    return (node as any)[field];
  }
  return undefined;
}
