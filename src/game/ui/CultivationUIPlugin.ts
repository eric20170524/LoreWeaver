import Phaser from "phaser";
import { GameSpec, PlayerState, PassiveSkillSpec, AbilitySpec } from "../../types";
import { UIPlugin, UIPluginContext } from "./UIPlugin";
import { synth } from "../../utils/AudioSynth";

const DEFAULT_BONE_TEXTS: PassiveSkillSpec[] = [
  {
    id: "suanni_bone",
    name: "狻猊骨文",
    treeTier: "T1",
    cost: 50,
    description: "参悟太古狻猊遗骨宝纹，提升点击修练感悟 (+2.0 点击威力)。",
    effects: [{ target: "clickPower", op: "add", value: 2.0 }],
    affectedRuntimeSkillIds: []
  },
  {
    id: "peng_bone",
    name: "金翅大鹏骨文",
    treeTier: "T1",
    cost: 120,
    description: "扶摇直上九万里，大幅增强天地灵气吸收效率 (+1.0/秒)。",
    effects: [{ target: "activeMultiplier", op: "add", value: 1.0 }],
    affectedRuntimeSkillIds: []
  },
  {
    id: "zhuque_bone",
    name: "朱雀骨文",
    treeTier: "T2",
    cost: 300,
    description: "凝练南方朱雀神火，兼修肉身与吐纳 (+3.5 点击威力, +1.5/秒)。",
    effects: [
      { target: "clickPower", op: "add", value: 3.5 },
      { target: "activeMultiplier", op: "add", value: 1.5 }
    ],
    affectedRuntimeSkillIds: []
  },
  {
    id: "dragon_bone",
    name: "真龙骨文",
    treeTier: "T3",
    cost: 800,
    description: "太古真龙大神通，龙威浩荡吐纳天地大势 (+5.0 点击威力, +5.0/秒)。",
    effects: [
      { target: "clickPower", op: "add", value: 5.0 },
      { target: "activeMultiplier", op: "add", value: 5.0 }
    ],
    affectedRuntimeSkillIds: []
  },
  {
    id: "supreme_bone",
    name: "至尊骨纹",
    treeTier: "T4",
    cost: 2500,
    description: "胸中至尊骨觉醒，轮回天威无双 (+15.0 点击威力, +10.0/秒)。",
    effects: [
      { target: "clickPower", op: "add", value: 15.0 },
      { target: "activeMultiplier", op: "add", value: 10.0 }
    ],
    affectedRuntimeSkillIds: []
  }
];

const DEFAULT_ABILITIES: AbilitySpec[] = [
  {
    id: "ability_suanni",
    name: "狻猊宝术 · 雷帝招来",
    description: "引天雷破万法，太古狻猊绝学。在主线关卡中产生狂暴雷霆震慑敌胆。",
    category: "神兽血脉",
    unlockSource: "initial",
    unlockCondition: "初始自带 / 炼气期 即可直接领悟",
    gameplayTags: ["雷霆", "爆发", "主线神技"],
    runtimeSkillIds: ["thunder_bolt"],
    affectedNodeIds: [1, 2]
  },
  {
    id: "ability_grass",
    name: "草字剑诀 · 一草斩星辰",
    description: "一株草斩尽日月星辰，极致剑道。大幅增强战斗关卡中的斩击威能。",
    category: "太古剑道",
    unlockSource: "mainline",
    unlockCondition: "通关主线 Node 2 或 参悟骨文达 2 种",
    gameplayTags: ["剑道", "破甲", "极致锋芒"],
    runtimeSkillIds: ["grass_sword"],
    affectedNodeIds: [2, 3]
  },
  {
    id: "ability_six_fist",
    name: "六道轮回拳 · 轮回无双",
    description: "肉身无双，六道轮转。天崩地裂间以无上拳意轰碎万劫。",
    category: "无双肉身",
    unlockSource: "node_reward",
    unlockCondition: "突破至 筑基期 或 通关 Node 3",
    gameplayTags: ["拳意", "近身", "无双霸道"],
    runtimeSkillIds: ["six_fist"],
    affectedNodeIds: [3, 4]
  },
  {
    id: "ability_kunpeng",
    name: "鲲鹏宝术 · 扶摇直上",
    description: "化鲲为鹏，阴阳交汇。掌控天地风水大道，极速积聚灵气与气血。",
    category: "太古遗种",
    unlockSource: "hybrid",
    unlockCondition: "突破至 金丹期 自动融会贯通",
    gameplayTags: ["极速", "阴阳", "天地大道"],
    runtimeSkillIds: ["kunpeng_flight"],
    affectedNodeIds: [4, 5]
  },
  {
    id: "ability_willow",
    name: "柳神宝术 · 枯木逢春",
    description: "祭灵绝学，涅槃重生。能够在垂死危机时刻瞬间焕发无限生机。",
    category: "祭灵绝技",
    unlockSource: "finale",
    unlockCondition: "突破至 元婴期 及以上境界解禁",
    gameplayTags: ["涅槃", "治愈", "万法不侵"],
    runtimeSkillIds: ["willow_rebirth"],
    affectedNodeIds: [5, 6]
  }
];

