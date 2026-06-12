import Phaser from "phaser";
import { GameSpec, PlayerState, NodeSpec, GameplayModifierSpec } from "../types";
import { synth } from "../utils/AudioSynth";
import {
  SurvivorHordeAdapter,
  createSurvivorHordeModifier,
  TapReactionAdapter,
  CollectDodgeAdapter
} from "../../../minigame_master/core/lib/gameplay/index.js";
import {
  createNodePayload,
  TestHooks
} from "../../../minigame_master/core/lib/contracts/index.js";

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


export function initializePhaserGame(
  parentEl: HTMLElement,
  spec: GameSpec,
  playerState: PlayerState,
  onSaveState: (state: PlayerState) => void,
  onLog: (text: string) => void
): Phaser.Game {
  
  // Custom scenes configuration
  class BootScene extends Phaser.Scene {
    constructor() {
      super({ key: "BootScene" });
    }

    create() {
      const { width, height } = this.scale;
      
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
      const titleText = this.add.text(width / 2, height / 2 - 220, "LORE WEAVER", {
        fontFamily: "Inter, sans-serif",
        fontSize: "28px",
        fontWeight: "bold",
        color: spec.themeColor,
        letterSpacing: "4"
      } as any).setOrigin(0.5);

      const subtitleText = this.add.text(width / 2, height / 2 + 190, "正在初始化修真世界沙盒 INITALIZING...", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "13px",
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
    private scoreText!: Phaser.GameObjects.Text;
    private multiplierText!: Phaser.GameObjects.Text;
    private idleTimer!: Phaser.Time.TimerEvent;
    private progressBars: Phaser.GameObjects.Graphics[] = [];
    private scrollContainer!: Phaser.GameObjects.Container;
    private bgGraphics!: Phaser.GameObjects.Graphics;

    constructor() {
      super({ key: "MainScene" });
    }

    init() {
      this.state = { ...this.game.registry.get("playerState") };
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

      // Top Header HUD bounds
      this.drawTopHUD(width, themeHex);

      // Create scrollable container for 12 nodes
      this.scrollContainer = this.add.container(0, 0);
      this.createNodeScrollList(width, themeHex);

      // Floating click Cultivator (Mandala)
      this.createCultivateMandala(width, height, themeHex);

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

    private drawTopHUD(width: number, themeColor: number) {
      // Background outline panel
      const topHud = this.add.graphics();
      topHud.fillStyle(0x090d16, 0.9);
      topHud.fillRoundedRect(16, 16, width - 32, 110, 8);
      topHud.lineStyle(1.5, themeColor, 0.6);
      topHud.strokeRoundedRect(16, 16, width - 32, 110, 8);

      // Realm display
      const realmTextStr = spec.economy.realms[this.state.currentRealmIndex] || "炼气期 Initial";
      this.add.text(32, 28, realmTextStr.toUpperCase(), {
        fontFamily: "Inter, sans-serif",
        fontSize: "15px",
        style: "bold",
        color: spec.themeColor,
        letterSpacing: "2"
      } as any);

      // Passive income rate tag
      const passiveRate = (this.state.activeMultiplier * 1.5).toFixed(1);
      this.multiplierText = this.add.text(32, 48, `挂机修炼效率: +${passiveRate}/秒`, {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "11px",
        color: "#64748b"
      });

      // Primary Currency Score displaying
      this.add.text(32, 70, `${spec.economy.currencyName.split("/")[0]}:`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#94a3b8"
      });

      this.scoreText = this.add.text(125, 65, Math.floor(this.state.mainCurrencyCount).toString(), {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "25px",
        fontStyle: "bold",
        color: "#ffffff"
      });

      // Sound Mute Switch
      const soundText = this.add.text(width - 92, 32, synth.getMuteState() ? "🔇 静音" : "🔊 音效", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "11px",
        color: synth.getMuteState() ? "#ef4444" : spec.themeColor
      }).setInteractive({ useHandCursor: true });

      soundText.on("pointerdown", () => {
        const nextMute = synth.toggleMute();
        soundText.setText(nextMute ? "🔇 静音" : "🔊 音效");
        soundText.setColor(nextMute ? "#ef4444" : spec.themeColor);
        synth.playClick();
        onLog(`🔊 切换音效输出: ${nextMute ? "静音(MUTE)" : "开启(ACTIVE)"}`);
      });

      // Breakthrough controller
      const nextBound = Math.pow(4, this.state.currentRealmIndex + 1) * 35;
      const canBrk = this.state.mainCurrencyCount >= nextBound && this.state.currentRealmIndex < spec.economy.realms.length - 1;
      
      const brkBtn = this.add.text(width - 145, 68, canBrk ? "⚡ 突破境界" : `🔒 需修为: ${nextBound}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        backgroundColor: canBrk ? spec.themeColor : "#1e293b",
        color: canBrk ? "#020617" : "#64748b",
        padding: { x: 10, y: 7 }
      }).setInteractive({ useHandCursor: true });

      brkBtn.on("pointerdown", () => {
        if (!canBrk) {
          synth.playDamage();
          this.cameras.main.shake(150, 0.005);
          onLog(`⚠️ ${spec.economy.currencyName}蕴能储量不足，无法突破天劫桎梏。`);
          return;
        }

        synth.playBreakthrough();
        this.cameras.main.flash(400, 255, 255, 255);
        this.cameras.main.shake(250, 0.01);
        
        this.state.mainCurrencyCount -= nextBound;
        this.state.currentRealmIndex += 1;
        this.state.activeMultiplier += 1.8;
        this.state.clickPower += 1.5;

        // Trigger safe storage commit
        this.saveStateToStore();
        this.scene.restart();

        onLog(`🔥 天梯跃迁: 成功逆天飞升破镜至全新天梯境界: [${spec.economy.realms[this.state.currentRealmIndex]}]！`);
      });
    }

    private createCultivateMandala(width: number, height: number, themeColor: number) {
      // Cultivate physical interactive mandala circle
      const cx = width / 2;
      const cy = height - 120;
      
      const aura = this.add.graphics();
      aura.fillStyle(themeColor, 0.06);
      aura.fillCircle(cx, cy, 75);
      aura.lineStyle(2, themeColor, 0.65);
      aura.strokeCircle(cx, cy, 65);

      const centerCore = this.add.graphics();
      centerCore.fillStyle(themeColor, 0.85);
      centerCore.fillCircle(cx, cy, 32);

      const circleLabel = this.add.text(cx, cy, "修炼\nCULTIVATE", {
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ffffff",
        align: "center"
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      // Hover and push scaling triggers
      circleLabel.on("pointerover", () => {
        this.tweens.add({
          targets: [circleLabel, centerCore],
          scale: 1.12,
          duration: 150
        });
      });

      circleLabel.on("pointerout", () => {
        this.tweens.add({
          targets: [circleLabel, centerCore],
          scale: 1.0,
          duration: 150
        });
      });

      circleLabel.on("pointerdown", () => {
        // Increment primary currency based on click power
        const gain = parseFloat((this.state.clickPower * 1.0).toFixed(1));
        this.state.mainCurrencyCount += gain;
        this.scoreText.setText(Math.floor(this.state.mainCurrencyCount).toString());

        // Play feedback sounds
        synth.playClick();

        // Screen micro shock
        this.tweens.add({
          targets: [centerCore, aura],
          scale: 0.92,
          yoyo: true,
          duration: 60
        });

        // Floating floating texts
        const px = cx + Phaser.Math.Between(-30, 30);
        const py = cy - 40;
        const flTxt = this.add.text(px, py, `+${gain}`, {
          fontFamily: "JetBrains Mono, monospace",
          fontSize: "18px",
          fontStyle: "bold",
          color: "#ffffff"
        }).setOrigin(0.5);

        this.tweens.add({
          targets: flTxt,
          y: py - 60,
          alpha: 0,
          scale: 1.35,
          duration: 800,
          onComplete: () => {
            flTxt.destroy();
          }
        });

        this.saveStateToStore();
      });
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
          fontSize: "14px",
          fontStyle: "bold",
          color: titleColor
        });
        this.scrollContainer.add(titleText);

        // Sub description intro text
        const introTextStr = isUnlocked ? node.intro : "未觉醒。请先参透前面境界及关卡桎梏。";
        const descText = this.add.text(42, dy + 42, introTextStr, {
          fontFamily: "Inter, sans-serif",
          fontSize: "11px",
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
            fontSize: "10px",
            color: spec.themeColor,
            backgroundColor: "rgba(0,0,0,0.45)",
            padding: { x: 5, y: 3 }
          });
          
          const rwd = this.add.text(230, dy + 82, `造化: ${node.rewards}`, {
            fontFamily: "Inter, sans-serif",
            fontSize: "10px",
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
      this.scoreText.setText(Math.floor(this.state.mainCurrencyCount).toString());
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
      this.node = data.node;
      this.timeLeft = data.node.durationLimit || 30;
      this.scoreCount = 0;
      this.livesCount = 3;
      this.adapter = null;
      this.testHooks = null;

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
        const baseKnobs: any = {
          duration: this.node.durationLimit || 30,
          goalValue: this.node.goalValue,
          difficulty: this.node.difficulty,
          resourceMultiplier: this.node.resourceMultiplier
        };

        const mergedKnobs = this.node.gameplay.knobs
          ? { ...baseKnobs, ...this.node.gameplay.knobs }
          : baseKnobs;

        const payload = createNodePayload({
          id: this.node.id,
          nodeId: `node_${this.node.id}`,
          nodeConfig: {
            duration: this.node.durationLimit,
            rewards: {
              score: this.node.goalValue
            },
            planning,
            abilityCatalog,
            gameplay: {
              cardId: cardId,
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
        }

        if (this.adapter) {
          this.adapter.init(payload);
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

      // Retreat Back Button (Returns safely to MainScene - strictly enforces Scene Hygiene)
      const rBtn = this.add.text(32, 32, "◀ 撤退 / RETREAT", {
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "rgba(239, 68, 68, 0.65)",
        padding: { x: 8, y: 5 }
      }).setInteractive({ useHandCursor: true });

      rBtn.on("pointerdown", () => {
        synth.playClick();
        onLog(`◀ 已主动撤出境界考验 [节点 ${this.node.id}]。正在返回修真卷轴主态。`);
        if (this.adapter) {
          this.adapter.retreat();
        } else {
          this.safeRetreat();
        }
      });

      // Play ambient drone BGM
      synth.startBgm();

      // Show level introductory overlay, and launch game only when skipped/completed
      this.showLevelIntro(() => {
        if (this.adapter) {
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
      });
    }

    update(time: number, delta: number) {
      if (this.adapter) {
        this.adapter.update(time, delta);
        const testState = this.adapter.getTestState();
        if (testState) {
          this.scoreHUD.setText(`目标进度：${testState.score} / ${this.node.goalValue}`);
          this.livesHUD.setText(`生命精力：${Math.ceil(testState.hp)}`);
          
          if (this.adapter.status === "running" && testState.score >= this.node.goalValue) {
            this.adapter.finish(true, "objective_met");
          }
        }
      }
    }

    private drawLevelHeader(width: number, height: number, themeHex: number) {
      // Display Boss dialogue / Taunt quotes
      const idx = Phaser.Math.Between(0, this.node.taunts.length - 1);
      const chosenTaunt = this.node.taunts[idx] || "「境界凡愚，命数如此！」";
      
      const phraseText = this.add.text(width / 2, 100, chosenTaunt, {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        fontStyle: "italic",
        color: "#f59e0b",
        wordWrap: { width: width - 80, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      this.add.text(width / 2, 140, `${this.node.title.toUpperCase()}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "16px",
        style: "bold",
        color: spec.themeColor,
        letterSpacing: "1"
      } as any).setOrigin(0.5);

      // Lives and Target score indicators
      this.scoreHUD = this.add.text(32, height - 42, `目标进度：0 / ${this.node.goalValue}`, {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "13px",
        color: "#ffffff"
      });

      this.livesHUD = this.add.text(width - 150, height - 42, `生命精力：${this.livesCount}`, {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "13px",
        color: "#10b981"
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
        this.scoreCount += 1;
        this.scoreHUD.setText(`已吸收: ${this.scoreCount} / ${this.node.goalValue}`);
        
        // Spawn micro numbers floating animation
        const fx = this.add.text(rx, ry, "+1 灵能", { fontFamily: "JetBrains Mono", fontSize: "12px", color: spec.themeColor });
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
            if (gem && gem.active && Phaser.Math.Distance.Between(gem.x, gem.y, this.playerCapsule.x, this.playerCapsule.y) < 32) {
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
            if (hazard && hazard.active && Phaser.Math.Distance.Between(hazard.x, hazard.y, this.playerCapsule.x, this.playerCapsule.y) < 30) {
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
          fontSize: "12px",
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
        this.scoreCount += 1;
        this.scoreHUD.setText(`心神共鸣: ${this.scoreCount} / ${this.node.goalValue}`);

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
        onLog(`💎 功德圆满！已成功通过考验 [节点 ${this.node.id}: ${this.node.title}]！`);

        const pState = { ...this.game.registry.get("playerState") } as PlayerState;
        
        if (!pState.completedNodeIds.includes(this.node.id)) {
          pState.completedNodeIds.push(this.node.id);
        }

        const nextId = this.node.id + 1;
        if (nextId <= 12 && !pState.unlockedNodeIds.includes(nextId)) {
          pState.unlockedNodeIds.push(nextId);
        }

        const unlockedAbilityLabels = this.applyPlanningRewards(pState);

        const multiplierGain = this.node.resourceMultiplier / 12.0;
        pState.activeMultiplier += multiplierGain;
        
        const rwdKey = spec.economy.resources[0] || "灵石";
        pState.secondaryResources[rwdKey] = (pState.secondaryResources[rwdKey] || 0) + 1;

        this.game.registry.set("playerState", pState);
        this.game.registry.get("onSaveState")(pState);

        if (unlockedAbilityLabels.length > 0) {
          onLog(`✨ 新能力已写入长期企划成长：${unlockedAbilityLabels.join(" / ")}`);
        }

        this.cameras.main.flash(300, 16, 185, 129);
        this.showVictoryOverlay(multiplierGain, rwdKey);
      } else {
        synth.stopBossTheme();
        synth.stopBgm();
        if (result.reason === "retreated") {
          this.safeRetreat();
        } else {
          synth.playDamage();
          onLog(`❌ 考验失败: 已从心魔灵阵中被震退，原因: [${result.reason || "未知"}]。`);
          this.cameras.main.shake(250, 0.015);
          this.showDefeatOverlay(result.reason || "天劫强力，元神溃散");
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
        fontSize: "20px",
        fontStyle: "bold",
        color: spec.themeColor
      }).setOrigin(0.5);

      const descText = this.add.text(width / 2, height / 2 - 140, this.node.intro, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#94a3b8",
        wordWrap: { width: width - 160, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      let mechDesc = "";
      if (this.node.gameplay?.cardId === "survivor_horde") {
        mechDesc = "⚔️ 割草生存：躲避敌人，利用法宝自动击杀怪物，并在最后击败降临的邪道首领。";
      } else if (this.node.gameplay?.cardId === "rhythm_timing") {
        mechDesc = "🔮 快速聚灵：点击屏幕上不断收缩的灵能法阵。漏掉会导致生命值受损，后期需击破劫雷法阵。";
      } else if (this.node.gameplay?.cardId === "drag_collect_grid") {
        mechDesc = "🍃 虚空飞渡：左右滑动躲避漫天红雷，收集绿灵珠。最后收集飞剑攻击劈落的天雷巨兽。";
      } else {
        mechDesc = "🔮 天道感应：体验由工作台配置的经典玩法考验。";
      }

      const mech = this.add.text(width / 2, height / 2 - 30, mechDesc, {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        color: "#10b981",
        wordWrap: { width: width - 160, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      const prompt = this.add.text(width / 2, height / 2 + 100, "—— 点击屏幕 开启考验 ——", {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
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

      const title = this.add.text(width / 2, height / 2 - 190, "🍀 功德圆满 / SUCCESS", {
        fontFamily: "Inter, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        color: "#f59e0b"
      }).setOrigin(0.5);

      const sub = this.add.text(width / 2, height / 2 - 130, `顺利参透第 ${this.node.id} 关：${this.node.title}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#94a3b8"
      }).setOrigin(0.5);

      const rwdTitle = this.add.text(width / 2, height / 2 - 70, "获得天道造化奖励", {
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#ffffff"
      }).setOrigin(0.5);

      const rwd1 = this.add.text(width / 2, height / 2 - 20, `✨ 修为挂机效率: +${(multiplierGain * 1.5).toFixed(2)}/秒`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#10b981"
      }).setOrigin(0.5);

      const rwd2 = this.add.text(width / 2, height / 2 + 20, `💎 额外获取造化: ${this.node.rewards}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#f59e0b"
      }).setOrigin(0.5);

      const rwd3 = this.add.text(width / 2, height / 2 + 60, `💼 奇珍机缘: ${resourceKey} +1`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#38bdf8"
      }).setOrigin(0.5);

      const btn = this.add.text(width / 2, height / 2 + 150, "领取天道机缘并返回", {
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
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
        fontSize: "22px",
        fontStyle: "bold",
        color: "#ef4444"
      }).setOrigin(0.5);

      let reasonZh = reason;
      if (reason === "hp_zero") reasonZh = "生命元神耗尽归零";
      else if (reason === "timer_expired") reasonZh = "劫数倒计时大限已到";

      const sub = this.add.text(width / 2, height / 2 - 70, `败因: [ ${reasonZh} ]`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#94a3b8",
        wordWrap: { width: width - 180, useAdvancedWrap: true },
        align: "center"
      }).setOrigin(0.5);

      const desc = this.add.text(width / 2, height / 2 - 10, "天雷凶险，仙途坎坷。请重整旗鼓再试，\n或先行退回主界面积攒修为。", {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        color: "#64748b",
        align: "center"
      }).setOrigin(0.5);

      // Try Again Button
      const btnRetry = this.add.text(width / 2 - 75, height / 2 + 80, "重整旗鼓", {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
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
        fontSize: "13px",
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

    /* GENERAL EXIT STRATEGIES AND SCENE RESTORATION CONTROLLER */
    private handleLevelWin() {
      synth.playVictoryFanfare();
      onLog(`💎 功德圆满！已成功通过考验 [节点 ${this.node.id}: ${this.node.title}]！悟得通关造化: [${this.node.rewards}]。`);

      const pState = { ...this.game.registry.get("playerState") } as PlayerState;
      
      // Update registration variables
      if (!pState.completedNodeIds.includes(this.node.id)) {
        pState.completedNodeIds.push(this.node.id);
      }

      // Unlock subsequent node sequentially
      const nextId = this.node.id + 1;
      if (nextId <= 12 && !pState.unlockedNodeIds.includes(nextId)) {
        pState.unlockedNodeIds.push(nextId);
      }

      const unlockedAbilityLabels = this.applyPlanningRewards(pState);

      // Add multiplier grow
      pState.activeMultiplier += this.node.resourceMultiplier / 12.0;
      
      // Seed material resources randomly based on clearing
      const rwdKey = spec.economy.resources[0] || "灵石";
      pState.secondaryResources[rwdKey] = (pState.secondaryResources[rwdKey] || 0) + 1;

      this.game.registry.set("playerState", pState);
      this.game.registry.get("onSaveState")(pState);

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
      onLog(`❌ 考验失败: 已从心魔灵阵中被震退，原因: [${reason}]。请重新尝试。`);
      
      this.cameras.main.shake(250, 0.015);
      
      this.add.text(this.scale.width / 2, this.scale.height / 2, "💀 渡劫失败", {
        fontFamily: "Inter, sans-serif",
        fontSize: "38px",
        fontStyle: "bold",
        color: "#ef4444"
      }).setOrigin(0.5);

      this.time.delayedCall(1600, () => {
        this.safeRetreat();
      });
    }

    private safeRetreat() {
      // Cleans everything before shutdown (Ensures 0% leakage risk)
      this.shutdown();
      this.scene.start("MainScene");
    }

    shutdown() {
      // Clear timers to prevent ticks executing after destruction
      if (this.gameTimer) this.gameTimer.destroy();
      if (this.spawnTimer) this.spawnTimer.destroy();
      if (this.spawnItemTimer) this.spawnItemTimer.destroy();

      // Clear dynamic array references
      this.activeOrbs = [];
      this.activeCollects = [];
      this.activeHazards = [];
      this.runeKeyrings = [];

      // Stop Synthesizer Drones BGM and Boss Theme
      synth.stopBgm();
      synth.stopBossTheme();

      // Clean up adapter
      if (this.adapter) {
        this.adapter.destroy();
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
