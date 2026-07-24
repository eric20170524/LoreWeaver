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
  RevisionRecord,
  PatchLevel
} from "../types";

export interface KnobDefinition {
  type: "number" | "integer" | "boolean" | "enum" | "array" | "string";
  default: any;
  min?: number;
  max?: number;
  values?: string[]; // For enum
  description?: string;
  descriptionEn?: string;
}

export type MaturityStatus =
  | "inventoried"
  | "card_json"
  | "ui_registered"
  | "runtime_ready"
  | "gate_verified"
  | "production_ready";

export interface GameplayCardOption {
  id: string;
  title: string;
  titleEn?: string;
  category: "base" | "container" | "modifier";
  adapter: string;
  
  // Maturity metadata (P0)
  maturityStatus?: MaturityStatus;
  knownRisks?: string[];
  supportedPlatforms?: string[];
  lastGateTime?: string;

  // Relational metadata
  modifierFor?: string[];
  compatibleBaseCards?: string[];
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
  {
    id: "node_iframe_microgame",
    title: "HTML 单页玩法容器",
    titleEn: "HTML single-page container",
    category: "container",
    adapter: "iframe",
    implementationStatus: "implemented",
    maturityStatus: "runtime_ready",
    knobs: {
      payloadEncoding: {
        type: "enum",
        default: "base64_json",
        values: ["base64_json", "plain_json"],
        description: "NodePayload 编码方式",
        descriptionEn: "NodePayload encoding"
      },
      fullscreen: {
        type: "boolean",
        default: true,
        description: "是否全屏覆盖",
        descriptionEn: "Fullscreen overlay"
      }
    }
  },
  {
    id: "survivor_horde",
    title: "割草生存",
    titleEn: "Survivor horde",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    maturityStatus: "production_ready",
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
      },
      difficulty: {
        type: "integer",
        default: 1,
        min: 1,
        max: 12,
        description: "难度档",
        descriptionEn: "Difficulty tier"
      },
      goalValue: {
        type: "integer",
        default: 120,
        min: 1,
        max: 9999,
        description: "局内目标值",
        descriptionEn: "In-run goal value"
      },
      victoryMode: {
        type: "enum",
        default: "survive",
        values: ["survive", "boss_only", "objective"],
        description: "胜利模式",
        descriptionEn: "Victory mode"
      },
      bossId: {
        type: "string",
        default: "",
        description: "Boss id",
        descriptionEn: "Boss id"
      },
      enemyPool: {
        type: "array",
        default: [],
        description: "敌人池（逗号分隔 id）",
        descriptionEn: "Enemy pool ids"
      }
    }
  },
  {
    id: "turn_based_skill_battle",
    title: "回合制技能战斗",
    titleEn: "Turn-based skill battle",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "敌方 HP 归零",
    victoryEn: "Enemy HP reaches zero",
    failure: "玩家 HP 归零或撤退",
    failureEn: "Player HP zero or retreat",
    requires: ["ActionBar", "CombatLog", "Cooldown"],
    knobs: {
      playerHp: {
        type: "integer",
        default: 100,
        min: 1,
        max: 999999,
        description: "玩家开战生命值",
        descriptionEn: "Player starting HP"
      },
      enemyHp: {
        type: "integer",
        default: 180,
        min: 1,
        max: 999999,
        description: "敌人生命值",
        descriptionEn: "Enemy HP"
      },
      enemyAtk: {
        type: "integer",
        default: 18,
        min: 0,
        max: 99999,
        description: "敌人攻击力",
        descriptionEn: "Enemy attack"
      }
    }
  },
  {
    id: "rhythm_timing",
    title: "快速聚灵",
    titleEn: "Spiritual tap reaction",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    maturityStatus: "production_ready",
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
    implementationStatus: "implemented",
    maturityStatus: "production_ready",
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
  {
    id: "sequence_synthesis",
    title: "顺序合成",
    titleEn: "Sequence synthesis",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "按配方顺序完成全部材料投入",
    victoryEn: "Complete full recipe sequence",
    failure: "撤退或爆炸重置后放弃",
    failureEn: "Retreat or abandon after explosion",
    requires: ["RecipeState", "InputOrderJudge", "ProgressBar"],
    knobs: {
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
    }
  },
  {
    id: "side_scrolling_brawler",
    title: "横版清版格斗",
    titleEn: "Side-scrolling brawler",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "肃清全部锁屏波次",
    victoryEn: "Clear all locked waves",
    failure: "命数耗尽且无法续关",
    failureEn: "Life stock empty without continue",
    requires: ["WaveManager", "LockScreenController", "ActorController", "HitboxResolver"],
    knobs: {
      stageLengthPx: {
        type: "integer",
        default: 2400,
        min: 800,
        max: 60000,
        description: "关卡横向长度 (像素)",
        descriptionEn: "Stage length (px)"
      },
      playersMax: {
        type: "integer",
        default: 1,
        min: 1,
        max: 4,
        description: "本地最大玩家数",
        descriptionEn: "Max local players"
      }
    }
  },
  {
    id: "energy_balance",
    title: "能量平衡",
    titleEn: "Energy balance",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "指针在安全区累计稳定时长达标",
    victoryEn: "Hold pointer in safe zone for target duration",
    failure: "失衡违规次数耗尽",
    failureEn: "Too many balance violations",
    requires: ["DragDrop", "Gauge", "StabilityTimer"],
    knobs: {
      targetStableSec: {
        type: "number",
        default: 20,
        min: 5,
        max: 120,
        description: "目标稳定时长 (秒)",
        descriptionEn: "Target stable duration (sec)"
      },
      safeZoneWidth: {
        type: "number",
        default: 0.22,
        min: 0.05,
        max: 0.6,
        description: "安全区宽度比例",
        descriptionEn: "Safe zone width ratio"
      },
      failViolationLimit: {
        type: "integer",
        default: 5,
        min: 1,
        max: 20,
        description: "允许失衡次数",
        descriptionEn: "Max balance violations"
      }
    }
  },
  {
    id: "rune_connect_sequence",
    title: "符文连阵",
    titleEn: "Rune connect sequence",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "按序完成全部符文连线",
    victoryEn: "Connect all runes in order",
    failure: "误连失误次数耗尽",
    failureEn: "Too many wrong links",
    requires: ["DragPath", "NodeGraph", "SequenceJudge"],
    knobs: {
      runeCount: {
        type: "integer",
        default: 8,
        min: 3,
        max: 16,
        description: "符文节点数量",
        descriptionEn: "Number of rune nodes"
      },
      maxMistakes: {
        type: "integer",
        default: 6,
        min: 1,
        max: 30,
        description: "最大误连次数",
        descriptionEn: "Max wrong links"
      },
      snapRadius: {
        type: "number",
        default: 36,
        min: 10,
        max: 80,
        description: "吸附半径 (像素)",
        descriptionEn: "Snap radius (px)"
      }
    }
  },
  {
    id: "branching_dialogue_check",
    title: "条件分支对话",
    titleEn: "Branching dialogue check",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "走到非失败结局",
    victoryEn: "Reach a non-fail ending",
    failure: "走到失败结局或撤退",
    failureEn: "Fail ending or retreat",
    requires: ["ChoiceGraph", "ConditionCheck", "StoryFlags"],
    knobs: {
      startFavor: {
        type: "integer",
        default: 40,
        min: 0,
        max: 100,
        description: "初始好感",
        descriptionEn: "Starting favor"
      }
    }
  },
  {
    id: "pressure_survival",
    title: "压力生存",
    titleEn: "Pressure survival",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "限时内压力未满",
    victoryEn: "Keep pressure under max until timer ends",
    failure: "压力条满",
    failureEn: "Pressure bar full",
    requires: ["PressureBar", "Cooldown", "TargetClick"],
    knobs: {
      durationSec: { type: "number", default: 30, min: 10, max: 120, description: "生存时长 (秒)", descriptionEn: "Survive duration (sec)" },
      pressureGrowthPerSec: { type: "number", default: 8, min: 1, max: 50, description: "每秒压力增长", descriptionEn: "Pressure growth / sec" },
      clickRelief: { type: "number", default: 6, min: 1, max: 50, description: "点击泄压量", descriptionEn: "Click relief amount" }
    }
  },
  {
    id: "reaction_pick",
    title: "反应辨识",
    titleEn: "Reaction pick",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "完成指定正确轮数",
    victoryEn: "Complete target correct rounds",
    failure: "机会耗尽",
    failureEn: "Lives exhausted",
    requires: ["PromptHUD", "RandomSpawner", "ClickJudge"],
    knobs: {
      targetRounds: { type: "integer", default: 6, min: 1, max: 20, description: "目标轮数", descriptionEn: "Target rounds" },
      lives: { type: "integer", default: 3, min: 1, max: 10, description: "机会数", descriptionEn: "Lives" }
    }
  },
  {
    id: "observe_capture",
    title: "观察捕捉",
    titleEn: "Observe capture",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "捕捉进度达标",
    victoryEn: "Reach capture progress target",
    failure: "撤退",
    failureEn: "Retreat",
    requires: ["TargetMotion", "WindowJudge", "ClickJudge"],
    knobs: {
      targetProgress: { type: "integer", default: 100, min: 20, max: 200, description: "目标进度", descriptionEn: "Target progress" },
      captureGain: { type: "number", default: 22, min: 5, max: 50, description: "成功捕捉增量", descriptionEn: "Capture gain" },
      missPenalty: { type: "number", default: 12, min: 0, max: 50, description: "误点惩罚", descriptionEn: "Miss penalty" }
    }
  },
  {
    id: "shooter_duel",
    title: "对决射击",
    titleEn: "Shooter duel",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "击败 Boss",
    victoryEn: "Defeat boss",
    failure: "HP 归零或超时",
    failureEn: "HP zero or timeout",
    requires: ["Shooter", "Collision", "HPBar", "Timer"],
    knobs: {
      playerHp: { type: "integer", default: 100, min: 1, max: 9999, description: "玩家生命", descriptionEn: "Player HP" },
      bossHp: { type: "integer", default: 300, min: 1, max: 99999, description: "Boss 生命", descriptionEn: "Boss HP" },
      timeLimitSec: { type: "number", default: 60, min: 15, max: 300, description: "时限 (秒)", descriptionEn: "Time limit (sec)" }
    }
  },
  {
    id: "drag_to_core",
    title: "拖入核心",
    titleEn: "Drag to core",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "汇聚进度 100%",
    victoryEn: "Reach 100% deposit progress",
    failure: "撤退",
    failureEn: "Retreat",
    requires: ["DragObject", "CoreZone", "HazardOrbit"],
    knobs: {
      fragCount: { type: "integer", default: 14, min: 3, max: 40, description: "碎片数量", descriptionEn: "Fragment count" },
      hazardCount: { type: "integer", default: 3, min: 0, max: 12, description: "干扰数量", descriptionEn: "Hazard count" },
      hazardPenalty: { type: "number", default: 12, min: 0, max: 50, description: "干扰惩罚进度", descriptionEn: "Hazard penalty" }
    }
  },
  {
    id: "dodge_counter_boss",
    title: "闪避反击 Boss",
    titleEn: "Dodge counter boss",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "破势槽满或 Boss 击败",
    victoryEn: "Fill break gauge or defeat boss",
    failure: "玩家 HP 归零",
    failureEn: "Player HP zero",
    requires: ["Telegraph", "Dodge", "CounterWindow", "HPBar"],
    knobs: {
      playerHp: { type: "integer", default: 100, min: 1, max: 9999, description: "玩家生命", descriptionEn: "Player HP" },
      bossHp: { type: "integer", default: 300, min: 1, max: 99999, description: "Boss 生命", descriptionEn: "Boss HP" },
      breakGaugeMax: { type: "integer", default: 100, min: 20, max: 300, description: "破势槽上限", descriptionEn: "Break gauge max" }
    }
  },
  {
    id: "maze_exploration_choice",
    title: "迷宫探索抉择",
    titleEn: "Maze exploration choice",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "到达出口",
    victoryEn: "Reach maze exit",
    failure: "撤退",
    failureEn: "Retreat",
    requires: ["TileMap", "DPad", "ChoiceModal"],
    knobs: {
      mazeW: { type: "integer", default: 15, min: 7, max: 31, description: "迷宫宽度", descriptionEn: "Maze width" },
      mazeH: { type: "integer", default: 11, min: 7, max: 31, description: "迷宫高度", descriptionEn: "Maze height" },
      rescueCost: { type: "integer", default: 60, min: 0, max: 999, description: "救助消耗", descriptionEn: "Rescue cost" }
    }
  },
  {
    id: "platform_escape",
    title: "平台逃亡",
    titleEn: "Platform escape",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "进度条满",
    victoryEn: "Progress bar full",
    failure: "HP 归零",
    failureEn: "HP zero",
    requires: ["Platformer", "Collision", "Progress"],
    knobs: {
      moveSpeed: { type: "number", default: 280, min: 50, max: 600, description: "移动速度", descriptionEn: "Move speed" },
      jumpV0: { type: "number", default: 720, min: 200, max: 1200, description: "跳跃初速", descriptionEn: "Jump velocity" },
      levelLen: { type: "integer", default: 1800, min: 400, max: 8000, description: "关卡长度", descriptionEn: "Level length" }
    }
  },
  {
    id: "hazard_collect_waves",
    title: "预警采集波",
    titleEn: "Hazard collect waves",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "完成全部波次采集",
    victoryEn: "Clear all collect waves",
    failure: "HP 归零或波次采集不足",
    failureEn: "HP zero or failed wave quota",
    requires: ["HazardTelegraph", "WaveManager", "Collectible"],
    knobs: {
      maxWave: { type: "integer", default: 3, min: 1, max: 10, description: "波次数", descriptionEn: "Wave count" },
      waveTimeSec: { type: "number", default: 15, min: 5, max: 60, description: "每波时限", descriptionEn: "Wave time limit" },
      collectTargetPerWave: { type: "integer", default: 4, min: 1, max: 20, description: "每波采集目标", descriptionEn: "Collect target per wave" }
    }
  },
  {
    id: "sequence_puzzle_combo",
    title: "顺序拼图组合",
    titleEn: "Sequence puzzle combo",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "完成顺序与拼图两阶段",
    victoryEn: "Complete sequence and puzzle phases",
    failure: "撤退",
    failureEn: "Retreat",
    requires: ["SequenceJudge", "DragSnap", "PuzzleState"],
    knobs: {
      sequenceLength: { type: "integer", default: 4, min: 2, max: 8, description: "顺序长度", descriptionEn: "Sequence length" },
      pieceCount: { type: "integer", default: 4, min: 2, max: 8, description: "拼图块数", descriptionEn: "Puzzle pieces" }
    }
  },
  {
    id: "rhythm_then_pickup",
    title: "节奏后拾取",
    titleEn: "Rhythm then pickup",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "完成节奏并拾取目标",
    victoryEn: "Finish rhythm phase then pick targets",
    failure: "拾取阶段超时",
    failureEn: "Pickup phase timeout",
    requires: ["TimingJudge", "TargetSpawner"],
    knobs: {
      phase1Target: { type: "integer", default: 12, min: 3, max: 40, description: "节奏命中目标", descriptionEn: "Rhythm hits needed" },
      bottlesNeeded: { type: "integer", default: 5, min: 1, max: 20, description: "拾取数量", descriptionEn: "Pickups needed" },
      phase2LimitSec: { type: "number", default: 20, min: 5, max: 60, description: "拾取时限", descriptionEn: "Pickup time limit" }
    }
  },
  {
    id: "qix_area_capture",
    title: "区域占领",
    titleEn: "Qix area capture",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "占领率达到阈值",
    victoryEn: "Reach capture ratio threshold",
    failure: "HP 归零或超时未达标",
    failureEn: "HP zero or timeout under threshold",
    requires: ["PathTrail", "PolygonArea", "EnemyCollision"],
    knobs: {
      captureTarget: { type: "number", default: 0.7, min: 0.3, max: 0.95, description: "目标占领比例", descriptionEn: "Target capture ratio" },
      enemyCount: { type: "integer", default: 2, min: 0, max: 8, description: "敌人数", descriptionEn: "Enemy count" },
      timeLimitSec: { type: "number", default: 90, min: 20, max: 300, description: "时限 (秒)", descriptionEn: "Time limit (sec)" },
      gridCols: { type: "integer", default: 24, min: 10, max: 48, description: "网格列", descriptionEn: "Grid columns" },
      gridRows: { type: "integer", default: 16, min: 8, max: 36, description: "网格行", descriptionEn: "Grid rows" }
    }
  },
  {
    id: "point_drag_progression",
    title: "点位拖拽进度",
    titleEn: "Point drag progression",
    category: "base",
    adapter: "phaser",
    implementationStatus: "implemented",
    victory: "阶段进度达标",
    victoryEn: "Reach stage progress target",
    failure: "失稳条满",
    failureEn: "Instability maxed",
    requires: ["DragDrop", "PointMap", "ProgressState", "BranchWeights"],
    knobs: {
      targetProgress: { type: "integer", default: 100, min: 30, max: 200, description: "目标进度", descriptionEn: "Target progress" },
      instabilityMax: { type: "integer", default: 100, min: 20, max: 200, description: "失稳上限", descriptionEn: "Instability max" },
      matchProgress: { type: "number", default: 14, min: 1, max: 50, description: "匹配点进度增益", descriptionEn: "Match progress gain" },
      poolSpawnIntervalSec: { type: "number", default: 1.1, min: 0.3, max: 5, description: "能量球刷新间隔", descriptionEn: "Orb spawn interval" }
    }
  },
  
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
  },
  {
    id: "locked_screen_wave",
    title: "锁屏波次",
    titleEn: "Locked screen wave",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "推进到触发点后锁定镜头，肃清敌人后解锁",
    effectSummaryEn: "Locks camera at trigger; unlocks after wave clear",
    changes: "镜头锁定, 波次推进",
    changesEn: "Camera lock, wave advance",
    requires: ["WaveManager", "LockScreenController"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      forceLock: {
        type: "boolean",
        default: true,
        description: "强制启用锁屏",
        descriptionEn: "Force lock screen"
      }
    }
  },
  {
    id: "arcade_timer_pressure",
    title: "街机计时压力",
    titleEn: "Arcade timer pressure",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "波次倒计时，超时后周期扣血",
    effectSummaryEn: "Wave countdown; pulse damage after timeout",
    changes: "时间压力, 扣血",
    changesEn: "Time pressure, HP drain",
    requires: ["ArcadeTimer", "HUD"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      baseLimitSec: {
        type: "integer",
        default: 78,
        min: 10,
        max: 300,
        description: "基础时限 (秒)",
        descriptionEn: "Base time limit (sec)"
      },
      hurryAtSec: {
        type: "integer",
        default: 10,
        min: 1,
        max: 60,
        description: "HURRY 警告阈值 (秒)",
        descriptionEn: "Hurry warning threshold"
      },
      timeoutDamage: {
        type: "number",
        default: 14,
        min: 0,
        max: 999,
        description: "超时脉冲伤害",
        descriptionEn: "Timeout pulse damage"
      }
    }
  },
  {
    id: "arcade_credit_continue",
    title: "投币续关",
    titleEn: "Arcade credit continue",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "命数耗尽后可用 CREDIT 续关复归",
    effectSummaryEn: "Continue run by spending credits after game over",
    changes: "续关, 命数",
    changesEn: "Continue, life stock",
    requires: ["ArcadeSession", "LifeStock"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      maxCredits: {
        type: "integer",
        default: 9,
        min: 0,
        max: 99,
        description: "最大 CREDIT",
        descriptionEn: "Max credits"
      },
      startCredits: {
        type: "integer",
        default: 3,
        min: 0,
        max: 99,
        description: "开局 CREDIT",
        descriptionEn: "Starting credits"
      }
    }
  },
  {
    id: "elemental_directional_combo",
    title: "元素方向连招",
    titleEn: "Elemental directional combo",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "根据方向轴触发前后上下组合技并附带元素标签",
    effectSummaryEn: "Directional combos with elemental tags",
    changes: "攻击, 连招",
    changesEn: "Attack, combos",
    requires: ["InputMapper", "AbilityCatalog"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      elementTags: {
        type: "array",
        default: ["fire", "ice", "thunder", "wind"],
        description: "元素标签池",
        descriptionEn: "Element tag pool"
      }
    }
  },
  {
    id: "local_coop_4p",
    title: "本地 1-4P 协作",
    titleEn: "Local co-op 1-4P",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "增加本地额外玩家（键盘布局 / AI 跟随）",
    effectSummaryEn: "Extra local players via keyboard or AI assist",
    changes: "多人输入, 镜头共享",
    changesEn: "Multi input, shared camera",
    requires: ["LocalCoopInput", "CameraController"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      playersMax: {
        type: "integer",
        default: 2,
        min: 1,
        max: 4,
        description: "同时玩家上限",
        descriptionEn: "Max simultaneous players"
      }
    }
  },
  {
    id: "branch_route_chain",
    title: "支线路由链",
    titleEn: "Branch route chain",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "按速清/无伤/连击等条件结算支线并连锁奖励",
    effectSummaryEn: "Route events from speed/no-damage/combo clears",
    changes: "支线奖励, 计分",
    changesEn: "Route rewards, scoring",
    requires: ["RouteConditionEvaluator", "Telemetry"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      promptDurationSec: {
        type: "number",
        default: 2.5,
        min: 0.5,
        max: 10,
        description: "提示展示时长 (秒)",
        descriptionEn: "Prompt duration (sec)"
      }
    }
  },
  {
    id: "crystal_collection",
    title: "晶体采集",
    titleEn: "Crystal collection",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "场上维持可采集晶体，拾取提供分数/资源",
    effectSummaryEn: "Maintain collectible crystals that grant score/resources",
    changes: "拾取, 资源",
    changesEn: "Pickup, resources",
    requires: ["Collectible"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      crystalCount: { type: "integer", default: 5, min: 1, max: 20, description: "场上晶体数量", descriptionEn: "Crystal count" },
      respawnIntervalMs: { type: "integer", default: 3000, min: 500, max: 30000, description: "补充间隔 (ms)", descriptionEn: "Respawn interval (ms)" },
      rewardScore: { type: "integer", default: 5, min: 1, max: 100, description: "单颗分数", descriptionEn: "Score per crystal" }
    }
  },
  {
    id: "horde_intensity",
    title: "高压刷怪",
    titleEn: "Horde intensity",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "刷怪倍率提升并概率生成厚血精英",
    effectSummaryEn: "Multiplies spawns and rolls elite brutes",
    changes: "刷怪强度",
    changesEn: "Spawn intensity",
    requires: ["Spawner"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      spawnMultiplier: { type: "integer", default: 3, min: 1, max: 10, description: "刷怪调用倍率", descriptionEn: "Spawn call multiplier" },
      eliteChance: { type: "number", default: 0.15, min: 0, max: 1, description: "精英出现概率", descriptionEn: "Elite chance" }
    }
  },
  {
    id: "resource_pressure",
    title: "资源压力抗性",
    titleEn: "Resource pressure",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "抗性持续下降，击杀解药精英可回复，抗性归零失败",
    effectSummaryEn: "Draining resist; kill elites to restore; zero resist fails",
    changes: "失败条件, 资源压力",
    changesEn: "Failure condition, resource pressure",
    requires: ["ResourceMeter", "EliteSpawner"],
    conflicts: ["poison_fog"],
    implementationStatus: "implemented",
    knobs: {
      drainPerSecond: { type: "number", default: 4, min: 0, max: 50, description: "每秒抗性衰减", descriptionEn: "Resist drain per second" },
      gemRestore: { type: "number", default: 40, min: 1, max: 100, description: "解药回复量", descriptionEn: "Antidote restore amount" },
      eliteIntervalMs: { type: "integer", default: 15000, min: 3000, max: 60000, description: "精英间隔 (ms)", descriptionEn: "Elite interval (ms)" }
    }
  },
  {
    id: "defend_line",
    title: "防线城墙",
    titleEn: "Defend line",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "侧翼城墙有独立 HP，敌军越线扣城防；床弩辅助清怪",
    effectSummaryEn: "Side wall HP; breach damages wall; ballista assists",
    changes: "失败条件, 防线",
    changesEn: "Failure condition, defense line",
    requires: ["ObjectiveHp"],
    conflicts: ["defend_core"],
    implementationStatus: "implemented",
    knobs: {
      wallHp: { type: "integer", default: 100, min: 1, max: 9999, description: "城墙生命", descriptionEn: "Wall HP" },
      breachDamage: { type: "number", default: 5, min: 1, max: 100, description: "越线扣血", descriptionEn: "Breach damage" }
    }
  },
  {
    id: "debuff_zone",
    title: "减益禁魔区",
    titleEn: "Debuff zone",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "移动禁魔/减速区域，进入后削弱移速与自动攻击",
    effectSummaryEn: "Moving zone that slows and silences auto-fire",
    changes: "地图危险, 减益",
    changesEn: "Map hazard, debuff",
    requires: ["Zone"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      zoneRadius: { type: "number", default: 100, min: 20, max: 400, description: "区域半径", descriptionEn: "Zone radius" },
      speedCap: { type: "number", default: 50, min: 10, max: 200, description: "区内速度上限", descriptionEn: "Speed cap inside" },
      moveIntervalMs: { type: "integer", default: 5000, min: 1000, max: 30000, description: "移动间隔 (ms)", descriptionEn: "Move interval (ms)" }
    }
  },
  {
    id: "destroy_pillars",
    title: "摧毁阵基",
    titleEn: "Destroy pillars",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "可攻击阵基，全部摧毁立即胜利",
    effectSummaryEn: "Destroyable pillars; clearing all wins immediately",
    changes: "胜利条件, 目标",
    changesEn: "Victory condition, objectives",
    requires: ["ObjectiveHp"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      pillarCount: { type: "integer", default: 4, min: 1, max: 8, description: "阵基数量", descriptionEn: "Pillar count" },
      pillarHp: { type: "integer", default: 10, min: 1, max: 200, description: "单座阵基 HP", descriptionEn: "HP per pillar" }
    }
  },
  {
    id: "score_extend_1up",
    title: "分数延命",
    titleEn: "Score extend 1UP",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["side_scrolling_brawler"],
    effectSummary: "分数达到阈值后奖命（不超过上限）",
    effectSummaryEn: "Grant life when score crosses thresholds",
    changes: "命数, 计分",
    changesEn: "Lives, scoring",
    requires: ["ScoreSystem", "LifeStock"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      thresholds: {
        type: "array",
        default: [5000, 12000, 24000, 42000, 65000],
        description: "奖命分数阈值",
        descriptionEn: "Score thresholds for 1UP"
      },
      maxLives: {
        type: "integer",
        default: 6,
        min: 1,
        max: 20,
        description: "命数上限",
        descriptionEn: "Max lives"
      }
    }
  },
  {
    id: "treasure_chest_horde",
    title: "宝箱割草",
    titleEn: "Treasure chest horde",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "靠近持续交互的风险分层宝箱，高风险读条会惊动守卫，后期刷出强化 Boss",
    effectSummaryEn: "Channel risk-tier chests; high risk alerts guards and a late-run boss",
    changes: "持续交互, 风险奖励, 守卫, Boss",
    changesEn: "Channel interaction, risk reward, guards, boss",
    requires: ["ChannelInteractionSystem", "RuntimeEventBus", "Boss"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      chestCount: { type: "integer", default: 6, min: 1, max: 20, description: "宝箱数量", descriptionEn: "Chest count" },
      requiredOpenCount: { type: "integer", default: 3, min: 1, max: 20, description: "最低开箱目标", descriptionEn: "Required opens" },
      interactionRadius: { type: "number", default: 90, min: 24, max: 240, description: "持续交互半径", descriptionEn: "Channel radius" },
      damageRegressMs: { type: "number", default: 400, min: 0, max: 5000, description: "受击回退毫秒数", descriptionEn: "Damage regress milliseconds" },
      bossSpawnRatio: { type: "number", default: 0.75, min: 0.2, max: 0.95, description: "Boss 出现时间比例", descriptionEn: "Boss spawn time ratio" }
    }
  },
  {
    id: "arena_wave_boss",
    title: "竞技场波次 Boss",
    titleEn: "Arena wave boss",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "离散波次清场，击败全部波次通关",
    effectSummaryEn: "Discrete clear waves instead of pure survival timer",
    changes: "胜利条件, 波次",
    changesEn: "Victory condition, waves",
    requires: ["WaveManager", "Boss"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      totalWaves: { type: "integer", default: 5, min: 1, max: 20, description: "总波次", descriptionEn: "Total waves" },
      interWaveDelayMs: { type: "integer", default: 3000, min: 500, max: 15000, description: "波间隔 (ms)", descriptionEn: "Inter-wave delay" }
    }
  },
  {
    id: "random_room_portals",
    title: "随机房间传送门",
    titleEn: "Random room portals",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "周期生成传送门，进入后难度与奖励倍率变化",
    effectSummaryEn: "Portals to side rooms with difficulty/reward multipliers",
    changes: "刷怪, 奖励",
    changesEn: "Spawns, rewards",
    requires: ["Portal", "RoomModifier"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      portalIntervalMs: { type: "integer", default: 12000, min: 3000, max: 60000, description: "传送门间隔", descriptionEn: "Portal interval" },
      difficultyMultiplier: { type: "number", default: 1.35, min: 1, max: 3, description: "房间难度倍率", descriptionEn: "Room difficulty mult" },
      rewardsMultiplier: { type: "number", default: 1.5, min: 1, max: 3, description: "房间奖励倍率", descriptionEn: "Room reward mult" }
    }
  },
  {
    id: "mirror_boss",
    title: "镜像 Boss",
    titleEn: "Mirror boss",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "镜像实体独立 HP 并射击，击败可立即胜利",
    effectSummaryEn: "Mirror clone with HP and projectiles; kill to win",
    changes: "Boss, 胜利条件",
    changesEn: "Boss, victory",
    requires: ["BossState", "Projectile"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      cloneHp: { type: "integer", default: 1000, min: 50, max: 99999, description: "镜像生命", descriptionEn: "Clone HP" },
      fireIntervalMs: { type: "integer", default: 2000, min: 300, max: 10000, description: "射击间隔", descriptionEn: "Fire interval" },
      bulletDamage: { type: "number", default: 15, min: 1, max: 200, description: "弹体伤害", descriptionEn: "Bullet damage" }
    }
  },
  {
    id: "self_destruct_enemy",
    title: "自爆敌人",
    titleEn: "Self-destruct enemy",
    category: "modifier",
    adapter: "phaser",
    modifierFor: ["survivor_horde"],
    effectSummary: "部分敌人接近玩家后引信爆炸",
    effectSummaryEn: "Some enemies fuse and explode near the player",
    changes: "敌人行为, 伤害",
    changesEn: "Enemy behavior, damage",
    requires: ["Spawner"],
    conflicts: [],
    implementationStatus: "implemented",
    knobs: {
      chance: { type: "number", default: 0.3, min: 0, max: 1, description: "自爆敌概率", descriptionEn: "Self-destruct chance" },
      damage: { type: "number", default: 20, min: 1, max: 200, description: "爆炸伤害", descriptionEn: "Explosion damage" },
      speed: { type: "number", default: 120, min: 20, max: 400, description: "自爆敌速度", descriptionEn: "Self-destruct speed" }
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

/** Campaign runtime knobs that belong exclusively to the gameplay workbench. */
export const CAMPAIGN_RUNTIME_KNOB_DEFS: Record<string, KnobDefinition> = {
  durationSec: {
    type: "number",
    default: 120,
    min: 30,
    max: 600,
    description: "关卡时长（秒）— 仅玩法台可写",
    descriptionEn: "Level duration (sec) — workbench only"
  },
  difficulty: {
    type: "integer",
    default: 1,
    min: 1,
    max: 12,
    description: "难度档（1–12）",
    descriptionEn: "Difficulty tier (1–12)"
  },
  goalValue: {
    type: "integer",
    default: 100,
    min: 1,
    max: 9999,
    description: "局内目标值（时长/击杀/分数由卡义解释）",
    descriptionEn: "In-run goal value"
  },
  victoryMode: {
    type: "enum",
    default: "survive",
    values: ["survive", "boss_only", "objective"],
    description: "胜利模式",
    descriptionEn: "Victory mode"
  },
  bossId: {
    type: "string",
    default: "",
    description: "Boss 运行时 id",
    descriptionEn: "Boss runtime id"
  },
  enemyPool: {
    type: "array",
    default: [],
    description: "敌人池 id（逗号分隔）",
    descriptionEn: "Enemy pool ids (comma-separated)"
  },
  realmRequired: {
    type: "integer",
    default: 1,
    min: 1,
    max: 12,
    description: "进入本关所需境界 id",
    descriptionEn: "Required realm id"
  }
};

// Extend KnobDefinition type usage for freeform string knobs via text inputs in UI.

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

/** Seed / merge campaign knobs from node top-level fields (single write authority → workbench). */
export function seedCampaignKnobsFromNode(node: GameSpec["nodes"][number]): Record<string, any> {
  const g = node.gameplay || defaultGameplayForMechanics(node.mechanics || "survivor_horde");
  const knobs = { ...(g.knobs || {}) };
  if (knobs.durationSec === undefined && node.durationLimit != null) knobs.durationSec = node.durationLimit;
  if (knobs.goalValue === undefined && node.goalValue != null) knobs.goalValue = node.goalValue;
  if (knobs.difficulty === undefined && node.difficulty != null) knobs.difficulty = node.difficulty;
  // Prefer existing knobs; only fill missing campaign keys with defaults
  for (const [key, def] of Object.entries(CAMPAIGN_RUNTIME_KNOB_DEFS)) {
    if (knobs[key] === undefined) knobs[key] = def.default;
  }
  return knobs;
}

/** Mirror workbench knobs back to node top-level numeric/contract fields for emulator compatibility. */
export function syncNodeFieldsFromGameplayKnobs(
  node: GameSpec["nodes"][number],
  gameplay: GameplayAssignment
): GameSpec["nodes"][number] {
  const knobs = gameplay.knobs || {};
  const next = { ...node, gameplay };
  if (typeof knobs.durationSec === "number") next.durationLimit = knobs.durationSec;
  if (typeof knobs.goalValue === "number") next.goalValue = knobs.goalValue;
  if (typeof knobs.difficulty === "number") next.difficulty = knobs.difficulty;
  // Keep mechanics label aligned with card when possible
  if (gameplay.cardId) next.mechanics = gameplay.cardId;
  return next;
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
    const baseGameplay = node.gameplay || defaultGameplayForMechanics(node.mechanics);
    const gameplay: GameplayAssignment = {
      ...baseGameplay,
      knobs: seedCampaignKnobsFromNode({ ...node, gameplay: baseGameplay })
    };
    const nodeWithGameplay = syncNodeFieldsFromGameplayKnobs(node, gameplay);
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
  reason = "Gameplay card selection changed",
  patchLevel: PatchLevel = "L2"
): ManifestPatch {
  const normalized = ensureGameplayManifest(spec);
  const node = normalized.nodes.find((item) => item.id === nodeId);
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
    // Prefer explicit level; fall back to nextGameplay.patchLevel then L2.
    patchLevel: patchLevel || nextGameplay.patchLevel || "L2",
    status: "proposed",
    createdAt: new Date().toISOString()
  };
}

/** True when only knobs/params changed (not cardId / modifier set) — L1, auto-apply. */
export function isKnobOnlyGameplayChange(before: GameplayAssignment, after: GameplayAssignment): boolean {
  if (before.cardId !== after.cardId) return false;
  if (before.adapter !== after.adapter) return false;
  const bMods = (before.modifiers || []).map((m) => m.id).sort().join(",");
  const aMods = (after.modifiers || []).map((m) => m.id).sort().join(",");
  if (bMods !== aMods) return false;
  // Modifier set same; knobs may differ on base or per-modifier.
  return true;
}

/** Resolve node by path segment: prefer matching node.id, else array index. */
export function resolveNodeFromPathSegment(
  nodes: GameSpec["nodes"],
  segment: string | number
): { node: GameSpec["nodes"][number]; index: number } | null {
  const n = Number(segment);
  if (!Number.isFinite(n)) return null;
  const byId = nodes.findIndex((node) => node.id === n);
  if (byId >= 0) return { node: nodes[byId], index: byId };
  if (n >= 0 && n < nodes.length) return { node: nodes[n], index: n };
  return null;
}

function setDeepValue(root: any, pathParts: string[], value: any): any {
  if (!pathParts.length) return value;
  const [head, ...rest] = pathParts;
  if (Array.isArray(root)) {
    const idx = Number(head);
    const next = [...root];
    next[idx] = setDeepValue(root[idx] ?? {}, rest, value);
    return next;
  }
  const base =
    root && typeof root === "object" && !Array.isArray(root) ? { ...root } : {};
  base[head] = setDeepValue(base[head], rest, value);
  return base;
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
    // parts: ["nodes", "0"|"1", "gameplay", "knobs", "logoText", ...]
    const resolved = resolveNodeFromPathSegment(nextSpec.nodes, parts[1]);
    if (resolved) {
      const field = parts[2];
      const rest = parts.slice(3); // e.g. knobs.logoText → ["knobs","logoText"] or knobs → ["knobs"] or [] for whole gameplay

      nextSpec.nodes = nextSpec.nodes.map((node, idx) => {
        if (idx !== resolved.index) return node;

        if (!field) {
          return syncNodeFieldsFromGameplayKnobs(node, patch.after as GameplayAssignment);
        }
        if (field === "gameplay") {
          const currentGameplay =
            node.gameplay || defaultGameplayForMechanics(node.mechanics || "survivor_horde");
          if (rest.length === 0) {
            return syncNodeFieldsFromGameplayKnobs(node, patch.after as GameplayAssignment);
          }
          if (rest[0] === "knobs") {
            const knobKey = rest[1];
            if (!knobKey) {
              // replace entire knobs object
              const nextGameplay: GameplayAssignment = {
                ...currentGameplay,
                knobs: {
                  ...(typeof patch.after === "object" && patch.after && !Array.isArray(patch.after)
                    ? patch.after
                    : {})
                }
              };
              return syncNodeFieldsFromGameplayKnobs(node, nextGameplay);
            }
            // nodes.N.gameplay.knobs.logoText → set single knob
            const nextKnobs = {
              ...(currentGameplay.knobs || {}),
              [knobKey]: patch.after
            };
            // deeper nesting under knob rare; support rest[2+]
            if (rest.length > 2) {
              nextKnobs[knobKey] = setDeepValue(
                currentGameplay.knobs?.[knobKey],
                rest.slice(2),
                patch.after
              );
            }
            const nextGameplay: GameplayAssignment = {
              ...currentGameplay,
              knobs: nextKnobs
            };
            return syncNodeFieldsFromGameplayKnobs(node, nextGameplay);
          }
          // nodes.N.gameplay.cardId / modifiers / etc.
          const nextGameplay = setDeepValue(currentGameplay, rest, patch.after) as GameplayAssignment;
          return syncNodeFieldsFromGameplayKnobs(node, nextGameplay);
        }
        // Block writing runtime play params from non-gameplay targets in design-plan flows
        if (["durationLimit", "goalValue", "difficulty", "mechanics"].includes(field)) {
          return node;
        }
        if (rest.length === 0) {
          return { ...node, [field]: patch.after };
        }
        return setDeepValue(node, [field, ...rest], patch.after);
      });
    }
  } else if (target.includes(".")) {
    // generic top-level dotted path (e.g. economy.currencyName)
    const parts = target.split(".");
    nextSpec = setDeepValue(nextSpec, parts, patch.after) as GameSpec;
  }

  const nodeIdMatch = target.match(/^nodes\.(\d+)/);
  let artifactNodeKey: number | null = null;
  if (nodeIdMatch) {
    const resolved = resolveNodeFromPathSegment(normalized.nodes, nodeIdMatch[1]);
    artifactNodeKey = resolved ? resolved.node.id : Number(nodeIdMatch[1]);
  }

  const newArtifactStatus = {
    ...(normalized.workbench?.artifactStatus || {}),
    "gate:build": "stale" as const,
    "gate:e2e": "stale" as const
  };
  if (artifactNodeKey !== null && Number.isFinite(artifactNodeKey)) {
    newArtifactStatus[`node:${artifactNodeKey}`] = "stale" as const;
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
  if (!path) return undefined;
  if (path === "themeColor") return spec.themeColor;
  if (path.startsWith("nodes.")) {
    const parts = path.split(".");
    const resolved = resolveNodeFromPathSegment(spec.nodes, parts[1]);
    if (!resolved) return undefined;
    let cur: any = resolved.node;
    for (let i = 2; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  // generic dotted path from root
  const parts = path.split(".");
  let cur: any = spec;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** True when current manifest value already equals the proposed after value. */
export function isPatchAlreadyApplied(spec: GameSpec | null | undefined, patch: { target: string; after: any }): boolean {
  if (!spec) return false;
  const current = getSpecValueByPath(spec, patch.target);
  return valuesEqual(current, patch.after);
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== typeof b) {
    // loose: "12" vs 12
    if ((typeof a === "string" || typeof a === "number") && (typeof b === "string" || typeof b === "number")) {
      return String(a) === String(b);
    }
    return false;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
