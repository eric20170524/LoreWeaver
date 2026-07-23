/**
 * ThemeContentResolver.js
 * Core runtime copy contract resolver.
 * Fully dethemed fallback guarantees data-driven text rendering without hardcoded theme strings.
 */

const GENERIC_FALLBACKS = {
  "zh-CN": {
    "level.title": "关卡挑战",
    "level.intro": "完成本关目标",
    "level.objective": "达成通关要求",
    "level.control_hint": "方向键/拖拽移动，点击操作",
    "level.hud.score": "得分",
    "level.hud.hp": "生命值",
    "level.hud.time": "剩余时间",
    "level.hud.wave": "波次",
    "level.victory": "挑战成功",
    "level.failure": "挑战失败",
    "level.retreat": "撤退结算",
    "entity.player": "操作角色",
    "entity.enemy": "目标单位",
    "entity.boss": "首领单位",
    "entity.pickup": "目标道具",
    "entity.material": "合成材料"
  },
  "en-US": {
    "level.title": "Level Trial",
    "level.intro": "Complete level objective",
    "level.objective": "Fulfill win condition",
    "level.control_hint": "Use arrow keys / touch to move",
    "level.hud.score": "Score",
    "level.hud.hp": "HP",
    "level.hud.time": "Time",
    "level.hud.wave": "Wave",
    "level.victory": "Victory",
    "level.failure": "Defeat",
    "level.retreat": "Retreated",
    "entity.player": "Player",
    "entity.enemy": "Target Entity",
    "entity.boss": "Boss Unit",
    "entity.pickup": "Pickup Item",
    "entity.material": "Material"
  }
};

export class ThemeContentResolver {
  constructor(contentPack = null, locale = "zh-CN") {
    this.contentPack = contentPack || {};
    this.locale = locale;
    this.fallbackLocale = contentPack?.defaultLocale || "zh-CN";
  }

  /**
   * Resolve copy by key path or explicit fallback
   * @param {string} key 
   * @param {Record<string, any>} params 
   * @param {string} defaultText 
   */
  getText(key, params = {}, defaultText = null) {
    let raw = this.lookupKey(key);

    if (!raw && defaultText != null) {
      raw = defaultText;
    }

    if (!raw) {
      raw = GENERIC_FALLBACKS[this.locale]?.[key] || 
            GENERIC_FALLBACKS[this.fallbackLocale]?.[key] || 
            GENERIC_FALLBACKS["zh-CN"]?.[key] || key;
    }

    return this.interpolate(raw, params);
  }

  lookupKey(key) {
    if (!this.contentPack) return null;
    const parts = key.split(".");
    
    // Check copyKeys first
    if (this.contentPack.copyKeys && this.contentPack.copyKeys[key]) {
      const val = this.contentPack.copyKeys[key];
      if (typeof val === "object") {
        return val[this.locale] || val[this.fallbackLocale] || Object.values(val)[0];
      }
      return val;
    }

    // Check levelMeta (schema fields + short aliases)
    if (parts[0] === "level" && this.contentPack.levelMeta) {
      const aliases = {
        objective: "objectiveText",
        control_hint: "controlHints",
        controlHints: "controlHints",
        victory: "victoryText",
        failure: "failureText",
        retreat: "retreatText",
        hudLabels: "hudLabels"
      };
      const field = aliases[parts[1]] || parts[1];
      const obj = this.contentPack.levelMeta[field];
      if (obj && typeof obj === "object") {
        return obj[this.locale] || obj[this.fallbackLocale] || Object.values(obj)[0];
      }
    }

    // Check entities: entity.player | entity.enemies.mob | entity.bosses.boss
    if (parts[0] === "entity" && this.contentPack.entities) {
      const cat = parts[1];
      let obj = this.contentPack.entities[cat];
      if (obj && parts.length >= 3 && typeof obj === "object" && !obj[this.locale] && !obj[this.fallbackLocale]) {
        // Nested kind map: entities.enemies.mob
        obj = obj[parts[2]];
      }
      if (obj && typeof obj === "object") {
        return obj[this.locale] || obj[this.fallbackLocale] || Object.values(obj)[0];
      }
      if (typeof obj === "string") return obj;
    }

    return null;
  }

  interpolate(str, params) {
    if (typeof str !== "string") return String(str || "");
    return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  }
}

/**
 * Validate Theme Content Pack structure & limits
 */
export function validateThemeContentPack(pack) {
  const errors = [];
  if (!pack) return { valid: true, errors: [] };

  if (pack.schemaVersion && pack.schemaVersion !== "1.0") {
    errors.push("schemaVersion must be 1.0");
  }

  // Max length check for text slots
  const MAX_SLOT_LENGTHS = {
    title: 32,
    control_hint: 64,
    hud: 16
  };

  if (pack.levelMeta?.title) {
    for (const [loc, val] of Object.entries(pack.levelMeta.title)) {
      if (typeof val === "string" && val.length > MAX_SLOT_LENGTHS.title) {
        errors.push(`title in ${loc} exceeds max length ${MAX_SLOT_LENGTHS.title}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
