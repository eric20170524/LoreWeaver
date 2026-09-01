#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const recorder = fs.readFileSync(path.join(ROOT, "productize/record-observed-release-evidence.ts"), "utf8");
const vlm = fs.readFileSync(path.join(ROOT, "productize/jobs/run-workspace-vlm-audit.py"), "utf8");
const bridge = fs.readFileSync(path.join(ROOT, "backend/release_task_sync.py"), "utf8");

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(recorder.includes("attemptPlayerTaskSync(workspaceId)"), "human recorder must attempt Player Task sync after a passed human report");
assert(recorder.includes('kindArg === "human" && built.report.status === "passed"'), "only passed human evidence may trigger Player sync from recorder");
assert(recorder.includes("device_evidence_is_release_gate_not_player_role"), "device evidence must stay a Certified release gate, not Player evidence");
assert(recorder.indexOf("fs.writeFileSync(latestPath") < recorder.indexOf("attemptPlayerTaskSync(workspaceId)"), "Task sync must happen only after durable human evidence write");

assert(vlm.includes("attempt_player_task_sync(args.workspace_id, workspace) if critic_passed"), "real VLM pass must attempt Player Task sync");
assert(vlm.includes("Task orchestration never downgrades valid VLM evidence"), "VLM script must document non-destructive Task sync semantics");
assert(vlm.indexOf("write_json(latest, report)") < vlm.indexOf("attempt_player_task_sync(args.workspace_id, workspace) if critic_passed"), "Task sync must happen only after durable VLM evidence write");

assert(bridge.includes('report.get("evidenceKind") == "real_vlm_exact_candidate"'), "Player visual bridge must require exact-candidate real VLM evidence kind");
assert(bridge.includes('REAL_VLM_PROVIDERS = {"grok", "codex"}'), "Player visual bridge must accept only real VLM providers");
assert(bridge.includes("for card_id in card_ids"), "multi-card Player sync must inspect every card");
assert(bridge.includes("human_playtest_{card_id}_latest.json"), "Player feel bridge must use per-card real human evidence");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.release-task-sync-wiring-check.v1",
  status: "passed",
  checks: [
    "human_pass_attempts_player_sync_after_durable_write",
    "device_evidence_is_not_relabelled_as_player_evidence",
    "real_vlm_pass_attempts_player_sync_after_durable_write",
    "task_sync_failure_cannot_rollback_valid_release_evidence",
    "player_visual_requires_exact_candidate_real_provider",
    "multi_card_feel_requires_per_card_human_reports"
  ]
}, null, 2));
