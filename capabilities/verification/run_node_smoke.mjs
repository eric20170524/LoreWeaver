#!/usr/bin/env node
/**
 * Workspace node smoke gate (qa-owned).
 * Runtime/contract checks live in minigame_master/core/lib/testing.
 *
 *   node workflow/scripts/run_node_smoke.mjs --workspace=20260611-060754-719406
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  smokeAdapter,
  defaultCardIdForNode
} from "../../minigame_master/core/lib/testing/runAdapterSmoke.js";
import { PLAYABLE_CARD_IDS } from "../../minigame_master/core/lib/contracts/PlayabilityContract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const REPORTS_DIR = path.join(LORE_ROOT, "capabilities", "reports");

function parseArgs(argv) {
  const out = {
    workspace: null,
    workspacePath: null,
    wallMsPerNode: 3000,
    simulatedSec: 10,
    out: path.join(REPORTS_DIR, "node_smoke_latest.json")
  };
  for (const a of argv) {
    if (a.startsWith("--workspace=")) out.workspace = a.slice("--workspace=".length);
    else if (a.startsWith("--workspace-path=")) out.workspacePath = a.slice("--workspace-path=".length);
    else if (a.startsWith("--wall-ms=")) out.wallMsPerNode = Number(a.slice("--wall-ms=".length)) || 3000;
    else if (a.startsWith("--simulated-sec=")) out.simulatedSec = Number(a.slice("--simulated-sec=".length)) || 10;
    else if (a.startsWith("--out=")) out.out = a.slice("--out=".length);
  }
  return out;
}

function resolveWorkspacePath(args) {
  if (args.workspacePath) return path.resolve(args.workspacePath);
  if (args.workspace) return path.join(LORE_ROOT, "data", "workspaces", args.workspace);
  const root = path.join(LORE_ROOT, "data", "workspaces");
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (!dirs.length) throw new Error("No workspace folders");
  return path.join(root, dirs[dirs.length - 1]);
}

function loadNodes(wsPath) {
  const nodesDir = path.join(wsPath, "loreweaver", "nodes");
  if (!fs.existsSync(nodesDir)) {
    const man = path.join(wsPath, "manifest.json");
    if (fs.existsSync(man)) {
      const m = JSON.parse(fs.readFileSync(man, "utf8"));
      return Array.isArray(m.nodes) ? m.nodes : [];
    }
    return [];
  }
  return fs
    .readdirSync(nodesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(nodesDir, f), "utf8")))
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}

function attributeOwners(runtime) {
  const set = new Set(runtime.owners || []);
  for (const i of runtime.contractIssues || []) {
    if (i.owner) set.add(i.owner);
  }
  set.delete("art");
  set.delete("audio");
  if (!set.size && (runtime.errors || []).length) set.add("code");
  return [...set];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const wsPath = resolveWorkspacePath(args);
  const wsId = path.basename(wsPath);
  const nodes = loadNodes(wsPath);

  const perNode = [];
  let pass = 0;
  let fail = 0;
  const handoffs = [];

  for (const node of nodes) {
    const cardId = defaultCardIdForNode(node);
    const runtime = await smokeAdapter(node, {
      wallMs: args.wallMsPerNode,
      simulatedSec: args.simulatedSec
    });

    const ok =
      (runtime.contractIssues || []).filter((i) => i.owner === "gameplay" || i.owner === "code")
        .length === 0 &&
      runtime.enter &&
      runtime.spawnOrProgress &&
      runtime.retreat &&
      runtime.noCrash;

    if (ok) pass += 1;
    else fail += 1;

    const owners = attributeOwners(runtime);
    const entry = {
      id: node.id,
      title: node.title,
      cardId,
      enter: runtime.enter,
      spawnOrProgress: runtime.spawnOrProgress,
      retreat: runtime.retreat,
      noCrash: runtime.noCrash,
      ms: runtime.ms,
      ok,
      owners,
      contractIssues: runtime.contractIssues,
      warnings: runtime.warnings,
      runtimeErrors: runtime.errors,
      note: runtime.note,
      playableKnown: PLAYABLE_CARD_IDS.has(cardId)
    };
    perNode.push(entry);

    if (!ok) {
      if (owners.includes("code")) {
        handoffs.push({
          from: "qa",
          to: "code",
          type: "reject",
          summary: `Node ${node.id} smoke failed (runtime): ${(runtime.errors || []).join("; ") || "enter/spawn/retreat"}`
        });
      }
      if (owners.includes("gameplay") || (runtime.contractIssues || []).some((i) => i.owner === "gameplay")) {
        handoffs.push({
          from: "qa",
          to: "gameplay",
          type: "reject",
          summary: `Node ${node.id} smoke failed (contract): ${(runtime.contractIssues || [])
            .filter((i) => i.owner === "gameplay")
            .map((i) => i.msg)
            .join("; ")}`
        });
      }
    }
  }

  const status = fail === 0 && nodes.length > 0 ? "passed" : "failed";
  const score = nodes.length === 0 ? 0 : Math.round((pass / nodes.length) * 100);

  const report = {
    schemaVersion: "loreweaver.node-smoke.v1",
    gate: "production_prep→asset_confirm",
    status,
    score,
    createdAt: new Date().toISOString(),
    workspaceId: wsId,
    workspacePath: wsPath,
    budget: {
      simulatedSecPerNode: args.simulatedSec,
      wallMsPerNode: args.wallMsPerNode
    },
    owners: {
      gate: "qa",
      runtime: "code",
      contract: "gameplay",
      softWarnings: ["art", "audio"]
    },
    summary: { total: nodes.length, passed: pass, failed: fail, score },
    perNode,
    suggestedHandoffs: handoffs,
    method: "core/lib/testing/runAdapterSmoke"
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2), "utf8");

  const wsQa = path.join(wsPath, "loreweaver", "departments", "qa");
  try {
    fs.mkdirSync(wsQa, { recursive: true });
    fs.writeFileSync(path.join(wsQa, "node_smoke_latest.json"), JSON.stringify(report, null, 2), "utf8");
  } catch {
    /* ignore */
  }

  console.log(
    JSON.stringify(
      { status: report.status, score, passed: pass, failed: fail, total: nodes.length, out: args.out },
      null,
      2
    )
  );
  process.exit(status === "passed" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(REPORTS_DIR, "node_smoke_latest.json"),
      JSON.stringify(
        {
          schemaVersion: "loreweaver.node-smoke.v1",
          status: "failed",
          score: 0,
          error: String(e?.stack || e),
          owners: { gate: "qa", runtime: "code", contract: "gameplay" }
        },
        null,
        2
      )
    );
  } catch {
    /* ignore */
  }
  process.exit(1);
});
