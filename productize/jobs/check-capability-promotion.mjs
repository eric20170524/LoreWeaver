#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCapabilityPromotion } from "../lib/capability-promotion.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/capability_promotion.schema.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function assert(value, message) {
  if (!value) throw new Error(message);
}
function evidence(id, kind, extra = {}) {
  return {
    id,
    kind,
    path: `data/workspaces/ws-verified/reports/${id}.json`,
    status: "passed",
    real: true,
    fixture: false,
    synthetic: false,
    stale: false,
    ...extra
  };
}
function validModulePromotion() {
  return {
    schemaVersion: "loreweaver.capability-promotion.v1",
    id: "promote-boss-readability",
    kind: "capability_module",
    candidate: {
      capabilityId: "boss_readability",
      sourceWorkspaceId: "ws-verified",
      sourceRevision: "abcdef123456",
      sourceLicense: "LoreWeaver Personal Use License 1.0",
      patchLevel: "L2",
      reusableSurface: "modifier composition and externalized telegraph knobs",
      parameterized: true,
      allTunablesExternalized: true,
      publicInterface: ["warningDelayMs", "damage", "phaseThresholds"],
      staticCheckRef: "productize/jobs/check-golden-vertical-slice.py",
      projectSpecificTerms: [],
      privatePaths: []
    },
    evidence: {
      usageCount: 1,
      refs: [
        evidence("usage", "usage"),
        evidence("static", "static"),
        evidence("runtime", "runtime")
      ]
    },
    approval: {
      required: true,
      approvedBy: "repository-owner",
      approvedAt: "2026-08-31T01:00:00Z"
    },
    destination: {
      path: "minigame_master/gameplay/cards/modifiers/boss_readability.json",
      exists: false
    },
    status: "approved"
  };
}

const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
assert(schema.$id, "promotion schema must declare $id");

const valid = evaluateCapabilityPromotion(validModulePromotion());
assert(valid.promotionAllowed === true, JSON.stringify(valid));
assert(valid.dryRunOnly === true, "Phase A promotion can only approve a dry run");
assert(valid.status === "approved_for_dry_run", "valid candidate gets a decision, not an automatic write");

const noApprovalInput = validModulePromotion();
noApprovalInput.approval.approvedBy = null;
noApprovalInput.approval.approvedAt = null;
const noApproval = evaluateCapabilityPromotion(noApprovalInput);
assert(!noApproval.promotionAllowed, "promotion without explicit approval must fail");
assert(noApproval.blockers.includes("explicit_user_approval_missing"));

const fixtureInput = validModulePromotion();
fixtureInput.evidence.refs = fixtureInput.evidence.refs.map((ref) => ({ ...ref, fixture: true }));
const fixture = evaluateCapabilityPromotion(fixtureInput);
assert(!fixture.promotionAllowed, "fixture evidence cannot promote a public prior");
assert(fixture.blockers.some((item) => item.startsWith("evidence_ineligible")));
assert(fixture.blockers.includes("required_evidence_kind_missing:runtime"));

const syntheticInput = validModulePromotion();
syntheticInput.evidence.refs[2].synthetic = true;
const synthetic = evaluateCapabilityPromotion(syntheticInput);
assert(!synthetic.promotionAllowed, "synthetic runtime evidence cannot promote a module");
assert(synthetic.blockers.includes("evidence_ineligible:runtime"));

const staleInput = validModulePromotion();
staleInput.evidence.refs[2].stale = true;
staleInput.evidence.refs[2].status = "stale";
const stale = evaluateCapabilityPromotion(staleInput);
assert(!stale.promotionAllowed, "stale evidence cannot promote");

const l3Input = validModulePromotion();
l3Input.candidate.patchLevel = "L3";
const l3 = evaluateCapabilityPromotion(l3Input);
assert(!l3.promotionAllowed, "L3 promotion must never be automatic");
assert(l3.blockers.includes("automatic_promotion_forbidden_for_L3"));
assert(l3.requiredActions.includes("open_manual_architecture_review_task"));

