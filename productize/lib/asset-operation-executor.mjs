import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertAssetRecipeValid } from "./asset-recipe.mjs";

const EXECUTION_SCHEMA_VERSION = "loreweaver.asset-recipe-execution.v1";

export class AssetOperationExecutionError extends Error {
  constructor(reason, detail = null) {
    super(detail ? `${reason}:${detail}` : reason);
    this.name = "AssetOperationExecutionError";
    this.reason = reason;
    this.detail = detail;
  }
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeId(value, field = "id") {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(text) || text === "." || text === "..") {
    throw new AssetOperationExecutionError(`${field}_invalid`, text || "missing");
  }
  return text;
}

function resolveInside(root, relativePath, reason = "asset_path_unsafe") {
  const raw = String(relativePath || "").trim();
  if (!raw || path.isAbsolute(raw)) throw new AssetOperationExecutionError(reason, raw || "missing");
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, raw);
  if (resolved === normalizedRoot || !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new AssetOperationExecutionError(reason, raw);
  }
  return resolved;
}

function relativeInside(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file)).split(path.sep).join("/");
  if (!rel || rel === "." || rel.startsWith("../") || rel === "..") {
    throw new AssetOperationExecutionError("handler_output_outside_workspace", file);
  }
  return rel;
}

function readPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function inspectArtifact(artifact) {
  const buffer = fs.readFileSync(artifact.absolutePath);
  const png = readPngDimensions(buffer);
  return {
    id: artifact.id,
    path: artifact.path,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    mime: artifact.mime || null,
    dimensions: png,
    extension: path.extname(artifact.path).toLowerCase() || null
  };
}

function artifactFromFile(workspaceDir, id, relativePath, mime = null, metadata = null) {
  const absolutePath = resolveInside(workspaceDir, relativePath, "handler_output_path_unsafe");
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new AssetOperationExecutionError("handler_output_missing", `${id}:${relativePath}`);
  }
  return {
    id,
    path: relativeInside(workspaceDir, absolutePath),
    absolutePath,
    sha256: sha256File(absolutePath),
    bytes: fs.statSync(absolutePath).size,
    mime: mime || null,
    metadata: metadata || null
  };
}

