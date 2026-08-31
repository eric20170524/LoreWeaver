#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AssetOperationExecutionError,
  createBuiltinAssetOperationHandlers,
  executeAssetRecipe
} from "../lib/asset-operation-executor.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function expectError(fn, contains) {
  try {
    await fn();
  } catch (error) {
    assert(String(error?.message || error).includes(contains), `expected '${contains}', got '${error?.message || error}'`);
    return;
  }
  throw new Error(`expected error containing: ${contains}`);
}

function minimalPng(width = 64, height = 32) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function baseRecipe(sourceHash) {
  return {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: "executor-check",
    title: "Executor Check",
    status: "candidate",
    assetKind: "image",
    source: {
      mode: "imported",
      provider: "test-source-port",
      model: null,
      license: "test-original",
      rawPrompt: null,
      negativePrompt: null,
      references: [],
      rawArtifacts: [
        {
          id: "raw-image",
          path: "assets/source/raw.png",
          sha256: sourceHash,
          license: "test-original",
          mime: "image/png"
        }
      ],
      notes: []
    },
    operations: [
      {
        id: "analyze-source",
        type: "analyze",
        port: "asset.analyze",
        provider: "deterministic-local",
        model: null,
        inputs: ["raw-image"],
        outputs: ["analysis"],
        parameters: { expectedKind: "sprite" }
      },
      {
        id: "label-source",
        type: "label",
        port: "asset.label",
        provider: "deterministic-local",
        model: null,
        inputs: ["analysis"],
        outputs: ["labelled-metadata"],
        parameters: { labels: { role: "player", clip: "idle" } }
      }
    ],
    outputs: {
      manifestPath: "assets/imagegen/manifest.json",
      finalAssets: [
        {
          key: "labelled-metadata",
          path: "loreweaver/asset-recipe-execution/executor-check/label-source/labelled-metadata.json",
          sha256: "a".repeat(64),
          bytes: 1,
          mime: "application/json",
          usedByRuntime: false,
          usageRefs: []
        }
      ],
      finalManifestKeys: ["labelled-metadata"]
    },
    verification: [],
    promotion: {
      approvedBy: null,
      approvedAt: null,
      destination: null,
      conflictChecked: false
    }
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-asset-executor-"));
try {
  const sourceDir = path.join(root, "assets/source");
  fs.mkdirSync(sourceDir, { recursive: true });
  const raw = minimalPng(96, 48);
  fs.writeFileSync(path.join(sourceDir, "raw.png"), raw);
  const sourceHash = sha256(raw);

  // First run records the actual deterministic final identity. Candidate execution
  // may be observed before its exact final hash is promoted into the recipe.
  const observedRecipe = baseRecipe(sourceHash);
  const observed = await executeAssetRecipe({
    recipe: observedRecipe,
    workspaceDir: root,
    handlers: createBuiltinAssetOperationHandlers(),
    enforceDeclaredFinalIdentity: false,
    reportPath: "reports/asset-recipe-execution-observed.json"
  });
  assert(observed.status === "passed" && observed.operationCount === 2, "ordered analyze + label graph executes");
  assert(observed.operations[0].outputs[0].sha256 === observed.operations[1].inputs[0].sha256, "downstream input binds the exact prior output hash");
  assert(fs.existsSync(path.join(root, observed.reportPath)), "execution report is written inside Workspace");
  const analysis = JSON.parse(fs.readFileSync(path.join(root, observed.operations[0].outputs[0].path), "utf8"));
  assert(analysis.inputs[0].dimensions.width === 96 && analysis.inputs[0].dimensions.height === 48, "built-in analyze reads real PNG dimensions");

  // Once exact output identity is recorded, a strict replay must reproduce it.
  const strictRecipe = baseRecipe(sourceHash);
  strictRecipe.outputs.finalAssets[0].sha256 = observed.finalAssets[0].sha256;
  strictRecipe.outputs.finalAssets[0].bytes = observed.finalAssets[0].bytes;
  const strict = await executeAssetRecipe({
    recipe: strictRecipe,
    workspaceDir: root,
    handlers: createBuiltinAssetOperationHandlers(),
    enforceDeclaredFinalIdentity: true
  });
  assert(strict.finalAssets[0].sha256 === observed.finalAssets[0].sha256, "strict replay binds exact final SHA-256");
  assert(strict.finalAssets[0].bytes === observed.finalAssets[0].bytes, "strict replay binds exact final bytes");

  // Custom trusted handlers can extend the port registry without placing scripts
  // or executable commands inside the recipe itself.
  const copyRecipe = baseRecipe(sourceHash);
  copyRecipe.id = "trusted-port-check";
  copyRecipe.operations = [
    {
      id: "copy-source",
      type: "convert",
      port: "asset.trusted_copy",
      provider: "test-trusted-handler",
      model: null,
      inputs: ["raw-image"],
      outputs: ["copied-image"],
      parameters: { preserveBytes: true }
    }
  ];
  copyRecipe.outputs.finalAssets = [
    {
      key: "copied-image",
      path: "loreweaver/asset-recipe-execution/trusted-port-check/copy-source/copied-image.png",
      sha256: sourceHash,
      bytes: raw.length,
      mime: "image/png",
      usedByRuntime: false,
      usageRefs: []
    }
  ];
  copyRecipe.outputs.finalManifestKeys = ["copied-image"];
  const handlers = createBuiltinAssetOperationHandlers();
  handlers.set("asset.trusted_copy", async (context) => {
    const out = context.resolveOutputPath("copied-image", ".png");
    fs.copyFileSync(context.inputs[0].absolutePath, out.absolutePath);
    return { outputs: [{ id: "copied-image", path: out.relativePath, mime: "image/png" }] };
  });
  const copied = await executeAssetRecipe({ recipe: copyRecipe, workspaceDir: root, handlers });
  assert(copied.finalAssets[0].sha256 === sourceHash, "trusted injected port is still hash-verified by executor");

  const missingPort = clone(copyRecipe);
  missingPort.id = "missing-port-check";
  missingPort.operations[0].port = "asset.remove_background";
  missingPort.outputs.finalAssets[0].path = "loreweaver/asset-recipe-execution/missing-port-check/copy-source/copied-image.png";
  await expectError(
    () => executeAssetRecipe({ recipe: missingPort, workspaceDir: root, handlers: createBuiltinAssetOperationHandlers(), enforceDeclaredFinalIdentity: false }),
    "asset_operation_port_unregistered"
  );

  const escapingHandlers = createBuiltinAssetOperationHandlers();
  escapingHandlers.set("asset.trusted_copy", async () => ({
    outputs: [{ id: "copied-image", path: "../outside.png", mime: "image/png" }]
  }));
  await expectError(
    () => executeAssetRecipe({ recipe: copyRecipe, workspaceDir: root, handlers: escapingHandlers }),
    "handler_output_path_unsafe"
  );

  let commandHandlerCalled = false;
  const commandRecipe = clone(copyRecipe);
  commandRecipe.operations[0].parameters.command = "touch should-never-run";
  const commandHandlers = createBuiltinAssetOperationHandlers();
  commandHandlers.set("asset.trusted_copy", async () => {
    commandHandlerCalled = true;
    throw new Error("handler should not run");
  });
  await expectError(
    () => executeAssetRecipe({ recipe: commandRecipe, workspaceDir: root, handlers: commandHandlers }),
    "executable_parameter_forbidden"
  );
  assert(commandHandlerCalled === false, "invalid executable-like parameters are rejected before any handler runs");
  assert(!fs.existsSync(path.join(root, "should-never-run")), "recipe command text is never executed");

  const tampered = Buffer.from(raw);
  tampered[20] ^= 0xff;
  fs.writeFileSync(path.join(sourceDir, "raw.png"), tampered);
  await expectError(
    () => executeAssetRecipe({ recipe: strictRecipe, workspaceDir: root, handlers: createBuiltinAssetOperationHandlers() }),
    "source_artifact_hash_mismatch"
  );

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.asset-operation-executor-check.v1",
    status: "passed",
    observedFinalHash: observed.finalAssets[0].sha256,
    strictFinalHash: strict.finalAssets[0].sha256,
    checks: [
      "ordered_tool_neutral_operation_graph_executes",
      "real_png_analysis_reads_source_bytes",
      "downstream_operations_bind_exact_prior_output_hashes",
      "strict_replay_binds_declared_final_hash_and_bytes",
      "trusted_handlers_extend_ports_without_recipe_code",
      "unregistered_ports_fail_closed",
      "handler_output_path_escape_is_rejected",
      "executable_recipe_parameters_are_rejected_before_handler_execution",
      "source_artifact_tampering_is_detected"
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
