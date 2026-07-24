import Phaser from "phaser";
import { createNodePayload, TestHooks } from "../../lib/contracts/index.js";
import {
  ThemeContentResolver,
  validateThemeContentPack
} from "../../lib/utils/ThemeContentResolver.js";
import { ReactionPickAdapter } from "../../lib/gameplay/reaction_pick/index.js";
import { EnergyBalanceAdapter } from "../../lib/gameplay/energy_balance/index.js";
import { ObserveCaptureAdapter } from "../../lib/gameplay/observe_capture/index.js";
import { DragToCoreAdapter } from "../../lib/gameplay/drag_to_core/index.js";
import { PressureSurvivalAdapter } from "../../lib/gameplay/pressure_survival/index.js";

const ADAPTERS = {
  reaction_pick: ReactionPickAdapter,
  energy_balance: EnergyBalanceAdapter,
  observe_capture: ObserveCaptureAdapter,
  drag_to_core: DragToCoreAdapter,
  pressure_survival: PressureSurvivalAdapter
};

const LAST_RESULT_KEY = "__LW_LIGHT_DEMO_LAST_RESULT__";
window.Phaser = Phaser;

function readQuery() {
  try {
    return new URLSearchParams(window.location.search || "");
  } catch {
    return new URLSearchParams();
  }
}

function loadThemePack(cardId, themeKey) {
  // Built-in dual skins without per-card import paths
  const skins = {
    default: {
      schemaVersion: "1.0",
      themeId: `${cardId}_default`,
      locales: ["zh-CN", "en"],
      defaultLocale: "zh-CN",
      levelMeta: {
        title: { "zh-CN": cardId, en: cardId },
        intro: { "zh-CN": "轻量玩法演示", en: "Lightweight demo" },
        objectiveText: { "zh-CN": "完成关卡目标", en: "Complete the objective" },
        controlHints: { "zh-CN": "按提示操作", en: "Follow on-screen hints" },
        hudLabels: { "zh-CN": "生命|进度|分数|状态", en: "HP|Progress|Score|Status" },
        victoryText: { "zh-CN": "胜利", en: "Victory" },
        failureText: { "zh-CN": "失败", en: "Defeat" },
        retreatText: { "zh-CN": "撤退", en: "Retreated" }
      },
      entities: {
        player: { "zh-CN": "玩家", en: "Player" },
        enemies: { mob: { "zh-CN": "目标", en: "Target" } },
        bosses: { boss: { "zh-CN": "首领", en: "Boss" } },
        pickups: { gem: { "zh-CN": "道具", en: "Item" } },
        skills: { act: { "zh-CN": "操作", en: "Action" } },
        statuses: { ok: { "zh-CN": "正常", en: "OK" } }
      },
      copyKeys: {}
    },
    neon: {
      schemaVersion: "1.0",
      themeId: `${cardId}_neon`,
      locales: ["zh-CN", "en"],
      defaultLocale: "zh-CN",
      levelMeta: {
        title: { "zh-CN": `${cardId}·霓虹`, en: `${cardId} Neon` },
        intro: { "zh-CN": "霓虹主题轻量演示", en: "Neon lightweight demo" },
        objectiveText: { "zh-CN": "完成关卡目标", en: "Complete the objective" },
        controlHints: { "zh-CN": "按提示操作", en: "Follow on-screen hints" },
        hudLabels: { "zh-CN": "护盾|进度|分数|状态", en: "Shield|Progress|Score|Status" },
        victoryText: { "zh-CN": "同步完成", en: "Synced" },
        failureText: { "zh-CN": "链路失败", en: "Link failed" },
        retreatText: { "zh-CN": "已断开", en: "Disconnected" }
      },
      entities: {
        player: { "zh-CN": "操作员", en: "Operator" },
        enemies: { mob: { "zh-CN": "噪声", en: "Noise" } },
        bosses: { boss: { "zh-CN": "核心", en: "Core" } },
        pickups: { gem: { "zh-CN": "数据", en: "Data" } },
        skills: { act: { "zh-CN": "执行", en: "Execute" } },
        statuses: { ok: { "zh-CN": "锁定", en: "Locked" } }
      },
      copyKeys: {}
    }
  };
  // Optional override from fixtures if present (sync import not used; runtime fetch skipped for offline E2E)
  return skins[themeKey] || skins.default;
}

