#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  commitCapabilityPromotion,
  previewCapabilityPromotion
} from "./lib/capability-promotion-transaction.mjs";
import { validateVerticalSliceBlueprint } from "./lib/vertical-slice-blueprint.mjs";
import { validateCapabilityModuleDescriptor } from "./lib/capability-module.mjs";
import { validateAssetRecipe } from "./lib/asset-recipe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const arg = (name) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const mode = arg("--mode") || "preview";
const promotionPath = arg("--promotion");
const candidatePath = arg("--candidate");
const token = arg("--approval-token");

function fail(reason, detail = null, code = 2) {
  console.log(JSON.stringify({ status: "blocked", reason, detail }, null, 2));
  process.exit(code);
}
function resolveInput(value, label) {
  if (!value) fail(`${label}_required`);
  const file = path.resolve(ROOT, value);
  if (!`${file}${path.sep}`.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`${label}_missing_or_outside_repository`, value);
  }
  return file;
}
function readJson(file, label) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_must_be_object`);
    return value;
  } catch (error) {
    fail(`${label}_invalid_json`, error?.message || String(error));
  }
}
function repoRefExists(ref) {
  const raw = String(ref || "");
  if (!raw || path.isAbsolute(raw) || raw.split(/[\\/]+/).includes("..")) return false;
  const full = path.resolve(ROOT, raw);
  return `${full}${path.sep}`.startsWith(`${ROOT}${path.sep}`) && fs.existsSync(full);
}
function validateProductionContract(contract) {
  const errors = [];
  if (contract?.schemaVersion !== "loreweaver.production-contract.v1") errors.push("schema_version_invalid");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(contract?.id || ""))) errors.push("contract_id_invalid");
  if (!["planned", "verified", "promoted"].includes(contract?.status)) errors.push("contract_status_invalid");
  if (!Array.isArray(contract?.stages) || !contract.stages.length) errors.push("contract_stages_missing");
  const ids = new Set();
  for (const stage of contract?.stages || []) {
    if (!stage?.id || ids.has(stage.id)) errors.push(`stage_id_missing_or_duplicate:${stage?.id || "missing"}`);
    ids.add(stage?.id);
    if (!stage?.owner || !stage?.purpose) errors.push(`stage_owner_or_purpose_missing:${stage?.id || "unknown"}`);
    for (const ref of [...(stage?.implementationRefs || []), ...(stage?.validatorRefs || [])]) {
      if (!repoRefExists(ref)) errors.push(`stage_ref_missing_or_unsafe:${stage?.id || "unknown"}:${ref}`);
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}
function validatorFor(kind) {
  if (kind === "blueprint") return validateVerticalSliceBlueprint;
  if (kind === "capability_module") return validateCapabilityModuleDescriptor;
  if (kind === "asset_recipe") return validateAssetRecipe;
  if (kind === "production_contract") return validateProductionContract;
  fail("promotion_kind_unsupported", kind);
}

if (!["preview", "commit"].includes(mode)) fail("mode_must_be_preview_or_commit", mode);
const promotionFile = resolveInput(promotionPath, "promotion");
const candidateFile = resolveInput(candidatePath, "candidate");
const promotion = readJson(promotionFile, "promotion");
const candidateDocument = readJson(candidateFile, "candidate");
const validator = validatorFor(promotion.kind);

const result = mode === "preview"
  ? previewCapabilityPromotion({ promotion, candidateDocument, repositoryRoot: ROOT, validator })
  : commitCapabilityPromotion({
      promotion,
      candidateDocument,
      repositoryRoot: ROOT,
      validator,
      approvalToken: token
    });

console.log(JSON.stringify({
  ...result,
  input: {
    promotion: path.relative(ROOT, promotionFile).split(path.sep).join("/"),
    candidate: path.relative(ROOT, candidateFile).split(path.sep).join("/")
  }
}, null, 2));

if (result.status === "blocked") process.exit(2);