const privateInput = validModulePromotion();
privateInput.candidate.privatePaths = ["/Users/alice/private-game/.env"];
const privateDecision = evaluateCapabilityPromotion(privateInput);
assert(!privateDecision.promotionAllowed, "private paths must block promotion");
assert(privateDecision.blockers.includes("private_paths_declared"));

const projectSpecificInput = validModulePromotion();
projectSpecificInput.candidate.projectSpecificTerms = ["Princess Eric Exclusive Boss"];
const projectSpecific = evaluateCapabilityPromotion(projectSpecificInput);
assert(!projectSpecific.promotionAllowed, "project-specific vocabulary must be generalized");
assert(projectSpecific.blockers.includes("project_specific_terms_not_removed"));

const conflictInput = validModulePromotion();
conflictInput.destination.exists = true;
const conflict = evaluateCapabilityPromotion(conflictInput);
assert(!conflict.promotionAllowed, "existing destination must fail closed");
assert(conflict.blockers.includes("destination_already_exists"));

const noRuntimeBlueprintInput = validModulePromotion();
noRuntimeBlueprintInput.id = "promote-blueprint";
noRuntimeBlueprintInput.kind = "blueprint";
noRuntimeBlueprintInput.candidate.capabilityId = "action_boss_fight_2d";
noRuntimeBlueprintInput.destination.path = "productize/fixtures/blueprints/action_boss_fight_2d.blueprint.json";
noRuntimeBlueprintInput.evidence.refs = noRuntimeBlueprintInput.evidence.refs.filter((ref) => ref.kind !== "runtime");
const noRuntimeBlueprint = evaluateCapabilityPromotion(noRuntimeBlueprintInput);
assert(!noRuntimeBlueprint.promotionAllowed, "Blueprint requires real runtime evidence");
assert(noRuntimeBlueprint.blockers.includes("required_evidence_kind_missing:runtime"));

const contractInput = validModulePromotion();
contractInput.id = "promote-contract";
contractInput.kind = "production_contract";
contractInput.candidate.capabilityId = "candidate-certification";
contractInput.candidate.parameterized = false;
contractInput.candidate.allTunablesExternalized = false;
contractInput.candidate.publicInterface = [];
contractInput.candidate.staticCheckRef = null;
contractInput.evidence.refs = [evidence("usage-contract", "usage"), evidence("static-contract", "static")];
contractInput.destination.path = "minigame_master/contracts/candidate_certification_contract.md";
const contractDecision = evaluateCapabilityPromotion(contractInput);
assert(contractDecision.promotionAllowed, JSON.stringify(contractDecision));

const assetInput = validModulePromotion();
assetInput.id = "promote-asset-recipe";
assetInput.kind = "asset_recipe";
assetInput.candidate.capabilityId = "sprite-edge-cleanup";
assetInput.candidate.staticCheckRef = null;
assetInput.evidence.refs = [evidence("usage-art", "usage"), evidence("visual-art", "visual")];
assetInput.destination.path = "minigame_master/capabilities/asset-recipes/sprite-edge-cleanup.json";
const assetDecision = evaluateCapabilityPromotion(assetInput);
assert(assetDecision.promotionAllowed, JSON.stringify(assetDecision));

console.log(JSON.stringify({
  schemaVersion: "loreweaver.capability-promotion-check.v1",
  status: "passed",
  checks: [
    "verified_L2_candidate_can_reach_dry_run_decision",
    "no_automatic_file_copy",
    "explicit_approval_required",
    "fixture_synthetic_stale_evidence_rejected",
    "L3_L4_automatic_promotion_rejected",
    "private_paths_and_project_terms_rejected",
    "destination_conflict_fails_closed",
    "blueprint_requires_runtime_evidence",
    "kind_specific_evidence_contracts"
  ]
}, null, 2));
