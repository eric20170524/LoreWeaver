import Phaser from "phaser";
import { TurnBasedSkillBattleAdapter } from "../../lib/gameplay/turn_based_skill_battle/index.js";
import { createNodePayload, TestHooks } from "../../lib/contracts/index.js";
import {
  ThemeContentResolver,
  validateThemeContentPack
} from "../../lib/utils/ThemeContentResolver.js";
import themeSect from "../../../gameplay/cards/fixtures/turn_based_skill_battle/theme_content_pack.fixture.json";
import themeNeon from "../../../gameplay/cards/fixtures/turn_based_skill_battle/theme_content_pack.neon.json";

const LAST_RESULT_KEY = "__LW_TBSB_DEMO_LAST_RESULT__";
const DEMO_CARD_ID = "turn_based_skill_battle";
const DEMO_SPEC_HASH = "turn_based_skill_battle:core_demo:v2_timer_controls";
const DEMO_RUNTIME_VERSION = "minigame_master.core.demo.turn_based_skill_battle";
window.Phaser = Phaser;

const THEME_PACKS = {
  sect: themeSect,
  duel: themeSect,
  default: themeSect,
  wasteland: themeSect,
  neon: themeNeon,
  cyber: themeNeon
};

function readQuery() {
  try {
    return new URLSearchParams(window.location.search || "");
  } catch {
    return new URLSearchParams();
  }
}

function resolveThemePack() {
  const q = readQuery();
  const key = String(q.get("theme") || q.get("skin") || "sect").toLowerCase();
  const locale = q.get("locale") || q.get("lang") || "zh-CN";
  const pack = THEME_PACKS[key] || THEME_PACKS.sect;
  const validation = validateThemeContentPack(pack);
  const resolver = new ThemeContentResolver(pack, locale);
  const themeApi = {
    themeKey: THEME_PACKS[key] ? key : "sect",
    themeId: pack.themeId || key,
    locale,
    pack,
    validation,
    getText: (k, params, fallback) => resolver.getText(k, params, fallback),
    hudParts() {
      const raw = resolver.getText("level.hudLabels", {}, "HP|Turn|Damage|Skills");
      const labels = String(raw || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        hp: labels[0] || "HP",
        turn: labels[1] || "Turn",
        damage: labels[2] || "Damage",
        skills: labels[3] || "Skills"
      };
    }
  };
  window.__LW_THEME__ = themeApi;
  window.__LW_TBSB_DEMO_META__ = {
    cardId: DEMO_CARD_ID,
    specHash: DEMO_SPEC_HASH,
    runtimeVersion: DEMO_RUNTIME_VERSION,
    releaseEligible: false,
    themeKey: themeApi.themeKey,
    themeId: themeApi.themeId,
    locale: themeApi.locale,
    title: themeApi.getText("level.title"),
    victoryText: themeApi.getText("level.victory"),
    failureText: themeApi.getText("level.failure"),
    retreatText: themeApi.getText("level.retreat")
  };
  return themeApi;
}

const theme = resolveThemePack();
const controls = {
  start: document.getElementById("lw-start"),
  retreat: document.getElementById("lw-retreat"),
  pause: document.getElementById("lw-pause"),
  restart: document.getElementById("lw-restart"),
  back: document.getElementById("lw-back")
};
const testStateNode = document.getElementById("lw-test-state");

function setPauseLabel(status = "running") {
  controls.pause.textContent = status === "paused" ? "Resume" : "Pause";
}

function setControlMode(mode) {
  controls.start.hidden = mode !== "menu";
  controls.retreat.hidden = mode !== "run";
  controls.pause.hidden = mode !== "run";
  controls.restart.hidden = mode === "menu";
  controls.back.hidden = mode !== "result";
}

function writeTestState(patch = {}) {
  const previous = testStateNode.textContent ? JSON.parse(testStateNode.textContent) : {};
  const next = {
    cardId: DEMO_CARD_ID,
    specHash: DEMO_SPEC_HASH,
    runtimeVersion: DEMO_RUNTIME_VERSION,
    releaseEligible: false,
    themeKey: theme.themeKey,
    themeId: theme.themeId,
    locale: theme.locale,
    title: theme.getText("level.title"),
    ...previous,
    ...patch
  };
  testStateNode.textContent = JSON.stringify(next);
  Object.entries(next).forEach(([key, value]) => {
    if (typeof value !== "object") testStateNode.dataset[key] = String(value);
  });
  return next;
}

