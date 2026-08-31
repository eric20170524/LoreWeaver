#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileVerticalSliceBlueprint,
  validateVerticalSliceBlueprint
} from "../lib/vertical-slice-blueprint.mjs";
import { validateRecipeGraph } from "../lib/recipe-graph.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(ROOT, "productize/fixtures/blueprints/survivor_vertical_slice_3.blueprint.json");
const LEGACY_GRAPH = path.join(ROOT, "productize/fixtures/recipes/survivor_vertical_slice_3.recipe-graph.json");
const CATALOG = path.join(ROOT, "minigame_master/capabilities/blueprints/catalog.json");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/vertical_slice_blueprint.schema.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}
function equalJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}
function assert(value, message) {
  if (!value) throw new Error(message);
}
function expectThrow(fn, contains) {
  try {
    fn();
  } catch (error) {
    assert(String(error.message || error).includes(contains), `expected '${contains}', got '${error.message || error}'`);
    return;
  }
  throw new Error(`expected throw containing '${contains}'`);
}

const schema = readJson(SCHEMA);
assert(schema.$id, "blueprint schema must declare $id");
const blueprint = readJson(FIXTURE);
const validation = validateVerticalSliceBlueprint(blueprint);
assert(validation.valid, JSON.stringify(validation));
assert(validation.compilable, "runtime_verified blueprint must be compilable");
assert(validation.stageCount === 3, "golden blueprint must have three stages");

const compiled = compileVerticalSliceBlueprint(blueprint);
const graphValidation = validateRecipeGraph(compiled.recipeGraph);
assert(graphValidation.valid, JSON.stringify(graphValidation));
assert(compiled.nodes.length === 3, "compiled blueprint must preserve three runtime nodes");
assert(equalJson(compiled.gameplayCards, ["survivor_horde"]), "one shared base card expected");
assert(compiled.recipeGraph.metadata.runtimeCompatibility === "resolved_linear_nodes", "must target existing runtime compiler");
assert(compiled.recipeGraph.metadata.blueprintId === blueprint.id, "compiled graph retains blueprint identity");

const legacy = readJson(LEGACY_GRAPH);
const normalizedLegacyNodes = legacy.nodes.map((node) => ({
  ...node.payload,
  taunts: node.payload.taunts || [],
  rewards: node.payload.rewards || "",
  resourceMultiplier: node.payload.resourceMultiplier ?? 1,
  gameplay: { ...node.payload.gameplay, patchLevel: node.payload.gameplay.patchLevel || "L2" }
}));
assert(
  equalJson(compiled.nodes, normalizedLegacyNodes),
  "Blueprint must preserve the existing golden node contract while adding explicit runtime defaults"
);

const compositionProgram = String.raw`
import json, sys
from pathlib import Path
from backend.gameplay_composition import validate_gameplay_composition
spec = json.load(sys.stdin)
result = validate_gameplay_composition(
    spec,
    cards_root=Path("minigame_master/gameplay/cards"),
)
print(json.dumps(result))
sys.exit(0 if result.get("status") == "passed" else 2)
`;
const composition = spawnSync("python3", ["-c", compositionProgram], {
  cwd: ROOT,
  input: JSON.stringify({ nodes: compiled.nodes }),
  encoding: "utf8"
});
assert(composition.status === 0, `compiled composition failed: ${composition.stdout}\n${composition.stderr}`);
const compositionReport = JSON.parse(composition.stdout.trim());
assert(compositionReport.checkedNodes === 3, "composition checks all blueprint stages");
assert(compositionReport.checkedModifiers === 4, "composition checks all four modifiers");

const alignmentCandidate = clone(blueprint);
alignmentCandidate.id = "candidate-only";
alignmentCandidate.status = "alignment_candidate";
alignmentCandidate.missingCapabilities = ["gameplay_card:missing_future_card"];
alignmentCandidate.promotion = {
  state: "candidate",
  evidenceRefs: [],
  approvedBy: null,
  approvedAt: null
};
const candidateValidation = validateVerticalSliceBlueprint(alignmentCandidate);
assert(candidateValidation.valid, JSON.stringify(candidateValidation));
assert(candidateValidation.compilable === false, "alignment candidate cannot compile");
expectThrow(() => compileVerticalSliceBlueprint(alignmentCandidate), "not runtime compilable");

const falseRuntimeClaim = clone(alignmentCandidate);
falseRuntimeClaim.status = "runtime_supported";
const falseClaimValidation = validateVerticalSliceBlueprint(falseRuntimeClaim);
assert(!falseClaimValidation.valid, "runtime claim with missing capability must fail");
assert(falseClaimValidation.errors.some((item) => item.startsWith("runtime_blueprint_has_missing_capabilities")));

const executablePayload = clone(blueprint);
executablePayload.stages[0].scriptPath = "copied-vibegame-runtime.js";
const executableValidation = validateVerticalSliceBlueprint(executablePayload);
assert(!executableValidation.valid, "Blueprint must reject embedded executable paths");
assert(executableValidation.errors.some((item) => item.startsWith("executable_payload_forbidden")));

const missingModifier = clone(blueprint);
missingModifier.stages[1].node.gameplay.modifiers.push("vibegame_only_module");
const missingModifierValidation = validateVerticalSliceBlueprint(missingModifier);
assert(!missingModifierValidation.valid, "unknown module cannot masquerade as LoreWeaver modifier");
assert(missingModifierValidation.errors.some((item) => item.includes("stage_modifier_not_found")));

const duplicateStage = clone(blueprint);
duplicateStage.stages[1].id = duplicateStage.stages[0].id;
const duplicateValidation = validateVerticalSliceBlueprint(duplicateStage);
assert(!duplicateValidation.valid, "duplicate stage ids must fail");

const catalog = readJson(CATALOG);
const candidates = catalog.entries.filter((entry) => entry.origin === "VibeGame concept alignment");
assert(candidates.length === 5, "five VibeGame subtype candidates expected");
for (const candidate of candidates) {
  assert(candidate.status === "alignment_candidate", `${candidate.id} must remain alignment_candidate`);
  assert(candidate.blueprintRef === null, `${candidate.id} must not expose a compilable fixture`);
  assert(candidate.missingCapabilities.length > 0, `${candidate.id} must state missing capabilities`);
}

console.log(JSON.stringify({
  schemaVersion: "loreweaver.vertical-slice-blueprint-check.v1",
  status: "passed",
  blueprintId: blueprint.id,
  blueprintHash: compiled.blueprintHash,
  stageCount: compiled.nodes.length,
  checkedModifiers: compositionReport.checkedModifiers,
  alignmentCandidates: candidates.map((candidate) => candidate.id),
  checks: [
    "verified_blueprint_compiles_to_existing_recipe_graph",
    "compiled_nodes_pass_real_gameplay_composition_validator",
    "alignment_candidate_is_non_compilable",
    "missing_capability_blocks_runtime_claim",
    "executable_payload_is_forbidden",
    "unknown_module_cannot_bypass_catalog",
    "candidate_catalog_does_not_claim_runtime_support"
  ]
}, null, 2));
