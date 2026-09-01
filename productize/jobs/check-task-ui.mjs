#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const pipeline = fs.readFileSync(path.join(ROOT, "src/components/PipelinePanel.tsx"), "utf8");
const taskPanel = fs.readFileSync(path.join(ROOT, "src/components/TaskContractPanel.tsx"), "utf8");

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(pipeline.includes('import { TaskContractPanel } from "./TaskContractPanel"'), "Expert Pipeline must import TaskContractPanel");
assert(pipeline.includes('{workspaceId && <TaskContractPanel workspaceId={workspaceId} locale={locale} />}'), "TaskContractPanel must be bound to the active Workspace");
assert(pipeline.includes("跨角色验收、Evidence 覆盖与最终 acceptance 以 TaskContract 为准"), "Expert copy must name TaskContract as acceptance source of truth");
assert(taskPanel.includes('/api/workspaces/${workspaceId}/tasks'), "Task panel must read Workspace Task repository");
assert(taskPanel.includes('/api/workspaces/${workspaceId}/tasks/${selectedId}/acceptance'), "Task panel must read canonical acceptance evaluation");
assert(!taskPanel.includes('method: "POST"') && !taskPanel.includes("method: 'POST'"), "Task audit panel must remain read-only; role transitions happen through controlled workflow surfaces");
assert(taskPanel.includes("Next owner") || taskPanel.includes("下一责任角色"), "Task panel must surface the next responsible role");
assert(taskPanel.includes("lastRoundHash") && taskPanel.includes("roundHash"), "Task audit view must expose handoff hash-chain identity");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.task-ui-check.v1",
  status: "passed",
  checks: [
    "expert_pipeline_mounts_task_contract_panel",
    "task_panel_is_workspace_bound",
    "task_contract_is_named_acceptance_source_of_truth",
    "task_panel_reads_canonical_acceptance_endpoint",
    "task_audit_view_remains_read_only",
    "next_owner_and_hash_chain_are_visible"
  ]
}, null, 2));