function deterministicOutputPath(workspaceDir, recipeId, operationId, outputId, extension = ".json") {
  safeId(recipeId, "recipe_id");
  safeId(operationId, "operation_id");
  safeId(outputId, "output_id");
  const rel = path.posix.join(
    "loreweaver",
    "asset-recipe-execution",
    recipeId,
    operationId,
    `${outputId}${extension}`
  );
  const absolute = resolveInside(workspaceDir, rel, "deterministic_output_path_unsafe");
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return { relativePath: rel, absolutePath: absolute };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Built-ins are intentionally narrow and deterministic. Image mutation ports
 * such as remove_background / cut_frames / build_atlas are not guessed here;
 * they must be supplied as trusted registered handlers by the owning tool.
 */
export function createBuiltinAssetOperationHandlers() {
  return new Map([
    ["asset.analyze", async (context) => {
      if (context.operation.outputs.length !== 1) {
        throw new AssetOperationExecutionError("analyze_requires_single_output", context.operation.id);
      }
      const outputId = context.operation.outputs[0];
      const out = deterministicOutputPath(
        context.workspaceDir,
        context.recipe.id,
        context.operation.id,
        outputId,
        ".json"
      );
      writeJson(out.absolutePath, {
        schemaVersion: "loreweaver.asset-analysis.v1",
        recipeId: context.recipe.id,
        operationId: context.operation.id,
        inputs: context.inputs.map(inspectArtifact),
        parameters: context.operation.parameters || {}
      });
      return {
        outputs: [{ id: outputId, path: out.relativePath, mime: "application/json" }]
      };
    }],
    ["asset.label", async (context) => {
      if (context.operation.outputs.length !== 1) {
        throw new AssetOperationExecutionError("label_requires_single_output", context.operation.id);
      }
      const outputId = context.operation.outputs[0];
      const out = deterministicOutputPath(
        context.workspaceDir,
        context.recipe.id,
        context.operation.id,
        outputId,
        ".json"
      );
      writeJson(out.absolutePath, {
        schemaVersion: "loreweaver.asset-label.v1",
        recipeId: context.recipe.id,
        operationId: context.operation.id,
        labels: context.operation.parameters?.labels || context.operation.parameters || {},
        inputArtifacts: context.inputs.map((artifact) => ({
          id: artifact.id,
          path: artifact.path,
          sha256: artifact.sha256
        }))
      });
      return {
        outputs: [{ id: outputId, path: out.relativePath, mime: "application/json" }]
      };
    }]
  ]);
}

function normalizeHandlers(handlers) {
  if (handlers instanceof Map) return new Map(handlers);
  if (handlers && typeof handlers === "object") return new Map(Object.entries(handlers));
  return new Map();
}

function sourceArtifacts(recipe, workspaceDir) {
  const result = new Map();
  for (const source of [
    ...(recipe.source?.references || []),
    ...(recipe.source?.rawArtifacts || [])
  ]) {
    const id = safeId(source.id, "source_artifact_id");
    const absolutePath = resolveInside(workspaceDir, source.path, "source_artifact_path_unsafe");
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new AssetOperationExecutionError("source_artifact_missing", `${id}:${source.path}`);
    }
    const actualHash = sha256File(absolutePath);
    if (actualHash !== source.sha256) {
      throw new AssetOperationExecutionError(
        "source_artifact_hash_mismatch",
        `${id}:expected=${source.sha256}:actual=${actualHash}`
      );
    }
    result.set(id, {
      id,
      path: relativeInside(workspaceDir, absolutePath),
      absolutePath,
      sha256: actualHash,
      bytes: fs.statSync(absolutePath).size,
      mime: source.mime || null,
      metadata: { source: true, license: source.license }
    });
  }
  return result;
}

function normalizeHandlerOutputs(operation, response, workspaceDir) {
  if (!response || typeof response !== "object" || !Array.isArray(response.outputs)) {
    throw new AssetOperationExecutionError("handler_result_outputs_required", operation.id);
  }
  const expected = [...operation.outputs];
  const byId = new Map();
  for (const raw of response.outputs) {
    const id = safeId(raw?.id, "handler_output_id");
    if (byId.has(id)) throw new AssetOperationExecutionError("handler_output_duplicate", `${operation.id}:${id}`);
    if (!expected.includes(id)) throw new AssetOperationExecutionError("handler_output_undeclared", `${operation.id}:${id}`);
    const absolutePath = resolveInside(workspaceDir, raw?.path, "handler_output_path_unsafe");
    const artifact = artifactFromFile(
      workspaceDir,
      id,
      relativeInside(workspaceDir, absolutePath),
      raw?.mime || null,
      raw?.metadata || null
    );
    byId.set(id, artifact);
  }
  const missing = expected.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new AssetOperationExecutionError("handler_output_missing_declared_ids", `${operation.id}:${missing.join(",")}`);
  }
  return expected.map((id) => byId.get(id));
}

