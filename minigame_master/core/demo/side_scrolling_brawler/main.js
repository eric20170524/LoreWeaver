import Phaser from "phaser";
import { SideScrollingBrawlerAdapter } from "../../lib/gameplay/side_scrolling_brawler/index.js";
import { createNodePayload, TestHooks } from "../../lib/contracts/index.js";

const LAST_RESULT_KEY = "__LW_BRAWLER_DEMO_LAST_RESULT__";
const DEMO_CARD_ID = "side_scrolling_brawler";
const DEMO_SPEC_HASH = "side_scrolling_brawler:core_demo:v1";
const DEMO_RUNTIME_VERSION = "minigame_master.core.demo.side_scrolling_brawler";
window.Phaser = Phaser;

function query() {
  try { return new URLSearchParams(window.location.search || ""); }
  catch { return new URLSearchParams(); }
}

const controls = {
  start: document.getElementById("lw-start"),
  retreat: document.getElementById("lw-retreat"),
  pause: document.getElementById("lw-pause"),
  restart: document.getElementById("lw-restart"),
  back: document.getElementById("lw-back")
};
const stateNode = document.getElementById("lw-test-state");

function setControls(mode, status = "running") {
  controls.start.hidden = mode !== "menu";
  controls.retreat.hidden = mode !== "run";
  controls.pause.hidden = mode !== "run";
  controls.restart.hidden = mode === "menu";
  controls.back.hidden = mode !== "result";
  controls.pause.textContent = status === "paused" ? "Resume" : "Pause";
}

function writeState(patch = {}) {
  let previous = {};
  try { previous = JSON.parse(stateNode.textContent || "{}"); } catch { previous = {}; }
  const next = {
    cardId: DEMO_CARD_ID,
    specHash: DEMO_SPEC_HASH,
    runtimeVersion: DEMO_RUNTIME_VERSION,
    releaseEligible: false,
    ...previous,
    ...patch
  };
  stateNode.textContent = JSON.stringify(next);
  Object.entries(next).forEach(([key, value]) => {
    if (typeof value !== "object") stateNode.dataset[key] = String(value);
  });
  return next;
}

function demoPayload() {
  const q = query();
  const failureMode = q.get("mode") === "fail" || q.get("fail") === "1";
  const playerHp = Number(q.get("playerHp") || (failureMode ? 18 : 100));
  const playerAttack = Number(q.get("playerAtk") || 42);
  const firstDamage = Number(q.get("enemyDamage") || (failureMode ? 60 : 8));
  const lifeStockEnabled = failureMode ? false : String(q.get("lifeStock") || "true") !== "false";
  const waveList = [
    {
      id: "demo_wave_1",
      name: "Gate Guard",
      triggerX: 140,
      lockX: 180,
      cameraMax: 430,
      enemies: [
        { id: "demo_mob", hp: 30, speed: failureMode ? 180 : 62, damage: firstDamage, x: failureMode ? 168 : 238, y: 0 }
      ]
    },
    {
      id: "demo_wave_boss",
      name: "Demo Boss",
      triggerX: 360,
      lockX: 400,
      cameraMax: 760,
      bossIntro: true,
      enemies: [
        { id: "demo_boss", hp: 64, speed: 48, damage: 14, x: 480, y: 0, isBoss: true, radius: 24 }
      ]
    }
  ];
  return createNodePayload({
    nodeId: "side_scrolling_brawler_demo",
    nodeConfig: {
      title: "Side Scrolling Brawler Demo",
      gameplay: {
        adapter: "phaser",
        cardId: DEMO_CARD_ID,
        knobs: {
          stageLengthPx: 900,
          playersMax: 1,
          waveList,
          laneDepth: { floorTop: 210, floorBottom: 520, ySpeedScale: 0.78 },
          lockScreen: { enabled: true, cameraPaddingPx: 56 },
          arcadeTimer: null,
          lifeStock: { enabled: lifeStockEnabled, startingLives: 2, reviveInvulnSec: 1.2 },
          continueCredits: { enabled: false, maxCredits: 0 },
          player: {
            hp: playerHp,
            speed: 230,
            attackDamage: playerAttack,
            attackCooldownMs: 120,
            attackRange: 92,
            radius: 16,
            color: 0x34d399
          },
          rewardTable: { score: 3 }
        }
      }
    },
    playerStats: { hp: playerHp },
    source: { engine: "phaser", projectId: "core_demo" }
  });
}