export class CultivationUIPlugin implements UIPlugin {
  private scoreText!: Phaser.GameObjects.Text;
  private multiplierText!: Phaser.GameObjects.Text;
  private caveBtn!: Phaser.GameObjects.Text;
  private realmBtn!: Phaser.GameObjects.Text;
  private perkBtn!: Phaser.GameObjects.Text;
  private abilityBtn!: Phaser.GameObjects.Text;
  private activeModalContainer: Phaser.GameObjects.Container | null = null;

  renderTopHUD(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    const { width } = scene.scale;

    const topHud = scene.add.graphics();
    topHud.fillStyle(0x1a110a, 0.95);
    topHud.fillRoundedRect(16, 16, width - 32, 110, 8);
    topHud.lineStyle(2, 0xffd700, 0.4);
    topHud.strokeRoundedRect(16, 16, width - 32, 110, 8);

    const realmTextStr = spec.economy.realms[state.currentRealmIndex] || "炼气期 Initial";
    scene.add.text(32, 28, `境界：${realmTextStr.toUpperCase()}`, {
      fontFamily: "Inter, sans-serif",
      fontSize: "22px",
      style: "bold",
      color: "#ffd700",
      letterSpacing: "2"
    } as any);

    const passiveRate = (state.activeMultiplier * 1.5).toFixed(1);
    this.multiplierText = scene.add.text(32, 54, `天地灵气吸收: +${passiveRate}/秒`, {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "16px",
      color: "#d4af37"
    });

    scene.add.text(32, 78, `${spec.economy.currencyName.split("/")[0]}储备:`, {
      fontFamily: "Inter, sans-serif",
      fontSize: "20px",
      color: "#b0c4de"
    });

    this.scoreText = scene.add.text(145, 74, Math.floor(state.mainCurrencyCount).toString(), {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "25px",
      fontStyle: "bold",
      color: "#ffffff"
    });

    const soundText = scene.add.text(width - 92, 32, synth.getMuteState() ? "🔇 静音" : "🔊 音效", {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "16px",
      color: synth.getMuteState() ? "#ef4444" : "#ffd700"
    }).setInteractive({ useHandCursor: true });

    soundText.on("pointerdown", () => {
      const nextMute = synth.toggleMute();
      soundText.setText(nextMute ? "🔇 静音" : "🔊 音效");
      soundText.setColor(nextMute ? "#ef4444" : "#ffd700");
      synth.playClick();
      context.onLog(`🔊 切换音效输出: ${nextMute ? "静音(MUTE)" : "开启(ACTIVE)"}`);
    });
  }

