/**
 * Lightweight Gameplay Cards eligible for horizontal production certification.
 * (Excludes heavy action: side_scrolling_brawler, platformers, etc.)
 */

export const LIGHTWEIGHT_CARDS = {
  reaction_pick: {
    cardId: "reaction_pick",
    adapterExport: "ReactionPickAdapter",
    adapterModule: "reaction_pick",
    title: { "zh-CN": "辨宝反应", en: "Reaction Pick" },
    intro: {
      "zh-CN": "在限时内找出正确目标道具。",
      en: "Pick the correct target before it vanishes."
    },
    knobs: { targetRounds: 4, lives: 5, showLifeMinSec: 2.2, showLifeMaxSec: 3.2 }
  },
  energy_balance: {
    cardId: "energy_balance",
    adapterExport: "EnergyBalanceAdapter",
    adapterModule: "energy_balance",
    title: { "zh-CN": "能量平衡", en: "Energy Balance" },
    intro: {
      "zh-CN": "拖动元素球维持能量指针在安全区。",
      en: "Drag orbs to keep the energy pointer in the safe zone."
    },
    knobs: {
      targetStableSec: 12,
      failOverWarn: 8,
      failViolationLimit: 8,
      orbSpawnMinSec: 1.0,
      orbSpawnMaxSec: 1.8
    }
  },
  observe_capture: {
    cardId: "observe_capture",
    adapterExport: "ObserveCaptureAdapter",
    adapterModule: "observe_capture",
    title: { "zh-CN": "观形捕捉", en: "Observe Capture" },
    intro: {
      "zh-CN": "目标停顿时点击捕捉，积满进度。",
      en: "Click when the target pauses to capture progress."
    },
    knobs: {
      targetProgress: 100,
      captureGain: 25,
      missPenalty: 10,
      pauseWindowSec: 0.7
    }
  },
  drag_to_core: {
    cardId: "drag_to_core",
    adapterExport: "DragToCoreAdapter",
    adapterModule: "drag_to_core",
    title: { "zh-CN": "碎片归核", en: "Drag to Core" },
    intro: {
      "zh-CN": "把碎片拖入核心，避开危险体。",
      en: "Drag fragments into the core; avoid hazards."
    },
    knobs: { fragCount: 8, hazardCount: 2, hazardSpeed: 70, hazardPenalty: 10 }
  },
  pressure_survival: {
    cardId: "pressure_survival",
    adapterExport: "PressureSurvivalAdapter",
    adapterModule: "pressure_survival",
    title: { "zh-CN": "压力生存", en: "Pressure Survival" },
    intro: {
      "zh-CN": "在压力上升中撑到目标时间。",
      en: "Survive rising pressure until the timer goal."
    },
    knobs: {}
  }
};

export function listLightweightCardIds() {
  return Object.keys(LIGHTWEIGHT_CARDS);
}

export function getLightweightCard(cardId) {
  return LIGHTWEIGHT_CARDS[cardId] || null;
}
