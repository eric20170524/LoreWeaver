import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateAssetRecipe } from "./asset-recipe.mjs";

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected JSON object: ${file}`);
  }
  return value;
}

function repoLikeRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function safeId(value, fallback = "asset") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function inferMode(provider, prompt, sourceFiles) {
  const lower = String(provider || "").toLowerCase();
  if (lower.includes("procedural") || lower.includes("pil") || lower.includes("local")) return "procedural";
  if (prompt && sourceFiles.length) return "reference_guided";
  if (prompt) return "generated";
  return "imported";
}

function collectSourceFiles(sourceDir) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) return [];
  return fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sourceDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Convert an existing LoreWeaver imagegen directory into a candidate AssetRecipe.
 *
 * This is deliberately conservative: it computes real file hashes and records
 * the known manifest/provenance, but it cannot reconstruct missing historical
 * processing steps or provider prompts. The output therefore remains `candidate`
 * and carries no release-eligible verification evidence.
 */
export function buildLegacyAtlasRecipeCandidate({
  workspaceDir,
  repoRoot = workspaceDir,
  recipeId = null
}) {
  const workspace = path.resolve(workspaceDir);
  const root = path.resolve(repoRoot);
  const assetsDir = path.join(workspace, "assets", "imagegen");
  const manifestPath = path.join(assetsDir, "manifest.json");
  const provenancePath = path.join(assetsDir, "provenance.json");
  const atlasPath = path.join(assetsDir, "atlas.png");
  const sourceDir = path.join(assetsDir, "source");
  for (const required of [manifestPath, provenancePath, atlasPath]) {
    if (!fs.existsSync(required) || !fs.statSync(required).isFile()) {
      throw new Error(`Legacy atlas migration missing required file: ${required}`);
    }
  }

  const manifest = readJson(manifestPath);
  const provenance = readJson(provenancePath);
  const sourceFiles = collectSourceFiles(sourceDir);
  if (!sourceFiles.length) {
    throw new Error("Legacy atlas migration requires at least one raw source artifact; final atlas cannot be its own source");
  }
  const provider = String(provenance.provider || "legacy-unknown-provider");
  const rawPrompt = provenance.rawPrompt || provenance.prompt || null;
  const license = String(provenance.license || "license-review-required");
  const rawArtifacts = sourceFiles.map((file, index) => ({
    id: `raw-${index + 1}-${safeId(path.basename(file, path.extname(file)))}`,
    path: repoLikeRelative(root, file),
    sha256: sha256File(file),
    license,
    mime: path.extname(file).toLowerCase() === ".png" ? "image/png" : null
  }));
  const frameCount = Object.keys(manifest.frames || {}).length;
  const atlasKey = "legacy-atlas";
  const recipe = {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: safeId(recipeId || `${path.basename(workspace)}-legacy-atlas`),
    title: `Legacy Atlas Migration · ${path.basename(workspace)}`,
    status: "candidate",
    assetKind: "atlas",
    source: {
      mode: inferMode(provider, rawPrompt, sourceFiles),
      provider,
      model: provenance.model || null,
      license,
      rawPrompt,
      negativePrompt: provenance.negativePrompt || null,
      references: [],
      rawArtifacts,
      notes: [
        String(provenance.notes || "Legacy provenance imported."),
        `Legacy provenance source: ${String(provenance.source || "unknown")}`,
        "Historical operation details were not fully machine-readable; this migration remains candidate until real operations and evidence are attached."
      ]
    },
    operations: [
      {
        id: "reconstruct-legacy-atlas",
        type: "build_atlas",
        port: "asset.legacy_atlas_reconstruction",
        provider,
        model: provenance.model || null,
        inputs: rawArtifacts.map((artifact) => artifact.id),
        outputs: [atlasKey],
        parameters: {
          migrationOnly: true,
          frameCount,
          atlasSize: manifest.atlasSize || null,
          frameSize: manifest.frameSize || null,
          sourceDescription: String(provenance.source || "unknown")
        }
      }
    ],
    outputs: {
      manifestPath: repoLikeRelative(root, manifestPath),
      finalAssets: [
        {
          key: atlasKey,
          path: repoLikeRelative(root, atlasPath),
          sha256: sha256File(atlasPath),
          bytes: fs.statSync(atlasPath).size,
          mime: "image/png",
          usedByRuntime: true,
          usageRefs: [
            `${repoLikeRelative(root, manifestPath)}#atlasImage`,
            `${repoLikeRelative(root, manifestPath)}#frames(${frameCount})`
          ]
        }
      ],
      finalManifestKeys: [atlasKey]
    },
    verification: [],
    promotion: {
      approvedBy: null,
      approvedAt: null,
      destination: null,
      conflictChecked: false
    }
  };

  const validation = validateAssetRecipe(recipe);
  if (!validation.valid) {
    throw new Error(`Migrated AssetRecipe candidate invalid: ${validation.errors.join(", ")}`);
  }
  return {
    recipe,
    validation,
    sourceSummary: {
      workspace: repoLikeRelative(root, workspace),
      sourceFileCount: sourceFiles.length,
      frameCount,
      atlasSha256: recipe.outputs.finalAssets[0].sha256,
      provenancePath: repoLikeRelative(root, provenancePath),
      manifestPath: repoLikeRelative(root, manifestPath)
    }
  };
}
