import {
  GameSpec,
  AbilitySpec,
  AudioCueSpec,
  CharacterDesignSpec,
  EnemyDesignSpec,
  GameplayAssignment,
  GameplayModifierSpec,
  ManifestPatch,
  NodePlanningSpec,
  PassiveSkillSpec,
  RevisionRecord
} from "../types";

export interface KnobDefinition {
  type: "number" | "integer" | "boolean" | "enum" | "array";
  default: any;
  min?: number;
  max?: number;
  values?: string[]; // For enum
  description?: string;
  descriptionEn?: string;
}

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

  // Knob definitions
  knobs?: Record<string, KnobDefinition>;
}

export const GAMEPLAY_CARD_OPTIONS: GameplayCardOption[] = [
  { id: "node_iframe_microgame", title: "HTML 单页玩法容器", titleEn: "HTML single-page container", category: "container", adapter: "iframe", knobs: {} },
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
    requires: ["Movement", "Spawner", "Timer", "Combat"],
    knobs: {
      durationSec: {
        type: "number",
        default: 120,
        min: 10,
        max: 600,
        description: "关卡倒计时时长 (秒)",
        descriptionEn: "Level run duration (seconds)"
      },
      enemySpawnRateSec: {
        type: "number",
        default: 1,
        min: 0.05,
        max: 20,
        description: "怪物刷新间隔 (秒)",
        descriptionEn: "Enemy spawn cadence (seconds)"
      }
    }
  },
  { id: "turn_based_skill_battle", title: "回合制技能战斗", titleEn: "Turn-based skill battle", category: "base", adapter: "iframe", knobs: {} },
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
    requires: ["TapController", "ShrinkingTimer", "MandalaBoss", "Timer"],
    knobs: {
      beatIntervalMs: {
        type: "integer",
        default: 1500,
        min: 300,
        max: 5000,
        description: "节拍周期时长 (毫秒)",
        descriptionEn: "Timing cycle length (ms)"
      },
      perfectWindowMs: {
        type: "integer",
        default: 80,
        min: 10,
        max: 500,
        description: "完美判定时间窗口 (毫秒)",
        descriptionEn: "Perfect hit timing window (ms)"
      },
      goodWindowMs: {
        type: "integer",
        default: 160,
        min: 10,
        max: 800,
        description: "优秀判定时间窗口 (毫秒)",
        descriptionEn: "Good hit timing window (ms)"
      },
      targetProgress: {
        type: "integer",
        default: 100,
        min: 10,
        max: 1000,
        description: "通关所需灵力进度值",
        descriptionEn: "Progress target to clear level"
      },
      requiredBestCombo: {
        type: "integer",
        default: 18,
        min: 0,
        max: 200,
        description: "通关连击次数要求 (0表示无)",
        descriptionEn: "Target best combo (0 for none)"
      }
    }
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
    requires: ["DragController", "CascadePhysics", "ThunderBeastBoss", "Timer"],
    knobs: {
      gridCols: {
        type: "integer",
        default: 8,
        min: 3,
        max: 16,
        description: "网格列数 (3-16)",
        descriptionEn: "Grid columns (3-16)"
      },
      gridRows: {
        type: "integer",
        default: 10,
        min: 3,
        max: 20,
        description: "网格行数 (3-20)",
        descriptionEn: "Grid rows (3-20)"
      },
      timeLimitSec: {
        type: "number",
        default: 40,
        min: 5,
        max: 300,
        description: "限制倒计时时长 (秒)",
        descriptionEn: "Timer limit (seconds)"
      },
      needAmount: {
        type: "integer",
        default: 16,
        min: 1,
        max: 999,
        description: "需要收集的灵珠目标数量",
        descriptionEn: "Target gems count to collect"
      },
      mistakesMax: {
        type: "integer",
        default: 3,
        min: 0,
        max: 20,
        description: "允许收集错误的上限次数",
        descriptionEn: "Maximum allowed wrong items"
      },
      allowDiagonal: {
        type: "boolean",
        default: false,
        description: "是否允许斜向滑动判定",
        descriptionEn: "Allow diagonal linkage paths"
      }
    }
  },
  { id: "sequence_synthesis", title: "顺序合成", titleEn: "Sequence synthesis", category: "base", adapter: "iframe", knobs: {
    recipeLength: {
      type: "integer",
      default: 4,
      min: 1,
      max: 20,
      description: "所需配方合成序列长度",
      descriptionEn: "Recipe sequence length"
    },
    materialPoolSize: {
      type: "integer",
      default: 6,
      min: 2,
      max: 30,
      description: "材料池可用选项数量",
      descriptionEn: "Number of options in pool"
    },
    wrongInputProgressPenalty: {
      type: "number",
      default: 30,
      min: 0,
      max: 100,
      description: "选错时的灵气倒退百分比",
      descriptionEn: "Wrong selection progress loss %"
    },
    explodeOnConsecutiveMistakes: {
      type: "integer",
      default: 2,
      min: 1,
      max: 10,
      description: "触发炉鼎爆炸惩罚的连续错误上限",
      descriptionEn: "Consecutive mistakes before explosion"
    }
  } },
  
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
    implementationStatus: "implemented",
    knobs: {
      warningMs: {
        type: "integer",
        default: 900,
        min: 100,
        max: 10000,
        description: "红色预警区域延迟时间 (毫秒)",
        descriptionEn: "Warning delay (ms)"
      },
      activeMs: {
        type: "integer",
        default: 250,
        min: 50,
        max: 10000,
        description: "伤害区域持续生效时间 (毫秒)",
        descriptionEn: "Active damage window (ms)"
      },
      damage: {
        type: "number",
        default: 20,
        min: 0,
        max: 9999,
        description: "预警伤害数值",
        descriptionEn: "Damage value"
      },
      shape: {
        type: "enum",
        values: ["line", "circle", "rect", "polygon"],
        default: "circle",
        description: "预警形状",
        descriptionEn: "Warning area shape"
      }
    }
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
    implementationStatus: "implemented",
    knobs: {
      coreHp: {
        type: "integer",
        default: 100,
        min: 1,
        max: 999999,
        description: "防守核心生命值上限",
        descriptionEn: "Defense core HP limit"
      },
      enemyTargetPriority: {
        type: "enum",
        values: ["player", "core", "nearest"],
        default: "core",
        description: "怪物索敌优先级偏好",
        descriptionEn: "Enemy target preference"
      },
      coreRadius: {
        type: "number",
        default: 36,
        min: 1,
        max: 500,
        description: "核心防护结界判定半径 (像素)",
        descriptionEn: "Core defense collision radius (px)"
      }
    }
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
    implementationStatus: "implemented",
    knobs: {
      npcHp: {
        type: "integer",
        default: 100,
        min: 1,
        max: 999999,
        description: "护送目标 NPC 生命值上限",
        descriptionEn: "Escorted NPC HP limit"
      },
      npcSpeed: {
        type: "number",
        default: 45,
        min: 5,
        max: 500,
        description: "NPC 移动前行速度",
        descriptionEn: "NPC travel speed"
      },
      checkpointCount: {
        type: "integer",
        default: 3,
        min: 1,
        max: 10,
        description: "全线关停停顿检查点数量",
        descriptionEn: "Escort checkpoints count"
      }
    }
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
    implementationStatus: "implemented",
    knobs: {
      phaseThresholds: {
        type: "array",
        default: [0.66, 0.33],
        description: "Boss 多阶段切换血量比例阈值 (如: 0.66, 0.33)",
        descriptionEn: "HP thresholds for boss phases"
      },
      phaseAnnouncement: {
        type: "boolean",
        default: true,
        description: "切换新状态时是否展示全屏公告",
        descriptionEn: "Announce new phase switch on screen"
      }
    }
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
    implementationStatus: "implemented",
    knobs: {
      damagePerSecond: {
        type: "number",
        default: 2,
        min: 0,
        max: 999,
        description: "安全区外每秒持续扣血量",
        descriptionEn: "Poison damage per second"
      },
      safeZoneRadius: {
        type: "number",
        default: 180,
        min: 0,
        max: 2000,
        description: "雷劫安全区初始半径 (像素)",
        descriptionEn: "Initial safe zone radius (px)"
      },
      shrinkRate: {
        type: "number",
        default: 0,
        min: 0,
        max: 100,
        description: "迷雾向中心收紧收缩速度",
        descriptionEn: "Fog area shrinking speed"
      }
    }
  },
  {
    id: "laser_warning",
    title: "激光预警",
    titleEn: "Laser warning",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "横跨屏幕 of 激光束预警，短暂延迟后发射造成致命伤害",
    effectSummaryEn: "Screen-wide laser beam warnings that fire after a short delay",
    changes: "地图危险, 伤害机制",
    changesEn: "Map Hazard, Damage Mechanism",
    requires: ["LaserRenderer", "LineCollision"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      laserCount: {
        type: "integer",
        default: 2,
        min: 1,
        max: 20,
        description: "天劫雷击激光预警条数",
        descriptionEn: "Laser warning beam count"
      },
      laserDamage: {
        type: "number",
        default: 40,
        min: 0,
        max: 9999,
        description: "激光束灼烧单次伤害",
        descriptionEn: "Laser damage value"
      },
      beamWidth: {
        type: "number",
        default: 16,
        min: 1,
        max: 200,
        description: "激光判定光束宽度 (像素)",
        descriptionEn: "Laser beam width (px)"
      }
    }
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
  const tags = uniqueList(ability.tags || ability.gameplayTags);
  return {
    ...ability,
    gameplayTags: uniqueList(ability.gameplayTags, tags),
    tags,
    runtimeSkillIds: uniqueList(ability.runtimeSkillIds),
    affectedNodeIds: Array.from(new Set((ability.affectedNodeIds || []).map(Number).filter(Boolean)))
  };
}

