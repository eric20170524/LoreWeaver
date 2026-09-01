#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeAssetRecipe } from "./lib/asset-operation-executor.mjs";
import { validateAssetRecipe } from "./lib/asset-recipe.mjs";
import {
  assetOperationCapabilitySnapshot,
  assertAssetOperationRegistryReady,
  createLoreWeaverAssetOperationHandlers
} from "./lib/asset-operation-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACES_ROOT = path.join(ROOT, "data/workspaces");
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

function fail(reason, extra = {}, code = 2) {
  console.log(JSON.stringify({
    schemaVersion: "loreweaver.asset-recipe-runner-result.v1",
    status: "failed",
    reason,
    ...extra
  }, null, 2));
  process.exit(code);
}
function safeWorkspaceId(value) {
  return /^[A-Za-z0-9._-]+$/.test(value || "") && value !== "." && value !== "..";
}
function resolveInside(root, relativePath, reason) {
  const raw = String(relativePath || "").trim();
  if (!raw || path.isAbsolute(raw)) fail(reason, { path: raw || null });
  const base = path.resolve(root);
  const resolved = path.resolve(base, raw);
  if (resolved === base || !resolved.startsWith(`${base}${path.sep}`)) fail(reason, { path: raw });
  return resolved;
}
function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("asset_recipe_not_object");
    return value;
  } catch (error) {
    fail("asset_recipe_read_failed", { error: error?.message || String(error) });
  }
}
function repoRelative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

async function main() {
  const workspaceId = String(valueArg("--workspace-id") || "").trim();
  const recipeRel = String(valueArg("--recipe") || "").trim();
  const reportRel = String(valueArg("--report") || "").trim();
  if (!safeWorkspaceId(workspaceId)) fail("invalid_workspace_id");
  if (!recipeRel) fail("asset_recipe_path_required");

  const workspace = path.join(WORKSPACES_ROOT, workspaceId);
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) fail("workspace_not_found");
  const recipePath = resolveInside(workspace, recipeRel, "asset_recipe_path_unsafe");
  if (path.extname(recipePath).toLowerCase() !== ".json" || !fs.existsSync(recipePath) || !fs.statSync(recipePath).isFile()) {
    fail("asset_recipe_json_missing", { recipe: recipeRel });
  }
  const recipe = readJson(recipePath);
  const validation = validateAssetRecipe(recipe);
  if (!validation.valid) {
    fail("asset_recipe_validation_failed", { validation });
  }

  const handlers = createLoreWeaverAssetOperationHandlers();
  let preflight;
  try {
    preflight = assertAssetOperationRegistryReady(recipe, handlers);
  } catch (error) {
    fail("asset_operation_preflight_blocked", {
      preflight: error?.preflight || null,
      capabilities: assetOperationCapabilitySnapshot(),
      error: error?.message || String(error)
    });
  }

  const defaultReport = `reports/asset_recipe_${String(recipe.id).replace(/[^A-Za-z0-9._-]+/g, "-")}_execution.json`;
  const requestedReport = reportRel || defaultReport;
  // Resolve before execution so an unsafe report path cannot be discovered after
  // operations have already written outputs.
  resolveInside(workspace, requestedReport, "asset_recipe_report_path_unsafe");

  const result = await executeAssetRecipe({
    recipe,
    workspaceDir: workspace,
    handlers,
    reportPath: requestedReport,
    enforceDeclaredFinalIdentity: true
  });
  console.log(JSON.stringify({
    schemaVersion: "loreweaver.asset-recipe-runner-result.v1",
    status: "passed",
    workspaceId,
    recipeId: recipe.id,
    recipe: repoRelative(recipePath),
    preflight,
    operationCount: result.operationCount,
    finalAssets: result.finalAssets,
    report: result.reportPath ? `${repoRelative(workspace)}/${result.reportPath}` : null,
    capabilities: assetOperationCapabilitySnapshot()
  }, null, 2));
}

main().catch((error) => fail("asset_recipe_execution_failed", {
  error: error?.stack || error?.message || String(error)
}));
