#!/usr/bin/env node
import express from "express";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerCapabilityPromotionRoutes } from "../../server/capabilityPromotionRoutes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FIXTURE = "productize/fixtures/blueprints/survivor_vertical_slice_3.blueprint.json";
const PROMOTION_REL = "productize/fixtures/.promotion-api-test.json";
const PROMOTION_FILE = path.join(ROOT, PROMOTION_REL);
const DEST_REL = "minigame_master/capabilities/blueprints/__promotion_api_test__.json";
const DEST_FILE = path.join(ROOT, DEST_REL);

function assert(value, message) {
  if (!value) throw new Error(message);
}
function evidence(id, kind) {
  return { id, kind, status: "passed", real: true, fixture: false, synthetic: false, stale: false, path: `reports/${id}.json` };
}
function openPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

if (!fs.existsSync(path.join(ROOT, FIXTURE))) throw new Error(`blueprint fixture missing: ${FIXTURE}`);
fs.rmSync(DEST_FILE, { force: true });
const promotion = {
  schemaVersion: "loreweaver.capability-promotion.v1",
  id: "promotion-api-test",
  kind: "blueprint",
  status: "approved",
  candidate: {
    capabilityId: "survivor_vertical_slice_3",
    sourceWorkspaceId: "real-workspace-test",
    sourceRevision: "abcdef1234567890",
    sourceLicense: "original-project-work",
    reusableSurface: "verified survivor vertical slice",
    patchLevel: "L2",
    projectSpecificTerms: [],
    privatePaths: [],
    parameterized: true,
    allTunablesExternalized: true,
    publicInterface: ["theme", "stages", "duration"]
  },
  destination: { path: DEST_REL, exists: false },
  evidence: {
    usageCount: 2,
    refs: [evidence("usage-api", "usage"), evidence("static-api", "static"), evidence("runtime-api", "runtime")]
  },
  approval: { required: true, approvedBy: "repository-owner", approvedAt: "2026-09-01T01:00:00Z" }
};
fs.writeFileSync(PROMOTION_FILE, `${JSON.stringify(promotion, null, 2)}\n`);

const app = express();
app.use(express.json());
registerCapabilityPromotionRoutes({ app, cwd: ROOT, timeoutMs: 20_000 });
const port = await openPort();
const server = await new Promise((resolve, reject) => {
  const instance = app.listen(port, "127.0.0.1", () => resolve(instance));
  instance.on("error", reject);
});

try {
  const base = `http://127.0.0.1:${port}`;
  const previewResponse = await fetch(`${base}/api/capability-promotions/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promotionPath: PROMOTION_REL, candidatePath: FIXTURE })
  });
  const preview = await previewResponse.json();
  assert(previewResponse.status === 200, JSON.stringify(preview));
  assert(preview.status === "ready_for_explicit_write_approval", JSON.stringify(preview));
  assert(preview.gateway?.explicitSecondPhaseRequired === true && preview.gateway?.tokenAutoSubmitted === false, "preview must never auto-submit approval");
  assert(/^[0-9a-f]{64}$/.test(preview.approvalToken || ""), "approval token missing");
  assert(!fs.existsSync(DEST_FILE), "preview must perform zero writes");

  const missingTokenResponse = await fetch(`${base}/api/capability-promotions/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promotionPath: PROMOTION_REL, candidatePath: FIXTURE })
  });
  const missingToken = await missingTokenResponse.json();
  assert(missingTokenResponse.status === 400 && missingToken.reason === "approval_token_required", JSON.stringify(missingToken));
  assert(!fs.existsSync(DEST_FILE), "missing approval token must perform zero writes");

  const traversalResponse = await fetch(`${base}/api/capability-promotions/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promotionPath: "../secret.json", candidatePath: FIXTURE })
  });
  assert(traversalResponse.status === 400, "path traversal must fail at Gateway");

  const commitResponse = await fetch(`${base}/api/capability-promotions/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promotionPath: PROMOTION_REL, candidatePath: FIXTURE, approvalToken: preview.approvalToken })
  });
  const committed = await commitResponse.json();
  assert(commitResponse.status === 201, JSON.stringify(committed));
  assert(committed.status === "promoted" && committed.gateway?.tokenAutoSubmitted === false, JSON.stringify(committed));
  assert(fs.existsSync(DEST_FILE), "explicit second phase must create destination");

  const replayResponse = await fetch(`${base}/api/capability-promotions/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promotionPath: PROMOTION_REL, candidatePath: FIXTURE })
  });
  const replay = await replayResponse.json();
  assert(replayResponse.status === 422 && replay.status === "blocked", "destination conflict must block repeat promotion");

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.capability-promotion-api-check.v1",
    status: "passed",
    checks: [
      "preview_is_zero_write",
      "gateway_paths_are_repository_scoped",
      "approval_token_is_not_auto_submitted",
      "commit_requires_explicit_second_request",
      "atomic_destination_created_only_after_token",
      "repeat_promotion_conflict_fails_closed"
    ]
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(PROMOTION_FILE, { force: true });
  fs.rmSync(DEST_FILE, { force: true });
}
