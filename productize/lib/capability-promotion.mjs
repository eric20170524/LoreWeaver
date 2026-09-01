import path from "node:path";

const PATCH_RANK = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 });
const PROMOTION_KINDS = new Set([
  "blueprint",
  "capability_module",
  "production_contract",
  "asset_recipe"
]);
const PRIVATE_PATH_MARKERS = [
  "/Users/",
  "/home/",
  "\\Users\\",
  ".env",
  "secrets/",
  "private/",
  "credentials"
];

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function unsafePath(value) {
  const text = String(value || "");
  if (!text) return false;
  if (path.isAbsolute(text) || text.split(/[\\/]+/).includes("..")) return true;
  return PRIVATE_PATH_MARKERS.some((marker) => text.toLowerCase().includes(marker.toLowerCase()));
}

function evidenceEligible(ref) {
  return Boolean(
    ref &&
    ref.status === "passed" &&
    ref.real === true &&
    ref.fixture !== true &&
    ref.synthetic !== true &&
    ref.stale !== true &&
    !unsafePath(ref.path)
  );
}

function requiredEvidenceKinds(kind) {
  if (kind === "blueprint" || kind === "capability_module") {
    return ["usage", "static", "runtime"];
  }
  if (kind === "asset_recipe") return ["usage", "visual"];
  return ["usage", "static"];
}

export function evaluateCapabilityPromotion(promotion) {
  const blockers = [];
  const warnings = [];
  const requiredActions = [];
  if (!promotion || typeof promotion !== "object" || Array.isArray(promotion)) {
    return {
      schemaVersion: "loreweaver.capability-promotion-decision.v1",
      status: "blocked",
      promotionAllowed: false,
      dryRunOnly: true,
      blockers: ["promotion_not_object"],
      warnings,
      requiredActions: ["provide_valid_promotion_contract"]
    };
  }
  if (promotion.schemaVersion !== "loreweaver.capability-promotion.v1") {
    blockers.push("schema_version_invalid");
  }
  if (!PROMOTION_KINDS.has(promotion.kind)) {
    blockers.push(`promotion_kind_invalid:${promotion.kind || "missing"}`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(promotion.id || ""))) {
    blockers.push("promotion_id_invalid");
  }

  const candidate = promotion.candidate || {};
  for (const field of ["capabilityId", "sourceWorkspaceId", "sourceRevision", "sourceLicense", "reusableSurface"]) {
    if (!present(candidate[field])) blockers.push(`candidate_${field}_missing`);
  }
  if (String(candidate.sourceRevision || "").length < 7) {
    blockers.push("candidate_source_revision_too_short");
  }
  const patchLevel = candidate.patchLevel;
  if (!(patchLevel in PATCH_RANK)) {
    blockers.push(`candidate_patch_level_invalid:${patchLevel || "missing"}`);
  } else if (PATCH_RANK[patchLevel] > PATCH_RANK.L2) {
    blockers.push(`automatic_promotion_forbidden_for_${patchLevel}`);
    requiredActions.push("open_manual_architecture_review_task");
  }
  if ((candidate.projectSpecificTerms || []).length) {
    blockers.push("project_specific_terms_not_removed");
    requiredActions.push("generalize_project_specific_vocabulary");
  }
  if ((candidate.privatePaths || []).length) {
    blockers.push("private_paths_declared");
    requiredActions.push("remove_private_paths_and_secrets");
  }
  for (const privatePath of candidate.privatePaths || []) {
    if (unsafePath(privatePath)) warnings.push(`unsafe_private_path:${privatePath}`);
  }

  const destination = promotion.destination || {};
  if (!present(destination.path)) blockers.push("destination_path_missing");
  else if (unsafePath(destination.path)) blockers.push("destination_path_unsafe");
  if (destination.exists === true) {
    blockers.push("destination_already_exists");
    requiredActions.push("perform_explicit_conflict_review");
  }

  const evidence = promotion.evidence || {};
  if (!Number.isInteger(evidence.usageCount) || evidence.usageCount < 1) {
    blockers.push("real_usage_count_required");
  }
  const refs = Array.isArray(evidence.refs) ? evidence.refs : [];
  if (!refs.length) blockers.push("promotion_evidence_missing");
  const ineligibleRefs = refs.filter((ref) => !evidenceEligible(ref));
  for (const ref of ineligibleRefs) {
    blockers.push(`evidence_ineligible:${ref?.id || "unknown"}`);
  }
  const eligibleKinds = new Set(refs.filter(evidenceEligible).map((ref) => ref.kind));
  for (const kind of requiredEvidenceKinds(promotion.kind)) {
    if (!eligibleKinds.has(kind)) {
      blockers.push(`required_evidence_kind_missing:${kind}`);
      requiredActions.push(`collect_real_${kind}_evidence`);
    }
  }

  if (promotion.kind === "capability_module") {
    if (candidate.parameterized !== true) blockers.push("module_not_parameterized");
    if (candidate.allTunablesExternalized !== true) blockers.push("module_tunables_not_externalized");
    if (!Array.isArray(candidate.publicInterface) || !candidate.publicInterface.length) {
      blockers.push("module_public_interface_missing");
    }
    if (!present(candidate.staticCheckRef) || unsafePath(candidate.staticCheckRef)) {
      blockers.push("module_static_check_missing_or_unsafe");
    }
  }
  if (promotion.kind === "blueprint") {
    if (candidate.allTunablesExternalized !== true) blockers.push("blueprint_tunables_not_externalized");
    if (!Array.isArray(candidate.publicInterface) || !candidate.publicInterface.length) {
      blockers.push("blueprint_public_interface_missing");
    }
  }
  if (promotion.kind === "asset_recipe" && candidate.parameterized !== true) {
    blockers.push("asset_recipe_not_parameterized");
  }

  const approval = promotion.approval || {};
  if (approval.required !== true) blockers.push("explicit_approval_must_be_required");
  if (!present(approval.approvedBy) || !present(approval.approvedAt)) {
    blockers.push("explicit_user_approval_missing");
    requiredActions.push("request_explicit_user_approval");
  }
  if (!present(candidate.sourceLicense)) {
    blockers.push("source_license_missing");
  }
  if (promotion.status !== "approved") {
    blockers.push(`promotion_status_must_be_approved:${promotion.status || "missing"}`);
  }

  const promotionAllowed = blockers.length === 0;
  return {
    schemaVersion: "loreweaver.capability-promotion-decision.v1",
    promotionId: promotion.id || null,
    capabilityId: candidate.capabilityId || null,
    kind: promotion.kind || null,
    status: promotionAllowed ? "approved_for_dry_run" : "blocked",
    promotionAllowed,
    dryRunOnly: true,
    blockers: unique(blockers),
    warnings: unique(warnings),
    requiredActions: unique(requiredActions),
    evidenceSummary: {
      usageCount: evidence.usageCount ?? 0,
      eligibleCount: refs.length - ineligibleRefs.length,
      ineligibleCount: ineligibleRefs.length,
      eligibleKinds: [...eligibleKinds].sort()
    },
    authority: {
      requestedPatchLevel: patchLevel || null,
      maxAutomaticPatchLevel: "L2",
      requiresExplicitApproval: true
    },
    destination: {
      path: destination.path || null,
      exists: destination.exists === true
    }
  };
}
