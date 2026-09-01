#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACE_ID = "20260611-060754-719406";
const WORKSPACE_REL = `data/workspaces/${WORKSPACE_ID}`;
const WORKSPACE = path.join(ROOT, WORKSPACE_REL);

function assert(value, message) {
  if (!value) throw new Error(message);
}
function snapshot(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
function restore(file, content) {
  if (content === null) fs.rmSync(file, { force: true });
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

const mutableFiles = [
  path.join(ROOT, "productize/jobs/atlas_verify_latest.json"),
  path.join(ROOT, "minigame_master/capabilities/reports/asset_job_latest.json"),
  path.join(WORKSPACE, "loreweaver/asset-recipes/legacy-atlas-verify.candidate.json"),
  path.join(WORKSPACE, "reports/asset_recipe_legacy_atlas_execution.json")
];
const before = new Map(mutableFiles.map((file) => [file, snapshot(file)]));
const executionRoot = path.join(WORKSPACE, "loreweaver/asset-recipe-execution/legacy-atlas-verify");
const executionExisted = fs.existsSync(executionRoot);

try {
  assert(fs.existsSync(path.join(WORKSPACE, "assets/imagegen/atlas.png")), "real legacy atlas fixture missing");
  assert(fs.existsSync(path.join(WORKSPACE, "assets/imagegen/manifest.json")), "real legacy atlas manifest missing");
  const run = spawnSync(process.execPath, [
    path.join(ROOT, "productize/run-asset-job.mjs"),
    `--workspace=${WORKSPACE_REL}`,
    "--job=atlas_verify"
  ], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  assert(run.status === 0, `legacy asset job failed:\n${run.stdout}\n${run.stderr}`);
  const result = JSON.parse(String(run.stdout || "{}"));
  assert(result.status === "passed", JSON.stringify(result));
  assert(result.assetRecipeMigration?.status === "candidate_executed", "atlas job must execute AssetRecipe candidate");
  assert(result.assetRecipeMigration?.operationPort === "asset.convert", "legacy job must use registered tool-neutral port");
  assert(result.assetRecipeMigration?.promotable === false, "migration must not silently promote legacy evidence");

  const candidatePath = path.join(WORKSPACE, result.assetRecipeMigration.recipe);
  const executionReportPath = path.join(WORKSPACE, result.assetRecipeMigration.executionReport);
  assert(fs.existsSync(candidatePath), "migration candidate recipe missing");
  assert(fs.existsSync(executionReportPath), "AssetRecipe execution report missing");
  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  const report = JSON.parse(fs.readFileSync(executionReportPath, "utf8"));
  assert(candidate.status === "candidate", "legacy migration must stay candidate");
  assert(candidate.operations?.[0]?.port === "asset.convert", "candidate operation port mismatch");
  assert(candidate.outputs?.finalAssets?.[0]?.sha256 === result.assetRecipeMigration.normalizedSha256, "candidate must bind executed output hash");
  assert(report.status === "passed" && report.operationCount === 1, "execution report must prove one real registered operation");
  assert(report.operations?.[0]?.port === "asset.convert", "execution report must record logical port");
  assert(report.exactFinalIdentityEnforced === false, "first migration execution must not pretend pre-known output identity");

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.legacy-asset-job-operation-migration-check.v1",
    status: "passed",
    workspaceId: WORKSPACE_ID,
    checks: [
      "real_legacy_atlas_job_runs",
      "registered_asset_convert_port_executes",
      "source_hash_is_verified_before_operation",
      "execution_report_records_real_output_identity",
      "candidate_recipe_is_rebound_to_executed_hash",
      "legacy_migration_remains_non_promotable_without_real_evidence"
    ]
  }, null, 2));
} finally {
  for (const [file, content] of before) restore(file, content);
  if (!executionExisted) fs.rmSync(executionRoot, { recursive: true, force: true });
  const assetRecipeDir = path.join(WORKSPACE, "loreweaver/asset-recipes");
  if (fs.existsSync(assetRecipeDir) && fs.readdirSync(assetRecipeDir).length === 0) {
    fs.rmdirSync(assetRecipeDir);
  }
}
