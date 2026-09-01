#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const compiler = fs.readFileSync(path.join(ROOT, "productize/release-compiler.mjs"), "utf8");
const promoter = fs.readFileSync(path.join(ROOT, "productize/promote-certified.mjs"), "utf8");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const dryRunIndex = compiler.indexOf("if (dryRun)");
const certifiedIndex = compiler.indexOf('if (mode === "certified")');
const reviewerIndex = compiler.indexOf('role: "reviewer"');
const promoterSpawnIndex = compiler.indexOf("const promoter = path.join");
assert(dryRunIndex >= 0 && certifiedIndex > dryRunIndex, "dry-run branch must exit before Certified Task role synchronization");
assert(reviewerIndex > certifiedIndex, "Reviewer sync must exist only in real Certified execution path");
assert(promoterSpawnIndex > reviewerIndex, "strict release decision must be mirrored to Reviewer before artifact promotion");
assert(!compiler.slice(dryRunIndex, certifiedIndex).includes('role: "reviewer"'), "dry-run must never append Reviewer handoff");
assert(compiler.includes("reviewerTaskSync"), "Certified compiler output must expose Reviewer sync result");
assert(compiler.includes("orchestratorTaskSync: promoted.taskSync || null"), "Certified compiler output must surface promoter Orchestrator sync result");

const payloadProofIndex = promoter.indexOf("const afterIdentity = hashExecutablePayloadManifest");
const zipIndex = promoter.indexOf('const certifiedZip = path.join(EXPORTS_ROOT');
const certifiedShaIndex = promoter.indexOf("const certifiedSha = crypto.createHash");
const promotionReportIndex = promoter.indexOf('const promotionReportPath = path.join(workspaceReportsDir, "certified_promotion_latest.json")');
const writePromotionIndex = promoter.indexOf("writeJson(promotionReportPath, promotionReport)");
const orchestratorIndex = promoter.indexOf('role: "orchestrator"');
assert(payloadProofIndex >= 0 && zipIndex > payloadProofIndex, "Certified archive must be created only after executable payload preservation proof");
assert(certifiedShaIndex > zipIndex, "Certified artifact SHA must be computed after archive creation");
assert(promotionReportIndex > certifiedShaIndex, "promotion report must be constructed only after Certified artifact identity exists");
assert(writePromotionIndex > promotionReportIndex, "promotion report must be durably written before final Task synchronization");
assert(orchestratorIndex > writePromotionIndex, "Orchestrator acceptance must happen only after promotion report is durable");
assert(promoter.includes('schemaVersion: "loreweaver.certified-promotion-report.v1"'), "promoter must emit canonical promotion report schema");
assert(promoter.includes("metadataOnlyPromotion: true"), "promotion report must explicitly declare metadata-only semantics");
assert(promoter.includes("payloadPreserved: true"), "promotion report must explicitly record payload preservation");
assert(promoter.includes("fixture: false") && promoter.includes("synthetic: false") && promoter.includes("stale: false"), "promotion report must not masquerade as fixture/synthetic/stale evidence");
assert(promoter.includes("promotionReport: repoRelative(promotionReportPath)"), "Certified output must expose promotion report path");
assert(promoter.includes("taskSync"), "Certified output must expose final Orchestrator Task sync result");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.release-task-finalization-wiring-check.v1",
  status: "passed",
  checks: [
    "dry_run_never_appends_reviewer",
    "strict_certified_decision_mirrors_reviewer_before_promotion",
    "payload_preservation_precedes_archive_and_promotion_report",
    "certified_artifact_identity_precedes_promotion_report",
    "promotion_report_is_durable_before_orchestrator_acceptance",
    "promotion_report_declares_metadata_only_payload_preserved_real_state",
    "certified_output_surfaces_both_task_sync_results"
  ]
}, null, 2));
