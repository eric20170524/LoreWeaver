import Phaser from "phaser";
import { GameSpec, PlayerState } from "../../types";
import { UIPlugin, UIPluginContext } from "./UIPlugin";
import { synth } from "../../utils/AudioSynth";

export class DefaultUIPlugin implements UIPlugin {
  private scoreText!: Phaser.GameObjects.Text;
  private multiplierText!: Phaser.GameObjects.Text;

  renderTopHUD(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    const { width } = scene.scale;
    const themeHex = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;

    const topHud = scene.add.graphics();
    topHud.fillStyle(0x090d16, 0.9);
    topHud.fillRoundedRect(16, 16, width - 32, 110, 8);
    topHud.lineStyle(1.5, themeHex, 0.6);
    topHud.strokeRoundedRect(16, 16, width - 32, 110, 8);

    const realmTextStr = spec.economy.realms[state.currentRealmIndex] || "炼气期 Initial";
    scene.add.text(32, 28, realmTextStr.toUpperCase(), {
      fontFamily: "Inter, sans-serif",
      fontSize: "22px",
      style: "bold",
      color: spec.themeColor,
      letterSpacing: "2"
    } as any);

    const passiveRate = (state.activeMultiplier * 1.5).toFixed(1);
    this.multiplierText = scene.add.text(32, 48, `挂机修炼效率: +${passiveRate}/秒`, {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "16px",
      color: "#64748b"
    });

    scene.add.text(32, 70, `${spec.economy.currencyName.split("/")[0]}:`, {
      fontFamily: "Inter, sans-serif",
      fontSize: "20px",
      color: "#94a3b8"
    });

    this.scoreText = scene.add.text(125, 65, Math.floor(state.mainCurrencyCount).toString(), {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "25px",
      fontStyle: "bold",
      color: "#ffffff"
    });

    const soundText = scene.add.text(width - 92, 32, synth.getMuteState() ? "🔇 静音" : "🔊 音效", {
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "16px",
      color: synth.getMuteState() ? "#ef4444" : spec.themeColor
    }).setInteractive({ useHandCursor: true });

    soundText.on("pointerdown", () => {
      const nextMute = synth.toggleMute();
      soundText.setText(nextMute ? "🔇 静音" : "🔊 音效");
      soundText.setColor(nextMute ? "#ef4444" : spec.themeColor);
      synth.playClick();
      context.onLog(`🔊 切换音效输出: ${nextMute ? "静音(MUTE)" : "开启(ACTIVE)"}`);
    });

    const nextBound = Math.pow(4, state.currentRealmIndex + 1) * 35;
    const canBrk = state.mainCurrencyCount >= nextBound && state.currentRealmIndex < spec.economy.realms.length - 1;
    
    const brkBtn = scene.add.text(width - 145, 68, canBrk ? "⚡ 突破境界" : `🔒 需修为: ${nextBound}`, {
      fontFamily: "Inter, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      backgroundColor: canBrk ? spec.themeColor : "#1e293b",
      color: canBrk ? "#020617" : "#64748b",
      padding: { x: 10, y: 7 }
    }).setInteractive({ useHandCursor: true });

    brkBtn.on("pointerdown", () => {
      if (!canBrk) {
        synth.playDamage();
        scene.cameras.main.shake(150, 0.005);
        context.onLog(`⚠️ ${spec.economy.currencyName}蕴能储量不足，无法突破天劫桎梏。`);
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
  }

  renderClickCore(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    const { width, height } = scene.scale;
    const themeHex = Phaser.Display.Color.HexStringToColor(spec.themeColor).color;

    const cx = width / 2;
    const cy = height - 120;
    
    const aura = scene.add.graphics();
    aura.fillStyle(themeHex, 0.06);
    aura.fillCircle(cx, cy, 75);
    aura.lineStyle(2, themeHex, 0.65);
    aura.strokeCircle(cx, cy, 65);

    const centerCore = scene.add.graphics();
    centerCore.fillStyle(themeHex, 0.85);
    centerCore.fillCircle(cx, cy, 32);

    const circleLabel = scene.add.text(cx, cy, "修炼\nCULTIVATE", {
      fontFamily: "Inter, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#ffffff",
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
      const gain = parseFloat((state.clickPower * 1.0).toFixed(1));
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
        color: "#ffffff"
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
  }

  update(time: number, delta: number) {}
  destroy() {}
}