  renderClickCore(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    const { width, height } = scene.scale;
    
    // Cultivation clickable circle
    const cx = width / 2;
    const cy = height - 260;
    
    const aura = scene.add.graphics();
    aura.fillStyle(0xffd700, 0.08);
    aura.fillCircle(cx, cy, 75);
    aura.lineStyle(2, 0xffd700, 0.8);
    aura.strokeCircle(cx, cy, 65);

    const centerCore = scene.add.graphics();
    centerCore.fillStyle(0x8b0000, 0.85);
    centerCore.fillCircle(cx, cy, 32);

    const circleLabel = scene.add.text(cx, cy, "打坐\n修炼", {
      fontFamily: "Inter, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#ffd700",
      align: "center"
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    circleLabel.on("pointerover", () => {
      scene.tweens.add({
        targets: [circleLabel, centerCore],
        scale: 1.12,
        duration: 150
      });
    });

    circleLabel.on("pointerout", () => {
      scene.tweens.add({
        targets: [circleLabel, centerCore],
        scale: 1.0,
        duration: 150
      });
    });

    circleLabel.on("pointerdown", () => {
      const gain = parseFloat((state.clickPower * 1.5).toFixed(1));
      state.mainCurrencyCount += gain;
      if (this.scoreText && this.scoreText.active) {
        this.scoreText.setText(Math.floor(state.mainCurrencyCount).toString());
      }

      synth.playClick();

      scene.tweens.add({
        targets: [centerCore, aura],
        scale: 0.92,
        yoyo: true,
        duration: 60
      });

      const px = cx + Phaser.Math.Between(-30, 30);
      const py = cy - 40;
      const flTxt = scene.add.text(px, py, `+${gain}`, {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "27px",
        fontStyle: "bold",
        color: "#ffd700"
      }).setOrigin(0.5);

      scene.tweens.add({
        targets: flTxt,
        y: py - 60,
        alpha: 0,
        scale: 1.35,
        duration: 800,
        onComplete: () => {
          flTxt.destroy();
        }
      });

      context.saveStateToStore();
    });

    // Advance Panel background
    const panelWidth = width - 40;
    const panelHeight = 160;
    const panelY = height - 170;

    const upgradeBg = scene.add.graphics();
    upgradeBg.fillStyle(0x1a110a, 0.9);
    upgradeBg.fillRoundedRect(20, panelY, panelWidth, panelHeight, 12);
    upgradeBg.lineStyle(2, 0xffd700, 0.3);
    upgradeBg.strokeRoundedRect(20, panelY, panelWidth, panelHeight, 12);

    scene.add.text(width / 2, panelY + 20, '【 修炼面板 】', { 
      fontSize: '22px', 
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Grid layout for buttons
    const btnStartX = 20 + panelWidth / 4;
    const btnStartY = panelY + 65;
    const btnSpacingY = 50;
    const btnSpacingX = panelWidth / 2;

    const createBtn = (x: number, y: number, text: string, color: string, onClick: () => void) => {
      const btn = scene.add.text(x, y, text, {
        fontSize: '18px', color: '#fff', backgroundColor: color, padding: {x:15, y:8}
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      
      btn.on('pointerdown', onClick);
      btn.on('pointerover', () => {
        scene.tweens.add({ targets: btn, scale: 1.05, duration: 100 });
        btn.setStyle({ color: '#ffd700' });
      });
      btn.on('pointerout', () => {
        scene.tweens.add({ targets: btn, scale: 1.0, duration: 100 });
        btn.setStyle({ color: '#ffffff' });
      });
      return btn;
    };

    // Cave Button
    this.caveBtn = createBtn(btnStartX, btnStartY, '开启洞天', '#555555', () => {
      const caveCost = 100 * (state.currentRealmIndex + 1);
      if (state.mainCurrencyCount >= caveCost) {
        state.mainCurrencyCount -= caveCost;
        state.activeMultiplier += 0.5;
        state.clickPower += 0.5;
        synth.playClick();
        scene.cameras.main.flash(200, 255, 215, 0);
        context.onLog(`✨ 消耗 ${caveCost} 蕴能，成功开启一口新洞天！吸收效率大幅提升。`);
        if (this.scoreText && this.scoreText.active) this.scoreText.setText(Math.floor(state.mainCurrencyCount).toString());
        context.saveStateToStore();
      } else {
        synth.playDamage();
        scene.cameras.main.shake(100, 0.005);
        context.onLog(`⚠️ 开启洞天需要 ${caveCost} 蕴能，当前灵气不足！`);
      }
    });

    // Breakthrough Button
    const nextBound = Math.pow(4, state.currentRealmIndex + 1) * 35;
    this.realmBtn = createBtn(btnStartX + btnSpacingX, btnStartY, '突破境界', '#8b0000', () => {
      if (state.mainCurrencyCount < nextBound || state.currentRealmIndex >= spec.economy.realms.length - 1) {
        synth.playDamage();
        scene.cameras.main.shake(150, 0.005);
        context.onLog(`⚠️ 突破需要 ${nextBound} 蕴能，当前灵气不足或已达最高境界！`);
        return;
      }
      synth.playBreakthrough();
      scene.cameras.main.flash(400, 255, 255, 255);
      scene.cameras.main.shake(250, 0.01);
      
      state.mainCurrencyCount -= nextBound;
      state.currentRealmIndex += 1;
      state.activeMultiplier += 1.8;
      state.clickPower += 1.5;

      context.saveStateToStore();
      scene.scene.restart();

      context.onLog(`🔥 天梯跃迁: 成功逆天飞升破镜至全新天梯境界: [${spec.economy.realms[state.currentRealmIndex]}]！`);
    });

    // Perk Tree Button -> Open Bone Text Comprehension Modal
    this.perkBtn = createBtn(btnStartX, btnStartY + btnSpacingY, '参悟骨文', '#00008b', () => {
      synth.playClick();
      context.onLog(`🌀 正在开启【太古骨文参悟】...`);
      this.openBoneTextModal(scene, state, spec, context);
    });

    // Ability Codex Button -> Open Precious Technique Compendium Modal
    this.abilityBtn = createBtn(btnStartX + btnSpacingX, btnStartY + btnSpacingY, '宝术图鉴', '#075985', () => {
      synth.playClick();
      context.onLog(`📚 正在翻阅【太古宝术图鉴】...`);
      this.openAbilityCodexModal(scene, state, spec, context);
    });
  }

  private closeModal() {
    if (this.activeModalContainer) {
      this.activeModalContainer.destroy();
      this.activeModalContainer = null;
    }
  }

  private openBoneTextModal(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    this.closeModal();

    const { width, height } = scene.scale;
    const container = scene.add.container(0, 0);
    this.activeModalContainer = container;

    // Dark overlay
    const overlay = scene.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, width, height);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    // Modal box dimensions
    const panelW = Math.min(680, width - 32);
    const panelH = Math.min(520, height - 60);
    const panelX = (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    const box = scene.add.graphics();
    box.fillStyle(0x111827, 0.98);
    box.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    box.lineStyle(2, 0xffd700, 0.8);
    box.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    container.add(box);

    // Header Title
    const title = scene.add.text(panelX + 24, panelY + 20, "📜 太古骨文参悟 (Bone Text Comprehension)", {
      fontFamily: "Inter, sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      color: "#ffd700"
    });
    container.add(title);

    // Subtitle / Currency display
    const currencyName = spec.economy?.currencyName?.split("/")[0] || "蕴能";
    const currencyText = scene.add.text(panelX + 24, panelY + 50, `当前${currencyName}储备: ${Math.floor(state.mainCurrencyCount)}`, {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "15px",
      color: "#b0c4de"
    });
    container.add(currencyText);

    // Close Button [ ✕ 关闭 ]
    const closeBtn = scene.add.text(panelX + panelW - 24, panelY + 20, "✕ 关闭", {
      fontFamily: "Inter, sans-serif",
      fontSize: "15px",
      color: "#ef4444",
      backgroundColor: "#374151",
      padding: { x: 10, y: 5 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    closeBtn.on("pointerdown", () => {
      synth.playClick();
      this.closeModal();
    });
    container.add(closeBtn);

    // Render Bone Text Items
    const passives = (spec.passiveSkillCatalog && spec.passiveSkillCatalog.length > 0)
      ? spec.passiveSkillCatalog
      : DEFAULT_BONE_TEXTS;

    const startY = panelY + 85;
    const itemH = 72;
    const itemGap = 10;

    passives.forEach((item, index) => {
      const iy = startY + index * (itemH + itemGap);
      if (iy + itemH > panelY + panelH - 15) return; // boundary check

      const itemBg = scene.add.graphics();
      const isUnlocked = Array.isArray(state.unlockedPassives) && state.unlockedPassives.includes(item.id);

      itemBg.fillStyle(isUnlocked ? 0x065f46 : 0x1f2937, 0.9);
      itemBg.fillRoundedRect(panelX + 20, iy, panelW - 40, itemH, 8);
      itemBg.lineStyle(1, isUnlocked ? 0x10b981 : 0x374151, 0.8);
      itemBg.strokeRoundedRect(panelX + 20, iy, panelW - 40, itemH, 8);
      container.add(itemBg);

      // Name & Tier
      const nameTxt = scene.add.text(panelX + 35, iy + 10, `${item.name} [${item.treeTier || "骨纹"}]`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "17px",
        fontStyle: "bold",
        color: isUnlocked ? "#34d399" : "#ffffff"
      });
      container.add(nameTxt);

      // Description
      const descTxt = scene.add.text(panelX + 35, iy + 36, item.description, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#9ca3af",
        wordWrap: { width: panelW - 200 }
      });
      container.add(descTxt);

      // Action Button
      const btnX = panelX + panelW - 35;
      const btnY = iy + itemH / 2;

      if (isUnlocked) {
        const statusLabel = scene.add.text(btnX, btnY, "✅ 已融会贯通", {
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          color: "#34d399"
        }).setOrigin(1, 0.5);
        container.add(statusLabel);
      } else {
        const canAfford = state.mainCurrencyCount >= item.cost;
        const buyBtn = scene.add.text(btnX, btnY, `参悟 (${item.cost} ${currencyName})`, {
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          fontStyle: "bold",
          color: canAfford ? "#ffffff" : "#9ca3af",
          backgroundColor: canAfford ? "#1d4ed8" : "#374151",
          padding: { x: 12, y: 6 }
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: canAfford });

        buyBtn.on("pointerdown", () => {
          if (state.mainCurrencyCount < item.cost) {
            synth.playDamage();
            context.onLog(`⚠️ 参悟【${item.name}】需要 ${item.cost} ${currencyName}，当前灵气不足！`);
            return;
          }

          state.mainCurrencyCount -= item.cost;
          if (!Array.isArray(state.unlockedPassives)) {
            state.unlockedPassives = [];
          }
          state.unlockedPassives.push(item.id);

          // Apply passive effects
          if (item.effects) {
            item.effects.forEach((eff) => {
              if (eff.target === "clickPower") {
                state.clickPower += Number(eff.value) || 0;
              } else if (eff.target === "activeMultiplier") {
                state.activeMultiplier += Number(eff.value) || 0;
              }
            });
          }

          synth.playClick();
          context.onLog(`✨ 成功参悟太古骨文【${item.name}】！参悟感悟大增。`);
          
          if (this.scoreText && this.scoreText.active) {
            this.scoreText.setText(Math.floor(state.mainCurrencyCount).toString());
          }
          if (this.multiplierText && this.multiplierText.active) {
            const passiveRate = (state.activeMultiplier * 1.5).toFixed(1);
            this.multiplierText.setText(`天地灵气吸收: +${passiveRate}/秒`);
          }

          context.saveStateToStore();

          // Refresh modal to update states
          this.openBoneTextModal(scene, state, spec, context);
        });

        container.add(buyBtn);
      }
    });
  }

  private openAbilityCodexModal(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    this.closeModal();

    const { width, height } = scene.scale;
    const container = scene.add.container(0, 0);
    this.activeModalContainer = container;

    // Dark overlay
    const overlay = scene.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, width, height);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    // Modal box dimensions
    const panelW = Math.min(680, width - 32);
    const panelH = Math.min(520, height - 60);
    const panelX = (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    const box = scene.add.graphics();
    box.fillStyle(0x0f172a, 0.98);
    box.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    box.lineStyle(2, 0x0284c7, 0.8);
    box.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    container.add(box);

    // Abilities catalog
    const abilities = (spec.abilityCatalog && spec.abilityCatalog.length > 0)
      ? spec.abilityCatalog
      : DEFAULT_ABILITIES;

    const unlockedList = Array.isArray(state.unlockedAbilities) ? state.unlockedAbilities : [];
    const unlockedCount = abilities.filter(a => 
      unlockedList.includes(a.id) || a.unlockSource === "initial" || state.currentRealmIndex >= 1
    ).length;

    // Header Title
    const title = scene.add.text(panelX + 24, panelY + 20, "📚 太古宝术图鉴 (Precious Technique Codex)", {
      fontFamily: "Inter, sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      color: "#38bdf8"
    });
    container.add(title);

    // Subtitle / Counter
    const countText = scene.add.text(panelX + 24, panelY + 50, `已领悟绝技: ${unlockedCount} / ${abilities.length}`, {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "15px",
      color: "#94a3b8"
    });
    container.add(countText);

    // Close Button [ ✕ 关闭 ]
    const closeBtn = scene.add.text(panelX + panelW - 24, panelY + 20, "✕ 关闭", {
      fontFamily: "Inter, sans-serif",
      fontSize: "15px",
      color: "#ef4444",
      backgroundColor: "#334155",
      padding: { x: 10, y: 5 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    closeBtn.on("pointerdown", () => {
      synth.playClick();
      this.closeModal();
    });
    container.add(closeBtn);

    // Render Ability Cards
    const startY = panelY + 85;
    const itemH = 75;
    const itemGap = 10;

    abilities.forEach((item, index) => {
      const iy = startY + index * (itemH + itemGap);
      if (iy + itemH > panelY + panelH - 15) return;

      const isUnlocked = unlockedList.includes(item.id) || item.unlockSource === "initial" || state.currentRealmIndex >= 1;

      const itemBg = scene.add.graphics();
      itemBg.fillStyle(isUnlocked ? 0x0369a1 : 0x1e293b, 0.85);
      itemBg.fillRoundedRect(panelX + 20, iy, panelW - 40, itemH, 8);
      itemBg.lineStyle(1, isUnlocked ? 0x38bdf8 : 0x475569, 0.8);
      itemBg.strokeRoundedRect(panelX + 20, iy, panelW - 40, itemH, 8);
      container.add(itemBg);

      // Name & Category Badge
      const categoryStr = item.category ? `[${item.category}]` : "[宝术]";
      const nameTxt = scene.add.text(panelX + 35, iy + 10, `${item.name}  ${categoryStr}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: isUnlocked ? "#7dd3fc" : "#cbd5e1"
      });
      container.add(nameTxt);

      // Description or Unlock Condition
      const descStr = isUnlocked 
        ? item.description 
        : `🔒 未解禁 — 解锁条件: ${item.unlockCondition || "突破境界或通过特定主线关卡"}`;

      const descTxt = scene.add.text(panelX + 35, iy + 36, descStr, {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: isUnlocked ? "#94a3b8" : "#f87171",
        wordWrap: { width: panelW - 200 }
      });
      container.add(descTxt);

      // Tags & Status Tag on the right
      const tagX = panelX + panelW - 35;
      const tagY = iy + itemH / 2;

      const statusTxt = scene.add.text(tagX, tagY, isUnlocked ? "✨ 已融会贯通" : "🔒 隐晦未明", {
        fontFamily: "Inter, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: isUnlocked ? "#38bdf8" : "#94a3b8"
      }).setOrigin(1, 0.5);
      container.add(statusTxt);
    });
  }

  update(time: number, delta: number) {}
  
  destroy() {
    this.closeModal();
  }
}