function normalizePassiveSkill(passive: PassiveSkillSpec): PassiveSkillSpec {
  return {
    ...passive,
    affectedRuntimeSkillIds: uniqueList(passive.affectedRuntimeSkillIds),
    effects: Array.isArray(passive.effects) ? passive.effects : []
  };
}

function normalizeCharacterDesign(character: CharacterDesignSpec): CharacterDesignSpec {
  return {
    ...character,
    appearsNodeIds: Array.from(new Set((character.appearsNodeIds || []).map(Number).filter(Boolean))),
    animationCues: uniqueList(character.animationCues),
    skillConnections: uniqueList(character.skillConnections),
    visualDesign: {
      ...character.visualDesign,
      palette: uniqueList(character.visualDesign?.palette)
    }
  };
}

function normalizeEnemyDesign(enemy: EnemyDesignSpec): EnemyDesignSpec {
  return {
    ...enemy,
    palette: uniqueList(enemy.palette)
  };
}

function normalizeAudioCue(cue: AudioCueSpec): AudioCueSpec {
  return {
    ...cue,
    synth: {
      ...cue.synth,
      frequencies: Array.isArray(cue.synth?.frequencies) ? cue.synth.frequencies.map(Number).filter(Boolean) : []
    }
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
  const passiveSkillCatalog = (spec.passiveSkillCatalog || []).map(normalizePassiveSkill);
  const characterDesignCatalog = (spec.characterDesignCatalog || []).map(normalizeCharacterDesign);
  const enemyDesignCatalog = (spec.enemyDesignCatalog || []).map(normalizeEnemyDesign);
  const skillEffectCatalog = (spec.skillEffectCatalog || []).map((effect) => ({
    ...effect,
    palette: uniqueList(effect.palette)
  }));
  const audioCueCatalog = (spec.audioCueCatalog || []).map(normalizeAudioCue);

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
    passiveSkillCatalog,
    characterDesignCatalog,
    enemyDesignCatalog,
    skillEffectCatalog,
    audioCueCatalog,
    gameplayCards,
    nodes,
    workbench: {
      patches: spec.workbench?.patches || [],
      revisions: spec.workbench?.revisions || [],
      artifactStatus: {
        manifest: "fresh",
        gameplayCards: "fresh",
        demo: "fresh",
        abilityCatalog: abilityCatalog.length ? "fresh" : "stale",
        passiveSkillCatalog: passiveSkillCatalog.length ? "fresh" : "stale",
        characterDesignCatalog: characterDesignCatalog.length ? "fresh" : "stale",
        enemyDesignCatalog: enemyDesignCatalog.length ? "fresh" : "stale",
        skillEffectCatalog: skillEffectCatalog.length ? "fresh" : "stale",
        audioCueCatalog: audioCueCatalog.length ? "fresh" : "stale",
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