function resolveCardId() {
  const q = readQuery();
  const id = String(q.get("card") || q.get("cardId") || "reaction_pick");
  if (!ADAPTERS[id]) return "reaction_pick";
  return id;
}

const DEMO_CARD_ID = resolveCardId();
const DEMO_SPEC_HASH = `${DEMO_CARD_ID}:core_demo:lightweight_v1`;
const DEMO_RUNTIME_VERSION = `minigame_master.core.demo.lightweight.${DEMO_CARD_ID}`;

function resolveTheme() {
  const q = readQuery();
  const key = String(q.get("theme") || "default").toLowerCase();
  const pack = loadThemePack(DEMO_CARD_ID, key === "neon" || key === "cyber" ? "neon" : "default");
  // Prefer fixture titles when query names match known fixtures — loadThemePack already generic
  const locale = q.get("locale") || "zh-CN";
  const validation = validateThemeContentPack(pack);
  const resolver = new ThemeContentResolver(pack, locale);
  const themeApi = {
    themeKey: key === "neon" || key === "cyber" ? "neon" : "default",
    themeId: pack.themeId,
    locale,
    pack,
    validation,
    getText: (k, params, fallback) => resolver.getText(k, params, fallback)
  };
  window.__LW_THEME__ = themeApi;
  window.__LW_LIGHT_DEMO_META__ = {
    cardId: DEMO_CARD_ID,
    specHash: DEMO_SPEC_HASH,
    runtimeVersion: DEMO_RUNTIME_VERSION,
    releaseEligible: false,
    themeKey: themeApi.themeKey,
    themeId: themeApi.themeId,
    locale,
    title: themeApi.getText("level.title"),
    victoryText: themeApi.getText("level.victory"),
    failureText: themeApi.getText("level.failure"),
    retreatText: themeApi.getText("level.retreat")
  };
  return themeApi;
}

const theme = resolveTheme();
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
    title: theme.getText("level.title"),
    ...previous,
    ...patch
  };
  testStateNode.textContent = JSON.stringify(next);
  Object.entries(next).forEach(([k, v]) => {
    if (typeof v !== "object") testStateNode.dataset[k] = String(v);
  });
  return next;
}

function parseKnobs() {
  const q = readQuery();
  const knobs = {};
  // Common overrides
  for (const [k, v] of q.entries()) {
    if (["card", "cardId", "theme", "skin", "locale", "lang"].includes(k)) continue;
    const n = Number(v);
    knobs[k] = Number.isFinite(n) && String(n) === v ? n : v;
  }
  // Card-friendly defaults for soak / cert
  if (DEMO_CARD_ID === "reaction_pick") {
    knobs.targetRounds = knobs.targetRounds ?? 4;
    knobs.lives = knobs.lives ?? 5;
  }
  if (DEMO_CARD_ID === "energy_balance") {
    knobs.targetStableSec = knobs.targetStableSec ?? 15;
    knobs.failViolationLimit = knobs.failViolationLimit ?? 12;
  }
  if (DEMO_CARD_ID === "drag_to_core") {
    knobs.fragCount = knobs.fragCount ?? 8;
    knobs.hazardCount = knobs.hazardCount ?? 2;
  }
  return knobs;
}