function createDemoPayload() {
  const q = readQuery();
  const enemyHp = Number(q.get("enemyHp") || 90);
  const playerHp = Number(q.get("playerHp") || 100);
  const enemyAtk = Number(q.get("enemyAtk") || 14);
  const timeLimitSec = Number(q.get("timeLimitSec") || q.get("durationSec") || 45);
  const failOnTimeoutRaw = String(q.get("failOnTimeout") || "true").toLowerCase();
  const failOnTimeout = failOnTimeoutRaw !== "false" && failOnTimeoutRaw !== "0";
  return createNodePayload({
    nodeId: "turn_based_skill_battle_demo",
    nodeConfig: {
      title: theme.getText("level.title"),
      themeContentPack: theme.pack,
      locale: theme.locale,
      gameplay: {
        adapter: "phaser",
        cardId: DEMO_CARD_ID,
        knobs: {
          playerHp,
          enemyHp,
          enemyAtk,
          playerAtk: 22,
          timeLimitSec,
          failOnTimeout,
          allowQuit: true,
          allowPause: true,
          artRuntimeMode: "prototype",
          rewardTable: { score: 3 }
        }
      }
    },
    playerStats: { hp: playerHp },
    source: { engine: "phaser", projectId: "core_demo" }
  });
}

class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create(data = {}) {
    const { width, height } = this.scale;
    const lastResult = data.lastResult || window[LAST_RESULT_KEY] || null;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0b1020, 1);
    const title = theme.getText("level.title");
    const intro = theme.getText("level.intro");
    const hint = theme.getText("level.control_hint");
    this.add
      .text(width / 2, height * 0.28, title, {
        fontSize: "34px",
        color: "#e0f2fe",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 48 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.38, intro, {
        fontSize: "16px",
        color: "#7dd3fc",
        align: "center",
        wordWrap: { width: width - 64 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.48, hint, {
        fontSize: "14px",
        color: "#bae6fd",
        align: "center"
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.54, `theme=${theme.themeKey} · ${theme.themeId}`, {
        fontSize: "12px",
        color: "#64748b"
      })
      .setOrigin(0.5);
    if (lastResult) {
      const endLabel = lastResult.success
        ? theme.getText("level.victory")
        : lastResult.reason === "retreated"
          ? theme.getText("level.retreat")
          : theme.getText("level.failure");
      this.add
        .text(width / 2, height * 0.62, `${endLabel} · ${lastResult.reason}`, {
          fontSize: "16px",
          color: lastResult.success ? "#7dd3fc" : "#fda4af"
        })
        .setOrigin(0.5);
    }
    setPauseLabel("running");
    setControlMode("menu");
    writeTestState({
      mode: "menu",
      status: "idle",
      hasLastResult: Boolean(lastResult),
      title,
      intro,
      controlHint: hint,
      settlementCount: 0
    });
    controls.start.onclick = () => this.scene.start("RunScene");
  }
}

class RunScene extends Phaser.Scene {
  constructor() {
    super("RunScene");
  }

  create() {
    const { width, height } = this.scale;
    this.resultShown = false;
    this.settlementCount = 0;
    this.add.rectangle(width / 2, height / 2, width, height, 0x111827, 1);
    this.hudLabels = theme.hudParts();
    this.hud = this.add
      .text(16, 14, "", { fontSize: "16px", color: "#e2e8f0" })
      .setDepth(50);
    this.objective = this.add
      .text(16, 64, theme.getText("level.objective"), {
        fontSize: "13px",
        color: "#94a3b8",
        wordWrap: { width: width - 32 }
      })
      .setDepth(50);

    this.testHooks = new TestHooks();
    this.adapter = new TurnBasedSkillBattleAdapter({
      Phaser,
      testHooks: this.testHooks,
      onEnd: (result) => this.showResult(result)
    });
    this.adapter.init(createDemoPayload()).create(this);
    window.__LW_TBSB_DEMO__ = this.adapter;

    const initialState = this.adapter.getTestState();
    writeTestState({
      mode: "run",
      status: initialState.status,
      nodeId: this.adapter.payload.nodeId,
      objective: theme.getText("level.objective"),
      enemyHp: initialState.enemyHp,
      hp: initialState.hp,
      timer: initialState.timer,
      turn: initialState.turn,
      score: initialState.score,
      skillsUsed: initialState.skillsUsed,
      cooldowns: initialState.cooldowns,
      settlementCount: 0,
      resultReason: null,
      resultSuccess: null,
      resultHeadline: null,
      rewards: null
    });
    setPauseLabel("running");
    setControlMode("run");

    controls.retreat.onclick = () => this.adapter.retreat();
    controls.pause.onclick = () => {
      if (this.adapter.status === "running") {
        this.adapter.pause();
      } else if (this.adapter.status === "paused") {
        this.adapter.resume();
      }
      const state = this.adapter.getTestState();
      setPauseLabel(state.status);
      writeTestState({
        mode: "run",
        status: state.status,
        hp: state.hp,
        enemyHp: state.enemyHp,
        timer: state.timer,
        turn: state.turn,
        skillsUsed: state.skillsUsed,
        cooldowns: state.cooldowns
      });
    };
    controls.restart.onclick = () => this.restartBattle();

    this.events.once("shutdown", () => {
      const oldAdapter = this.adapter;
      oldAdapter?.destroy();
      if (window.__LW_TBSB_DEMO__ === oldAdapter) {
        window.__LW_TBSB_DEMO__ = null;
      }
    });
  }

  restartBattle() {
    if (this.adapter?.status === "paused") {
      this.adapter.resume();
    }
    this.scene.restart();
  }

  update(time, delta) {
    this.adapter?.update(time, delta);
    const state = this.adapter?.getTestState();
    if (!state) return;
    const h = this.hudLabels;
    this.hud.setText([
      `${h.hp} ${Math.ceil(state.hp)}`,
      `${h.turn} ${state.turn}`,
      `${h.damage} ${state.score}`,
      `${h.skills} ${state.skillsUsed}`,
      `Time ${Math.ceil(state.timer)}s`
    ]);
    writeTestState({
      mode: state.status === "ended" ? "result" : "run",
      status: state.status,
      hp: state.hp,
      enemyHp: state.enemyHp,
      timer: state.timer,
      turn: state.turn,
      score: state.score,
      skillsUsed: state.skillsUsed,
      cooldowns: state.cooldowns,
      settlementCount: this.settlementCount
    });
  }

  showResult(result) {
    if (this.resultShown) return;
    this.resultShown = true;
    this.settlementCount += 1;
    window[LAST_RESULT_KEY] = result;
    const headline = result.success
      ? theme.getText("level.victory")
      : result.reason === "retreated"
        ? theme.getText("level.retreat")
        : theme.getText("level.failure");
    writeTestState({
      mode: "result",
      status: "ended",
      resultReason: result.reason,
      resultSuccess: result.success,
      resultHeadline: headline,
      rewards: result.rewards,
      settlementCount: this.settlementCount
    });
    const { width, height } = this.scale;
    this.add
      .rectangle(width / 2, height / 2, Math.min(width - 40, 420), 220, 0x0f172a, 0.94)
      .setStrokeStyle(2, result.success ? 0x38bdf8 : 0xf43f5e)
      .setDepth(100);
    this.add
      .text(width / 2, height / 2 - 58, headline, {
        fontSize: "28px",
        color: result.success ? "#7dd3fc" : "#fda4af",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 360 }
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(width / 2, height / 2 - 8, `${result.reason} | ${JSON.stringify(result.rewards)}`, {
        fontSize: "14px",
        color: "#e2e8f0"
      })
      .setOrigin(0.5)
      .setDepth(101);
    setControlMode("result");
    controls.restart.onclick = () => this.restartBattle();
    controls.back.onclick = () => this.scene.start("MenuScene", { lastResult: result });
  }
}

// eslint-disable-next-line no-new
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#0b1020",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, RunScene]
});
writeTestState({ mode: "boot", status: "idle" });
