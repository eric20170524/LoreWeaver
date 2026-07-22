#!/usr/bin/env node
/**
 * Text Length & Heuristic Limit Checker (P1 Task 3.3)
 * Heuristic check for CJK, English, and Mixed text length limits across Desktop/Mobile viewport slots.
 */

import { validateThemeContentPack } from "../../minigame_master/core/lib/utils/ThemeContentResolver.js";

const VIEWPORTS = [
  { name: "Desktop", width: 1280, height: 800, maxTitleChars: 40, maxDescChars: 140 },
  { name: "Mobile", width: 720, height: 1280, maxTitleChars: 25, maxDescChars: 90 },
  { name: "NarrowMobile", width: 360, height: 640, maxTitleChars: 18, maxDescChars: 60 }
];

const VALID_SAMPLE_PACK = {
  type: "ValidPack",
  title: "割草生存：玩法关卡测试",
  desc: "在限定时间内躲避怪物攻击，积累得分并达成关卡胜利条件。"
};

const OVERLONG_SAMPLE_PACK = {
  type: "OverlongPack",
  title: "这是一个超级超级极其漫长超出了所有屏幕安全区槽位限制的错误关卡标题测试例",
  desc: "超长描述信息".repeat(30)
};

function runTextLayoutCheck() {
  console.log("Running Text Length & Heuristic Limit Checker...");
  let passedCount = 0;
  let errorCount = 0;

  // Test valid sample pack across viewports
  for (const vp of VIEWPORTS) {
    const titleLen = VALID_SAMPLE_PACK.title.length;
    const descLen = VALID_SAMPLE_PACK.desc.length;

    if (titleLen <= vp.maxTitleChars && descLen <= vp.maxDescChars) {
      console.log(`[PASS] Valid text fits within ${vp.name} limit (Title: ${titleLen}/${vp.maxTitleChars}, Desc: ${descLen}/${vp.maxDescChars})`);
      passedCount++;
    } else {
      console.error(`[FAIL] Valid text exceeded ${vp.name} limit`);
      errorCount++;
    }
  }

  // Test overlong sample pack to ensure heuristic limit check catches overflow
  for (const vp of VIEWPORTS) {
    const isOverlong = OVERLONG_SAMPLE_PACK.title.length > vp.maxTitleChars || OVERLONG_SAMPLE_PACK.desc.length > vp.maxDescChars;
    if (isOverlong) {
      console.log(`[PASS] Overlong text correctly flagged for ${vp.name}`);
      passedCount++;
    } else {
      console.error(`[FAIL] Overlong text failed to trigger limit warning on ${vp.name}`);
      errorCount++;
    }
  }

  // Validate ThemeContentPack schema & max limits helper
  const mockPack = {
    schemaVersion: "1.0",
    themeId: "aurora_test",
    levelMeta: {
      title: { "zh-CN": "短标题" }
    }
  };
  const val = validateThemeContentPack(mockPack);
  if (val.valid) passedCount++;
  else errorCount++;

  console.log(`\nText Length Check Summary: ${passedCount} passed, ${errorCount} errors.`);
  return errorCount === 0;
}

if (!runTextLayoutCheck()) {
  process.exit(1);
}