function createDemoPayload() {
  const knobs = parseKnobs();
  return createNodePayload({
    nodeId: `${DEMO_CARD_ID}_demo`,
    nodeConfig: {
      title: theme.getText("level.title"),
      themeContentPack: theme.pack,
      locale: theme.locale,
      gameplay: {
        adapter: "phaser",
        cardId: DEMO_CARD_ID,
        knobs: {
          allowQuit: true,
          allowPause: true,
          artRuntimeMode: "prototype",
          ...knobs
        }
      }
    },
    playerStats: { hp: 100 },
    source: { engine: "phaser", projectId: "core_demo_lightweight" }
  });
}

function createAdapter() {
  const Cls = ADAPTERS[DEMO_CARD_ID];
  return new Cls({
    Phaser,
    testHooks: new TestHooks(),
    onEnd: (result) => {
      const scene = window.__LW_LIGHT_RUN_SCENE__;
      scene?.showResult?.(result);
    }
  });
}

class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }
  create(data = {}) {
    const { width, height } = this.scale;
    const lastResult = data.lastResult || window[LAST_RESULT_KEY] || null;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1);
    const title = theme.getText("level.title");
    const intro = theme.getText("level.intro");
    this.add
      .text(width / 2, height * 0.28, title, {
        fontSize: "30px",
        color: "#f8fafc",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 48 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.38, intro, {
        fontSize: "15px",
        color: "#94a3b8",
        align: "center",
        wordWrap: { width: width - 64 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.48, `card=${DEMO_CARD_ID} · theme=${theme.themeKey}`, {
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
        .text(width / 2, height * 0.58, `${endLabel} · ${lastResult.reason}`, {
          fontSize: "16px",
          color: lastResult.success ? "#86efac" : "#fda4af"
        })
        .setOrigin(0.5);
    }
    setControlMode("menu");
    writeTestState({ mode: "menu", status: "idle", hasLastResult: Boolean(lastResult), title, intro });
    controls.start.onclick = () => this.scene.start("RunScene");
  }
}

class RunScene extends Phaser.Scene {
  constructor() {
    super("RunScene");
  }
  create() {
    window.__LW_LIGHT_RUN_SCENE__ = this;
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x111827, 1);
    this.hud = this.add.text(16, 14, "", { fontSize: "15px", color: "#e2e8f0" }).setDepth(50);
    this.adapter = createAdapter();
    this.adapter.init(createDemoPayload()).create(this);
    window.__LW_LIGHT_DEMO__ = this.adapter;
    writeTestState({
      mode: "run",
      status: this.adapter.status,
      nodeId: this.adapter.payload?.nodeId
    });
    setControlMode("run");
    controls.retreat.onclick = () => this.adapter.retreat?.();
    this.events.once("shutdown", () => this.adapter?.destroy?.());
  }
  update(time, delta) {
    this.adapter?.update?.(time, delta);
    const state = this.adapter?.getTestState?.() || {};
    this.hud.setText(
      [
        `card ${DEMO_CARD_ID}`,
        `status ${state.status}`,
        `hp ${state.hp ?? "-"}`,
        `score ${state.score ?? state.progress ?? "-"}`
      ].join("  |  ")
    );
    writeTestState({
      mode: state.status === "ended" ? "result" : "run",
      status: state.status,
      hp: state.hp,
      timer: state.timer ?? state.elapsedSeconds ?? state.elapsedSec ?? null,
      score: state.score ?? state.progress ?? 0,
      progress: state.progress
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
      .rectangle(width / 2, height / 2, Math.min(width - 40, 420), 200, 0x0f172a, 0.94)
      .setStrokeStyle(2, result.success ? 0x22c55e : 0xf43f5e)
      .setDepth(100);
    this.add
      .text(width / 2, height / 2 - 40, headline, {
        fontSize: "26px",
        color: result.success ? "#86efac" : "#fda4af",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(width / 2, height / 2 + 10, `${result.reason}`, {
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
  backgroundColor: "#0f172a",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, RunScene]
});
writeTestState({ mode: "boot", status: "idle" });
