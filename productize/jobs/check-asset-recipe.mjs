#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAssetRecipe } from "../lib/asset-recipe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/asset_recipe.schema.json");
const HASH = "a".repeat(64);
const RAW_HASH = "b".repeat(64);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function assert(value, message) {
  if (!value) throw new Error(message);
}
function verification(id, kind, extra = {}) {
  return {
    id,
    kind,
    status: "passed",
    report: `data/workspaces/ws-asset/reports/${id}.json`,
    real: true,
    fixture: false,
    synthetic: false,
    stale: false,
    outputHashes: [HASH],
    ...extra
  };
}
function verifiedRecipe() {
  return {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: "player-atlas-pipeline",
    title: "Player Atlas Pipeline",
    status: "verified",
    assetKind: "atlas",
    source: {
      mode: "reference_guided",
      provider: "image-provider-port",
      model: "provider-model",
      license: "original-project-work",
      rawPrompt: "Original player sprite, readable silhouette, transparent background.",
      negativePrompt: "text, watermark, cropped limbs",
      references: [
        {
          id: "player-reference",
          path: "assets/source/player-reference.png",
          sha256: RAW_HASH,
          license: "original-reference",
          mime: "image/png"
        }
      ],
      rawArtifacts: [
        {
          id: "raw-sheet",
          path: "assets/source/player-raw.png",
          sha256: RAW_HASH,
          license: "original-generated",
          mime: "image/png"
        }
      ],
      notes: ["Tool provider may be replaced without changing the recipe contract."]
    },
    operations: [
      {
        id: "analyze-layout",
        type: "analyze",
        port: "asset.analyze",
        provider: "vision-provider",
        model: "vision-model",
        inputs: ["raw-sheet"],
        outputs: ["layout-analysis"],
        parameters: { expectedFrames: 4 }
      },
      {
        id: "remove-background",
        type: "remove_background",
        port: "asset.remove_background",
        provider: "local-or-remote-port",
        model: null,
        inputs: ["raw-sheet", "layout-analysis"],
        outputs: ["transparent-sheet"],
        parameters: { preserveInteriorHoles: true }
      },
      {
        id: "cut-frames",
        type: "cut_frames",
        port: "asset.cut_frames",
        provider: "deterministic-image-port",
        model: null,
        inputs: ["transparent-sheet", "layout-analysis"],
        outputs: ["idle-frame", "walk-frame"],
        parameters: { frameWidth: 64, frameHeight: 64 }
      },
      {
        id: "clean-edges",
        type: "edge_cleanup",
        port: "asset.edge_cleanup",
        provider: "deterministic-image-port",
        model: null,
        inputs: ["idle-frame", "walk-frame"],
        outputs: ["idle-clean", "walk-clean"],
        parameters: { alphaThreshold: 8 }
      },
      {
        id: "build-atlas",
        type: "build_atlas",
        port: "asset.build_atlas",
        provider: "deterministic-image-port",
        model: null,
        inputs: ["idle-clean", "walk-clean"],
        outputs: ["player_atlas"],
        parameters: { padding: 2, powerOfTwo: true }
      }
    ],
    outputs: {
      manifestPath: "assets/imagegen/manifest.json",
      finalAssets: [
        {
          key: "player_atlas",
          path: "assets/imagegen/player-atlas.png",
          sha256: HASH,
          bytes: 4096,
          mime: "image/png",
          usedByRuntime: true,
          usageRefs: ["runtime-spec.assetManifest.playerAtlas"]
        }
      ],
      finalManifestKeys: ["player_atlas"]
    },
    verification: [
      verification("integrity", "integrity"),
      verification("runtime-usage", "runtime_usage"),
      verification("license", "license"),
      verification("vlm", "vlm"),
      verification("edges", "edges"),
      verification("atlas", "atlas")
    ],
    promotion: {
      approvedBy: null,
      approvedAt: null,
      destination: null,
      conflictChecked: false
    }
  };
}

const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
assert(schema.$id, "AssetRecipe schema must declare $id");

const valid = validateAssetRecipe(verifiedRecipe());
assert(valid.valid, JSON.stringify(valid));
assert(valid.operationCount === 5, "all processing operations must be visible");
assert(valid.finalAssetCount === 1, "only final selected runtime assets are recorded");
assert(valid.requiredVerificationKinds.every((kind) => valid.eligibleVerificationKinds.includes(kind)), "verified recipe must have all required real evidence");

const candidate = verifiedRecipe();
candidate.id = "legacy-atlas-migration-candidate";
candidate.status = "candidate";
candidate.source.mode = "procedural";
candidate.source.rawPrompt = null;
candidate.source.references = [];
candidate.source.provider = "local-procedural-port";
candidate.operations = [
  {
    id: "build-atlas",
    type: "build_atlas",
    port: "asset.build_atlas",
    provider: "local-procedural-port",
    model: null,
    inputs: ["raw-sheet"],
    outputs: ["player_atlas"],
    parameters: { migration: true }
  }
];
candidate.outputs.finalAssets[0].usedByRuntime = false;
candidate.outputs.finalAssets[0].usageRefs = [];
candidate.verification = [];
const candidateDecision = validateAssetRecipe(candidate);
assert(candidateDecision.valid, JSON.stringify(candidateDecision));
assert(candidateDecision.promotable === false, "migration candidate must not masquerade as promoted");
assert(candidateDecision.warnings.some((warning) => warning.startsWith("candidate_verification_incomplete")), "candidate gaps must remain explicit");

