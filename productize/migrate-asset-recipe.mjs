#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyAtlasRecipeCandidate } from "./lib/legacy-asset-recipe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACES_ROOT = path.join(ROOT, "data", "workspaces");
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

function output(payload, code = 0) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(code);
}
function safeWorkspaceId(value) {
  return /^[A-Za-z0-9._-]+$/.test(value || "") && value !== "." && value !== "..";
}

const workspaceId = String(valueArg("--workspace-id") || "").trim();
const outputArg = valueArg("--output");
const recipeId = valueArg("--recipe-id");
const dryRun = args.includes("--dry-run");
if (!safeWorkspaceId(workspaceId)) {
  output({ status: "blocked", reason: "invalid_workspace_id" }, 2);
}
const workspace = path.join(WORKSPACES_ROOT, workspaceId);
if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
  output({ status: "blocked", reason: "workspace_not_found", workspaceId }, 2);
}

try {
  const result = buildLegacyAtlasRecipeCandidate({
    workspaceDir: workspace,
    repoRoot: ROOT,
    recipeId
  });
  const outputPath = outputArg
    ? path.resolve(ROOT, outputArg)
    : path.join(workspace, "assets", "imagegen", "asset-recipe.candidate.json");
  const workspacePrefix = `${workspace}${path.sep}`;
  if (!`${outputPath}${path.sep}`.startsWith(workspacePrefix)) {
    output({ status: "blocked", reason: "output_must_remain_inside_workspace", output: outputArg || null }, 2);
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result.recipe, null, 2)}\n`);
  }
  output({
    schemaVersion: "loreweaver.asset-recipe-migration-result.v1",
    status: "passed",
    dryRun,
    workspaceId,
    recipeId: result.recipe.id,
    recipeStatus: result.recipe.status,
    promotable: result.validation.promotable,
    warnings: result.validation.warnings,
    sourceSummary: result.sourceSummary,
    output: path.relative(ROOT, outputPath).split(path.sep).join("/")
  });
} catch (error) {
  output({
    schemaVersion: "loreweaver.asset-recipe-migration-result.v1",
    status: "blocked",
    workspaceId,
    reason: "legacy_asset_recipe_migration_failed",
    error: error?.message || String(error)
  }, 2);
}
