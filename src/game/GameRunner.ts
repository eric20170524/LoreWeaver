import Phaser from "phaser";
import { GameSpec, PlayerState, NodeSpec, GameplayModifierSpec, NodeResult } from "../types";
import { synth } from "../utils/AudioSynth";
import AudioAssetResolver from "../../minigame_master/core/lib/audio/AudioAssetResolver.js";
import { RewardApplier } from "../utils/RewardApplier";
import {
  SurvivorHordeAdapter,
  createSurvivorHordeModifier,
  TapReactionAdapter,
  CollectDodgeAdapter,
  TurnBasedSkillBattleAdapter,
  SequenceSynthesisAdapter,
  SideScrollingBrawlerAdapter,
  createSideScrollingBrawlerModifier,
  IframeNodeContainer,
  EnergyBalanceAdapter,
  RuneConnectSequenceAdapter,
  BranchingDialogueCheckAdapter,
  PressureSurvivalAdapter,
  ReactionPickAdapter,
  ObserveCaptureAdapter,
  ShooterDuelAdapter,
  DragToCoreAdapter,
  DodgeCounterBossAdapter,
  MazeExplorationChoiceAdapter,
  PlatformEscapeAdapter,
  HazardCollectWavesAdapter,
  SequencePuzzleComboAdapter,
  RhythmThenPickupAdapter,
  QixAreaCaptureAdapter,
  PointDragProgressionAdapter
} from "../../minigame_master/core/lib/gameplay/index.js";
import {
  createNodePayload,
  TestHooks,
  normalizePlayabilityKnobs
} from "../../minigame_master/core/lib/contracts/index.js";
import {
  RuntimeArtBinder
} from "../../minigame_master/core/lib/graphics/index.js";
import { UIPlugin, UIPluginContext } from "./ui/UIPlugin";
import { GAMEPLAY_CARD_OPTIONS } from "../utils/gameplayManifest";
import { DefaultUIPlugin } from "./ui/DefaultUIPlugin";
import { CultivationUIPlugin } from "./ui/CultivationUIPlugin";

const SURVIVOR_MODIFIER_DEFAULT_KNOBS: Record<string, Record<string, any>> = {
  hazard_telegraph: {
    intervalMs: 3600,
    warningDelayMs: 900,
    radius: 54,
    damage: 18,
    target: "random"
  },
  defend_core: {
    hp: 80,
    radius: 34,
    color: 0x38bdf8,
    enemyDamage: 8,
    aggro: false
  }
};

type RunSkillState = {
  id: string;
  label: string;
  level: number;
};

type FirstNodeGrowthEvent = {
  type: "collection" | "skill_level" | "skill_unlock";
  milestone?: string;
  amount?: number;
  score?: number;
  skillId?: string;
  level?: number;
  before?: Record<string, number | null>;
  after?: Record<string, number | null>;
  atMs: number;
};

type FirstNodeGrowthState = {
  enabled: boolean;
  collectionSource: string;
  growthTrigger: string;
  runtimeMutation: string;
  playerFeedback: string;
  combatImpact: string;
  triggerThreshold: number;
  collectedEssence: number;
  lastObservedScore: number;
  activeSkills: RunSkillState[];
  mutationStats: {
    weaponDamage: number;
    playerHp: number | null;
  };
  combatStats: {
    bulletDamageBefore: number;
    bulletDamageAfter: number;
    healedHp: number;
    unlockedAoE: boolean;
  };
  lastFeedback: string;
  events: FirstNodeGrowthEvent[];
};

type ImageGenAssetPaths = {
  manifestPath: string;
  atlasPath: string;
  provenancePath: string;
  sourceImagePath: string;
  transparentSourceImagePath: string;
  mode: "static_export" | "workspace_live";
};

type PhaserGameOptions = {
  workspaceId?: string | null;
};

function getImageGenAssetPaths(workspaceId?: string | null): ImageGenAssetPaths | null {
  if (typeof window !== "undefined" && Boolean((window as any).__LOREWEAVER_EMBEDDED_SPEC__)) {
    return {
      manifestPath: "assets/imagegen/manifest.json",
      atlasPath: "assets/imagegen/atlas.png",
      provenancePath: "assets/imagegen/provenance.json",
      sourceImagePath: "assets/imagegen/source/generated-sprite-atlas-20260628.png",
      transparentSourceImagePath: "assets/imagegen/source/generated-sprite-atlas-20260628-transparent.png",
      mode: "static_export"
    };
  }

  if (!workspaceId) return null;
  const workspacePrefix = `/api/workspaces/${encodeURIComponent(workspaceId)}/asset-files`;
  return {
    manifestPath: `${workspacePrefix}/assets/imagegen/manifest.json`,
    atlasPath: `${workspacePrefix}/assets/imagegen/atlas.png`,
    provenancePath: `${workspacePrefix}/assets/imagegen/provenance.json`,
    sourceImagePath: `${workspacePrefix}/assets/imagegen/source/generated-sprite-atlas-20260628.png`,
    transparentSourceImagePath: `${workspacePrefix}/assets/imagegen/source/generated-sprite-atlas-20260628-transparent.png`,
    mode: "workspace_live"
  };
}


