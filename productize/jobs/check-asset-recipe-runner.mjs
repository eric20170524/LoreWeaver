#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { encodePng } from "../lib/png-asset-operations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const workspaceId = `__asset_recipe_runner_check_${process.pid}`;
const workspace = path.join(ROOT, "data/workspaces", workspaceId);
const runner = path.join(ROOT, "productize/run-asset-recipe.mjs");

function assert(value, message) {
  if (!value) throw new Error(message);
}
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function run(recipePath) {
  const env = {
    ...process.env,
    PATH: "",
    XAI_API_KEY: "",
    GROK_API_KEY: "",
    CODEX_CLI: "",
    CHATGPT_CODEX_CLI: ""
  };
  return spawnSync(process.execPath, [
    runner,
    `--workspace-id=${workspaceId}`,
    `--recipe=${recipePath}`
  ], { cwd: ROOT, encoding: "utf8", env, timeout: 30000 });
}
function candidatePromotion() {
  return { approvedBy: null, approvedAt: null, destination: null, conflictChecked: false };
}

try {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  const rgba = Buffer.from([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255
  ]);
  const png = encodePng({ width: 2, height: 2, rgba });
  const sourcePath = path.join(workspace, "assets/source.png");
  fs.writeFileSync(sourcePath, png);
  const sourceHash = sha256(png);
  const recipeId = "runner-image-normalize";
  const outputRel = `loreweaver/asset-recipe-execution/${recipeId}/normalize/normalized.png`;
  const baseRecipe = {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: recipeId,
    title: "Runner deterministic image normalize",
    status: "candidate",
    assetKind: "image",
    source: {
      mode: "imported",
      provider: "test-authored-source",
      model: null,
      license: "test-original",
      rawPrompt: null,
      negativePrompt: null,
      references: [],
      rawArtifacts: [{
        id: "source",
        path: "assets/source.png",
        sha256: sourceHash,
        license: "test-original",
        mime: "image/png"
      }],
      notes: ["CI runner contract fixture only; not promotion evidence."]
    },
    operations: [{
      id: "normalize",
      type: "convert",
      port: "asset.convert",
      provider: "deterministic-image-port",
      model: null,
      inputs: ["source"],
      outputs: ["normalized"],
      parameters: { format: "png_rgba8" }
    }],
    outputs: {
      manifestPath: "assets/manifest.json",
      finalAssets: [{
        key: "normalized",
        path: outputRel,
        sha256: sourceHash,
        bytes: png.length,
        mime: "image/png",
        usedByRuntime: false,
        usageRefs: []
      }],
      finalManifestKeys: ["normalized"]
    },
    verification: [],
    promotion: candidatePromotion()
  };
  writeJson(path.join(workspace, "recipe.json"), baseRecipe);

  const deterministic = run("recipe.json");
  assert(deterministic.status === 0, `deterministic runner failed: ${deterministic.stdout}\n${deterministic.stderr}`);
  const deterministicPayload = JSON.parse(deterministic.stdout);
  assert(deterministicPayload.status === "passed", deterministic.stdout);
  assert(deterministicPayload.preflight?.ready === true, "deterministic ports must pass preflight");
  const outputPath = path.join(workspace, outputRel);
  assert(fs.existsSync(outputPath), "deterministic output missing");
  assert(sha256(fs.readFileSync(outputPath)) === sourceHash, "strict final identity must be enforced");

  fs.rmSync(path.join(workspace, "loreweaver/asset-recipe-execution"), { recursive: true, force: true });
  fs.rmSync(path.join(workspace, "reports"), { recursive: true, force: true });
  const vlmRecipe = {
    ...baseRecipe,
    id: "runner-image-with-real-vlm",
    operations: [
      {
        ...baseRecipe.operations[0],
        id: "normalize",
        outputs: ["normalized"]
      },
      {
        id: "visual-review",
        type: "manual_review",
        port: "asset.vlm",
        provider: "real-provider-required",
        model: null,
        inputs: ["normalized"],
        outputs: ["vlm_report"],
        parameters: { purpose: "CI proves missing real provider fails before execution" }
      }
    ],
    outputs: {
      ...baseRecipe.outputs,
      finalAssets: [{
        ...baseRecipe.outputs.finalAssets[0],
        path: "loreweaver/asset-recipe-execution/runner-image-with-real-vlm/normalize/normalized.png"
      }]
    }
  };
  writeJson(path.join(workspace, "recipe-vlm.json"), vlmRecipe);
  const blocked = run("recipe-vlm.json");
  assert(blocked.status !== 0, "VLM recipe must fail without a real provider");
  const blockedPayload = JSON.parse(blocked.stdout);
  assert(blockedPayload.reason === "asset_operation_preflight_blocked", blocked.stdout);
  assert(blockedPayload.preflight?.missingPorts?.includes("asset.vlm"), blocked.stdout);
  assert(
    !fs.existsSync(path.join(workspace, "loreweaver/asset-recipe-execution/runner-image-with-real-vlm")),
    "preflight failure must occur before deterministic operation outputs are written"
  );

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.asset-recipe-runner-check.v1",
    status: "passed",
    checks: [
      "canonical_runner_executes_deterministic_recipe",
      "strict_final_identity_is_enforced",
      "missing_real_vlm_provider_is_detected_in_preflight",
      "missing_provider_preflight_is_zero_operation_write"
    ]
  }, null, 2));
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
