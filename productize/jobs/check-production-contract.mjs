#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_PATH = path.join(ROOT, "minigame_master/contracts/production_contract.schema.json");
const CONTRACT_PATH = path.join(ROOT, "minigame_master/capabilities/contracts/candidate-certification.contract.json");
const CATALOG_PATH = path.join(ROOT, "minigame_master/capabilities/contracts/catalog.json");
const EXPECTED_STAGE_ORDER = [
  "compile-candidate",
  "verify-runtime",
  "verify-visual",
  "verify-human",
  "verify-device",
  "independent-release-review",
  "promote-certified"
];
const REQUIRED_IDENTITY_FIELDS = [
  "specHash",
  "runtimeVersion",
  "payloadHash",
  "artifact",
  "artifactSha256",
  "screenshot",
  "screenshotSha256"
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function assert(value, message) {
  if (!value) throw new Error(message);
}
function repoFileExists(ref) {
  const full = path.resolve(ROOT, ref);
  const rootPrefix = `${ROOT}${path.sep}`;
  return `${full}${path.sep}`.startsWith(rootPrefix) && fs.existsSync(full);
}

const schema = readJson(SCHEMA_PATH);
const contract = readJson(CONTRACT_PATH);
const catalog = readJson(CATALOG_PATH);
assert(schema.$id, "ProductionContract schema must declare $id");
assert(contract.schemaVersion === "loreweaver.production-contract.v1", "contract schema version mismatch");
assert(contract.id === "candidate-certification", "unexpected contract id");
assert(contract.status === "verified", "shipped release chain should be a verified contract");
assert(JSON.stringify(contract.stages.map((stage) => stage.id)) === JSON.stringify(EXPECTED_STAGE_ORDER), "stage order must remain explicit and stable");
assert(new Set(contract.stages.map((stage) => stage.id)).size === contract.stages.length, "stage ids must be unique");

for (const stage of contract.stages) {
  assert(stage.owner, `${stage.id}: owner missing`);
  assert(stage.purpose, `${stage.id}: purpose missing`);
  assert(Array.isArray(stage.implementationRefs) && stage.implementationRefs.length > 0, `${stage.id}: implementation refs missing`);
  assert(Array.isArray(stage.validatorRefs) && stage.validatorRefs.length > 0, `${stage.id}: validator refs missing`);
  for (const ref of [...stage.implementationRefs, ...stage.validatorRefs]) {
    assert(repoFileExists(ref), `${stage.id}: declared implementation/validator does not exist: ${ref}`);
  }
}
for (const ref of contract.source.evidenceRefs) {
  assert(repoFileExists(ref), `contract source evidence does not exist: ${ref}`);
}

const stages = Object.fromEntries(contract.stages.map((stage) => [stage.id, stage]));
assert(stages["verify-runtime"].owner === "player", "runtime verification must be owned by Player");
assert(stages["verify-runtime"].requiredEvidenceKinds.includes("runtime"), "runtime stage requires runtime evidence");
assert(stages["verify-runtime"].requiredEvidenceKinds.includes("browser"), "runtime stage requires browser evidence");
assert(stages["verify-visual"].owner === "visual_critic", "visual evidence requires an independent critic");
assert(stages["verify-human"].owner === "human_tester", "human evidence cannot be self-certified by implementation agent");
assert(stages["verify-device"].owner === "device_tester", "device evidence cannot be self-certified by browser automation");
assert(stages["independent-release-review"].owner === "reviewer", "aggregate maturity requires independent review");
assert(stages["promote-certified"].owner === "orchestrator", "final promotion belongs to orchestrator after review");

assert(contract.evidenceContract.freshnessRequired === true, "fresh evidence must be required");
assert(contract.evidenceContract.realEvidenceOnly === true, "real evidence must be required");
assert(contract.evidenceContract.waiversAllowed === false, "strict Certified contract cannot allow waivers");
for (const field of REQUIRED_IDENTITY_FIELDS) {
  assert(contract.evidenceContract.identityFields.includes(field), `exact Candidate identity field missing: ${field}`);
}
assert(contract.failureModes.some((mode) => mode.id === "identity-mismatch"), "identity mismatch failure mode missing");
assert(contract.failureModes.some((mode) => mode.id === "candidate-reselection"), "candidate reselection failure mode missing");
assert(contract.failureModes.some((mode) => mode.id === "payload-mutated-during-promotion"), "payload mutation failure mode missing");

const serialized = JSON.stringify(contract);
assert(!serialized.includes("VibeGameSceneTree"), "ProductionContract must not import a second runtime authority");
assert(!serialized.includes("tmux"), "ProductionContract must be provider/process neutral");
assert(!serialized.includes("fixture evidence can certify"), "fixture evidence must never be promoted as release evidence");

const verifiedEntry = catalog.entries.find((entry) => entry.id === contract.id);
assert(verifiedEntry?.status === "verified", "verified contract must be discoverable in catalog");
assert(verifiedEntry.contractRef === "minigame_master/capabilities/contracts/candidate-certification.contract.json", "catalog ref mismatch");
const plannedEntries = catalog.entries.filter((entry) => entry.status === "planned");
assert(plannedEntries.length >= 5, "planned production contract backlog should be explicit");
for (const entry of plannedEntries) {
  assert(entry.contractRef === null, `${entry.id}: planned capability must not expose a false verified contract`);
  assert(Array.isArray(entry.missingCapabilities) && entry.missingCapabilities.length > 0, `${entry.id}: planned contract must state missing capabilities`);
}

console.log(JSON.stringify({
  schemaVersion: "loreweaver.production-contract-check.v1",
  status: "passed",
  contractId: contract.id,
  stageCount: contract.stages.length,
  stageOrder: EXPECTED_STAGE_ORDER,
  plannedContracts: plannedEntries.map((entry) => entry.id),
  checks: [
    "cross_role_stage_ownership",
    "declared_implementations_and_validators_exist",
    "static_runtime_visual_human_device_review_separation",
    "exact_candidate_identity_contract",
    "fresh_real_no_waiver_certification",
    "metadata_only_promotion_failure_mode",
    "planned_contracts_do_not_claim_support",
    "no_second_runtime_or_provider_process_coupling"
  ]
}, null, 2));