export function initializePhaserGame(
  parentEl: HTMLElement,
  spec: GameSpec,
  playerState: PlayerState,
  onSaveState: (state: PlayerState) => void,
  onLog: (text: string) => void,
  options: PhaserGameOptions = {}
): Phaser.Game {
  const imageGenAssetPaths = getImageGenAssetPaths(options.workspaceId);
  const runtimeArtBinder = new RuntimeArtBinder();
  // Workbench defaults to prototype (procedural fallback + artSource telemetry).
  // Production hard-fail: options.artRuntimeMode / window.__LOREWEAVER_ART_RUNTIME_MODE__ / knobs.artRuntimeMode
  const resolveArtRuntimeMode = (): "prototype" | "production" => {
    const fromOptions = (options as any).artRuntimeMode || (options as any).runtimeArtMode;
    const fromWindow =
      typeof window !== "undefined"
        ? (window as any).__LOREWEAVER_ART_RUNTIME_MODE__
        : null;
    const raw = String(fromOptions || fromWindow || "prototype").toLowerCase();
    return raw === "production" ? "production" : "prototype";
  };
  runtimeArtBinder.setRuntimeMode(resolveArtRuntimeMode());
  
  // Custom scenes configuration
  class BootScene extends Phaser.Scene {
    constructor() {
      super({ key: "BootScene" });
    }

    preload() {
      runtimeArtBinder.preload(this, imageGenAssetPaths);
      this.load.on("loaderror", (file: any) => {
        if (typeof window !== "undefined") {
          const prev = (window as any).__LOREWEAVER_ART_PIPELINE__ || {};
          (window as any).__LOREWEAVER_ART_PIPELINE__ = {
            ...prev,
            status: "error",
            runtimeMode: runtimeArtBinder.runtimeMode,
            allowProceduralFallback: runtimeArtBinder.allowProceduralFallback,
            manifestError: `failed to load ${file?.src || file?.key || "unknown imagegen asset"}`,
            updatedAt: new Date().toISOString()
          };
        }
      });
    }

    create() {
      const { width, height } = this.scale;
      const bootKnobs = spec.nodes?.[0]?.gameplay?.knobs || {};
      const knobMode = (bootKnobs as any).artRuntimeMode || (bootKnobs as any).runtimeArtMode;
      if (knobMode) {
        runtimeArtBinder.setRuntimeMode(String(knobMode).toLowerCase() === "production" ? "production" : "prototype");
      }
      const artStatus = runtimeArtBinder.install(this, imageGenAssetPaths);
      this.game.registry.set("runtimeArtBinder", runtimeArtBinder);
      this.game.registry.set("runtimeArt", runtimeArtBinder.createContext(this));
      if (artStatus?.status === "loaded") {
        onLog(`🎨 美术 atlas 已接线：${artStatus.loadedCount}/${artStatus.expectedCount} 帧 (RuntimeArtBinder, mode=${runtimeArtBinder.runtimeMode})`);
      } else if (artStatus?.status === "skipped_no_workspace_assets") {
        if (runtimeArtBinder.isProduction()) {
          onLog(`⚠️ 生产模式未找到 workspace imagegen 资源：关键角色创建时将硬失败（ArtAssetMissingError）。`);
        } else {
          onLog(`🎨 未找到 workspace imagegen 资源，原型模式将使用程序化兜底（artSource=fallback|primitive）。`);
        }
      } else if (artStatus?.status === "error") {
        if (runtimeArtBinder.isProduction()) {
          onLog(`⚠️ 美术 atlas 接线失败（生产模式）：关键角色创建时将硬失败。`);
        } else {
          onLog(`⚠️ 美术 atlas 接线失败，原型模式将回退程序化精灵。`);
        }
      }
      
      // Draw background
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x020617, 0x020617, 0x090d16, 0x090d16, 1);
      bg.fillRect(0, 0, width, height);

      // Programmatic glowing vector mandala
      const circle = this.add.graphics();
      const outerColor = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;
      circle.lineStyle(1.5, outerColor, 0.4);
      circle.strokeCircle(width / 2, height / 2, 120);
      circle.lineStyle(3, outerColor, 0.85);
      circle.strokeCircle(width / 2, height / 2, 80);
      
      this.tweens.addCounter({
        from: 0,
        to: 360,
        duration: 3000,
        repeat: -1,
        onUpdate: (tween) => {
          circle.clear();
          circle.lineStyle(1.5, outerColor, 0.35);
          circle.strokeCircle(width / 2, height / 2, 110 + Math.sin(tween.getValue() * (Math.PI / 180)) * 10);
          circle.lineStyle(3, outerColor, 0.85);
          circle.strokeCircle(width / 2, height / 2, 70 + Math.cos(tween.getValue() * (Math.PI / 180)) * 8);
        }
      });

      // Loading text
      const titleText = this.add.text(width / 2, height / 2 - 220, String(bootKnobs.loadingLabel || "LORE WEAVER"), {
        fontFamily: "Inter, sans-serif",
        fontSize: "28px",
        fontWeight: "bold",
        color: spec.themeColor,
        letterSpacing: "4"
      } as any).setOrigin(0.5);

      const subtitleText = this.add.text(width / 2, height / 2 + 190, String(
        bootKnobs.statusText || "正在初始化游戏运行沙盒 INITIALIZING..."
      ), {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "20px",
        color: "#94a3b8"
      }).setOrigin(0.5);

      this.time.delayedCall(1600, () => {
        onLog(`🎨 国风同人世界观 [${spec.title}] 正式载入 WebGL 渲染流！`);
        this.scene.start("MainScene");
      });
    }
  }

  class MainScene extends Phaser.Scene {
    private state!: PlayerState;
    private idleTimer!: Phaser.Time.TimerEvent;
    private progressBars: Phaser.GameObjects.Graphics[] = [];
    private scrollContainer!: Phaser.GameObjects.Container;
    private bgGraphics!: Phaser.GameObjects.Graphics;
    private activeUIPlugin!: UIPlugin;
    private audioResolver: any = null;

    constructor() {
      super({ key: "MainScene" });
    }

    init() {
      this.state = { ...this.game.registry.get("playerState") };
      const pluginType = spec.uiConfig?.plugin || "default";
      if (pluginType === "cultivation") {
        this.activeUIPlugin = new CultivationUIPlugin();
      } else {
        this.activeUIPlugin = new DefaultUIPlugin();
      }
    }

    create() {
      const { width, height } = this.scale;
      const themeHex = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;
      
      // Draw background
      this.bgGraphics = this.add.graphics();
      this.bgGraphics.fillGradientStyle(0x030712, 0x030712, 0x0b0f19, 0x0b0f19, 1);
      this.bgGraphics.fillRect(0, 0, width, height);

      // Draw subtle background ambient particles
      this.createAmbientNebula();

      const uiContext: UIPluginContext = {
        onLog: onLog,
        saveStateToStore: () => this.saveStateToStore()
      };

      // Top Header HUD bounds
      this.activeUIPlugin.renderTopHUD(this, this.state, spec, uiContext);

      // Create scrollable container for 12 nodes
      this.scrollContainer = this.add.container(0, 0);
      this.createNodeScrollList(width, themeHex);

      // Floating click Cultivator (Mandala)
      this.activeUIPlugin.renderClickCore(this, this.state, spec, uiContext);

      // Start delta timer for passive production accumulation
      this.idleTimer = this.time.addEvent({
        delay: 1000,
        callback: this.tickPassiveIncome,
        callbackScope: this,
        loop: true
      });
    }

    private createAmbientNebula() {
      const { width, height } = this.scale;
      const particles: Phaser.GameObjects.Arc[] = [];
      const col = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;
      
      for (let i = 0; i < 24; i++) {
        const x = Phaser.Math.Between(40, width - 40);
        const y = Phaser.Math.Between(100, height - 300);
        const r = Phaser.Math.Between(2, 5);
        const dot = this.add.arc(x, y, r, 0, 360, false, col, 0.25);
        particles.push(dot);
        
        this.tweens.add({
          targets: dot,
          alpha: { from: 0.1, to: 0.65 },
          y: y - Phaser.Math.Between(15, 30),
          duration: Phaser.Math.Between(3000, 6000),
          yoyo: true,
          repeat: -1
        });
      }
    }



    private createNodeScrollList(width: number, themeColor: number) {
      const { height } = this.scale;
      const scrollYOffset = 150;
      const cardHeight = 110;
      
      // Let's print out 12 sequential horizontal cards
      spec.nodes.forEach((node, i) => {
        const dy = scrollYOffset + i * (cardHeight + 14);
        
        const isUnlocked = this.state.unlockedNodeIds.includes(node.id);
        const isCompleted = this.state.completedNodeIds.includes(node.id);

        const cardBg = this.add.graphics();
        
        // Highlight active or completed states
        if (isCompleted) {
          cardBg.fillStyle(0x061510, 0.7); // Emerald dark
          cardBg.lineStyle(1.5, 0x10b981, 0.45);
        } else if (isUnlocked) {
          cardBg.fillStyle(0x0e1726, 0.7); // Current unlocked deep blue
          cardBg.lineStyle(2, themeColor, 0.7);
        } else {
          cardBg.fillStyle(0x111827, 0.35); // Locked card grey
          cardBg.lineStyle(1, 0x374151, 0.45);
        }

        // Draw card structures
        cardBg.fillRoundedRect(22, dy, width - 44, cardHeight, 6);
        cardBg.strokeRoundedRect(22, dy, width - 44, cardHeight, 6);
        this.scrollContainer.add(cardBg);

        // Stage Title
        const lockPrefix = isCompleted ? "✅ " : isUnlocked ? "🌀 " : "🔒 ";
        const titleColor = isUnlocked ? "#ffffff" : "#4b5563";
        const titleText = this.add.text(42, dy + 18, `${lockPrefix}节点 ${node.id}: ${node.title}`, {
          fontFamily: "Inter, sans-serif",
          fontSize: "21px",
          fontStyle: "bold",
          color: titleColor
        });
        this.scrollContainer.add(titleText);

        // Sub description intro text
        const introTextStr = isUnlocked ? node.intro : "尚未解锁。请先完成前置节点。";
        const descText = this.add.text(42, dy + 42, introTextStr, {
          fontFamily: "Inter, sans-serif",
          fontSize: "16px",
          color: isUnlocked ? "#94a3b8" : "#4b5563",
          wordWrap: { width: width - 84, useAdvancedWrap: true }
        });
        this.scrollContainer.add(descText);

        // Mechanics tag & Rewards labels
        if (isUnlocked) {
          const mechLabels: { [key: string]: string } = {
            tap_reaction: "⚡ 快速聚灵 (TAP)",
            collect_dodge: "🍃 虚空飞渡 (DODGE)",
            memory_sequence: "🔮 心魂律动 (MEMORY)"
          };
          const rawMech = mechLabels[node.mechanics] || node.mechanics.toUpperCase();
          const tag = this.add.text(42, dy + 82, `玩法: ${rawMech}`, {
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "15px",
            color: spec.themeColor,
            backgroundColor: "rgba(0,0,0,0.45)",
            padding: { x: 5, y: 3 }
          });
          
          const rwd = this.add.text(230, dy + 82, `奖励: ${node.rewards}`, {
            fontFamily: "Inter, sans-serif",
            fontSize: "15px",
            color: "#f59e0b"
          });

          this.scrollContainer.add([tag, rwd]);
          
          // Trigger click bounds to activate war-moblization or enter scenes directly
          const clickTarget = this.add.zone(22 + (width - 44)/2, dy + cardHeight/2, width - 44, cardHeight);
          clickTarget.setInteractive({ useHandCursor: true });
          clickTarget.on("pointerdown", () => {
            synth.playClick();
            onLog(`⚔️ Launching Trial Node [${node.id}: ${node.title}] with mechanics: [${node.mechanics}]...`);
            this.scene.start("LevelActiveScene", { node });
          });
          this.scrollContainer.add(clickTarget);
        }
      });

      // Enable basic vertical dragging scrolling
      let startY = 0;
      let startContainerY = 0;
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        // Prevent scroll collision near cultivate mandala
        if (pointer.y > height - 200) return;
        startY = pointer.y;
        startContainerY = this.scrollContainer.y;
      });

      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown || pointer.y > height - 180) return;
        const diff = pointer.y - startY;
        let targetY = startContainerY + diff;
        
        // Limits of scroll bounds
        const maxScroll = -((cardHeight + 14) * 12 - 500);
        if (targetY > 0) targetY = 0;
        if (targetY < maxScroll) targetY = maxScroll;
        
        this.scrollContainer.y = targetY;
      });
    }

    private tickPassiveIncome = () => {
      // passively accumulation state increase
      const increment = parseFloat((this.state.activeMultiplier * 1.5).toFixed(2));
      this.state.mainCurrencyCount += increment;
      if ((this.activeUIPlugin as any).onIncomeTick) {
        (this.activeUIPlugin as any).onIncomeTick(this, this.state, increment);
      }
      this.saveStateToStore();
    };

    private saveStateToStore() {
      this.game.registry.set("playerState", this.state);
      onSaveState(this.state);
    }

    shutdown() {
      if (this.idleTimer) {
        this.idleTimer.destroy();
      }
    }
  }

  // Active level interactive minigames controller scene
  class LevelActiveScene extends Phaser.Scene {
    private node!: NodeSpec;
    private timerBar!: Phaser.GameObjects.Graphics;
    private timeLeft: number = 30;
    private gameTimer!: Phaser.Time.TimerEvent;
    
    // Mechanics values
    private scoreCount: number = 0;
    private scoreHUD!: Phaser.GameObjects.Text;
    private livesCount: number = 3;
    private livesHUD!: Phaser.GameObjects.Text;
    
    private adapter: any = null;
    private testHooks: any = null;
    private runGrowthState: FirstNodeGrowthState | null = null;
    private growthHUD: Phaser.GameObjects.Text | null = null;
    private activeIframe: HTMLIFrameElement | null = null;
    private iframeListener: ((ev: MessageEvent) => void) | null = null;
    private iframeContainer: any = null;
    private audioResolver: any = null;

    // Tap Reaction lists
    private spawnTimer!: Phaser.Time.TimerEvent;
    private activeOrbs: Phaser.GameObjects.Arc[] = [];

    // Collect Dodge values
    private playerCapsule!: Phaser.GameObjects.Graphics;
    private spawnItemTimer!: Phaser.Time.TimerEvent;
    private activeCollects: Phaser.GameObjects.Arc[] = [];
    private activeHazards: Phaser.GameObjects.Graphics[] = [];

    // Memory sequence values
    private sequenceLength: number = 4;
    private cpuSequence: number[] = [];
    private playerStep: number = 0;
    private runeKeyrings: Phaser.GameObjects.Graphics[] = [];
    private userInteractiveLocks: boolean = true;

    constructor() {
      super({ key: "LevelActiveScene" });
    }

    init(data: { node: NodeSpec }) {
      (this as any)._didRetreat = false;
      (this as any)._retreatBtn = null;
      this.node = data.node;
      this.timeLeft = data.node.durationLimit || 30;
      this.scoreCount = 0;
      this.livesCount = 3;
      this.adapter = null;
      this.testHooks = null;
      this.runGrowthState = null;
      this.growthHUD = null;

      if (this.node.gameplay) {
        this.testHooks = new TestHooks("__LOREWEAVER_TEST_HOOKS__");
        const cardId = this.node.gameplay.cardId;

        const pState = this.game.registry.get("playerState") || {};
        const unlockedAbilities = Array.isArray(pState.unlockedAbilities) ? pState.unlockedAbilities : [];
        const planning = this.node.planning || {
          mainlineHooks: [],
          rewardUnlocks: [],
          runSkillPool: []
        };
        const abilityCatalog = spec.abilityCatalog || [];
        const runtimeVisuals = {
          characterDesignCatalog: spec.characterDesignCatalog || [],
          enemyDesignCatalog: spec.enemyDesignCatalog || []
        };
        const artBinder = this.game.registry.get("runtimeArtBinder") as RuntimeArtBinder | null;
        const runtimeArt = artBinder
          ? artBinder.createContext(this)
          : this.game.registry.get("runtimeArt") || null;
        const baseKnobs: any = {
          duration: this.node.durationLimit || 30,
          durationSec: this.node.durationLimit || 30,
          timeLimitSec: this.node.durationLimit || 30,
          goalValue: this.node.goalValue,
          needAmount: this.node.goalValue,
          difficulty: this.node.difficulty,
          resourceMultiplier: this.node.resourceMultiplier,
          cardId
        };

        const mergedRaw = this.node.gameplay.knobs
          ? { ...baseKnobs, ...this.node.gameplay.knobs, cardId }
          : baseKnobs;

        // Per-node art runtime mode override (prototype default; production hard-fails missing critical art)
        if (artBinder && (mergedRaw.artRuntimeMode || mergedRaw.runtimeArtMode)) {
          const m = String(mergedRaw.artRuntimeMode || mergedRaw.runtimeArtMode).toLowerCase();
          artBinder.setRuntimeMode(m === "production" ? "production" : "prototype");
        }
        // survivor_horde golden critical set: fail early in production if atlas did not install
        if (artBinder && artBinder.isProduction() && cardId === "survivor_horde") {
          try {
            artBinder.validateRequiredAssets(
              {
                playerClips: ["idle", "walk", "attack", "hurt", "death"],
                enemyKinds: ["mob", "elite", "boss"],
                environments: ["bg_default"]
              },
              {
                enemyIdMap: {
                  mob: "wild_rhino",
                  elite: "green_scaled_eagle",
                  boss: "qiongqi_cub"
                },
                envKeyMap: { bg_default: "lw_art_env_bg_desert" },
                semanticAssetMapping: {
                  player: {
                    idle: "lw_runtime_player_idle",
                    walk: "lw_runtime_player_walk",
                    attack: "lw_runtime_player_attack",
                    hurt: "lw_runtime_player_hurt",
                    death: "lw_runtime_player_death"
                  },
                  enemy: {
                    mob: "lw_enemy_wild_rhino",
                    elite: "lw_enemy_green_scaled_eagle",
                    boss: "lw_enemy_qiongqi_cub"
                  },
                  environment: { bg_default: "lw_art_env_bg_desert" }
                }
              }
            );
          } catch (artErr: any) {
            const msg = artErr?.message || String(artErr);
            onLog(`⚠️ production art validation failed: ${msg}`);
            this.testHooks?.recordError?.(artErr);
            artBinder.syncToTestHooks(this.testHooks);
            // Re-throw so production does not silently continue with missing critical art
            throw artErr;
          }
        }
        if (artBinder && this.testHooks) {
          artBinder.syncToTestHooks(this.testHooks);
        }
        // Shared PlayabilityContract — card-standard + legacy aliases
        const mergedKnobs = normalizePlayabilityKnobs(cardId, mergedRaw, {
          durationLimit: this.node.durationLimit,
          goalValue: this.node.goalValue,
          gameplay: { cardId }
        });

        const payload = createNodePayload({
          id: this.node.id,
          nodeId: `node_${this.node.id}`,
          nodeConfig: {
            duration: mergedKnobs.durationSec || this.node.durationLimit,
            durationLimit: mergedKnobs.durationSec || this.node.durationLimit,
            goalValue: mergedKnobs.needAmount ?? this.node.goalValue,
            rewards: {
              score: mergedKnobs.needAmount ?? this.node.goalValue
            },
            planning,
            abilityCatalog,
            runtimeVisuals,
            runtimeArtStatus: runtimeArt?.status?.() || null,
            gameplay: {
              cardId: cardId,
              runtimeVisuals,
              knobs: mergedKnobs,
              runSkillPool: planning.runSkillPool
            }
          },
          playerStats: {
            hp: pState.hp || 100
          },
          playerPerks: [
            ...planning.mainlineHooks,
            ...unlockedAbilities
          ],
          inventory: {
            abilities: abilityCatalog,
            unlockedAbilities,
            runSkillPool: planning.runSkillPool
          }
        });
        // Attach non-serializable art context for adapters (not part of NodeResult contract)
        (payload as any).runtimeArt = runtimeArt;
        (payload as any).art = runtimeArt;

        if (cardId === "survivor_horde") {
          const modifiersList = (this.node.gameplay?.modifiers || []).flatMap((modSpec: GameplayModifierSpec) => {
            try {
              const defaultKnobs = SURVIVOR_MODIFIER_DEFAULT_KNOBS[modSpec.id] || {};
              return [createSurvivorHordeModifier({
                id: modSpec.id,
                knobs: {
                  ...defaultKnobs,
                  ...(modSpec.knobs || {})
                }
              })];
            } catch (error) {
              onLog(`⚠️ 跳过暂不支持的 survivor_horde modifier: ${modSpec.id}`);
              return [];
            }
          });

          this.adapter = new SurvivorHordeAdapter({
            testHooks: this.testHooks,
            modifiers: modifiersList,
            onPresentationEvent: (event: any) => {
              this.handleSurvivorPresentationEvent(event);
            },
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            }
          });
        } else if (cardId === "rhythm_timing") {
          this.adapter = new TapReactionAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            },
            spawnParticles: (x: number, y: number, color: number) => {
              this.spawnParticleExplosion(x, y, color);
            }
          });
        } else if (cardId === "drag_collect_grid") {
          this.adapter = new CollectDodgeAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            },
            spawnParticles: (x: number, y: number, color: number) => {
              this.spawnParticleExplosion(x, y, color);
            }
          });
        } else if (cardId === "turn_based_skill_battle") {
          this.adapter = new TurnBasedSkillBattleAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            }
          });
        } else if (cardId === "sequence_synthesis") {
          this.adapter = new SequenceSynthesisAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            },
            spawnParticles: (x: number, y: number, color: number) => {
              this.spawnParticleExplosion(x, y, color);
            }
          });
        } else if (cardId === "side_scrolling_brawler") {
          const modifiersList = (this.node.gameplay?.modifiers || []).flatMap((modSpec: GameplayModifierSpec) => {
            try {
              return [createSideScrollingBrawlerModifier({
                id: modSpec.id,
                knobs: { ...(modSpec.knobs || {}) }
              })];
            } catch (error) {
              onLog(`⚠️ 跳过暂不支持的 side_scrolling_brawler modifier: ${modSpec.id}`);
              return [];
            }
          });
          this.adapter = new SideScrollingBrawlerAdapter({
            Phaser,
            testHooks: this.testHooks,
            modifiers: modifiersList,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            }
          });
        } else if (cardId === "energy_balance") {
          this.adapter = new EnergyBalanceAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            },
            spawnParticles: (x: number, y: number, color: number) => {
              this.spawnParticleExplosion(x, y, color);
            }
          });
        } else if (cardId === "rune_connect_sequence") {
          this.adapter = new RuneConnectSequenceAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            },
            spawnParticles: (x: number, y: number, color: number) => {
              this.spawnParticleExplosion(x, y, color);
            }
          });
        } else if (cardId === "branching_dialogue_check") {
          this.adapter = new BranchingDialogueCheckAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => {
              this.handleAdapterEnd(result);
            }
          });
        } else if (cardId === "pressure_survival") {
          this.adapter = new PressureSurvivalAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        } else if (cardId === "reaction_pick") {
          this.adapter = new ReactionPickAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result)
          });
        } else if (cardId === "observe_capture") {
          this.adapter = new ObserveCaptureAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        } else if (cardId === "shooter_duel") {
          this.adapter = new ShooterDuelAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result)
          });
        } else if (cardId === "drag_to_core") {
          this.adapter = new DragToCoreAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        } else if (cardId === "dodge_counter_boss") {
          this.adapter = new DodgeCounterBossAdapter({
            Phaser,
            testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        } else if (cardId === "maze_exploration_choice") {
          this.adapter = new MazeExplorationChoiceAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result)
          });
        } else if (cardId === "platform_escape") {
          this.adapter = new PlatformEscapeAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result)
          });
        } else if (cardId === "hazard_collect_waves") {
          this.adapter = new HazardCollectWavesAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        } else if (cardId === "sequence_puzzle_combo") {
          this.adapter = new SequencePuzzleComboAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result)
          });
        } else if (cardId === "rhythm_then_pickup") {
          this.adapter = new RhythmThenPickupAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        } else if (cardId === "qix_area_capture") {
          this.adapter = new QixAreaCaptureAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result)
          });
        } else if (cardId === "point_drag_progression") {
          this.adapter = new PointDragProgressionAdapter({
            Phaser, testHooks: this.testHooks,
            onEnd: (result: any) => this.handleAdapterEnd(result),
            spawnParticles: (x: number, y: number, color: number) => this.spawnParticleExplosion(x, y, color)
          });
        }

        if (this.adapter) {
          this.adapter.init(payload);
          this.setupFirstNodeGrowthLoop(cardId);
        }
      }
    }

    create() {
      const { width, height } = this.scale;
      const col = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;

      // Dark background with cosmic borders
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x020617, 0x020617, 0x070b14, 0x070b14, 1);
      bg.fillRect(0, 0, width, height);

      // Arena borders matching custom color spec
      bg.lineStyle(1.5, col, 0.4);
      bg.strokeRect(12, 12, width - 24, height - 24);

      // Level general Header
      this.drawLevelHeader(width, height, col);

      const knobs = (this.node.gameplay?.knobs || {}) as Record<string, any>;

      if (!this.audioResolver) {
        this.audioResolver = new AudioAssetResolver({ synthFallback: true });
      }
      const bgmKey = typeof knobs.bgmKey === "string" && knobs.bgmKey ? knobs.bgmKey : "bgm_default";
      onLog(`🎵 节点 BGM 合同: ${bgmKey}${knobs.bossBgmKey ? ` · boss=${knobs.bossBgmKey}` : ""}`);
      this.audioResolver.playBgm(bgmKey);

      // Show level introductory overlay, and launch game only when skipped/completed
      this.showLevelIntro(() => {
        if (this.node.gameplay?.adapter === "iframe") {
          this.launchIframeContainer(width, height);
        } else if (this.adapter) {
          this.adapter.create(this);
          (window as any).__LW_SURVIVOR_DEMO__ = this.adapter;
        } else {
          // Spawn overall active level timers
          this.timerBar = this.add.graphics();
          this.gameTimer = this.time.addEvent({
            delay: 50,
            callback: this.tickLevelTimer,
            callbackScope: this,
            loop: true
          });

          // Distribute and trigger minigame core routines
          this.launchMechanicMinigame(width, height, col);
        }

        // Retreat AFTER intro so it is never covered by the skip zone.
        this.mountRetreatButton(knobs);
      });
    }

    /** Mount top-left retreat control above gameplay (not under intro overlay). */
    private mountRetreatButton(knobs: Record<string, any>) {
      const allowQuit = knobs.allowQuit !== false && knobs.shellRetreat !== false;
      if (!allowQuit) {
        onLog(`🔒 节点 ${this.node.id} 已关闭撤退（allowQuit=false），须通关或失败结算。`);
        return;
      }
      if ((this as any)._retreatBtn && (this as any)._retreatBtn.active) return;

      const rBtn = this.add
        .text(32, 32, "◀ 撤退 / RETREAT", {
          fontFamily: "Inter, sans-serif",
          fontSize: "16px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "rgba(239, 68, 68, 0.75)",
          padding: { x: 10, y: 6 }
        })
        .setInteractive({ useHandCursor: true })
        .setDepth(100000)
        .setScrollFactor(0);
      (this as any)._retreatBtn = rBtn;

      rBtn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        try {
          pointer?.event?.stopPropagation?.();
        } catch {
          /* ignore */
        }
        synth.playClick();
        onLog(`◀ 已主动撤出节点考验 [节点 ${this.node.id}]。正在返回主视图。`);
        // Always leave the node scene; adapter.retreat notifies rewards/path, then force shell.
        try {
          if (this.iframeContainer) {
            this.iframeContainer.retreat?.();
          } else if (this.adapter && typeof (this.adapter as any).retreat === "function") {
            (this.adapter as any).retreat();
          }
        } catch (err) {
          onLog(`⚠️ adapter.retreat 异常：${err}`);
        }
        // Safety: even if onEnd is missing, leave the scene.
        this.time.delayedCall(30, () => {
          if (this.sys?.isActive()) {
            this.safeRetreat();
          }
        });
      });
    }

    update(time: number, delta: number) {
      if (this.adapter) {
        this.adapter.update(time, delta);
        const testState = this.adapter.getTestState?.() || {};
        if (testState) {
          this.observeFirstNodeGrowth(testState);
          const goal =
            typeof (testState as any).goalValue === "number"
              ? (testState as any).goalValue
              : this.node.goalValue;
          const score =
            typeof (testState as any).score === "number"
              ? (testState as any).score
              : typeof (this.adapter as any)?.state?.score === "number"
              ? (this.adapter as any).state.score
              : typeof (testState as any).progress === "number"
              ? (testState as any).progress
              : typeof (testState as any).surviveTime === "number"
              ? (testState as any).surviveTime
              : 0;
          const hp =
            typeof (testState as any).hp === "number"
              ? (testState as any).hp
              : typeof (this.adapter as any)?.state?.hp === "number"
              ? (this.adapter as any).state.hp
              : 100;
          if (this.scoreHUD) {
            this.scoreHUD.setText(`目标进度：${score} / ${goal}`);
          }
          if (this.livesHUD) {
            this.livesHUD.setText(`生命精力：${Math.ceil(hp)}`);
          }

          // Prefer adapter-internal win conditions; only force-finish when goal is met
          // and adapter exposes a numeric score (avoid undefined >= N).
          if (
            this.adapter.status === "running" &&
            typeof score === "number" &&
            typeof goal === "number" &&
            goal > 0 &&
            score >= goal &&
            typeof (this.adapter as any).finish === "function"
          ) {
            (this.adapter as any).finish(true, "objective_met");
          }
        }
      }
    }

    private drawLevelHeader(width: number, height: number, themeHex: number) {
      // Display Boss dialogue / Taunt quotes
      const idx = Phaser.Math.Between(0, this.node.taunts.length - 1);
      const chosenTaunt = this.node.taunts[idx] || "「挑战尚未成功，再试一次吧！」";
      
      const phraseText = this.add.text(width / 2, 100, chosenTaunt, {
        fontFamily: "Inter, sans-serif",
        fontSize: "18px",
        fontStyle: "italic",
        color: "#f59e0b",
        wordWrap: { width: width - 80, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      this.add.text(width / 2, 140, `${this.node.title.toUpperCase()}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "24px",
        style: "bold",
        color: spec.themeColor,
        letterSpacing: "1"
      } as any).setOrigin(0.5);

      // Lives and Target score indicators
      this.scoreHUD = this.add.text(32, height - 42, `目标进度：0 / ${this.node.goalValue}`, {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "20px",
        color: "#ffffff"
      });

      this.livesHUD = this.add.text(width - 150, height - 42, `生命精力：${this.livesCount}`, {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "20px",
        color: "#10b981"
      });

      if (this.runGrowthState?.enabled) {
        this.growthHUD = this.add.text(32, height - 72, "", {
          fontFamily: "JetBrains Mono, monospace",
          fontSize: "18px",
          color: "#fbbf24"
        });
        this.refreshGrowthHUD();
      }
    }

    private setupFirstNodeGrowthLoop(cardId: string) {
      if (this.node.id !== 1 || cardId !== "survivor_horde" || !this.adapter) return;

      const baseDamage = Number(this.adapter.config?.weapon?.bulletDamage || 2);
      this.runGrowthState = {
        enabled: true,
        collectionSource: "beast_essence_score_from_survivor_horde_collectibles",
        growthTrigger: "Collect 2 early beast-essence score motes",
        runtimeMutation: "activeSkills[].level and adapter.config.weapon.bulletDamage",
        playerFeedback: "Growth HUD, floating skill text, particle burst, and loot cue",
        combatImpact: "Lv.2 primordial_fist raises bullet damage for subsequent shots",
        triggerThreshold: 2,
        collectedEssence: 0,
        lastObservedScore: 0,
        activeSkills: [
          {
            id: "primordial_fist",
            label: this.getRuntimeSkillLabel("primordial_fist"),
            level: 1
          }
        ],
        mutationStats: {
          weaponDamage: baseDamage,
          playerHp: this.readAdapterHp()
        },
        combatStats: {
          bulletDamageBefore: baseDamage,
          bulletDamageAfter: baseDamage,
          healedHp: 0,
          unlockedAoE: false
        },
        lastFeedback: "awaiting_collection",
        events: []
      };

      this.publishGrowthState();
    }

    private observeFirstNodeGrowth(testState: any) {
      const growth = this.runGrowthState;
      if (!growth?.enabled || !this.adapter || this.adapter.status !== "running") return;

      const score = Math.max(0, Math.floor(Number(testState?.score || 0)));
      if (score > growth.lastObservedScore) {
        const amount = score - growth.lastObservedScore;
        growth.lastObservedScore = score;
        growth.collectedEssence += amount;
        growth.events.push({
          type: "collection",
          amount,
          score,
          atMs: Math.round(this.time.now || 0)
        });
      }

      if (growth.collectedEssence >= 2) {
        this.applyFirstNodeGrowthMilestone("primordial_fist_lv2");
      }

      if (growth.collectedEssence >= 4) {
        this.applyFirstNodeGrowthMilestone("suan_ni_roar_unlock");
      }

      this.refreshGrowthHUD();
      this.publishGrowthState();
    }

    private applyFirstNodeGrowthMilestone(milestone: string) {
      const growth = this.runGrowthState;
      if (!growth || growth.events.some((event) => event.milestone === milestone)) return;

      const before = this.readGrowthMutationStats();

      if (milestone === "primordial_fist_lv2") {
        const skill = growth.activeSkills.find((item) => item.id === "primordial_fist");
        if (skill) {
          skill.level = Math.max(skill.level, 2);
        }

        const currentDamage = Number(this.adapter?.config?.weapon?.bulletDamage || 2);
        this.adapter.config.weapon.bulletDamage = Math.max(currentDamage + 2, Math.ceil(currentDamage * 1.6));
        growth.lastFeedback = `${this.getRuntimeSkillLabel("primordial_fist")} Lv.2`;
        this.showGrowthFeedback("基础拳 Lv.2，拳罡更重", 0xf59e0b);
        growth.events.push({
          type: "skill_level",
          milestone,
          skillId: "primordial_fist",
          level: 2,
          before,
          after: this.readGrowthMutationStats(),
          atMs: Math.round(this.time.now || 0)
        });
      } else if (milestone === "suan_ni_roar_unlock") {
        growth.activeSkills.push({
          id: "suan_ni_roar",
          label: this.getRuntimeSkillLabel("suan_ni_roar"),
          level: 1
        });

        const currentDamage = Number(this.adapter?.config?.weapon?.bulletDamage || 2);
        this.adapter.config.weapon.bulletDamage = currentDamage + 3;
        growth.combatStats.unlockedAoE = true;
        growth.lastFeedback = `${this.getRuntimeSkillLabel("suan_ni_roar")} unlocked`;
        this.showGrowthFeedback("临阵参悟：狻猊怒啸", 0xfacc15);
        growth.events.push({
          type: "skill_unlock",
          milestone,
          skillId: "suan_ni_roar",
          level: 1,
          before,
          after: this.readGrowthMutationStats(),
          atMs: Math.round(this.time.now || 0)
        });
      }

      const after = this.readGrowthMutationStats();
      growth.mutationStats.weaponDamage = after.weaponDamage || 0;
      growth.mutationStats.playerHp = after.playerHp;
      growth.combatStats.bulletDamageAfter = after.weaponDamage || growth.combatStats.bulletDamageAfter;
      this.refreshGrowthHUD();
    }

    private getRuntimeSkillLabel(skillId: string) {
      const directLabels: Record<string, string> = {
        primordial_fist: "原始真解·基础拳",
        suan_ni_roar: "狻猊宝术·怒啸",
        willow_blessing: "柳神赐福·回春"
      };
      if (directLabels[skillId]) return directLabels[skillId];

      const ability = spec.abilityCatalog?.find((item) => item.runtimeSkillIds?.includes(skillId));
      return ability?.name || skillId;
    }

    private readAdapterHp() {
      const hp = this.adapter?.state?.hp;
      return typeof hp === "number" ? hp : null;
    }

    private readGrowthMutationStats() {
      return {
        weaponDamage: Number(this.adapter?.config?.weapon?.bulletDamage || 0),
        playerHp: this.readAdapterHp()
      };
    }

    private refreshGrowthHUD() {
      if (!this.growthHUD || !this.runGrowthState) return;

      const growth = this.runGrowthState;
      const skills = growth.activeSkills
        .map((skill) => `${skill.label} Lv.${skill.level}`)
        .join(" / ");
      this.growthHUD.setText(`血气参悟：${growth.collectedEssence}/${growth.triggerThreshold} · ${skills}`);
    }

    private showGrowthFeedback(text: string, color: number) {
      synth.playLoot();
      const { width, height } = this.scale;
      const fx = this.add.text(width / 2, height - 118, text, {
        fontFamily: "Inter, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        color: "#fff7d6",
        backgroundColor: "rgba(15, 23, 42, 0.72)",
        padding: { x: 10, y: 6 }
      }).setOrigin(0.5).setDepth(20);

      this.spawnParticleExplosion(width / 2, height / 2, color);
      this.cameras.main.flash(160, 245, 158, 11);
      this.tweens.add({
        targets: fx,
        y: height - 150,
        alpha: 0,
        duration: 1200,
        onComplete: () => fx.destroy()
      });
    }

    private publishGrowthState() {
      if (!this.testHooks || !this.runGrowthState) return;

      const growth = this.runGrowthState;
      this.testHooks.update({
        growth: {
          enabled: growth.enabled,
          collectionSource: growth.collectionSource,
          growthTrigger: growth.growthTrigger,
          runtimeMutation: growth.runtimeMutation,
          playerFeedback: growth.playerFeedback,
          combatImpact: growth.combatImpact,
          triggerThreshold: growth.triggerThreshold,
          collectedEssence: growth.collectedEssence,
          activeSkills: growth.activeSkills.map((skill) => ({ ...skill })),
          mutationStats: { ...growth.mutationStats },
          combatStats: { ...growth.combatStats },
          lastFeedback: growth.lastFeedback,
          events: growth.events.slice(-8)
        }
      });
    }

    private tickLevelTimer() {
      const { width, height } = this.scale;
      this.timeLeft -= 0.05;
      
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.handleLevelLoss("大限已到，仙缘退散");
        return;
      }

      // Re-draw timer slider bar
      this.timerBar.clear();
      this.timerBar.fillStyle(0x1e293b, 1);
      this.timerBar.fillRect(32, 170, width - 64, 6);

      const ratio = this.timeLeft / (this.node.durationLimit || 30);
      const barCol = ratio > 0.35 ? Phaser.Display.Color.HexStringToColor(spec.themeColor).color : 0xef4444;
      
      this.timerBar.fillStyle(barCol, 1);
      this.timerBar.fillRect(32, 170, (width - 64) * ratio, 6);
    }

    private launchMechanicMinigame(width: number, height: number, themeColor: number) {
      if (this.node.mechanics === "tap_reaction") {
        this.scoreHUD.setText(`已吸收: 0 / ${this.node.goalValue}`);
        this.triggerTapReactionOrbs(width, height, themeColor);
      } else if (this.node.mechanics === "collect_dodge") {
        this.scoreHUD.setText(`已收集: 0 / ${this.node.goalValue}`);
        this.triggerCollectDodgeArena(width, height, themeColor);
      } else if (this.node.mechanics === "memory_sequence") {
        this.scoreHUD.setText(`心神共鸣: 0 / ${this.node.goalValue}`);
        this.triggerMemorySequenceLabyrinth(width, height, themeColor);
      }
    }

    /* MINIGAME 1: TAP REACTION (SPAWN GLOW ROTATING ORBS) */
    private triggerTapReactionOrbs(width: number, height: number, themeColor: number) {
      // Spawn initial orbs
      const initialCount = 3;
      for (let i = 0; i < initialCount; i++) {
        this.spawnReactionOrb(width, height, themeColor);
      }

      // Loop generation timer based on difficulty multipliers
      const interval = Math.max(800, 1500 - this.node.difficulty * 150);
      this.spawnTimer = this.time.addEvent({
        delay: interval,
        callback: () => this.spawnReactionOrb(width, height, themeColor),
        callbackScope: this,
        loop: true
      });
    }

    private spawnReactionOrb(width: number, height: number, themeColor: number) {
      const rx = Phaser.Math.Between(60, width - 60);
      const ry = Phaser.Math.Between(210, height - 160);
      const rad = Phaser.Math.Between(25, 40);

      const ring = this.add.arc(rx, ry, rad, 0, 360, false, themeColor, 0.45);
      ring.setInteractive({ useHandCursor: true });
      this.activeOrbs.push(ring);

      // Micro hover scaling animation
      ring.on("pointerover", () => {
        ring.setAlpha(0.85);
      });
      ring.on("pointerout", () => {
        ring.setAlpha(0.45);
      });

      // Click mechanics trigger
      ring.on("pointerdown", () => {
        synth.playLoot();
        const gain = Phaser.Math.Between(1, 5);
        this.scoreCount += gain;
        this.scoreHUD.setText(`已吸收: ${this.scoreCount} / ${this.node.goalValue}`);
        
        // Spawn micro numbers floating animation
        const fx = this.add.text(rx, ry, `+${gain} 能量`, { fontFamily: "JetBrains Mono", fontSize: "18px", color: spec.themeColor });
        this.tweens.add({
          targets: fx,
          y: ry - 40,
          alpha: 0,
          duration: 400,
          onComplete: () => fx.destroy()
        });

        // Small camera shake
        this.cameras.main.shake(80, 0.003);

        // Splice and clean target orb
        const idx = this.activeOrbs.indexOf(ring);
        if (idx > -1) this.activeOrbs.splice(idx, 1);
        ring.destroy();

        if (this.scoreCount >= this.node.goalValue) {
          this.handleLevelWin();
        }
      });

      // Self-destruct tween if player misses
      this.tweens.add({
        targets: ring,
        scale: 0,
        alpha: 0,
        duration: 3500 - this.node.difficulty * 250,
        onComplete: () => {
          if (ring && ring.active) {
            const idx = this.activeOrbs.indexOf(ring);
            if (idx > -1) this.activeOrbs.splice(idx, 1);
            ring.destroy();
          }
        }
      });
    }

    /* MINIGAME 2: COLLECT & DODGE (GLIDING CAPSULE CAPSULE) */
    private triggerCollectDodgeArena(width: number, height: number, themeColor: number) {
      // Draw bottom simple player avatar shape representer
      this.playerCapsule = this.add.graphics();
      this.playerCapsule.fillStyle(themeColor, 0.9);
      this.playerCapsule.fillRoundedRect(-30, -10, 60, 20, 4);
      this.playerCapsule.lineStyle(1.5, 0xffffff, 1);
      this.playerCapsule.strokeRoundedRect(-30, -10, 60, 20, 4);
      this.playerCapsule.setPosition(width / 2, height - 130);

      // Pointer drag triggers to float avatar on horizontal axis
      this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
        if (!this.playerCapsule || !(this.playerCapsule as any).active) return;
        // Enforce horizontal bounds boundaries safely
        const tx = Phaser.Math.Clamp(p.x, 48, width - 48);
        this.playerCapsule.x = tx;
      });

      // Items cascading loop logic
      const rate = Math.max(450, 900 - this.node.difficulty * 100);
      this.spawnItemTimer = this.time.addEvent({
        delay: rate,
        callback: () => this.spawnCascadeItem(width, height, themeColor),
        callbackScope: this,
        loop: true
      });
    }

    private spawnCascadeItem(width: number, height: number, themeColor: number) {
      const rx = Phaser.Math.Between(40, width - 40);
      const fallSpeed = Phaser.Math.Between(200, 360) + this.node.difficulty * 30;
      
      const isDodgeHazard = Phaser.Math.Between(1, 10) > 6; // 40% hazard rate
      
      if (!isDodgeHazard) {
        // Benefit Item (Green crystal dots)
        const gem = this.add.arc(rx, 190, 8, 0, 360, false, 0x10b981, 0.9);
        this.activeCollects.push(gem);

        this.tweens.add({
          targets: gem,
          y: height - 60,
          duration: (height - 250) / (fallSpeed / 1000),
          onUpdate: () => {
            // Collision boundary checks
            if (gem && gem.active && this.playerCapsule && (this.playerCapsule as any).active && Phaser.Math.Distance.Between(gem.x, gem.y, this.playerCapsule.x, this.playerCapsule.y) < 32) {
              synth.playLoot();
              this.scoreCount += 1;
              this.scoreHUD.setText(`已收集: ${this.scoreCount} / ${this.node.goalValue}`);
              this.cleanAndDestroyArc(gem, this.activeCollects);

              if (this.scoreCount >= this.node.goalValue) {
                this.handleLevelWin();
              }
            }
          },
          onComplete: () => {
            this.cleanAndDestroyArc(gem, this.activeCollects);
          }
        });
      } else {
        // Hazard Item (Red warnings diamond)
        const hazard = this.add.graphics();
        hazard.fillStyle(0xef4444, 0.95);
        hazard.fillTriangle(0, -10, -8, 6, 8, 6);
        hazard.setPosition(rx, 190);
        this.activeHazards.push(hazard);

        this.tweens.add({
          targets: hazard,
          y: height - 60,
          duration: (height - 250) / (fallSpeed / 1000),
          onUpdate: () => {
            // Collision damage metrics
            if (hazard && hazard.active && this.playerCapsule && (this.playerCapsule as any).active && Phaser.Math.Distance.Between(hazard.x, hazard.y, this.playerCapsule.x, this.playerCapsule.y) < 30) {
              synth.playDamage();
              this.livesCount -= 1;
              this.livesHUD.setText(`生命精力：${this.livesCount}`);
              this.livesHUD.setColor("#ef4444");
              this.cameras.main.flash(180, 239, 68, 68);
              onLog(`💥 碰撞在物理虚空乱流上！生命精力受损。`);

              this.cleanAndDestroyGraphics(hazard, this.activeHazards);

              if (this.livesCount <= 0) {
                this.handleLevelLoss("神魂精魄破碎溃散");
              }
            }
          },
          onComplete: () => {
            this.cleanAndDestroyGraphics(hazard, this.activeHazards);
          }
        });
      }
    }

    private cleanAndDestroyArc(arc: Phaser.GameObjects.Arc, arr: Phaser.GameObjects.Arc[]) {
      if (!arc || !arc.active) return;
      const idx = arr.indexOf(arc);
      if (idx > -1) arr.splice(idx, 1);
      arc.destroy();
    }

    private cleanAndDestroyGraphics(g: Phaser.GameObjects.Graphics, arr: Phaser.GameObjects.Graphics[]) {
      if (!g || !g.active) return;
      const idx = arr.indexOf(g);
      if (idx > -1) arr.splice(idx, 1);
      g.destroy();
    }

    /* MINIGAME 3: MEMORY SEQUENCE (ELEMENTAL BLINKS RUNES) */
    private triggerMemorySequenceLabyrinth(width: number, height: number, themeColor: number) {
      // Renders 4 neon circular elements
      const panelPositions = [
        { id: 0, x: width / 2 - 80, y: height / 2 - 80, col: 0x10b981, label: "木 WOOD" }, // Green
        { id: 1, x: width / 2 + 80, y: height / 2 - 80, col: 0x06b6d4, label: "水 WATER" }, // Cyan
        { id: 2, x: width / 2 - 80, y: height / 2 + 80, col: 0xef4444, label: "火 FIRE" }, // Red
        { id: 3, x: width / 2 + 80, y: height / 2 + 80, col: 0xa855f7, label: "金 METAL" } // Purple
      ];

      // Draw active panels
      panelPositions.forEach((pos) => {
        const pan = this.add.graphics();
        pan.fillStyle(pos.col, 0.15);
        pan.fillCircle(pos.x, pos.y, 55);
        pan.lineStyle(1.5, pos.col, 0.55);
        pan.strokeCircle(pos.x, pos.y, 55);
        
        const label = this.add.text(pos.x, pos.y, pos.label, {
          fontFamily: "Inter",
          fontSize: "18px",
          fontStyle: "bold",
          color: "#ffffff"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        // Add custom markers to access easily
        label.setData("ringId", pos.id);
        label.setData("colorHex", pos.col);
        label.setData("graphics", pan);
        label.setData("posX", pos.x);
        label.setData("posY", pos.y);

        this.runeKeyrings.push(pan);

        // Hover effect bounds
        label.on("pointerover", () => {
          if (this.userInteractiveLocks) return;
          pan.fillStyle(pos.col, 0.45);
          pan.fillCircle(pos.x, pos.y, 55);
        });

        label.on("pointerout", () => {
          pan.clear();
          pan.fillStyle(pos.col, 0.15);
          pan.fillCircle(pos.x, pos.y, 55);
          pan.lineStyle(1.5, pos.col, 0.55);
          pan.strokeCircle(pos.x, pos.y, 55);
        });

        // Handle user input
        label.on("pointerdown", () => {
          if (this.userInteractiveLocks) return;
          
          this.flashSingleRune(pos.id);
          this.checkPlayerInput(pos.id);
        });
      });

      // Sequence depth scales with node difficulty
      this.sequenceLength = 2 + this.node.difficulty;
      
      // Delay to allow start
      this.time.delayedCall(1000, () => {
        this.runNewCPUSequence();
      });
    }

    private runNewCPUSequence() {
      this.userInteractiveLocks = true;
      this.playerStep = 0;
      this.cpuSequence = [];

      for (let i = 0; i < this.sequenceLength; i++) {
        this.cpuSequence.push(Phaser.Math.Between(0, 3));
      }

      onLog(`💡 第 ${this.scoreCount + 1} 重心神共鸣闪烁序列为: [${this.cpuSequence.join(" -> ")}]`);
      this.playbackCPUSequence(0);
    }

    private playbackCPUSequence(idx: number) {
      if (idx >= this.cpuSequence.length) {
        // Unlock user's turn
        this.userInteractiveLocks = false;
        return;
      }

      const activeId = this.cpuSequence[idx];
      this.flashSingleRune(activeId);

      this.time.delayedCall(700, () => {
        this.playbackCPUSequence(idx + 1);
      });
    }

    private flashSingleRune(id: number) {
      const ringG = this.runeKeyrings[id];
      if (!ringG) return;

      synth.playLoot();

      // Pulse alpha visual indicators
      this.tweens.addCounter({
        from: 15,
        to: 90,
        yoyo: true,
        duration: 250,
        onUpdate: (tween) => {
          ringG.alpha = tween.getValue() / 15;
        }
      });
    }

    private checkPlayerInput(clickedId: number) {
      const expectedId = this.cpuSequence[this.playerStep];

      if (clickedId !== expectedId) {
        synth.playDamage();
        this.cameras.main.shake(200, 0.008);
        onLog(`⚠️ 心神感应异动，符咒引导失败！正在重新校准引导。`);
        
        this.livesCount -= 1;
        this.livesHUD.setText(`生命精力：${this.livesCount}`);
        this.livesHUD.setColor("#ef4444");

        if (this.livesCount <= 0) {
          this.handleLevelLoss("COGNITIVE DESYNC BREAKDOWN");
          return;
        }

        this.userInteractiveLocks = true;
        this.time.delayedCall(800, () => {
          this.runNewCPUSequence();
        });
        return;
      }

      this.playerStep += 1;

      if (this.playerStep >= this.cpuSequence.length) {
        const gain = Phaser.Math.Between(1, 5);
        this.scoreCount += gain;
        this.scoreHUD.setText(`心神共鸣: ${this.scoreCount} / ${this.node.goalValue}`);

        const { width, height } = this.scale;
        const fx = this.add.text(width / 2, height / 2 - 40, `+${gain} 能量`, {
          fontFamily: "JetBrains Mono, monospace",
          fontSize: "22px",
          color: spec.themeColor || "#10b981"
        }).setOrigin(0.5);
        this.tweens.add({
          targets: fx,
          y: height / 2 - 90,
          alpha: 0,
          duration: 600,
          onComplete: () => fx.destroy()
        });

        if (this.scoreCount >= this.node.goalValue) {
          this.handleLevelWin();
        } else {
          // Play next sequence after short wait
          this.userInteractiveLocks = true;
          this.time.delayedCall(1000, () => {
            this.runNewCPUSequence();
          });
        }
      }
    }

    private handleAdapterEnd(result: any) {
      if (result.success) {
        // Stop combat BGM, play fanfare
        synth.stopBossTheme();
        synth.stopBgm();
        synth.playVictoryFanfare();
        onLog(`🎉 关卡胜利！已成功通过节点 [${this.node.id}: ${this.node.title}]！`);

        const pState = { ...this.game.registry.get("playerState") } as PlayerState;
        const r = result.reward || {};
        const rwdKey = spec.economy.resources[0] || "金币";
        const secondaryResources = r.secondaryResources || { [rwdKey]: 1 };
        const unlockedAbilities = r.unlockedAbilities || this.node.planning?.rewardUnlocks || [];
        const storyFlags = r.storyFlags || [];

        const nodeResult: NodeResult = {
          success: true,
          rewards: {
            multiplierGain: r.multiplierGain ?? (this.node.resourceMultiplier / 12.0),
            secondaryResources,
            unlockedAbilities,
            unlockedPassives: r.unlockedPassives || [],
            storyFlags,
            unlockNextNode: r.unlockNextNode !== false
          }
        };

        const nextState = RewardApplier.apply(pState, this.node, nodeResult);

        const newlyUnlocked = (nodeResult.rewards?.unlockedAbilities || []).filter(id => !pState.unlockedAbilities?.includes(id));
        const unlockedAbilityLabels = newlyUnlocked.map((abilityId) => {
          const ability = spec.abilityCatalog?.find((item) => item.id === abilityId);
          return ability?.name || abilityId;
        });

        this.game.registry.set("playerState", nextState);
        this.game.registry.get("onSaveState")(nextState);

        if (unlockedAbilityLabels.length > 0) {
          onLog(`✨ 新能力已写入长期企划成长：${unlockedAbilityLabels.join(" / ")}`);
        }

        const multiplierGain = nodeResult.rewards?.multiplierGain ?? (this.node.resourceMultiplier / 12.0);
        this.cameras.main.flash(300, 16, 185, 129);
        this.showVictoryOverlay(multiplierGain, rwdKey);
      } else {
        synth.stopBossTheme();
        synth.stopBgm();
        if (result.reason === "retreated") {
          this.safeRetreat();
        } else {
          synth.playDamage();
          onLog(`❌ 关卡失败: 已从节点中震退，原因: [${result.reason || "未知"}]。`);
          this.cameras.main.shake(250, 0.015);
          this.showDefeatOverlay(result.reason || "能量耗尽，挑战失败");
        }
      }
    }

    private showLevelIntro(onComplete: () => void) {
      const { width, height } = this.scale;
      const introContainer = this.add.container(0, 0);

      const overlay = this.add.graphics();
      overlay.fillStyle(0x020617, 0.85);
      overlay.fillRect(0, 0, width, height);
      introContainer.add(overlay);

      const col = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;
      const panel = this.add.graphics();
      panel.fillStyle(0x0f172a, 0.95);
      panel.fillRoundedRect(50, height / 2 - 260, width - 100, 420, 10);
      panel.lineStyle(2, col, 0.85);
      panel.strokeRoundedRect(50, height / 2 - 260, width - 100, 420, 10);
      introContainer.add(panel);

      const title = this.add.text(width / 2, height / 2 - 210, `第 ${this.node.id} 劫：${this.node.title}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "30px",
        fontStyle: "bold",
        color: spec.themeColor
      }).setOrigin(0.5);

      const descText = this.add.text(width / 2, height / 2 - 140, this.node.intro, {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#94a3b8",
        wordWrap: { width: width - 160, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      let mechDesc = "";
      const cardOpt = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === this.node.gameplay?.cardId);
      if (cardOpt) {
        const cardTitle = cardOpt.title;
        const cardSummary = cardOpt.effectSummary || cardOpt.victory || "完成本关目标考验。";
        mechDesc = `⚔️ ${cardTitle}：${cardSummary}`;
      } else {
        mechDesc = "🔮 玩法考验：完成本关卡配置的目标要求。";
      }

      const mech = this.add.text(width / 2, height / 2 - 30, mechDesc, {
        fontFamily: "Inter, sans-serif",
        fontSize: "18px",
        color: "#10b981",
        wordWrap: { width: width - 160, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      const prompt = this.add.text(width / 2, height / 2 + 100, "—— 点击屏幕 开启考验 ——", {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        fontStyle: "bold",
        color: "#64748b"
      }).setOrigin(0.5);

      this.tweens.add({
        targets: prompt,
        alpha: { from: 1, to: 0.3 },
        duration: 800,
        yoyo: true,
        repeat: -1
      });

      introContainer.add([title, descText, mech, prompt]);

      const skipZone = this.add.zone(width / 2, height / 2, width, height).setInteractive();
      skipZone.on("pointerdown", () => {
        synth.playClick();
        this.tweens.add({
          targets: introContainer,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            introContainer.destroy();
            skipZone.destroy();
            onComplete();
          }
        });
      });

      this.time.delayedCall(2500, () => {
        if (introContainer.active) {
          this.tweens.add({
            targets: introContainer,
            alpha: 0,
            duration: 300,
            onComplete: () => {
              introContainer.destroy();
              skipZone.destroy();
              onComplete();
            }
          });
        }
      });
    }

    private spawnParticleExplosion(x: number, y: number, color: number) {
      const count = 12;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Phaser.Math.Between(60, 160);
        const px = x + Math.cos(angle) * 8;
        const py = y + Math.sin(angle) * 8;
        const dot = this.add.arc(px, py, Phaser.Math.Between(2, 4), 0, 360, false, color, 0.95);
        
        this.tweens.add({
          targets: dot,
          x: px + Math.cos(angle) * speed * 0.4,
          y: py + Math.sin(angle) * speed * 0.4,
          alpha: 0,
          scale: 0.1,
          duration: Phaser.Math.Between(400, 700),
          onComplete: () => dot.destroy()
        });
      }
    }

    private handleSurvivorPresentationEvent(event: any) {
      if (!event || event.accepted !== true) return;

      if (event.action === "treasure_opened") synth.playLoot();
      else if (event.action === "channel_interrupted" || event.action === "guards_alerted") synth.playDamage();
      else if (event.action === "channel_started") synth.playClick();

      const fallback = { x: this.scale.width / 2, y: this.scale.height / 2 };
      const x = Number.isFinite(event.position?.x) ? event.position.x : fallback.x;
      const y = Number.isFinite(event.position?.y) ? event.position.y : fallback.y;
      if (event.vfx?.kind === "reward_burst") {
        this.spawnParticleExplosion(x, y, event.vfx.color || spec.themeColor);
        this.cameras.main.flash(120, 245, 158, 11);
      }

      if (typeof event.callout !== "string" || !event.callout.trim()) return;
      const callout = this.add.text(x, y - 54, event.callout, {
        fontFamily: "Inter, sans-serif",
        fontSize: "17px",
        fontStyle: "bold",
        color: "#fff7d6",
        backgroundColor: "rgba(15, 23, 42, 0.78)",
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5).setDepth(30);
      this.tweens.add({
        targets: callout,
        y: y - 82,
        alpha: 0,
        duration: 900,
        onComplete: () => callout.destroy()
      });
    }

    private showVictoryOverlay(multiplierGain: number, resourceKey: string) {
      const { width, height } = this.scale;
      const container = this.add.container(0, 0);

      const overlay = this.add.graphics();
      overlay.fillStyle(0x020617, 0.7);
      overlay.fillRect(0, 0, width, height);
      container.add(overlay);

      const panel = this.add.graphics();
      panel.fillStyle(0x0f172a, 0.95);
      panel.fillRoundedRect(60, height / 2 - 240, width - 120, 480, 12);
      panel.lineStyle(2.5, 0xd97706, 1);
      panel.strokeRoundedRect(60, height / 2 - 240, width - 120, 480, 12);
      container.add(panel);

      // Gold dust particles continuously
      this.time.addEvent({
        delay: 150,
        callback: () => {
          this.spawnParticleExplosion(
            Phaser.Math.Between(80, width - 80),
            Phaser.Math.Between(height / 2 - 200, height / 2 + 100),
            0xd97706
          );
        },
        repeat: 12
      });

      const title = this.add.text(width / 2, height / 2 - 190, "🍀 挑战成功 / STAGE CLEAR", {
        fontFamily: "Inter, sans-serif",
        fontSize: "33px",
        fontStyle: "bold",
        color: "#f59e0b"
      }).setOrigin(0.5);

      const sub = this.add.text(width / 2, height / 2 - 130, `顺利通关第 ${this.node.id} 关：${this.node.title}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#94a3b8"
      }).setOrigin(0.5);

      const rwdTitle = this.add.text(width / 2, height / 2 - 70, "获得通关结算奖励", {
        fontFamily: "Inter, sans-serif",
        fontSize: "21px",
        fontStyle: "bold",
        color: "#ffffff"
      }).setOrigin(0.5);

      const rwd1 = this.add.text(width / 2, height / 2 - 20, `✨ 基础收益效率: +${(multiplierGain * 1.5).toFixed(2)}/秒`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#10b981"
      }).setOrigin(0.5);

      const rwd2 = this.add.text(width / 2, height / 2 + 20, `💎 额外结算积分: ${this.node.rewards}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#f59e0b"
      }).setOrigin(0.5);

      const rwd3 = this.add.text(width / 2, height / 2 + 60, `💼 获得资源: ${resourceKey} +1`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#38bdf8"
      }).setOrigin(0.5);

      const btn = this.add.text(width / 2, height / 2 + 150, "确认并继续", {
        fontFamily: "Inter, sans-serif",
        fontSize: "21px",
        fontStyle: "bold",
        color: "#0f172a",
        backgroundColor: "#f59e0b",
        padding: { x: 20, y: 10 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on("pointerover", () => btn.setScale(1.05));
      btn.on("pointerout", () => btn.setScale(1));
      btn.on("pointerdown", () => {
        synth.playClick();
        container.destroy();
        this.safeRetreat();
      });

      container.add([title, sub, rwdTitle, rwd1, rwd2, rwd3, btn]);
    }

    private showDefeatOverlay(reason: string) {
      const { width, height } = this.scale;
      const container = this.add.container(0, 0);

      const overlay = this.add.graphics();
      overlay.fillStyle(0x020617, 0.7);
      overlay.fillRect(0, 0, width, height);
      container.add(overlay);

      const panel = this.add.graphics();
      panel.fillStyle(0x0f172a, 0.95);
      panel.fillRoundedRect(60, height / 2 - 180, width - 120, 360, 12);
      panel.lineStyle(2.5, 0xef4444, 1);
      panel.strokeRoundedRect(60, height / 2 - 180, width - 120, 360, 12);
      container.add(panel);

      const title = this.add.text(width / 2, height / 2 - 130, "💀 身死道消 / DEFEATED", {
        fontFamily: "Inter, sans-serif",
        fontSize: "33px",
        fontStyle: "bold",
        color: "#ef4444"
      }).setOrigin(0.5);

      let reasonZh = reason;
      if (reason === "hp_zero") reasonZh = "生命值耗尽归零";
      else if (reason === "timer_expired") reasonZh = "倒计时结束超时";

      const sub = this.add.text(width / 2, height / 2 - 70, `败因: [ ${reasonZh} ]`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        color: "#94a3b8",
        wordWrap: { width: width - 180, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      const desc = this.add.text(width / 2, height / 2 - 10, "关卡考验极具挑战。请重整旗鼓再试，\n或先行退回主界面提升基础等级。", {
        fontFamily: "Inter, sans-serif",
        fontSize: "18px",
        color: "#64748b",
        align: "center"
      }).setOrigin(0.5);

      // Try Again Button
      const btnRetry = this.add.text(width / 2 - 75, height / 2 + 80, "重整旗鼓", {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#10b981",
        padding: { x: 16, y: 10 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btnRetry.on("pointerover", () => btnRetry.setScale(1.05));
      btnRetry.on("pointerout", () => btnRetry.setScale(1));
      btnRetry.on("pointerdown", () => {
        synth.playClick();
        container.destroy();
        this.shutdown();
        this.scene.restart({ node: this.node });
      });

      // Retreat Button
      const btnBack = this.add.text(width / 2 + 75, height / 2 + 80, "退回主干", {
        fontFamily: "Inter, sans-serif",
        fontSize: "20px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#334155",
        padding: { x: 16, y: 10 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btnBack.on("pointerover", () => btnBack.setScale(1.05));
      btnBack.on("pointerout", () => btnBack.setScale(1));
      btnBack.on("pointerdown", () => {
        synth.playClick();
        container.destroy();
        this.safeRetreat();
      });

      container.add([title, sub, desc, btnRetry, btnBack]);
    }

    private handleLevelWin() {
      synth.playVictoryFanfare();
      onLog(`🎉 关卡胜利！已成功通过节点 [${this.node.id}: ${this.node.title}]！获得通关奖励: [${this.node.rewards}]。`);

      const pState = { ...this.game.registry.get("playerState") } as PlayerState;
      const rwdKey = spec.economy.resources[0] || "金币";
      
      const nodeResult: NodeResult = {
        success: true,
        rewards: {
          multiplierGain: this.node.resourceMultiplier / 12.0,
          secondaryResources: { [rwdKey]: 1 },
          unlockedAbilities: this.node.planning?.rewardUnlocks || []
        }
      };

      const nextState = RewardApplier.apply(pState, this.node, nodeResult);

      const newlyUnlocked = (nodeResult.rewards?.unlockedAbilities || []).filter(id => !pState.unlockedAbilities?.includes(id));
      const unlockedAbilityLabels = newlyUnlocked.map((abilityId) => {
        const ability = spec.abilityCatalog?.find((item) => item.id === abilityId);
        return ability?.name || abilityId;
      });

      this.game.registry.set("playerState", nextState);
      this.game.registry.get("onSaveState")(nextState);

      if (unlockedAbilityLabels.length > 0) {
        onLog(`✨ 新能力已写入长期企划成长：${unlockedAbilityLabels.join(" / ")}`);
      }

      // Flash feedback
      this.cameras.main.flash(300, 16, 185, 129);
      
      this.add.text(this.scale.width / 2, this.scale.height / 2, "🍀 挑战成功", {
        fontFamily: "Inter, sans-serif",
        fontSize: "38px",
        fontStyle: "bold",
        color: spec.themeColor
      }).setOrigin(0.5);

      this.time.delayedCall(1400, () => {
        this.safeRetreat();
      });
    }

    private applyPlanningRewards(pState: PlayerState) {
      const rewardUnlocks = this.node.planning?.rewardUnlocks || [];
      if (!Array.isArray(pState.unlockedAbilities)) {
        pState.unlockedAbilities = [];
      }

      const newlyUnlocked = rewardUnlocks.filter((abilityId) => !pState.unlockedAbilities.includes(abilityId));
      if (newlyUnlocked.length === 0) return [];

      pState.unlockedAbilities = [...pState.unlockedAbilities, ...newlyUnlocked];
      return newlyUnlocked.map((abilityId) => {
        const ability = spec.abilityCatalog?.find((item) => item.id === abilityId);
        return ability?.name || abilityId;
      });
    }

    private handleLevelLoss(reason: string) {
      synth.playDamage();
      onLog(`❌ 关卡失败: 已从节点中震退，原因: [${reason}]。请重新尝试。`);
      
      this.cameras.main.shake(250, 0.015);
      
      this.add.text(this.scale.width / 2, this.scale.height / 2, "💀 挑战失败", {
        fontFamily: "Inter, sans-serif",
        fontSize: "38px",
        fontStyle: "bold",
        color: "#ef4444"
      }).setOrigin(0.5);

      this.time.delayedCall(1600, () => {
        this.safeRetreat();
      });
    }

    private launchIframeContainer(width: number, height: number) {
      const parentEl = this.game.canvas.parentElement;
      if (!parentEl) {
        onLog(`❌ 无法找到容器 DOM 挂载 iframe。`);
        this.handleLevelLoss("IFRAME MOUNT FAILURE");
        return;
      }

      onLog(`📂 正在加载独立 H5 玩法容器 [节点 ${this.node.id}: ${this.node.title}]...`);

      const knobs = this.node.gameplay?.knobs || {};
      const payload = createNodePayload({
        nodeId: String(this.node.id),
        nodeIndex: this.node.id,
        nodeConfig: {
          ...this.node,
          gameplay: this.node.gameplay
        },
        playerStats: this.game.registry.get("playerState") || {},
        source: { engine: "iframe" }
      });

      const container = new IframeNodeContainer({
        testHooks: this.testHooks,
        config: {
          payloadEncoding: knobs.payloadEncoding || "base64_json",
          messageTypes: knobs.messageTypes || ["NODE_RESULT", "NODE_CLOSE", "NODE_EXIT"],
          fullscreen: knobs.fullscreen !== false
        },
        onEnd: (result: any) => {
          this.activeIframe = null;
          this.iframeContainer = null;
          if (result?.success) {
            onLog(`📥 H5 玩法容器回传 NodeResult: ${JSON.stringify(result.rewards || {})}`);
            this.handleIframeResult(true, {
              ...(result.rewards || {}),
              success: true,
              reason: result.reason,
              storyFlags: result.unlocks?.flags
            });
          } else {
            onLog(`🚪 H5 玩法容器结束: ${result?.reason || "failed"}`);
            this.handleIframeResult(false, { reason: result?.reason || "retreated" });
          }
        }
      });

      container.init(payload);
      const iframe = container.mount(parentEl, {
        src: `./nodes/node${this.node.id}.html`,
        nodeId: this.node.id
      });
      this.activeIframe = iframe;
      this.iframeContainer = container;
    }

    private handleIframeResult(success: boolean, reward: any) {
      if (this.iframeContainer) {
        this.iframeContainer.destroy?.();
        this.iframeContainer = null;
        this.activeIframe = null;
      } else if (this.activeIframe) {
        if (this.activeIframe.parentElement) {
          this.activeIframe.parentElement.removeChild(this.activeIframe);
        }
        this.activeIframe = null;
      }
      if (this.iframeListener) {
        window.removeEventListener("message", this.iframeListener);
        this.iframeListener = null;
      }

      if (success) {
        synth.stopBossTheme();
        synth.stopBgm();
        synth.playVictoryFanfare();
        onLog(`🎉 关卡胜利！独立 H5 玩法容器 [节点 ${this.node.id}: ${this.node.title}] 通关成功！`);

        const pState = { ...this.game.registry.get("playerState") } as PlayerState;
        const rwdKey = spec.economy.resources[0] || "金币";

        const mappedSecondary: { [key: string]: number } = {};
        if (typeof reward.qi === "number") {
          mappedSecondary[rwdKey] = reward.qi;
        } else if (reward.secondaryResources) {
          Object.assign(mappedSecondary, reward.secondaryResources);
        } else {
          mappedSecondary[rwdKey] = 1;
        }

        const mappedAbilities: string[] = [];
        if (reward.skill) {
          mappedAbilities.push(reward.skill);
        }
        if (reward.unlockedAbilities) {
          mappedAbilities.push(...reward.unlockedAbilities);
        }
        if (mappedAbilities.length === 0 && this.node.planning?.rewardUnlocks) {
          mappedAbilities.push(...this.node.planning.rewardUnlocks);
        }

        const mappedFlags: string[] = [];
        if (reward.storyFlags) {
          mappedFlags.push(...reward.storyFlags);
        } else if (reward.relic) {
          mappedFlags.push(reward.relic);
        }

        const nodeResult: NodeResult = {
          success: true,
          rewards: {
            multiplierGain: reward.multiplierGain ?? (reward.xp ? reward.xp / 300.0 : this.node.resourceMultiplier / 12.0),
            secondaryResources: mappedSecondary,
            unlockedAbilities: mappedAbilities,
            storyFlags: mappedFlags,
            unlockNextNode: reward.unlockNextNode !== false
          }
        };

        const nextState = RewardApplier.apply(pState, this.node, nodeResult);

        const newlyUnlocked = (nodeResult.rewards?.unlockedAbilities || []).filter(id => !pState.unlockedAbilities?.includes(id));
        const unlockedAbilityLabels = newlyUnlocked.map((abilityId) => {
          const ability = spec.abilityCatalog?.find((item) => item.id === abilityId);
          return ability?.name || abilityId;
        });

        this.game.registry.set("playerState", nextState);
        this.game.registry.get("onSaveState")(nextState);

        if (unlockedAbilityLabels.length > 0) {
          onLog(`✨ 新能力已写入长期企划成长：${unlockedAbilityLabels.join(" / ")}`);
        }

        const multiplierGain = nodeResult.rewards?.multiplierGain ?? (this.node.resourceMultiplier / 12.0);
        this.cameras.main.flash(300, 16, 185, 129);
        this.showVictoryOverlay(multiplierGain, rwdKey);
      } else {
        synth.stopBossTheme();
        synth.stopBgm();
        if (reward.reason === "retreated") {
          this.safeRetreat();
        } else {
          synth.playDamage();
          onLog(`❌ 关卡失败: 已从节点中震退，原因: [${reward.reason || "挑战失败"}]。`);
          this.cameras.main.shake(250, 0.015);
          this.showDefeatOverlay(reward.reason || "能量耗尽，挑战失败");
        }
      }
    }

    private safeRetreat() {
      if ((this as any)._didRetreat) return;
      (this as any)._didRetreat = true;
      // Cleans everything before shutdown (Ensures 0% leakage risk)
      this.shutdown();
      this.scene.start("MainScene");
    }

    shutdown() {
      // Kill all active tweens to prevent callbacks on destroyed objects
      try {
        this.tweens?.killAll();
      } catch {}

      // Clear input listeners
      try {
        this.input?.removeAllListeners();
      } catch {}

      // Clear timers to prevent ticks executing after destruction
      if (this.gameTimer) this.gameTimer.destroy();
      if (this.spawnTimer) this.spawnTimer.destroy();
      if (this.spawnItemTimer) this.spawnItemTimer.destroy();

      // Clear dynamic array references & destroy objects
      this.activeOrbs?.forEach((orb) => orb?.destroy?.());
      this.activeCollects?.forEach((c) => c?.destroy?.());
      this.activeHazards?.forEach((h) => h?.destroy?.());
      this.runeKeyrings?.forEach((r) => r?.destroy?.());
      this.activeOrbs = [];
      this.activeCollects = [];
      this.activeHazards = [];
      this.runeKeyrings = [];

      if (this.playerCapsule) {
        try {
          this.playerCapsule.destroy();
        } catch {}
        this.playerCapsule = null as any;
      }

      // Clean up active iframe if any
      if (this.iframeContainer) {
        this.iframeContainer.destroy?.();
        this.iframeContainer = null;
        this.activeIframe = null;
      } else if (this.activeIframe) {
        if (this.activeIframe.parentElement) {
          this.activeIframe.parentElement.removeChild(this.activeIframe);
        }
        this.activeIframe = null;
      }
      if (this.iframeListener) {
        window.removeEventListener("message", this.iframeListener);
        this.iframeListener = null;
      }

      // Stop Synthesizer Drones BGM and Audio Resolver
      if (this.audioResolver) {
        this.audioResolver.stopAll();
      }
      synth.stopBgm();
      synth.stopBossTheme();

      // Clean up adapter
      if (this.adapter) {
        try {
          this.adapter.destroy();
        } catch {}
        this.adapter = null;
      }
      if (this.testHooks) {
        this.testHooks = null;
      }
      delete (window as any).__LW_SURVIVOR_DEMO__;
    }
  }

  // Phaser instance instantiation bootstrap
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL,
    parent: parentEl,
    width: 720,
    height: 1280,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: "arcade",
      arcade: { debug: false }
    },
    render: {
      preserveDrawingBuffer: true
    },
    scene: [BootScene, MainScene, LevelActiveScene],
    transparent: true
  };

  const game = new Phaser.Game(config);
  
  // Set communication hooks to Phaser global variables
  game.registry.set("playerState", playerState);
  game.registry.set("onSaveState", onSaveState);
  game.registry.set("gameSpec", spec);

  (window as any).__LOREWEAVER_GAME__ = game;

  return game;
}
