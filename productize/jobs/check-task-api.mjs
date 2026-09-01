#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerTaskContractRoutes } from "../../server/taskContractRoutes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function assert(value, message) {
  if (!value) throw new Error(message);
}

class FakeApp {
  constructor() {
    this.routes = new Map();
  }
  get(route, handler) {
    this.routes.set(`GET ${route}`, handler);
  }
  post(route, handler) {
    this.routes.set(`POST ${route}`, handler);
  }
  handler(method, route) {
    const handler = this.routes.get(`${method} ${route}`);
    if (!handler) throw new Error(`route not registered: ${method} ${route}`);
    return handler;
  }
}

function responseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    }
  };
}

async function call(app, method, route, { params = {}, body = undefined } = {}) {
  const response = responseCapture();
  await app.handler(method, route)({ params, body }, response);
  return { statusCode: response.statusCode, payload: response.payload };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-task-api-"));
const workspaceId = "workspace-api-test";
const workspace = path.join(root, workspaceId);
fs.mkdirSync(workspace, { recursive: true });
const priorRoot = process.env.LOREWEAVER_WORKSPACES_ROOT;
process.env.LOREWEAVER_WORKSPACES_ROOT = root;

try {
  const app = new FakeApp();
  registerTaskContractRoutes({
    app,
    cwd: ROOT,
    getPythonCommand: () => "python3",
    validateWorkspace: (id) => {
      if (!/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..") {
        return { ok: false, statusCode: 400, payload: { status: "failed", reason: "invalid_workspace_id" } };
      }
      const workspaceDir = path.join(root, id);
      if (!fs.existsSync(workspaceDir)) {
        return { ok: false, statusCode: 404, payload: { status: "failed", reason: "workspace_not_found" } };
      }
      return { ok: true, statusCode: 200, payload: null, workspaceDir };
    },
    timeoutMs: 15_000
  });

  const createBody = {
    id: "boss-readability-api",
    title: "Boss readability through bounded handoffs",
    sourceSpecHash: "spec-hash-api-12345678",
    productIntent: {
      goal: "Improve boss telegraph readability.",
      userVisibleOutcome: "Players understand the attack before damage.",
      nonGoals: ["Replace RuntimeKernel"]
    },
    acceptanceCriteria: [
      {
        id: "AC1",
        description: "Static wiring and runtime telegraph are both proven.",
        evidenceKinds: ["static", "runtime"]
      }
    ],
    context: {
      all: [{ file: "task/prd.md", reason: "bounded intent" }],
      architect: [{ file: "docs/runtime.md", reason: "architecture boundary" }],
      programmer: [{ file: "src/runtime.ts", reason: "implementation surface" }],
      auditor: [{ file: "contracts/runtime.md", reason: "static contract" }],
      player: [{ file: "reports/runtime.json", reason: "runtime evidence" }],
      reviewer: [{ file: "task/prd.md", reason: "independent acceptance" }]
    },
    runtimeStateContract: {
      fields: [{ path: "boss.telegraph", type: "boolean", reason: "attack warning" }],
      inputActions: ["move"]
    },
    requestedPatchLevel: "L2"
  };

  const created = await call(app, "POST", "/api/workspaces/:wsId/tasks", {
    params: { wsId: workspaceId },
    body: createBody
  });
  assert(created.statusCode === 200, JSON.stringify(created));
  assert(created.payload.taskStatus === "draft", "API creates a draft TaskContract");
  assert(created.payload.lastRoundHash === null, "new task has no handoff hash");

  const listed = await call(app, "GET", "/api/workspaces/:wsId/tasks", {
    params: { wsId: workspaceId }
  });
  assert(listed.statusCode === 200 && listed.payload.count === 1, JSON.stringify(listed));
  assert(listed.payload.tasks[0].valid === true, "list reports contract validity");

  const shown = await call(app, "GET", "/api/workspaces/:wsId/tasks/:taskId", {
    params: { wsId: workspaceId, taskId: createBody.id }
  });
  assert(shown.statusCode === 200 && shown.payload.task.id === createBody.id, JSON.stringify(shown));

  const illegal = await call(app, "POST", "/api/workspaces/:wsId/tasks/:taskId/handoffs", {
    params: { wsId: workspaceId, taskId: createBody.id },
    body: {
      role: "programmer",
      verdict: "passed",
      summary: "attempt to skip architecture",
      evidenceRefs: [{ id: "impl", kind: "implementation", path: "reports/impl.json", status: "passed", criterionIds: [] }]
    }
  });
  assert(illegal.statusCode === 422, JSON.stringify(illegal));
  assert(String(illegal.payload.reason).includes("role_out_of_order"), "illegal role jump is blocked");

  const architect = await call(app, "POST", "/api/workspaces/:wsId/tasks/:taskId/handoffs", {
    params: { wsId: workspaceId, taskId: createBody.id },
    body: {
      role: "architect",
      verdict: "passed",
      summary: "bounded architecture plan",
      evidenceRefs: [{ id: "plan", kind: "plan", path: "reports/plan.json", status: "passed", criterionIds: [] }]
    }
  });
  assert(architect.statusCode === 200, JSON.stringify(architect));
  assert(architect.payload.taskStatus === "planned", "architect handoff advances task");
  const architectHash = architect.payload.lastRoundHash;
  assert(typeof architectHash === "string" && architectHash.length === 64, "round hash is returned");

  const conflict = await call(app, "POST", "/api/workspaces/:wsId/tasks/:taskId/handoffs", {
    params: { wsId: workspaceId, taskId: createBody.id },
    body: {
      role: "programmer",
      verdict: "passed",
      summary: "stale process",
      expectedLastRoundHash: "0".repeat(64),
      evidenceRefs: [{ id: "impl-stale", kind: "implementation", path: "reports/impl-stale.json", status: "passed", criterionIds: [] }]
    }
  });
  assert(conflict.statusCode === 409, JSON.stringify(conflict));
  assert(String(conflict.payload.reason).includes("task_concurrency_conflict"), "stale process cannot overwrite current task");

  const programmer = await call(app, "POST", "/api/workspaces/:wsId/tasks/:taskId/handoffs", {
    params: { wsId: workspaceId, taskId: createBody.id },
    body: {
      role: "programmer",
      verdict: "passed",
      summary: "implementation complete",
      expectedLastRoundHash: architectHash,
      evidenceRefs: [{ id: "impl-current", kind: "implementation", path: "reports/impl-current.json", status: "passed", criterionIds: [] }]
    }
  });
  assert(programmer.statusCode === 200, JSON.stringify(programmer));
  assert(programmer.payload.taskStatus === "implemented", "current hash permits the expected handoff");

  const acceptance = await call(app, "GET", "/api/workspaces/:wsId/tasks/:taskId/acceptance", {
    params: { wsId: workspaceId, taskId: createBody.id }
  });
  assert(acceptance.statusCode === 200, JSON.stringify(acceptance));
  assert(acceptance.payload.acceptance.accepted === false, "implementation alone is not final acceptance");
  assert(
    acceptance.payload.acceptance.blockers.includes("task_not_accepted:implemented"),
    "acceptance reports the exact unfinished task state"
  );
  assert(
    acceptance.payload.acceptance.blockers.includes("criterion_evidence_missing:AC1:static")
      && acceptance.payload.acceptance.blockers.includes("criterion_evidence_missing:AC1:runtime"),
    "acceptance reports the remaining static and runtime evidence gaps"
  );

  const invalidTask = await call(app, "GET", "/api/workspaces/:wsId/tasks/:taskId", {
    params: { wsId: workspaceId, taskId: "../escape" }
  });
  assert(invalidTask.statusCode === 400, "unsafe task id is rejected before spawning Python");

  const missingWorkspace = await call(app, "GET", "/api/workspaces/:wsId/tasks", {
    params: { wsId: "missing-workspace" }
  });
  assert(missingWorkspace.statusCode === 404, "missing workspace fails before task command");

  const taskFile = path.join(workspace, "tasks", `${createBody.id}.json`);
  const persisted = JSON.parse(fs.readFileSync(taskFile, "utf8"));
  assert(persisted.handoffRounds.length === 2, "only successful handoffs are persisted");
  assert(fs.existsSync(path.join(workspace, "tasks", "history", createBody.id)), "API writes append-only task history");

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.task-api-check.v1",
    status: "passed",
    registeredRoutes: [...app.routes.keys()].sort(),
    taskStatus: persisted.status,
    roundCount: persisted.handoffRounds.length,
    checks: [
      "real_python_task_contract_cli_is_used",
      "create_list_show_and_acceptance_routes",
      "illegal_role_jump_is_blocked",
      "optimistic_concurrency_conflict_maps_to_409",
      "unfinished_acceptance_reports_exact_state_and_evidence_gaps",
      "successful_handoffs_are_hash_chained_and_persisted",
      "unsafe_ids_and_missing_workspaces_fail_before_spawn",
      "failed_transitions_do_not_append_history"
    ]
  }, null, 2));
} finally {
  if (priorRoot === undefined) delete process.env.LOREWEAVER_WORKSPACES_ROOT;
  else process.env.LOREWEAVER_WORKSPACES_ROOT = priorRoot;
}
