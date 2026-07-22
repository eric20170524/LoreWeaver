#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modPath = path.join(root, "minigame_master/core/lib/gameplay/campaign/index.js");
const mod = await import(pathToFileURL(modPath).href);

const contract = mod.createLevelContract({
  nodeId: 1,
  durationSeconds: 90,
  victoryMode: mod.VICTORY_MODES.SURVIVE,
  beats: [{ id: "intro", kind: "intro", atSecond: 2, spawns: [{ enemyType: "foe", count: 1 }] }]
});
const validation = mod.validateLevelContract(contract);
assert.equal(validation.valid, true, validation.reasons.join("; "));
assert.ok(mod.GAME_FEEL_LIMITS.hitStopMsMax >= 90);
assert.equal(mod.particleQuantity(20) <= 18, true);
assert.ok(!JSON.stringify(mod).includes("shihao"));
assert.ok(!JSON.stringify(contract).includes("荒域"));

const out = {
  schemaVersion: "loreweaver.campaign-core-check.v1",
  status: "passed",
  createdAt: new Date().toISOString(),
  module: "minigame_master/core/lib/gameplay/campaign",
  assertions: ["level_contract_valid", "game_feel_limits", "theme_agnostic"]
};
const reportPath = path.join(root, "minigame_master/capabilities/reports/campaign_core_check_latest.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(out, null, 2)}\n`);
console.log("Campaign core check passed:", reportPath);
