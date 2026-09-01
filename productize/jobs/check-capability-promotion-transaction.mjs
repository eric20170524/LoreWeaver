#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  commitCapabilityPromotion,
  previewCapabilityPromotion
} from "../lib/capability-promotion-transaction.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function evidence(id, kind) {
  return {
    id,
    kind,
    status: "passed",
    real: true,
    fixture: false,
    synthetic: false,
    stale: false,
    path: `reports/${id}.json`
  };
}

function promotion(destination = "minigame_master/capabilities/blueprints/promoted-demo.json") {
  return {
    schemaVersion: "loreweaver.capability-promotion.v1",
    id: "promote-demo-blueprint",
    kind: "blueprint",
    status: "approved",
    candidate: {
      capabilityId: "promoted_demo",
      sourceWorkspaceId: "workspace-real-01",
      sourceRevision: "1234567890abcdef",
      sourceLicense: "original-project-work",
      reusableSurface: "three-stage survivor vertical slice",
      patchLevel: "L2",
      projectSpecificTerms: [],
      privatePaths: [],
      parameterized: true,
      allTunablesExternalized: true,
      publicInterface: ["durationSec", "difficulty", "goalValue"]
    },
    destination: { path: destination, exists: false },
    evidence: {
      usageCount: 2,
      refs: [
        evidence("usage-1", "usage"),
        evidence("static-1", "static"),
        evidence("runtime-1", "runtime")
      ]
    },
    approval: {
      required: true,
      approvedBy: "repository-owner",
      approvedAt: "2026-09-01T01:00:00Z"
    }
  };
}

function candidate(id = "promoted_demo") {
  return {
    schemaVersion: "test.blueprint.v1",
    id,
    title: "Promoted Demo",
    status: "verified",
    config: { durationSec: 90, difficulty: 2 }
  };
}

function validator(value) {
  const errors = [];
  if (value?.schemaVersion !== "test.blueprint.v1") errors.push("schema_version_invalid");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(value?.id || ""))) errors.push("id_invalid");
  return { valid: errors.length === 0, errors, warnings: [] };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-promotion-transaction-"));
try {
  const contract = promotion();
  const doc = candidate();
  const destination = path.join(root, contract.destination.path);

  const preview = previewCapabilityPromotion({
    promotion: contract,
    candidateDocument: doc,
    repositoryRoot: root,
    validator
  });
  assert(preview.status === "ready_for_explicit_write_approval", JSON.stringify(preview));
  assert(preview.writeAllowed === false && preview.dryRun === true, "preview must never write");
  assert(preview.approvalToken?.length === 64, "preview must return bound approval token");
  assert(!fs.existsSync(destination), "dry run must not create destination");
  assert(preview.diff.operation === "create" && preview.diff.afterSha256 === preview.candidateHash, "diff must bind candidate identity");

  const wrongToken = commitCapabilityPromotion({
    promotion: contract,
    candidateDocument: doc,
    repositoryRoot: root,
    validator,
    approvalToken: "0".repeat(64)
  });
  assert(wrongToken.status === "blocked", "wrong token must fail closed");
  assert(wrongToken.blockers.includes("explicit_write_approval_token_missing_or_mismatched"));
  assert(!fs.existsSync(destination), "wrong token must perform zero writes");

  const changed = commitCapabilityPromotion({
    promotion: contract,
    candidateDocument: { ...doc, config: { ...doc.config, difficulty: 3 } },
    repositoryRoot: root,
    validator,
    approvalToken: preview.approvalToken
  });
  assert(changed.status === "blocked", "candidate changed after preview must invalidate approval token");
  assert(changed.blockers.includes("explicit_write_approval_token_missing_or_mismatched"));
  assert(!fs.existsSync(destination));

  const committed = commitCapabilityPromotion({
    promotion: contract,
    candidateDocument: doc,
    repositoryRoot: root,
    validator,
    approvalToken: preview.approvalToken
  });
  assert(committed.status === "promoted", JSON.stringify(committed));
  assert(committed.writeAllowed === true && committed.written?.atomic === true);
  assert(committed.written?.overwrite === false);
  assert(fs.existsSync(destination), "approved transaction must create destination");
  assert(JSON.parse(fs.readFileSync(destination, "utf8")).id === doc.id, "written document mismatch");

  const replay = previewCapabilityPromotion({
    promotion: contract,
    candidateDocument: doc,
    repositoryRoot: root,
    validator
  });
  assert(replay.status === "blocked", "existing destination must block replay");
  assert(replay.blockers.includes("destination_conflict_at_preview"));

  const escaped = previewCapabilityPromotion({
    promotion: promotion("docs/escape.json"),
    candidateDocument: doc,
    repositoryRoot: root,
    validator
  });
  assert(escaped.status === "blocked", "kind-specific destination roots are mandatory");
  assert(escaped.blockers.some((item) => item.startsWith("promotion_destination_outside_kind_root")));

  const invalid = previewCapabilityPromotion({
    promotion: promotion("minigame_master/capabilities/blueprints/invalid.json"),
    candidateDocument: { ...doc, schemaVersion: "wrong" },
    repositoryRoot: root,
    validator
  });
  assert(invalid.status === "blocked", "candidate validator must run before approval token issuance");
  assert(invalid.blockers.includes("candidate_invalid:schema_version_invalid"));

  const l3 = promotion("minigame_master/capabilities/blueprints/l3.json");
  l3.candidate.patchLevel = "L3";
  const l3Decision = previewCapabilityPromotion({
    promotion: l3,
    candidateDocument: doc,
    repositoryRoot: root,
    validator
  });
  assert(l3Decision.status === "blocked", "L3 promotion must remain manual architecture review only");
  assert(l3Decision.blockers.includes("automatic_promotion_forbidden_for_L3"));

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.capability-promotion-transaction-check.v1",
    status: "passed",
    checks: [
      "dry_run_zero_writes",
      "candidate_validation_before_approval",
      "approval_token_binds_candidate_and_destination",
      "wrong_or_stale_approval_token_rejected",
      "kind_specific_destination_root",
      "conflict_checked_before_and_after_approval",
      "atomic_create_only_write",
      "post_write_hash_integrity",
      "L3_L4_remain_non_automatic"
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
