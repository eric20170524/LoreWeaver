import Phaser from "phaser";
import { CollectDodgeAdapter } from "../../lib/gameplay/collect_dodge/index.js";
import { createNodePayload, TestHooks } from "../../lib/contracts/index.js";
import {
  ThemeContentResolver,
  validateThemeContentPack
} from "../../lib/utils/ThemeContentResolver.js";
import themeVoid from "../../../gameplay/cards/fixtures/drag_collect_grid/theme_content_pack.fixture.json";
import themeNeon from "../../../gameplay/cards/fixtures/drag_collect_grid/theme_content_pack.neon.json";

const LAST_RESULT_KEY = "__LW_DRAG_DEMO_LAST_RESULT__";
const DEMO_CARD_ID = "drag_collect_grid";
const DEMO_SPEC_HASH = "drag_collect_grid:core_demo:v1_theme_skin";
const DEMO_RUNTIME_VERSION = "minigame_master.core.demo.drag_collect_grid";
window.Phaser = Phaser;

const THEME_PACKS = {
  void: themeVoid,
  orchard: themeVoid,
  default: themeVoid,
  wasteland: themeVoid,
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
  const key = String(q.get("theme") || q.get("skin") || "void").toLowerCase();
  const locale = q.get("locale") || q.get("lang") || "zh-CN";
  const pack = THEME_PACKS[key] || THEME_PACKS.void;
  const validation = validateThemeContentPack(pack);
  const resolver = new ThemeContentResolver(pack, locale);
  const themeApi = {
    themeKey: THEME_PACKS[key] ? key : "void",
    themeId: pack.themeId || key,
    locale,
    pack,
    validation,
    getText: (k, params, fallback) => resolver.getText(k, params, fallback),
    hudParts() {
      const raw = resolver.getText("level.hudLabels", {}, "HP|Time|Collected|Goal");
      const labels = String(raw || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        hp: labels[0] || "HP",
        time: labels[1] || "Time",
        collected: labels[2] || "Collected",
        goal: labels[3] || "Goal"
      };
    }
  };
  window.__LW_THEME__ = themeApi;
  window.__LW_DRAG_DEMO_META__ = {
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
  back: document.getElementById("lw-back")
};
const testStateNode = document.getElementById("lw-test-state");

function setControlMode(mode) {
  controls.start.hidden = mode !== "menu";
  controls.retreat.hidden = mode !== "run";
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

function readDemoDurationSec() {
  try {
    const n = Number(readQuery().get("durationSec") || readQuery().get("duration") || 40);
    if (Number.isFinite(n) && n >= 10 && n <= 3600) return Math.floor(n);
  } catch {
    /* ignore */
  }
  return 40;
}

function createDemoPayload() {
  const durationSec = readDemoDurationSec();
  const q = readQuery();
  const goalValue = Number(q.get("goalValue") || q.get("needAmount") || 8);
  const hazardRate = Number(q.get("hazardRate") || 0.25);
  return createNodePayload({
    nodeId: "drag_collect_grid_demo",
    nodeConfig: {
      title: theme.getText("level.title"),
      duration: durationSec,
      durationLimit: durationSec,
      goalValue,
      themeContentPack: theme.pack,
      locale: theme.locale,
      gameplay: {
        adapter: "phaser",
        cardId: DEMO_CARD_ID,
        knobs: {
          timeLimitSec: durationSec,
          durationSec,
          needAmount: goalValue,
          goalValue,
          spawnIntervalMs: 500,
          itemSpeed: 240,
          hazardRate,
          damageOnHit: 18,
          difficulty: 1,
          skipBoss: true,
          allowQuit: true,
          allowPause: true,
          artRuntimeMode: "prototype"
        }
      }
    },
    playerStats: { hp: 100 },
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x0c1220, 1);
    const title = theme.getText("level.title");
    const intro = theme.getText("level.intro");
    const hint = theme.getText("level.control_hint");
    this.add
      .text(width / 2, height * 0.28, title, {
        fontSize: "34px",
        color: "#ecfdf5",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 48 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.38, intro, {
        fontSize: "16px",
        color: "#6ee7b7",
        align: "center",
        wordWrap: { width: width - 64 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.48, hint, {
        fontSize: "14px",
        color: "#a7f3d0",
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
          color: lastResult.success ? "#6ee7b7" : "#fda4af"
        })
        .setOrigin(0.5);
    }
    setControlMode("menu");
    writeTestState({
      mode: "menu",
      status: "idle",
      hasLastResult: Boolean(lastResult),
      title,
      intro,
      controlHint: hint
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x111827, 1);
    this.hudLabels = theme.hudParts();
    this.hud = this.add
      .text(16, 14, "", { fontSize: "18px", color: "#e2e8f0" })
      .setDepth(50);
    this.objective = this.add
      .text(16, 72, theme.getText("level.objective"), {
        fontSize: "13px",
        color: "#94a3b8",
        wordWrap: { width: width - 32 }
      })
      .setDepth(50);

    this.testHooks = new TestHooks();
    this.adapter = new CollectDodgeAdapter({
      Phaser,
      testHooks: this.testHooks,
      onEnd: (result) => this.showResult(result)
    });
    this.adapter.init(createDemoPayload()).create(this);
    window.__LW_DRAG_DEMO__ = this.adapter;
    writeTestState({
      mode: "run",
      status: this.adapter.status,
      nodeId: this.adapter.payload.nodeId,
      objective: theme.getText("level.objective"),
      goalValue: this.adapter.config.goalValue
    });
    setControlMode("run");
    controls.retreat.onclick = () => this.adapter.retreat();
    this.events.once("shutdown", () => this.adapter?.destroy());
  }
  update(time, delta) {
    this.adapter?.update(time, delta);
    const state = this.adapter?.getTestState();
    if (!state) return;
    const h = this.hudLabels;
    this.hud.setText([
      `${h.hp} ${state.hp}`,
      `${h.time} ${state.timer}`,
      `${h.collected} ${state.score}`,
      `${h.goal} ${this.adapter.config.goalValue}`
    ]);
    writeTestState({
      mode: state.status === "ended" ? "result" : "run",
      status: state.status,
      hp: state.hp,
      timer: state.timer,
      score: state.score,
      bossSpawned: state.bossSpawned,
      spawnedTotal: state.spawnedTotal
    });
  }
  showResult(result) {
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
      rewards: result.rewards
    });
    const { width, height } = this.scale;
    this.add
      .rectangle(width / 2, height / 2, Math.min(width - 40, 420), 220, 0x0f172a, 0.94)
      .setStrokeStyle(2, result.success ? 0x34d399 : 0xf43f5e)
      .setDepth(100);
    this.add
      .text(width / 2, height / 2 - 58, headline, {
        fontSize: "28px",
        color: result.success ? "#6ee7b7" : "#fda4af",
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
    controls.back.onclick = () => this.scene.start("MenuScene", { lastResult: result });
  }
}

// eslint-disable-next-line no-new
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#0c1220",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, RunScene]
});
writeTestState({ mode: "boot", status: "idle" });
