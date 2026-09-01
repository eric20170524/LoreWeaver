import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "productize/sync-release-task.py");
const ROLES = new Set(["player", "reviewer", "orchestrator"]);

function parseJsonOutput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const starts = [];
  for (let index = 0; index < raw.length; index += 1) if (raw[index] === "{") starts.push(index);
  for (const start of starts.reverse()) {
    try { return JSON.parse(raw.slice(start)); } catch {}
  }
  return null;
}

/**
 * Mirror an already-established release event into TaskContract. This adapter is
 * deliberately non-destructive: release evidence/artifacts are authoritative and
 * remain valid even if Task synchronization is unavailable or out of sequence.
 */
export function runReleaseTaskSync({ workspaceId, role, taskId = null, env = process.env } = {}) {
  if (!/^[A-Za-z0-9._-]+$/.test(String(workspaceId || "")) || workspaceId === "." || workspaceId === "..") {
    return { status: "blocked", action: "noop", role, reason: "invalid_workspace_id" };
  }
  if (!ROLES.has(role)) {
    return { status: "blocked", action: "noop", role, reason: `invalid_release_task_role:${role || "missing"}` };
  }
  const python = env.PYTHON || env.PYTHON3 || (process.platform === "win32" ? "python" : "python3");
  const args = [SCRIPT, `--workspace-id=${workspaceId}`, `--role=${role}`];
  if (taskId) args.push(`--task-id=${taskId}`);
  const result = spawnSync(python, args, {
    cwd: ROOT,
    encoding: "utf8",
    env,
    timeout: 30000,
    shell: false
  });
  const payload = parseJsonOutput(result.stdout);
  if (payload) return payload;
  return {
    schemaVersion: "loreweaver.release-task-sync.v1",
    status: "blocked",
    action: "noop",
    role,
    reason: result.error
      ? `task_sync_process_error:${result.error.message}`
      : `task_sync_non_json_output:${result.status}:${String(result.stderr || "").slice(-500)}`
  };
}