const missingSource = clone(candidate);
missingSource.source.rawArtifacts = [];
const missingSourceDecision = validateAssetRecipe(missingSource);
assert(!missingSourceDecision.valid, "recipe without prompt/reference/raw artifact must fail");
assert(missingSourceDecision.errors.includes("source_trace_missing"));

const unresolved = verifiedRecipe();
unresolved.operations[1].inputs.push("unknown-analysis");
const unresolvedDecision = validateAssetRecipe(unresolved);
assert(!unresolvedDecision.valid, "unresolved operation graph input must fail");
assert(unresolvedDecision.errors.some((error) => error.includes("operation_input_unresolved")));

const scriptPort = verifiedRecipe();
scriptPort.operations[0].port = "tools/analyze.py";
const scriptPortDecision = validateAssetRecipe(scriptPort);
assert(!scriptPortDecision.valid, "AssetRecipe port must not embed executable path");
assert(scriptPortDecision.errors.some((error) => error.startsWith("operation_port_must_be_tool_neutral")));

const commandParam = verifiedRecipe();
commandParam.operations[0].parameters.command = "python private_tool.py";
const commandDecision = validateAssetRecipe(commandParam);
assert(!commandDecision.valid, "AssetRecipe parameters must not hide a shell command");
assert(commandDecision.errors.some((error) => error.startsWith("executable_parameter_forbidden")));

const unusedVerified = verifiedRecipe();
unusedVerified.outputs.finalAssets[0].usedByRuntime = false;
unusedVerified.outputs.finalAssets[0].usageRefs = [];
const unusedDecision = validateAssetRecipe(unusedVerified);
assert(!unusedDecision.valid, "verified recipes may include only actually used assets");
assert(unusedDecision.errors.includes("verified_recipe_contains_unused_asset:player_atlas"));

const fakeEvidence = verifiedRecipe();
fakeEvidence.verification.find((item) => item.kind === "runtime_usage").synthetic = true;
const fakeDecision = validateAssetRecipe(fakeEvidence);
assert(!fakeDecision.valid, "synthetic runtime usage cannot verify an AssetRecipe");
assert(fakeDecision.errors.includes("required_verification_missing:runtime_usage"));

const staleVlm = verifiedRecipe();
const vlm = staleVlm.verification.find((item) => item.kind === "vlm");
vlm.status = "stale";
vlm.stale = true;
const staleVlmDecision = validateAssetRecipe(staleVlm);
assert(!staleVlmDecision.valid, "stale VLM cannot verify a visual recipe");
assert(staleVlmDecision.errors.includes("required_verification_missing:vlm"));

const wrongHash = verifiedRecipe();
wrongHash.verification.find((item) => item.kind === "integrity").outputHashes = ["c".repeat(64)];
const wrongHashDecision = validateAssetRecipe(wrongHash);
assert(!wrongHashDecision.valid, "verification must bind exact final output hashes");
assert(wrongHashDecision.errors.includes("verification_does_not_bind_all_outputs:integrity"));

const privatePath = verifiedRecipe();
privatePath.source.rawArtifacts[0].path = "/Users/alice/private-game/raw.png";
const privatePathDecision = validateAssetRecipe(privatePath);
assert(!privatePathDecision.valid, "private absolute paths cannot enter reusable recipes");

const approved = verifiedRecipe();
approved.status = "approved";
approved.promotion = {
  approvedBy: "repository-owner",
  approvedAt: "2026-08-31T12:00:00Z",
  destination: "minigame_master/capabilities/asset-recipes/player-atlas-pipeline.json",
  conflictChecked: true
};
const approvedDecision = validateAssetRecipe(approved);
assert(approvedDecision.valid && approvedDecision.promotable, JSON.stringify(approvedDecision));

console.log(JSON.stringify({
  schemaVersion: "loreweaver.asset-recipe-check.v1",
  status: "passed",
  recipeId: valid.recipeId,
  operationCount: valid.operationCount,
  requiredVerificationKinds: valid.requiredVerificationKinds,
  checks: [
    "raw_prompt_reference_and_artifact_provenance",
    "ordered_tool_neutral_operation_graph",
    "only_manifest_selected_runtime_assets_reach_verified_recipe",
    "all_required_evidence_is_real_fresh_and_hash_bound",
    "candidate_gaps_remain_explicit",
    "unresolved_inputs_and_hidden_commands_are_rejected",
    "synthetic_stale_and_wrong_hash_evidence_are_rejected",
    "private_paths_are_rejected",
    "promotion_requires_explicit_approval_and_conflict_check"
  ]
}, null, 2));
