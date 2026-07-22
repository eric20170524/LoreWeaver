#!/usr/bin/env node
/**
 * Static check for minigame_master/core/lib and src/game/GameRunner.ts theme decoupling.
 * Verifies that executable core, adapters, and GameRunner do not contain hardcoded project/theme terms.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const SCAN_TARGETS = [
  path.join(LORE_ROOT, "minigame_master", "core", "lib"),
  path.join(LORE_ROOT, "src", "game", "GameRunner.ts")
];

// Comprehensive list of forbidden theme-specific terms
const FORBIDDEN_THEME_TERMS = [
  "灵气", "修仙", "劫雷", "法宝", "元神", "仙丹", 
  "妖兽", "斩妖", "魔教", "天劫", "真气", "大道", 
  "灵石", "九天", "功法", "心魔", "修士", "煞气",
  "雷劫", "灵瓶", "玉佩", "丹药", "机缘", "境界",
  "修真", "天道", "造化", "功德", "参透", "奇珍",
  "灵珠", "御煞", "符文", "炼制", "修为", "仙途"
];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const violations = [];

  lines.forEach((line, idx) => {
    // Ignore pure single-line comments or docstrings
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;

    for (const term of FORBIDDEN_THEME_TERMS) {
      if (line.includes(term)) {
        violations.push({
          line: idx + 1,
          term,
          content: line.trim()
        });
      }
    }
  });

  return violations;
}

function walkDirOrFile(targetPath) {
  let results = [];
  if (!fs.existsSync(targetPath)) return results;

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    const violations = checkFile(targetPath);
    if (violations.length > 0) {
      results.push({ file: path.relative(LORE_ROOT, targetPath), violations });
    }
    return results;
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDirOrFile(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".ts"))) {
      const violations = checkFile(fullPath);
      if (violations.length > 0) {
        results.push({ file: path.relative(LORE_ROOT, fullPath), violations });
      }
    }
  }

  return results;
}

function main() {
  console.log("Running Core & GameRunner Theme Decoupling Static Audit...");
  let allIssues = [];

  for (const target of SCAN_TARGETS) {
    allIssues = allIssues.concat(walkDirOrFile(target));
  }

  if (allIssues.length === 0) {
    console.log("PASSED: minigame_master/core/lib and GameRunner.ts are 100% theme-decoupled (zero hardcoded theme terms found).");
    process.exit(0);
  } else {
    console.error(`FAILED: Found ${allIssues.length} files with hardcoded theme-specific terms:`);
    for (const item of allIssues) {
      console.error(`\nFile: ${item.file}`);
      for (const v of item.violations) {
        console.error(`  L${v.line}: Term '${v.term}' -> "${v.content}"`);
      }
    }
    process.exit(1);
  }
}

main();
