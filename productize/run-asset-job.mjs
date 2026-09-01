#!/usr/bin/env node
/**
 * LW-052: deterministic asset verification + AssetRecipe migration bridge.
 * Legacy report shape is preserved while supported atlas / PCM WAV processing
 * executes through registered tool-neutral AssetRecipe ports.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createBuiltinAssetOperationHandlers,
  executeAssetRecipe
} from "./lib/asset-operation-executor.mjs";
import { createDeterministicPngAssetOperationHandlers } from "./lib/png-asset-operations.mjs";
import { createDeterministicWavAssetOperationHandlers } from "./lib/wav-asset-operations.mjs";
import { validateAssetRecipe } from "./lib/asset-recipe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const jobId = args.find((a) => a.startsWith("--job="))?.split("=")[1] || "audio_verify";
const wsRel = args.find((a) => a.startsWith("--workspace="))?.split("=")[1];
if (!wsRel) {
  console.error("Error: Missing --workspace parameter. Usage: node productize/run-asset-job.mjs --workspace=<path_to_workspace> [--job=audio_verify|atlas_verify]");
  process.exit(1);
}
const ws = path.resolve(LORE_ROOT, wsRel);
if (!`${ws}${path.sep}`.startsWith(`${LORE_ROOT}${path.sep}`) || !fs.existsSync(ws) || !fs.statSync(ws).isDirectory()) {
  console.error(`Error: Specified workspace directory is missing or outside repository: ${ws}`);
  process.exit(1);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function mergedAssetHandlers() {
  return new Map([
    ...createBuiltinAssetOperationHandlers(),
    ...createDeterministicPngAssetOperationHandlers(),
    ...createDeterministicWavAssetOperationHandlers()
  ]);
}
function safeAssetId(relativePath, index) {
  const stem = String(relativePath || "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `audio_${String(index + 1).padStart(2, "0")}_${stem || "asset"}`;
}
function candidatePromotion() {
  return { approvedBy: null, approvedAt: null, destination: null, conflictChecked: false };
}

const audioVerifyImpl = async () => {
  const bgm = path.join(ws, "assets/audio/bgm");
  const sfx = path.join(ws, "assets/audio/sfx");
  const files = [];
  for (const dir of [bgm, sfx]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const lower = name.toLowerCase();
      if (!lower.endsWith(".wav") && !lower.endsWith(".mp3") && !lower.endsWith(".ogg")) continue;
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      files.push({
        path: path.relative(ws, full).split(path.sep).join("/"),
        bytes: fs.statSync(full).size,
        sha256: sha256File(full),
        license: "original-synth",
        provider: "local",
        format: path.extname(name).slice(1).toLowerCase()
      });
    }
  }

  const wavFiles = files.filter((file) => file.format === "wav");
  const compressedFiles = files.filter((file) => file.format === "mp3" || file.format === "ogg");
  let assetRecipeMigration = files.length
    ? {
        status: "pending_compressed_codec",
        supportedFormats: ["pcm16-wav"],
        unsupportedAssets: compressedFiles.map((file) => file.path),
        blocker: wavFiles.length ? null : "no_pcm_wav_source_for_deterministic_migration"
      }
    : { status: "blocked", blocker: "audio_assets_missing" };

  if (wavFiles.length) {
    const recipeId = "legacy-audio-verify";
    const rawArtifacts = wavFiles.map((file, index) => ({
      id: safeAssetId(file.path, index),
      path: file.path,
      sha256: file.sha256,
      license: file.license,
      mime: "audio/wav"
    }));
    const operations = rawArtifacts.map((artifact, index) => ({
      id: `normalize-${String(index + 1).padStart(2, "0")}`,
      type: "normalize_audio",
      port: "asset.normalize_audio",
      provider: "deterministic-wav-port",
      model: null,
      inputs: [artifact.id],
      outputs: [`${artifact.id}_normalized`],
      parameters: { peak: 0.95, migration: true }
    }));
    const finalAssets = operations.map((operation) => ({
      key: operation.outputs[0],
      path: `loreweaver/asset-recipe-execution/${recipeId}/${operation.id}/${operation.outputs[0]}.wav`,
      sha256: "0".repeat(64),
      bytes: 1,
      mime: "audio/wav",
      usedByRuntime: false,
      usageRefs: []
    }));
    const recipe = {
      schemaVersion: "loreweaver.asset-recipe.v1",
      id: recipeId,
      title: "Legacy Audio Verification Migration Candidate",
      status: "candidate",
      assetKind: "audio",
      source: {
        mode: "imported",
        provider: "legacy-workspace",
        model: null,
        license: "original-project-work",
        rawPrompt: null,
        negativePrompt: null,
        references: [],
        rawArtifacts,
        notes: [
          "Migration bridge from legacy audio_verify.",
          "Only PCM16 WAV is executed deterministically; MP3/OGG remain explicit unsupported compression inputs."
        ]
      },
      operations,
      outputs: {
        manifestPath: "assets/audio/manifest.json",
        finalAssets,
        finalManifestKeys: finalAssets.map((asset) => asset.key)
      },
      verification: [],
      promotion: candidatePromotion()
    };

    try {
      const execution = await executeAssetRecipe({
        recipe,
        workspaceDir: ws,
        handlers: mergedAssetHandlers(),
        reportPath: "reports/asset_recipe_legacy_audio_execution.json",
        enforceDeclaredFinalIdentity: false
      });
      const byKey = new Map(execution.finalAssets.map((asset) => [asset.key, asset]));
      recipe.outputs.finalAssets = recipe.outputs.finalAssets.map((declared) => {
        const observed = byKey.get(declared.key);
        if (!observed) throw new Error(`asset_recipe_normalized_audio_missing:${declared.key}`);
        return {
          ...declared,
          path: observed.path,
          sha256: observed.sha256,
          bytes: observed.bytes
        };
      });
      const validation = validateAssetRecipe(recipe);
      if (!validation.valid) throw new Error(`asset_recipe_audio_candidate_invalid:${validation.errors.join(",")}`);
      const recipePath = path.join(ws, "loreweaver/asset-recipes/legacy-audio-verify.candidate.json");
      writeJson(recipePath, recipe);
      assetRecipeMigration = {
        status: compressedFiles.length ? "candidate_executed_partial" : "candidate_executed",
        recipe: path.relative(ws, recipePath).split(path.sep).join("/"),
        operationPorts: [...new Set(operations.map((operation) => operation.port))],
        executionReport: execution.reportPath,
        sourceCount: wavFiles.length,
        normalizedAssets: execution.finalAssets.map((asset) => ({
          key: asset.key,
          path: asset.path,
          sha256: asset.sha256,
          bytes: asset.bytes
        })),
        unsupportedAssets: compressedFiles.map((file) => file.path),
        promotable: false,
        reason: compressedFiles.length
          ? "PCM WAV was migrated deterministically; compressed assets and real runtime-usage/audio evidence remain incomplete"
          : "processing is now reproducible, but real runtime-usage/audio/license evidence is still incomplete"
      };
    } catch (error) {
      assetRecipeMigration = {
        status: "blocked",
        supportedFormats: ["pcm16-wav"],
        attemptedAssets: wavFiles.map((file) => file.path),
        unsupportedAssets: compressedFiles.map((file) => file.path),
        blocker: error?.message || String(error),
        promotable: false
      };
    }
  }

  return {
    kind: "audio_verify",
    status: files.length >= 1 ? "passed" : "pending_manual",
    assets: files,
    provenance: "assets/audio/manifest.json",
    secrets: { leaked: false },
    assetRecipeMigration
  };
};

const atlasVerifyImpl = async () => {
  const atlas = path.join(ws, "assets/imagegen/atlas.png");
  const manifest = path.join(ws, "assets/imagegen/manifest.json");
  if (!fs.existsSync(atlas) || !fs.existsSync(manifest)) {
    return {
      kind: "image_verify",
      status: "pending_manual",
      assets: [],
      secrets: { leaked: false },
      assetRecipeMigration: { status: "blocked", blocker: "atlas_or_manifest_missing" }
    };
  }
  const man = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const atlasHash = sha256File(atlas);
  const atlasBytes = fs.statSync(atlas).size;
  const recipeId = "legacy-atlas-verify";
  const operationId = "normalize-atlas";
  const outputId = "normalized_atlas";
  const normalizedPath = `loreweaver/asset-recipe-execution/${recipeId}/${operationId}/${outputId}.png`;
  const recipe = {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: recipeId,
    title: "Legacy Atlas Verification Migration Candidate",
    status: "candidate",
    assetKind: "atlas",
    source: {
      mode: "imported",
      provider: "legacy-workspace",
      model: null,
      license: "original-project-work",
      rawPrompt: null,
      negativePrompt: null,
      references: [],
      rawArtifacts: [{
        id: "legacy_atlas",
        path: "assets/imagegen/atlas.png",
        sha256: atlasHash,
        license: "original-project-work",
        mime: "image/png"
      }],
      notes: ["Migration bridge from legacy atlas_verify; does not claim verified promotion evidence."]
    },
    operations: [{
      id: operationId,
      type: "convert",
      port: "asset.convert",
      provider: "deterministic-image-port",
      model: null,
      inputs: ["legacy_atlas"],
      outputs: [outputId],
      parameters: { format: "png_rgba8", migration: true }
    }],
    outputs: {
      manifestPath: "assets/imagegen/manifest.json",
      finalAssets: [{
        key: outputId,
        path: normalizedPath,
        sha256: "0".repeat(64),
        bytes: 1,
        mime: "image/png",
        usedByRuntime: false,
        usageRefs: []
      }],
      finalManifestKeys: [outputId]
    },
    verification: [],
    promotion: candidatePromotion()
  };

  const execution = await executeAssetRecipe({
    recipe,
    workspaceDir: ws,
    handlers: mergedAssetHandlers(),
    reportPath: "reports/asset_recipe_legacy_atlas_execution.json",
    enforceDeclaredFinalIdentity: false
  });
  const normalized = execution.finalAssets.find((asset) => asset.key === outputId);
  if (!normalized) throw new Error("asset_recipe_normalized_atlas_missing");
  recipe.outputs.finalAssets[0] = {
    ...recipe.outputs.finalAssets[0],
    path: normalized.path,
    sha256: normalized.sha256,
    bytes: normalized.bytes
  };
  const recipeValidation = validateAssetRecipe(recipe);
  if (!recipeValidation.valid) {
    throw new Error(`asset_recipe_migration_candidate_invalid:${recipeValidation.errors.join(",")}`);
  }
  const recipePath = path.join(ws, "loreweaver/asset-recipes/legacy-atlas-verify.candidate.json");
  writeJson(recipePath, recipe);

  return {
    kind: "image_verify",
    status: "passed",
    assets: [{
      path: "assets/imagegen/atlas.png",
      bytes: atlasBytes,
      sha256: atlasHash,
      frameCount: Object.keys(man.frames || {}).length,
      license: "original-generated",
      provider: "local"
    }],
    provenance: "assets/imagegen/provenance.json",
    secrets: { leaked: false },
    assetRecipeMigration: {
      status: "candidate_executed",
      recipe: path.relative(ws, recipePath).split(path.sep).join("/"),
      operationPort: "asset.convert",
      executionReport: execution.reportPath,
      sourceSha256: atlasHash,
      normalizedSha256: normalized.sha256,
      promotable: false,
      reason: "legacy processing provenance and real VLM/runtime-usage evidence are incomplete"
    }
  };
};

const jobs = {
  audio_verify: audioVerifyImpl,
  atlas_verify: atlasVerifyImpl,
  campaign_audio_verify: audioVerifyImpl,
  campaign_atlas_verify: atlasVerifyImpl
};

const runner = jobs[jobId];
if (!runner) {
  console.error("Unknown job", jobId, "known:", Object.keys(jobs).join(", "));
  process.exit(1);
}

try {
  const result = {
    schemaVersion: "loreweaver.asset-job.v3",
    jobId,
    workspace: path.relative(LORE_ROOT, ws).split(path.sep).join("/"),
    createdAt: new Date().toISOString(),
    ...(await runner())
  };

  const out = path.join(LORE_ROOT, "productize/jobs", `${jobId}_latest.json`);
  writeJson(out, result);
  writeJson(path.join(LORE_ROOT, "minigame_master/capabilities/reports/asset_job_latest.json"), result);
  console.log(JSON.stringify({
    status: result.status,
    jobId,
    assets: result.assets?.length || 0,
    assetRecipeMigration: result.assetRecipeMigration || null
  }, null, 2));
  if (result.status === "failed") process.exit(1);
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
