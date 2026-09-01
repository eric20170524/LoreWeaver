#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyAtlasRecipeCandidate } from "../lib/legacy-asset-recipe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACE = path.join(ROOT, "data/workspaces/20260611-060754-719406");

function assert(value, message) {
  if (!value) throw new Error(message);
}
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const beforeCandidate = path.join(WORKSPACE, "assets/imagegen/asset-recipe.candidate.json");
const existedBefore = fs.existsSync(beforeCandidate);
const migrated = buildLegacyAtlasRecipeCandidate({
  workspaceDir: WORKSPACE,
  repoRoot: ROOT,
  recipeId: "campaign-atlas-legacy-migration"
});
const recipe = migrated.recipe;
assert(recipe.status === "candidate", "legacy migration must never auto-claim verified/promoted");
assert(migrated.validation.valid, JSON.stringify(migrated.validation));
assert(migrated.validation.promotable === false, "legacy candidate cannot be promoted without new evidence");
assert(migrated.validation.warnings.some((warning) => warning.startsWith("candidate_verification_incomplete")), "missing verification remains visible");
assert(recipe.source.rawArtifacts.length >= 2, "real raw source files must be discovered");
assert(recipe.source.rawArtifacts.every((artifact) => /^[0-9a-f]{64}$/.test(artifact.sha256)), "raw source SHA-256 values must be computed");
assert(recipe.operations.length === 1 && recipe.operations[0].parameters.migrationOnly === true, "operation reconstruction must be marked migration-only");
assert(recipe.outputs.finalAssets.length === 1, "legacy migration records the selected atlas output only");
const finalAsset = recipe.outputs.finalAssets[0];
const actualAtlas = path.join(WORKSPACE, "assets/imagegen/atlas.png");
assert(finalAsset.sha256 === sha256File(actualAtlas), "final atlas hash must bind actual bytes");
assert(finalAsset.bytes === fs.statSync(actualAtlas).size, "final atlas size must bind actual bytes");
assert(finalAsset.usedByRuntime === true && finalAsset.usageRefs.length >= 2, "manifest runtime usage must be recorded");
assert(migrated.sourceSummary.frameCount > 0, "legacy manifest frame inventory must be retained");
assert(fs.existsSync(beforeCandidate) === existedBefore, "pure migration builder performs zero file writes");

// A final atlas cannot be used as its own source when source history is absent.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lw-asset-recipe-missing-source-"));
const imagegen = path.join(temp, "assets/imagegen");
fs.mkdirSync(imagegen, { recursive: true });
fs.writeFileSync(path.join(imagegen, "atlas.png"), "fake-atlas");
fs.writeFileSync(path.join(imagegen, "manifest.json"), JSON.stringify({ atlasImage: "assets/imagegen/atlas.png", frames: {} }));
fs.writeFileSync(path.join(imagegen, "provenance.json"), JSON.stringify({ provider: "legacy", license: "unknown" }));
let missingSourceBlocked = false;
try {
  buildLegacyAtlasRecipeCandidate({ workspaceDir: temp, repoRoot: temp });
} catch (error) {
  missingSourceBlocked = String(error.message || error).includes("requires at least one raw source artifact");
}
assert(missingSourceBlocked, "migration must fail rather than fabricate source provenance");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.legacy-asset-recipe-check.v1",
  status: "passed",
  recipeId: recipe.id,
  rawSourceCount: recipe.source.rawArtifacts.length,
  frameCount: migrated.sourceSummary.frameCount,
  atlasSha256: finalAsset.sha256,
  checks: [
    "real_source_and_atlas_hashes_are_computed",
    "manifest_runtime_usage_is_recorded",
    "operation_reconstruction_is_marked_migration_only",
    "legacy_output_remains_non_promotable_candidate",
    "pure_builder_performs_zero_writes",
    "missing_source_history_fails_closed"
  ]
}, null, 2));
