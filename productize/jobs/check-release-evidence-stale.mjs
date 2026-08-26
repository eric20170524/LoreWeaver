#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  markReleaseEvidenceStale,
  releaseEvidenceTargets
} from "../lib/mark-gate-reports-stale.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-stale-release-"));
const shared = path.join(root, "shared");
const workspace = path.join(root, "workspace");
const cardId = "survivor_horde";
const targets = releaseEvidenceTargets([cardId]);

for (const file of [
  `human_playtest_${cardId}_latest.json`,
  `device_verification_${cardId}_latest.json`,
  "release_decision_latest.json",
  "export_artifact_meta.json",
  "standalone_browser_report.json",
  "visual_audit_latest.json",
  `visual_audit_${cardId}_latest.json`
]) {
  writeJson(path.join(workspace, file), {
    schemaVersion: "test",
    status: "passed",
    releaseCertified: file === "release_decision_latest.json",
    exportAllowed: file === "release_decision_latest.json",
    releaseEligible: ["export_artifact_meta.json", "visual_audit_latest.json", `visual_audit_${cardId}_latest.json`].includes(file),
    freshness: "fresh"
  });
}
writeJson(path.join(shared, `runtime_e2e_${cardId}_latest.json`), {
  status: "passed",
  cardId,
  releaseEligible: true
});

const identity = {
  cardId,
  recipeHash: "new-recipe-hash",
  contentHash: "new-content-hash",
  runtimeVersion: "runtime-v2"
};
const result = markReleaseEvidenceStale({
  sharedReportsDir: shared,
  workspaceReportsDir: workspace,
  cardIds: [cardId],
  reason: "test_identity_change",
  identity
});

assert(result.workspace.marked.length >= 7, "workspace evidence including visual evidence should be invalidated");
assert(result.shared.marked.some((m) => m.file === `runtime_e2e_${cardId}_latest.json`), "shared per-card runtime evidence should be invalidated");

const human = readJson(path.join(workspace, `human_playtest_${cardId}_latest.json`));
const device = readJson(path.join(workspace, `device_verification_${cardId}_latest.json`));
const decision = readJson(path.join(workspace, "release_decision_latest.json"));
const artifact = readJson(path.join(workspace, "export_artifact_meta.json"));
const visualLatest = readJson(path.join(workspace, "visual_audit_latest.json"));
const visualCard = readJson(path.join(workspace, `visual_audit_${cardId}_latest.json`));
for (const evidence of [human, device, decision, artifact, visualLatest, visualCard]) {
  assert(evidence.status === "stale", "evidence status must become stale");
  assert(evidence.freshness === "stale", "evidence freshness must become stale");
  assert(evidence.invalidatedBy.recipeHash === identity.recipeHash, "new identity must be recorded");
}
assert(decision.exportAllowed === false, "stale release decision cannot export");
assert(decision.releaseCertified === false, "stale release decision cannot remain certified");
assert(artifact.releaseEligible === false, "stale artifact metadata cannot remain release eligible");
assert(targets.includes(`human_playtest_${cardId}_latest.json`), "target helper includes human evidence");
assert(targets.includes("visual_audit_latest.json"), "target helper includes generic exact VLM evidence");
assert(targets.includes(`visual_audit_${cardId}_latest.json`), "target helper includes card-scoped exact VLM evidence");

console.log("PASSED release evidence stale propagation checks");
console.log(JSON.stringify({
  workspaceMarked: result.workspace.marked.map((m) => m.file),
  sharedMarked: result.shared.marked.map((m) => m.file),
  invalidatedBy: identity
}, null, 2));
