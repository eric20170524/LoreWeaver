import Phaser from "phaser";
import { SequenceSynthesisAdapter } from "../../lib/gameplay/sequence_synthesis/index.js";
import { createNodePayload, TestHooks } from "../../lib/contracts/index.js";
import {
  ThemeContentResolver,
  validateThemeContentPack
} from "../../lib/utils/ThemeContentResolver.js";
import themeAlchemy from "../../../gameplay/cards/fixtures/sequence_synthesis/theme_content_pack.fixture.json";
import themeNeon from "../../../gameplay/cards/fixtures/sequence_synthesis/theme_content_pack.neon.json";

const LAST_RESULT_KEY = "__LW_SEQ_DEMO_LAST_RESULT__";
const DEMO_CARD_ID = "sequence_synthesis";
const DEMO_SPEC_HASH = "sequence_synthesis:core_demo:v1_theme_skin";
const DEMO_RUNTIME_VERSION = "minigame_master.core.demo.sequence_synthesis";
window.Phaser = Phaser;

const THEME_PACKS = {
  alchemy: themeAlchemy,
  furnace: themeAlchemy,
  default: themeAlchemy,
  wasteland: themeAlchemy,
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
  const key = String(q.get("theme") || q.get("skin") || "alchemy").toLowerCase();
  const locale = q.get("locale") || q.get("lang") || "zh-CN";
  const pack = THEME_PACKS[key] || THEME_PACKS.alchemy;
  const validation = validateThemeContentPack(pack);
  const resolver = new ThemeContentResolver(pack, locale);
  const themeApi = {
    themeKey: THEME_PACKS[key] ? key : "alchemy",
    themeId: pack.themeId || key,
    locale,
    pack,
    validation,
    getText: (k, params, fallback) => resolver.getText(k, params, fallback),
    hudParts() {
      const raw = resolver.getText("level.hudLabels", {}, "Progress|Step|Mistakes|Time");
      const labels = String(raw || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        progress: labels[0] || "Progress",
        step: labels[1] || "Step",
        mistakes: labels[2] || "Mistakes",
        time: labels[3] || "Time"
      };
    }
  };
  window.__LW_THEME__ = themeApi;
  window.__LW_SEQ_DEMO_META__ = {
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

function createDemoPayload() {
  const q = readQuery();
  const recipeLength = Number(q.get("recipeLength") || 3);
  const pool = Number(q.get("materialPoolSize") || 5);
  return createNodePayload({
    nodeId: "sequence_synthesis_demo",
    nodeConfig: {
      title: theme.getText("level.title"),
      themeContentPack: theme.pack,
      locale: theme.locale,
      gameplay: {
        adapter: "phaser",
        cardId: DEMO_CARD_ID,
        knobs: {
          recipeLength,
          materialPoolSize: pool,
          wrongInputProgressPenalty: 25,
          explodeOnConsecutiveMistakes: 3,
          explodeFails: false,
          allowQuit: true,
          allowPause: true,
          artRuntimeMode: "prototype",
          runSeed: Number(q.get("seed") || 42),
          rewardTable: { score: 2 }
        }
      }
    },
    playerStats: { hp: 100 },
    runSeed: Number(q.get("seed") || 42),
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x120f0a, 1);
    const title = theme.getText("level.title");
    const intro = theme.getText("level.intro");
    const hint = theme.getText("level.control_hint");
    this.add
      .text(width / 2, height * 0.28, title, {
        fontSize: "34px",
        color: "#fef3c7",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 48 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.38, intro, {
        fontSize: "16px",
        color: "#fbbf24",
        align: "center",
        wordWrap: { width: width - 64 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.48, hint, {
        fontSize: "14px",
        color: "#fde68a",
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
          color: lastResult.success ? "#fbbf24" : "#fda4af"
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x1c1917, 1);
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
    this.adapter = new SequenceSynthesisAdapter({
      Phaser,
      testHooks: this.testHooks,
      onEnd: (result) => this.showResult(result)
    });
    this.adapter.init(createDemoPayload()).create(this);
    window.__LW_SEQ_DEMO__ = this.adapter;
    writeTestState({
      mode: "run",
      status: this.adapter.status,
      nodeId: this.adapter.payload.nodeId,
      objective: theme.getText("level.objective"),
      recipeLength: this.adapter.state.recipe.length,
      stepIndex: this.adapter.state.stepIndex
    });
    setControlMode("run");
    controls.retreat.onclick = () => this.adapter.retreat();
    this.events.once("shutdown", () => this.adapter?.destroy());
  }
  update(time, delta) {
    this.adapter?.update?.(time, delta);
    const state = this.adapter?.getTestState();
    if (!state) return;
    const h = this.hudLabels;
    this.hud.setText([
      `${h.progress} ${state.progress}`,
      `${h.step} ${state.stepIndex + 1}/${state.recipeLength}`,
      `${h.mistakes} ${state.mistakes}`,
      `${h.time} ${state.elapsedSeconds}`
    ]);
    writeTestState({
      mode: state.status === "ended" ? "result" : "run",
      status: state.status,
      hp: state.hp,
      timer: state.elapsedSeconds,
      score: state.score,
      progress: state.progress,
      stepIndex: state.stepIndex,
      recipeLength: state.recipeLength,
      mistakes: state.mistakes
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
      .setStrokeStyle(2, result.success ? 0xf59e0b : 0xf43f5e)
      .setDepth(100);
    this.add
      .text(width / 2, height / 2 - 58, headline, {
        fontSize: "28px",
        color: result.success ? "#fbbf24" : "#fda4af",
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
  backgroundColor: "#120f0a",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, RunScene]
});
writeTestState({ mode: "boot", status: "idle" });
