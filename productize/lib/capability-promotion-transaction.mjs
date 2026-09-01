import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateCapabilityPromotion } from "./capability-promotion.mjs";

const DESTINATION_ROOTS = Object.freeze({
  blueprint: "minigame_master/capabilities/blueprints",
  capability_module: "minigame_master/capabilities/modules",
  production_contract: "minigame_master/capabilities/contracts",
  asset_recipe: "minigame_master/capabilities/asset-recipes"
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = canonical(value[key]);
      return out;
    }, {});
  }
  return value;
}

export function hashPromotionCandidate(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonical(value ?? null)))
    .digest("hex");
}

function safeDestination(repositoryRoot, kind, destinationPath) {
  const allowedRoot = DESTINATION_ROOTS[kind];
  if (!allowedRoot) throw new Error(`promotion_kind_has_no_destination_root:${kind}`);
  const normalized = String(destinationPath || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("promotion_destination_unsafe");
  }
  if (!(normalized === allowedRoot || normalized.startsWith(`${allowedRoot}/`))) {
    throw new Error(`promotion_destination_outside_kind_root:${allowedRoot}`);
  }
  const root = path.resolve(repositoryRoot);
  const target = path.resolve(root, normalized);
  if (!`${target}${path.sep}`.startsWith(`${root}${path.sep}`)) {
    throw new Error("promotion_destination_outside_repository");
  }
  return { normalized, target };
}

function approvalToken({ promotion, candidateHash, destinationPath }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    schemaVersion: "loreweaver.capability-promotion-approval.v1",
    promotionId: promotion.id,
    capabilityId: promotion.candidate?.capabilityId,
    sourceWorkspaceId: promotion.candidate?.sourceWorkspaceId,
    sourceRevision: promotion.candidate?.sourceRevision,
    destinationPath,
    candidateHash,
    approvedBy: promotion.approval?.approvedBy,
    approvedAt: promotion.approval?.approvedAt
  })).digest("hex");
}

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`
  );
  try {
    fs.writeFileSync(temp, content, { encoding: "utf8", flag: "wx" });
    const fd = fs.openSync(temp, "r");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function validateDocument(candidateDocument, validator) {
  if (!candidateDocument || typeof candidateDocument !== "object" || Array.isArray(candidateDocument)) {
    return { valid: false, errors: ["candidate_document_not_object"], warnings: [] };
  }
  if (typeof validator !== "function") {
    return { valid: false, errors: ["candidate_validator_required"], warnings: [] };
  }
  const result = validator(candidateDocument);
  if (!result || result.valid !== true) {
    return {
      valid: false,
      errors: result?.errors || ["candidate_validation_failed"],
      warnings: result?.warnings || []
    };
  }
  return { valid: true, errors: [], warnings: result.warnings || [] };
}

export function previewCapabilityPromotion({
  promotion,
  candidateDocument,
  repositoryRoot,
  validator
}) {
  const policy = evaluateCapabilityPromotion(promotion);
  if (!policy.promotionAllowed) {
    return {
      schemaVersion: "loreweaver.capability-promotion-transaction.v1",
      status: "blocked",
      writeAllowed: false,
      blockers: policy.blockers,
      warnings: policy.warnings,
      policy
    };
  }

  let destination;
  try {
    destination = safeDestination(repositoryRoot, promotion.kind, promotion.destination?.path);
  } catch (error) {
    return {
      schemaVersion: "loreweaver.capability-promotion-transaction.v1",
      status: "blocked",
      writeAllowed: false,
      blockers: [error?.message || String(error)],
      warnings: policy.warnings,
      policy
    };
  }

  if (fs.existsSync(destination.target)) {
    return {
      schemaVersion: "loreweaver.capability-promotion-transaction.v1",
      status: "blocked",
      writeAllowed: false,
      blockers: ["destination_conflict_at_preview"],
      warnings: policy.warnings,
      policy,
      destination: destination.normalized
    };
  }

  const validation = validateDocument(candidateDocument, validator);
  if (!validation.valid) {
    return {
      schemaVersion: "loreweaver.capability-promotion-transaction.v1",
      status: "blocked",
      writeAllowed: false,
      blockers: validation.errors.map((item) => `candidate_invalid:${item}`),
      warnings: [...policy.warnings, ...validation.warnings],
      policy,
      destination: destination.normalized
    };
  }

  const candidateHash = hashPromotionCandidate(candidateDocument);
  const token = approvalToken({ promotion, candidateHash, destinationPath: destination.normalized });
  return {
    schemaVersion: "loreweaver.capability-promotion-transaction.v1",
    status: "ready_for_explicit_write_approval",
    writeAllowed: false,
    dryRun: true,
    blockers: [],
    warnings: [...policy.warnings, ...validation.warnings],
    promotionId: promotion.id,
    capabilityId: promotion.candidate.capabilityId,
    kind: promotion.kind,
    destination: destination.normalized,
    candidateHash,
    approvalToken: token,
    diff: {
      operation: "create",
      path: destination.normalized,
      before: null,
      afterSha256: candidateHash,
      bytes: Buffer.byteLength(`${JSON.stringify(candidateDocument, null, 2)}\n`, "utf8")
    },
    policy
  };
}

export function commitCapabilityPromotion({
  promotion,
  candidateDocument,
  repositoryRoot,
  validator,
  approvalToken: suppliedApprovalToken
}) {
  const preview = previewCapabilityPromotion({ promotion, candidateDocument, repositoryRoot, validator });
  if (preview.status !== "ready_for_explicit_write_approval") return preview;
  if (!suppliedApprovalToken || suppliedApprovalToken !== preview.approvalToken) {
    return {
      ...preview,
      status: "blocked",
      writeAllowed: false,
      dryRun: false,
      blockers: ["explicit_write_approval_token_missing_or_mismatched"]
    };
  }

  const destination = safeDestination(repositoryRoot, promotion.kind, preview.destination);
  if (fs.existsSync(destination.target)) {
    return {
      ...preview,
      status: "blocked",
      writeAllowed: false,
      dryRun: false,
      blockers: ["destination_conflict_after_approval"]
    };
  }

  const currentHash = hashPromotionCandidate(candidateDocument);
  if (currentHash !== preview.candidateHash) {
    return {
      ...preview,
      status: "blocked",
      writeAllowed: false,
      dryRun: false,
      blockers: ["candidate_changed_after_approval"]
    };
  }

  const serialized = `${JSON.stringify(candidateDocument, null, 2)}\n`;
  atomicWrite(destination.target, serialized);
  const writtenHash = hashPromotionCandidate(JSON.parse(fs.readFileSync(destination.target, "utf8")));
  if (writtenHash !== preview.candidateHash) {
    fs.rmSync(destination.target, { force: true });
    throw new Error("promotion_atomic_write_integrity_failed");
  }

  return {
    ...preview,
    schemaVersion: "loreweaver.capability-promotion-transaction.v1",
    status: "promoted",
    writeAllowed: true,
    dryRun: false,
    approvalToken: null,
    written: {
      path: preview.destination,
      sha256: writtenHash,
      host: os.hostname(),
      atomic: true,
      overwrite: false
    }
  };
}

export { DESTINATION_ROOTS };