class MenuScene extends Phaser.Scene {
  constructor() { super("MenuScene"); }
  create(data = {}) {
    const { width, height } = this.scale;
    const lastResult = data.lastResult || window[LAST_RESULT_KEY] || null;
    this.add.rectangle(width / 2, height / 2, width, height, 0x08111f, 1);
    this.add.text(width / 2, height * 0.28, "SIDE SCROLLING BRAWLER", {
      fontSize: "30px", color: "#d1fae5", fontStyle: "bold", align: "center"
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.39, "Advance → lock screen → clear wave → unlock → boss", {
      fontSize: "16px", color: "#6ee7b7", align: "center", wordWrap: { width: width - 48 }
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.48, "WASD move · J/Space light · K heavy", {
      fontSize: "14px", color: "#a7f3d0"
    }).setOrigin(0.5);
    if (lastResult) {
      this.add.text(width / 2, height * 0.61, `${lastResult.success ? "CLEAR" : "FAILED"} · ${lastResult.reason}`, {
        fontSize: "16px", color: lastResult.success ? "#6ee7b7" : "#fda4af"
      }).setOrigin(0.5);
    }
    setControls("menu");
    writeState({ mode: "menu", status: "idle", hasLastResult: Boolean(lastResult), settlementCount: 0 });
    controls.start.onclick = () => this.scene.start("RunScene");
  }
}

class RunScene extends Phaser.Scene {
  constructor() { super("RunScene"); }

  create() {
    const { width, height } = this.scale;
    this.resultShown = false;
    this.settlementCount = 0;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1);
    this.hud = this.add.text(16, 14, "", { fontSize: "14px", color: "#ecfdf5" }).setDepth(1000).setScrollFactor(0);
    this.testHooks = new TestHooks();
    this.adapter = new SideScrollingBrawlerAdapter({
      Phaser,
      testHooks: this.testHooks,
      onEnd: (result) => this.showResult(result)
    });
    this.adapter.init(demoPayload()).create(this);
    window.__LW_BRAWLER_DEMO__ = this.adapter;
    setControls("run", "running");
    this.publish();

    controls.retreat.onclick = () => this.adapter.retreat();
    controls.pause.onclick = () => {
      if (this.adapter.status === "running") this.adapter.pause();
      else if (this.adapter.status === "paused") this.adapter.resume();
      setControls("run", this.adapter.status);
      this.publish();
    };
    controls.restart.onclick = () => this.restartRun();

    this.events.once("shutdown", () => {
      const oldAdapter = this.adapter;
      oldAdapter?.destroy();
      if (window.__LW_BRAWLER_DEMO__ === oldAdapter) window.__LW_BRAWLER_DEMO__ = null;
    });
  }

  restartRun() {
    if (this.adapter?.status === "paused") this.adapter.resume();
    this.scene.restart();
  }

  update(time, delta) {
    this.adapter?.update(time, delta);
    this.publish();
  }

  publish() {
    const state = this.adapter?.getTestState?.();
    if (!state) return;
    const playerX = Number(this.adapter?.player?.x || 0);
    const aliveEnemies = Array.isArray(this.adapter?.enemies)
      ? this.adapter.enemies.filter((enemy) => enemy.alive).length
      : 0;
    this.hud?.setText([
      `HP ${Math.ceil(state.hp)} · Lives ${state.lives}`,
      `Kills ${state.kills} · Waves ${state.wavesCleared}/${state.totalWaves}`,
      `Player X ${Math.round(playerX)} · Enemies ${aliveEnemies}`,
      `Status ${state.status}`
    ]);
    writeState({
      mode: state.status === "ended" ? "result" : "run",
      status: state.status,
      hp: state.hp,
      lives: state.lives,
      kills: state.kills,
      wavesCleared: state.wavesCleared,
      totalWaves: state.totalWaves,
      locked: state.locked,
      timerSec: state.timerSec,
      elapsedSec: Number(this.adapter?.state?.elapsedSec || 0),
      playerX,
      aliveEnemies,
      settlementCount: this.settlementCount,
      resultReason: state.lastResult?.reason || null,
      resultSuccess: state.lastResult?.success ?? null
    });
  }

  showResult(result) {
    if (this.resultShown) return;
    this.resultShown = true;
    this.settlementCount += 1;
    window[LAST_RESULT_KEY] = result;
    writeState({
      mode: "result",
      status: "ended",
      resultReason: result.reason,
      resultSuccess: result.success,
      rewards: result.rewards,
      settlementCount: this.settlementCount
    });
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, Math.min(width - 40, 430), 210, 0x020617, 0.94)
      .setStrokeStyle(2, result.success ? 0x34d399 : 0xfb7185).setDepth(2000);
    this.add.text(width / 2, height / 2 - 42, result.success ? "STAGE CLEAR" : "RUN FAILED", {
      fontSize: "28px", color: result.success ? "#6ee7b7" : "#fda4af", fontStyle: "bold"
    }).setOrigin(0.5).setDepth(2001);
    this.add.text(width / 2, height / 2 + 14, `${result.reason} · ${JSON.stringify(result.rewards)}`, {
      fontSize: "14px", color: "#e2e8f0", align: "center", wordWrap: { width: 360 }
    }).setOrigin(0.5).setDepth(2001);
    setControls("result");
    controls.restart.onclick = () => this.restartRun();
    controls.back.onclick = () => this.scene.start("MenuScene", { lastResult: result });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#08111f",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, RunScene]
});
writeState({ mode: "boot", status: "idle" });
