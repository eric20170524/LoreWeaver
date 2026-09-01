import type { Express } from "express";
import path from "path";
import { spawn } from "child_process";
import type { WorkspaceValidation } from "./taskContractRoutes";

type Options = {
  app: Express;
  cwd: string;
  getPythonCommand: () => string;
  validateWorkspace: (workspaceId: string) => WorkspaceValidation;
  timeoutMs?: number;
};

function safeId(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function parseJsonOutput(stdout: string) {
  const raw = String(stdout || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function statusCode(payload: any, exitCode: number | null) {
  if (exitCode === 0 && payload?.status === "passed") return 200;
  if (payload?.status === "blocked") {
    const reason = String(payload.reason || "");
    if (reason.includes("not_found")) return 404;
    if (reason.includes("concurrency") || reason.includes("multiple_tasks")) return 409;
    return 422;
  }
  return 500;
}

export function registerDepartmentTaskSyncRoutes({
  app,
  cwd,
  getPythonCommand,
  validateWorkspace,
  timeoutMs = 30_000
}: Options) {
  app.post("/api/workspaces/:wsId/tasks/sync-departments", async (req, res) => {
    const workspaceId = String(req.params.wsId || "");
    const departmentId = String(req.body?.departmentId || "").trim();
    const taskId = String(req.body?.taskId || "").trim();
    if (!safeId(departmentId)) return res.status(400).json({ status: "blocked", reason: "invalid_department_id" });
    if (taskId && !safeId(taskId)) return res.status(400).json({ status: "blocked", reason: "invalid_task_id" });

    const validation = validateWorkspace(workspaceId);
    if (!validation.ok) return res.status(validation.statusCode).json(validation.payload);

    const script = path.join(cwd, "productize", "sync-department-task.py");
    const args = [script, `--workspace-id=${workspaceId}`, `--department-id=${departmentId}`];
    if (taskId) args.push(`--task-id=${taskId}`);

    const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
      const child = spawn(getPythonCommand(), args, { cwd, env: process.env, shell: false });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: 1, stdout: "", stderr: error.message, timedOut: false });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
    });

    if (result.timedOut) return res.status(504).json({ status: "failed", reason: "department_task_sync_timeout" });
    const payload = parseJsonOutput(result.stdout) || {
      schemaVersion: "loreweaver.department-task-sync.v1",
      status: "failed",
      reason: "department_task_sync_non_json_output",
      stdout: result.stdout.slice(-2000),
      stderr: result.stderr.slice(-2000)
    };
    return res.status(statusCode(payload, result.code)).json(payload);
  });
}
