#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  candidateReselectionEvidenceTargets,
  markCandidateReselectionEvidenceStale,
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
function freshEvidence(extra = {}) {
  return {
    schemaVersion: "test",
    status: "passed",
    freshness: "fresh",
    stale: false,
    ...extra
  };
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
  writeJson(path.join(workspace, file), freshEvidence({
    releaseCertified: file === "release_decision_latest.json",
    exportAllowed: file === "release_decision_latest.json",
    releaseEligible: ["export_artifact_meta.json", "visual_audit_latest.json", `visual_audit_${cardId}_latest.json`].includes(file)
  }));
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

// Candidate reselection is narrower than an authoring mutation: the new Browser
// report stays fresh while downstream package-bound evidence becomes stale.
const reselect = path.join(root, "reselect");
const browserPath = path.join(reselect, "standalone_browser_report.json");
const humanPath = path.join(reselect, `human_playtest_${cardId}_latest.json`);
const devicePath = path.join(reselect, `device_verification_${cardId}_latest.json`);
const visualPath = path.join(reselect, `visual_audit_${cardId}_latest.json`);
const decisionPath = path.join(reselect, "release_decision_latest.json");
const artifactPath = path.join(reselect, "export_artifact_meta.json");
for (const file of [browserPath, humanPath, devicePath, visualPath, decisionPath, artifactPath]) {
  writeJson(file, freshEvidence({
    cardId,
    releaseEligible: file === artifactPath,
    exportAllowed: file === decisionPath,
    releaseCertified: file === decisionPath
  }));
}
const previousBrowser = {
  status: "passed",
  specHash: "spec-a",
  runtimeVersion: "runtime-a",
  payloadHash: "payload-a",
  artifact: "candidate-a.zip",
  artifactSha256: "artifact-a",
  screenshotSha256: "screenshot-a"
};
const nextBrowser = {
  ...previousBrowser,
  artifact: "candidate-b.zip",
  artifactSha256: "artifact-b",
  screenshotSha256: "screenshot-b"
};
const reselection = markCandidateReselectionEvidenceStale({
  workspaceReportsDir: reselect,
  cardIds: [cardId],
  previousBrowserReport: previousBrowser,
  nextBrowserReport: nextBrowser
});
assert(reselection.changed === true, "new exact Candidate should trigger downstream invalidation");
assert(reselection.candidateChanged === true, "artifact identity change must be classified as Candidate change");
assert(readJson(browserPath).status === "passed", "Browser anchor must not be invalidated by Candidate reselection");
for (const file of [humanPath, devicePath, visualPath, decisionPath, artifactPath]) {
  const evidence = readJson(file);
  assert(evidence.status === "stale", `${path.basename(file)} must be stale after Candidate reselection`);
  assert(evidence.staleReason === "exact_candidate_reselected", `${path.basename(file)} must record Candidate reselection reason`);
}

// Re-verifying the same ZIP with a different screenshot only invalidates VLM and
// release decision. Human/device observations remain valid for the same artifact.
for (const file of [humanPath, devicePath, visualPath, decisionPath, artifactPath]) {
  writeJson(file, freshEvidence({
    cardId,
    releaseEligible: file === artifactPath,
    exportAllowed: file === decisionPath,
    releaseCertified: file === decisionPath
  }));
}
const screenshotOnly = markCandidateReselectionEvidenceStale({
  workspaceReportsDir: reselect,
  cardIds: [cardId],
  previousBrowserReport: nextBrowser,
  nextBrowserReport: { ...nextBrowser, screenshotSha256: "screenshot-c" }
});
assert(screenshotOnly.changed === true, "changed selected screenshot should invalidate VLM");
assert(screenshotOnly.candidateChanged === false, "same artifact must not be classified as Candidate change");
assert(screenshotOnly.screenshotChanged === true, "screenshot change must be recorded");
assert(readJson(visualPath).status === "stale", "VLM evidence must stale when selected screenshot changes");
assert(readJson(decisionPath).status === "stale", "release decision must stale when selected screenshot changes");
assert(readJson(humanPath).status === "passed", "human evidence remains valid for same exact artifact");
assert(readJson(devicePath).status === "passed", "device evidence remains valid for same exact artifact");
assert(readJson(artifactPath).status === "passed", "artifact metadata remains valid for same exact artifact");

// Idempotent re-verification is a no-op.
const noChangeTargets = candidateReselectionEvidenceTargets([cardId], {
  candidateChanged: false,
  screenshotChanged: false
});
assert(JSON.stringify(noChangeTargets) === JSON.stringify(["release_decision_latest.json"]), "target helper remains deterministic");
const noChange = markCandidateReselectionEvidenceStale({
  workspaceReportsDir: reselect,
  cardIds: [cardId],
  previousBrowserReport: nextBrowser,
  nextBrowserReport: { ...nextBrowser }
});
assert(noChange.changed === false, "identical Browser identity must not invalidate downstream evidence");
assert(noChange.result === null, "idempotent re-verification must perform no writes");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.release-evidence-stale-check.v2",
  status: "passed",
  checks: [
    "authoring_mutation_invalidates_all_release_evidence",
    "candidate_reselection_preserves_new_browser_anchor",
    "candidate_reselection_invalidates_vlm_human_device_and_release_state",
    "screenshot_only_reselection_invalidates_only_visual_and_release_decision",
    "idempotent_reverification_is_noop"
  ],
  workspaceMarked: result.workspace.marked.map((m) => m.file),
  sharedMarked: result.shared.marked.map((m) => m.file),
  invalidatedBy: identity
}, null, 2));
