import type { Express } from "express";
import path from "path";
import { spawn } from "child_process";

export type WorkspaceValidation = {
  ok: boolean;
  statusCode: number;
  payload: any;
  workspaceDir?: string;
};

type RegisterTaskContractRoutesOptions = {
  app: Express;
  cwd: string;
  getPythonCommand: () => string;
  validateWorkspace: (workspaceId: string) => WorkspaceValidation;
  timeoutMs?: number;
};

type TaskCommandResult = {
  statusCode: number;
  payload: any;
};

function safeTaskId(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function parseJsonOutput(stdout: string) {
  const raw = String(stdout || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const starts: number[] = [];
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === "{") starts.push(index);
    }
    for (const start of starts.reverse()) {
      try {
        return JSON.parse(raw.slice(start));
      } catch {
        // Continue searching for the last complete JSON object.
      }
    }
    return null;
  }
}

function commandStatus(payload: any, exitCode: number | null) {
  if (exitCode === 0 && payload?.status === "passed") return 200;
  if (payload?.status === "blocked") {
    const reason = String(payload?.reason || "");
    if (reason.includes("not_found")) return 404;
    if (reason.includes("already_exists") || reason.includes("concurrency_conflict")) return 409;
    return 422;
  }
  return 500;
}

function runTaskCommand({
  cwd,
  python,
  args,
  input,
  timeoutMs
}: {
  cwd: string;
  python: string;
  args: string[];
  input?: unknown;
  timeoutMs: number;
}): Promise<TaskCommandResult> {
  return new Promise((resolve) => {
    const cli = path.join(cwd, "productize", "task-contract.py");
    const child = spawn(python, [cli, ...args], {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const settle = (statusCode: number, payload: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ statusCode, payload });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode == null) child.kill("SIGKILL");
      }, 1000).unref?.();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      settle(500, {
        schemaVersion: "loreweaver.task-api-error.v1",
        status: "failed",
        reason: "task_process_error",
        error: error.message
      });
    });
    child.on("close", (code) => {
      if (timedOut) {
        settle(504, {
          schemaVersion: "loreweaver.task-api-error.v1",
          status: "failed",
          reason: "task_command_timeout"
        });
        return;
      }
      const payload = parseJsonOutput(stdout) || {
        schemaVersion: "loreweaver.task-api-error.v1",
        status: "failed",
        reason: "task_command_non_json_output",
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000)
      };
      if (stderr.trim() && payload.status !== "passed") {
        payload.stderr = stderr.slice(-4000);
      }
      settle(commandStatus(payload, code), payload);
    });

    if (input !== undefined) child.stdin.end(JSON.stringify(input));
    else child.stdin.end();
  });
}

export function registerTaskContractRoutes({
  app,
  cwd,
  getPythonCommand,
  validateWorkspace,
  timeoutMs = 30_000
}: RegisterTaskContractRoutesOptions) {
  const execute = async (
    workspaceId: string,
    commandArgs: string[],
    input?: unknown
  ): Promise<TaskCommandResult> => {
    const validation = validateWorkspace(workspaceId);
    if (!validation.ok) {
      return { statusCode: validation.statusCode, payload: validation.payload };
    }
    return runTaskCommand({
      cwd,
      python: getPythonCommand(),
      args: commandArgs,
      input,
      timeoutMs
    });
  };

  app.get("/api/workspaces/:wsId/tasks", async (req, res) => {
    const workspaceId = String(req.params.wsId || "");
    const result = await execute(workspaceId, ["list", `--workspace-id=${workspaceId}`]);
    return res.status(result.statusCode).json(result.payload);
  });

  app.get("/api/workspaces/:wsId/tasks/:taskId", async (req, res) => {
    const workspaceId = String(req.params.wsId || "");
    const taskId = String(req.params.taskId || "");
    if (!safeTaskId(taskId)) {
      return res.status(400).json({ status: "blocked", reason: "invalid_task_id" });
    }
    const result = await execute(workspaceId, [
      "show",
      `--workspace-id=${workspaceId}`,
      `--task-id=${taskId}`
    ]);
    return res.status(result.statusCode).json(result.payload);
  });

  app.post("/api/workspaces/:wsId/tasks", async (req, res) => {
    const workspaceId = String(req.params.wsId || "");
    const result = await execute(
      workspaceId,
      ["create", `--workspace-id=${workspaceId}`],
      req.body
    );
    return res.status(result.statusCode).json(result.payload);
  });

  app.post("/api/workspaces/:wsId/tasks/:taskId/handoffs", async (req, res) => {
    const workspaceId = String(req.params.wsId || "");
    const taskId = String(req.params.taskId || "");
    if (!safeTaskId(taskId)) {
      return res.status(400).json({ status: "blocked", reason: "invalid_task_id" });
    }
    const result = await execute(
      workspaceId,
      [
        "handoff",
        `--workspace-id=${workspaceId}`,
        `--task-id=${taskId}`
      ],
      req.body
    );
    return res.status(result.statusCode).json(result.payload);
  });

  app.get("/api/workspaces/:wsId/tasks/:taskId/acceptance", async (req, res) => {
    const workspaceId = String(req.params.wsId || "");
    const taskId = String(req.params.taskId || "");
    if (!safeTaskId(taskId)) {
      return res.status(400).json({ status: "blocked", reason: "invalid_task_id" });
    }
    const result = await execute(workspaceId, [
      "evaluate",
      `--workspace-id=${workspaceId}`,
      `--task-id=${taskId}`
    ]);
    return res.status(result.statusCode).json(result.payload);
  });
}
