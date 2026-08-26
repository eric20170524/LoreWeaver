#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markReleaseEvidenceStale } from "../lib/mark-gate-reports-stale.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

const workspaceId = valueArg("--workspace-id");
const rawCards = valueArg("--card-ids") || "";
const reason = valueArg("--reason") || "creator_revision_applied";
const specHash = valueArg("--spec-hash") || null;
if (!workspaceId || !/^[A-Za-z0-9._-]+$/.test(workspaceId)) {
  console.error(JSON.stringify({ status: "failed", reason: "invalid_workspace_id" }));
  process.exit(2);
}

const cardIds = rawCards.split(",").map((item) => item.trim()).filter(Boolean);
const result = markReleaseEvidenceStale({
  sharedReportsDir: path.join(LORE_ROOT, "minigame_master/capabilities/reports"),
  workspaceReportsDir: path.join(LORE_ROOT, "data/workspaces", workspaceId, "reports"),
  cardIds,
  reason,
  identity: {
    specHash,
    mutation: "creator_revision"
  }
});

console.log(JSON.stringify({
  schemaVersion: "loreweaver.creator-revision-evidence-invalidation.v1",
  status: "passed",
  workspaceId,
  cardIds,
  result
}, null, 2));
