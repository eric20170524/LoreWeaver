#!/usr/bin/env node
/**
 * LW-049 / LW-055: Machine-side final acceptance + evidence index.
 * Human playtest remains an explicit residual (sequenced last by human decision).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const wsRel = args.find((a) => a.startsWith("--workspace="))?.split("=")[1];

if (!wsRel) {
  console.error("Error: Missing --workspace parameter. Usage: node productize/final-acceptance-package.mjs --workspace=<path_to_workspace>");
  process.exit(1);
}

const WS = path.resolve(LORE_ROOT, wsRel);
if (!fs.existsSync(WS)) {
  console.error(`Error: Workspace path does not exist: ${WS}`);
  process.exit(1);
}

const now = new Date().toISOString();

function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

const maturity = readJson(path.join(WS, "reports/maturity_score_latest.json"), {});
const fullQa = readJson(path.join(WS, "reports/full_qa_latest.json"), {});
const exportSmoke = readJson(path.join(WS, "reports/export_smoke_latest.json"), {});
const cold = readJson(path.join(LORE_ROOT, "productize/coldstart/latest.json"), {});
const coreCheck = readJson(path.join(LORE_ROOT, "minigame_master/capabilities/reports/campaign_core_check_latest.json"), {});
const cardVal = readJson(path.join(LORE_ROOT, "minigame_master/capabilities/reports/gameplay_card_validate_latest.json"), {});
const assetJob = readJson(path.join(LORE_ROOT, "minigame_master/capabilities/reports/asset_job_latest.json"), {});
const patch = readJson(path.join(LORE_ROOT, "minigame_master/capabilities/reports/source_patch_latest.json"), {});

const gameScore = maturity?.assessment?.scoreAfterHardCaps ?? maturity?.gate?.score ?? null;
const hardCaps = (maturity?.hardCaps || []).filter((c) => c.active).map((c) => c.id);
const missing = (maturity?.missingEvidence || []).map((m) => m.id);

const machineAcceptance = {
  schemaVersion: "loreweaver.final-acceptance.v1",
  gate: "game_final_acceptance_machine",
  status: gameScore >= 90 && hardCaps.length === 0 && fullQa.status === "passed" && exportSmoke.status === "passed"
    ? "machine_ready"
    : "failed",
  createdAt: now,
  game: {
    workspace: path.relative(LORE_ROOT, WS).split(path.sep).join("/"),
    score: gameScore,
    hardCapsActive: hardCaps,
    missingEvidence: missing,
    fullQa: fullQa.status || "missing",
    exportSmoke: exportSmoke.status || "missing"
  },
  humanPlaytest: {
    required: true,
    deferredByPolicy: true,
    policy: "真人体验放最后，所有关卡完成后",
    artifact: "reports/human_playtest_latest.json",
    status: fs.existsSync(path.join(WS, "reports/human_playtest_latest.json")) ? "present" : "missing"
  },
  residualRisk: [
    "maturity:gate remains blocked until human_playtest evidence exists",
    "physical device thermal/haptic confirmation still desirable"
  ]
};

const loreweaverScore = {
  schemaVersion: "loreweaver.tool-maturity.v1",
  status: "passed",
  createdAt: now,
  score: 88,
  target: 85,
  dimensions: {
    core_extract: coreCheck.status === "passed" ? 20 : 0,
    compiler: cold?.status === "passed" ? 20 : 0,
    gameplay_card_v2: cardVal.status === "passed" ? 15 : 0,
    asset_jobs: assetJob.status === "passed" || assetJob.status === "pending_manual" ? 10 : 0,
    patch_workflow: patch.status === "passed" ? 10 : 0,
    export_pipeline: exportSmoke.status === "passed" ? 13 : 0,
    cold_start: cold?.status === "passed" ? 10 : 0
  },
  notes: "Machine-scored productization maturity for LW-050–054 artifacts."
};
loreweaverScore.score = Object.values(loreweaverScore.dimensions).reduce((a, b) => a + b, 0);
loreweaverScore.status = loreweaverScore.score >= 85 ? "passed" : "failed";

const evidenceIndex = {
  schemaVersion: "loreweaver.evidence-index.v1",
  createdAt: now,
  requirementId: "REQ-20260711-001",
  gameWorkspace: path.relative(LORE_ROOT, WS).split(path.sep).join("/"),
  coldStartWorkspace: cold?.path || null,
  artifacts: {
    maturity: `${path.relative(LORE_ROOT, WS).split(path.sep).join("/")}/reports/maturity_score_latest.json`,
    fullQa: `${path.relative(LORE_ROOT, WS).split(path.sep).join("/")}/reports/full_qa_latest.json`,
    exportSmoke: `${path.relative(LORE_ROOT, WS).split(path.sep).join("/")}/reports/export_smoke_latest.json`,
    exportStandalone: "minigame_master/capabilities/reports/export_standalone_latest.json",
    campaignCore: "minigame_master/capabilities/reports/campaign_core_check_latest.json",
    compile: "minigame_master/capabilities/reports/workspace_compile_latest.json",
    gameplayCard: "minigame_master/capabilities/reports/gameplay_card_validate_latest.json",
    assetJob: "minigame_master/capabilities/reports/asset_job_latest.json",
    sourcePatch: "minigame_master/capabilities/reports/source_patch_latest.json",
    machineAcceptance: "minigame_master/capabilities/reports/final_acceptance_machine_latest.json",
    loreweaverScore: "minigame_master/capabilities/reports/loreweaver_tool_maturity_latest.json"
  },
  taskCoverage: {
    "LW-048": fullQa.status === "passed" && exportSmoke.status === "passed",
    "LW-049": machineAcceptance.status === "machine_ready",
    "LW-050": coreCheck.status === "passed",
    "LW-051": cold?.status === "passed" && cardVal.status === "passed",
    "LW-052": (assetJob.status === "passed" || assetJob.status === "pending_manual") && patch.status === "passed",
    "LW-053": exportSmoke.status === "passed",
    "LW-054": cold?.status === "passed",
    "LW-055": true
  },
  humanGatesRemaining: ["human_playtest", "human_final_acceptance_confirm"]
};

fs.mkdirSync(path.join(LORE_ROOT, "minigame_master/capabilities/reports"), { recursive: true });
fs.writeFileSync(path.join(LORE_ROOT, "minigame_master/capabilities/reports/final_acceptance_machine_latest.json"), `${JSON.stringify(machineAcceptance, null, 2)}\n`);
fs.writeFileSync(path.join(LORE_ROOT, "minigame_master/capabilities/reports/loreweaver_tool_maturity_latest.json"), `${JSON.stringify(loreweaverScore, null, 2)}\n`);
fs.writeFileSync(path.join(LORE_ROOT, "minigame_master/capabilities/reports/evidence_index_latest.json"), `${JSON.stringify(evidenceIndex, null, 2)}\n`);
fs.writeFileSync(path.join(WS, "reports/final_acceptance_machine_latest.json"), `${JSON.stringify(machineAcceptance, null, 2)}\n`);

console.log(JSON.stringify({
  machineAcceptance: machineAcceptance.status,
  gameScore,
  loreweaverScore: loreweaverScore.score,
  humanPlaytest: machineAcceptance.humanPlaytest.status
}, null, 2));

if (machineAcceptance.status === "failed" || loreweaverScore.status === "failed") process.exit(1);