function verifyFinalAssets(recipe, artifacts, workspaceDir, enforceDeclaredFinalIdentity) {
  const final = [];
  for (const declared of recipe.outputs?.finalAssets || []) {
    const artifact = artifacts.get(declared.key);
    if (!artifact) throw new AssetOperationExecutionError("final_asset_not_executed", declared.key);
    const declaredPath = relativeInside(
      workspaceDir,
      resolveInside(workspaceDir, declared.path, "final_asset_path_unsafe")
    );
    if (artifact.path !== declaredPath) {
      throw new AssetOperationExecutionError(
        "final_asset_path_mismatch",
        `${declared.key}:expected=${declaredPath}:actual=${artifact.path}`
      );
    }
    if (enforceDeclaredFinalIdentity) {
      if (artifact.sha256 !== declared.sha256) {
        throw new AssetOperationExecutionError(
          "final_asset_hash_mismatch",
          `${declared.key}:expected=${declared.sha256}:actual=${artifact.sha256}`
        );
      }
      if (artifact.bytes !== declared.bytes) {
        throw new AssetOperationExecutionError(
          "final_asset_bytes_mismatch",
          `${declared.key}:expected=${declared.bytes}:actual=${artifact.bytes}`
        );
      }
    }
    final.push({
      key: declared.key,
      path: artifact.path,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      mime: artifact.mime,
      usedByRuntime: declared.usedByRuntime === true,
      usageRefs: [...(declared.usageRefs || [])]
    });
  }
  return final;
}

export async function executeAssetRecipe({
  recipe,
  workspaceDir,
  handlers = createBuiltinAssetOperationHandlers(),
  reportPath = null,
  enforceDeclaredFinalIdentity = true
}) {
  const validation = assertAssetRecipeValid(recipe);
  const root = path.resolve(workspaceDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new AssetOperationExecutionError("workspace_missing", root);
  }
  const registry = normalizeHandlers(handlers);
  const artifacts = sourceArtifacts(recipe, root);
  const operations = [];

  for (const operation of recipe.operations || []) {
    const handler = registry.get(operation.port);
    if (typeof handler !== "function") {
      throw new AssetOperationExecutionError(
        "asset_operation_port_unregistered",
        `${operation.id}:${operation.port}`
      );
    }
    const inputs = operation.inputs.map((id) => {
      const artifact = artifacts.get(id);
      if (!artifact) throw new AssetOperationExecutionError("operation_input_missing_at_execution", `${operation.id}:${id}`);
      return artifact;
    });
    const startedAt = new Date().toISOString();
    const response = await handler({
      recipe,
      operation,
      workspaceDir: root,
      inputs: inputs.map((item) => ({ ...item })),
      resolveOutputPath: (outputId, extension = ".bin") =>
        deterministicOutputPath(root, recipe.id, operation.id, outputId, extension)
    });
    const outputs = normalizeHandlerOutputs(operation, response, root);
    for (const artifact of outputs) {
      if (artifacts.has(artifact.id)) {
        throw new AssetOperationExecutionError("operation_output_id_collision", `${operation.id}:${artifact.id}`);
      }
      artifacts.set(artifact.id, artifact);
    }
    operations.push({
      id: operation.id,
      type: operation.type,
      port: operation.port,
      provider: operation.provider || null,
      model: operation.model || null,
      startedAt,
      completedAt: new Date().toISOString(),
      inputs: inputs.map((item) => ({ id: item.id, path: item.path, sha256: item.sha256, bytes: item.bytes })),
      outputs: outputs.map((item) => ({ id: item.id, path: item.path, sha256: item.sha256, bytes: item.bytes, mime: item.mime }))
    });
  }

  const finalAssets = verifyFinalAssets(recipe, artifacts, root, enforceDeclaredFinalIdentity);
  const result = {
    schemaVersion: EXECUTION_SCHEMA_VERSION,
    status: "passed",
    recipeId: recipe.id,
    recipeStatus: recipe.status,
    validationStatus: validation.status,
    workspace: root,
    operationCount: operations.length,
    operations,
    finalAssets,
    finalManifestKeys: [...(recipe.outputs?.finalManifestKeys || [])],
    runtimeManifestPath: recipe.outputs?.manifestPath || null,
    exactFinalIdentityEnforced: enforceDeclaredFinalIdentity
  };

  if (reportPath) {
    const reportFile = resolveInside(root, reportPath, "execution_report_path_unsafe");
    writeJson(reportFile, result);
    result.reportPath = relativeInside(root, reportFile);
  }
  return result;
}

export { EXECUTION_SCHEMA_VERSION, sha256File as hashAssetFile };
