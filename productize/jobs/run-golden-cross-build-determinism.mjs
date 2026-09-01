#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashExecutablePayloadManifest } from "../lib/executable-payload.mjs";
import {
  evaluateRuntimeDeterminismReadiness,
  createCrossBuildDeterminismEvidence
} from "../../minigame_master/core/lib/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACE_ID = "__golden_survivor_vertical_slice_ci";
const WORKSPACE_REL = `data/workspaces/${WORKSPACE_ID}`;
const WORKSPACE = path.join(ROOT, WORKSPACE_REL);
const SEED = "golden-survivor-cross-build-v1";
const ADVANCE_FRAMES = 120;
const PROJECTION_PATHS = [
  "hp",
  "score",
  "timer",
  "kills",
  "determinism.random.state",
  "determinism.random.calls",
  "determinism.adapterStateSample.enemyCount",
  "determinism.adapterStateSample.enemies"
];

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: "failed", reason, ...extra }, null, 2));
  process.exit(2);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}
function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function parseLastJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const starts = [];
  for (let index = 0; index < raw.length; index += 1) if (raw[index] === "{") starts.push(index);
  for (const start of starts.reverse()) {
    try { return JSON.parse(raw.slice(start)); } catch {}
  }
  return null;
}
function walkFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, base));
    else if (entry.isFile()) {
      const buffer = fs.readFileSync(full);
      files.push({
        path: path.relative(base, full).split(path.sep).join("/"),
        bytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex")
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg"
  }[ext] || "application/octet-stream";
}
function startStaticServer(root, port) {
  return new Promise((resolve, reject) => {
    const normalizedRoot = `${path.resolve(root)}${path.sep}`;
    const server = http.createServer((req, res) => {
      let requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (requestPath === "/") requestPath = "/index.html";
      const file = path.resolve(root, requestPath.replace(/^\/+/, ""));
      if (!`${file}${path.sep}`.startsWith(normalizedRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compileCandidate(label) {
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const result = spawnSync(tsx, [
    path.join(ROOT, "productize/release-compiler.mjs"),
    `--workspace=${WORKSPACE_REL}`,
    "--mode=candidate"
  ], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 180000 });
  if (result.status !== 0) fail(`candidate_${label}_compile_failed`, { stdout: result.stdout?.slice(-3000), stderr: result.stderr?.slice(-3000) });
  const compiler = parseLastJson(result.stdout);
  const exporter = parseLastJson(compiler?.exporterOutput);
  if (!exporter?.stage || !exporter?.artifact) fail(`candidate_${label}_compiler_output_invalid`, { compiler });
  const stage = path.resolve(exporter.stage);
  const artifact = path.resolve(ROOT, exporter.artifact);
  if (!fs.existsSync(stage) || !fs.existsSync(artifact)) fail(`candidate_${label}_artifact_missing`);
  const payload = hashExecutablePayloadManifest(walkFiles(stage));
  return {
    id: `${label}:${path.basename(stage)}`,
    stage,
    artifact,
    artifactSha256: sha256File(artifact),
    payloadHash: payload.payloadHash,
    specHash: readJson(path.join(stage, "release-manifest.json")).specHash
  };
}

const scenario = {
  schemaVersion: "loreweaver.runtime-scenario.v1",
  id: "golden-survivor-cross-build-state",
  title: "Golden survivor seeded state replay",
  requiredCapabilities: ["semanticInput", "pause", "resume", "exactFrameAdvance"],
  steps: [
    { id: "pause", type: "pause" },
    { id: "move", type: "input", payload: { action: "move", x: 360, y: 640 } },
    { id: "advance", type: "advance_frames", frames: ADVANCE_FRAMES }
  ]
};
const scenarioHash = `sha256:${sha256Json(scenario)}`;
const declaration = {
  schemaVersion: "loreweaver.runtime-determinism.v1",
  scope: "adapter_state_trace",
  runtimeAuthority: "LoreWeaverRuntimeKernel",
  random: { controlled: true, source: "seeded_prng", seed: SEED, scope: "adapter" },
  time: { controlled: true, mode: "exact_frame", hostWallClockSettleAllowed: false },
  input: { controlled: true, mode: "semantic" },
  stateProjection: { id: "survivor-cross-build-state-v1", paths: PROJECTION_PATHS },
  presentation: { controlled: false, randomSource: "Phaser.Math/host", screenshotTimingControlled: false },
  metadata: { evidenceScope: "adapter state only; visual frame determinism is explicitly excluded" }
};

async function executeBuild(playwright, build) {
  const port = await findOpenPort();
  const server = await startStaticServer(build.stage, port);
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error?.message || String(error)));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("favicon")) errors.push(msg.text());
    });
    await page.addInitScript(({ seed }) => {
      window.__LOREWEAVER_DETERMINISM__ = {
        mode: "verification",
        seed,
        scope: "adapter_state_trace"
      };
    }, { seed: SEED });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__ && Array.isArray(window.__LOREWEAVER_EMBEDDED_SPEC__?.nodes), null, { timeout: 30000 });

    await page.evaluate(() => {
      const game = window.__LOREWEAVER_GAME__;
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find((item) => Number(item.id) === 1);
      if (!node || node.gameplay?.cardId !== "survivor_horde") throw new Error("golden_survivor_node_1_missing");
      try { game.scene.stop("LevelActiveScene"); } catch {}
      game.scene.start("LevelActiveScene", { node });
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ready = await page.evaluate(() => {
        const game = window.__LOREWEAVER_GAME__;
        const scene = game?.scene?.keys?.LevelActiveScene;
        const api = window.__LOREWEAVER_RUNTIME_OBSERVATION__;
        return Boolean(game?.scene?.isActive?.("LevelActiveScene"))
          && scene?.node?.gameplay?.cardId === "survivor_horde"
          && (scene?.adapter?.status === "running" || window.__LOREWEAVER_TEST_HOOKS__?.status === "running")
          && api?.capabilities?.().pause === true;
      });
      if (ready) break;
      const canvas = await page.locator("canvas").boundingBox().catch(() => null);
      if (canvas) await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(250);
    }

    const paused = await page.evaluate(() => window.__LOREWEAVER_RUNTIME_OBSERVATION__?.pause?.({ reason: "cross_build_determinism_probe" }));
    if (paused?.status !== "passed") throw new Error(`determinism_pause_failed:${JSON.stringify(paused)}`);

    // The target Scene is already paused, so waiting for Phaser startup cooldown
    // cannot advance gameplay state. Exact-frame stays fail-closed until cooldown=0.
    await page.waitForFunction(() => {
      const loop = window.__LOREWEAVER_GAME__?.loop;
      return Boolean(loop) && Number(loop._coolDown || 0) === 0 && loop.running === true && loop.sleeping !== true;
    }, null, { timeout: 10000, polling: 25 });

    const outcome = await page.evaluate(({ frames }) => {
      const api = window.__LOREWEAVER_RUNTIME_OBSERVATION__;
      const capabilities = api.capabilities();
      const before = api.snapshot();
      const move = api.input({ action: "move", x: 360, y: 640 });
      const advance = api.advanceFrames({ frames });
      const after = api.snapshot();
      const trace = api.trace();
      return { capabilities, before, move, advance, after, trace };
    }, { frames: ADVANCE_FRAMES });

    if (outcome.move?.status !== "passed") throw new Error(`determinism_move_failed:${JSON.stringify(outcome.move)}`);
    if (outcome.advance?.status !== "passed") throw new Error(`determinism_advance_failed:${JSON.stringify(outcome.advance)}`);
    if (outcome.after?.state?.status !== "paused") throw new Error(`determinism_scene_not_paused_after_advance:${outcome.after?.state?.status}`);
    if (outcome.before?.sessionId !== outcome.after?.sessionId || outcome.after?.sessionId !== outcome.trace?.sessionId) {
      throw new Error("determinism_same_session_identity_failed");
    }
    const random = outcome.after?.state?.determinism?.random;
    if (random?.controlled !== true || random?.source !== "seeded_prng" || !String(random.seed || "").includes(SEED)) {
      throw new Error(`seeded_random_not_observed:${JSON.stringify(random)}`);
    }
    if (errors.length) throw new Error(`browser_errors:${JSON.stringify(errors)}`);

    return {
      status: "passed",
      passed: true,
      scenarioId: scenario.id,
      scenarioHash,
      runtimeAuthority: outcome.after.runtimeAuthority,
      sessionId: outcome.after.sessionId,
      capabilities: outcome.capabilities,
      initialSnapshot: outcome.before,
      finalSnapshot: outcome.after,
      traceRange: {
        startSequence: outcome.before.sequence,
        endSequence: outcome.trace.lastSequence,
        finalEntryCount: outcome.trace.entryCount
      }
    };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  if (!fs.existsSync(WORKSPACE)) fail("golden_workspace_missing_run_golden_candidate_first");
  let playwright;
  try { playwright = await import("playwright"); }
  catch (error) { fail("playwright_not_installed", { error: error?.message || String(error) }); }

  const buildA = compileCandidate("build-a");
  await sleep(1100);
  const buildB = compileCandidate("build-b");
  const runA = await executeBuild(playwright, buildA);
  const runB = await executeBuild(playwright, buildB);
  const readiness = evaluateRuntimeDeterminismReadiness({
    scenario,
    declaration,
    capabilities: runA.capabilities
  });
  if (!readiness.ready) fail("golden_determinism_readiness_blocked", { readiness });

  const evidence = createCrossBuildDeterminismEvidence({
    readiness,
    baselineResult: runA,
    candidateResult: runB,
    baselineBuild: {
      id: buildA.id,
      payloadHash: buildA.payloadHash,
      artifactSha256: buildA.artifactSha256,
      specHash: buildA.specHash
    },
    candidateBuild: {
      id: buildB.id,
      payloadHash: buildB.payloadHash,
      artifactSha256: buildB.artifactSha256,
      specHash: buildB.specHash
    }
  });
  const report = {
    ...evidence,
    schemaVersion: "loreweaver.golden-cross-build-determinism-report.v1",
    createdAt: new Date().toISOString(),
    workspaceId: WORKSPACE_ID,
    fixture: false,
    synthetic: false,
    headless: true,
    releaseEligible: false,
    evidenceMeaning: "Two independently compiled Candidate stages executed in two Chromium sessions with the same explicit verification seed, semantic input, paused target Scene and exact Phaser frame advancement. Only the declared adapter-state projection is compared; visual-frame determinism is not claimed.",
    declaration,
    readiness,
    runs: [
      { build: buildA, sessionId: runA.sessionId, finalState: runA.finalSnapshot.state },
      { build: buildB, sessionId: runB.sessionId, finalState: runB.finalSnapshot.state }
    ]
  };
  const reportPath = path.join(WORKSPACE, "reports/cross_build_determinism_latest.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({
    status: evidence.status,
    deterministic: evidence.deterministic,
    scope: evidence.scope,
    workspaceId: WORKSPACE_ID,
    scenarioHash,
    baselinePayloadHash: buildA.payloadHash,
    candidatePayloadHash: buildB.payloadHash,
    baselineSessionId: runA.sessionId,
    candidateSessionId: runB.sessionId,
    projection: evidence.comparison,
    report: path.relative(ROOT, reportPath).split(path.sep).join("/")
  }, null, 2));
  if (!evidence.deterministic) process.exit(2);
}

main().catch((error) => fail("golden_cross_build_determinism_error", { error: error?.stack || error?.message || String(error) }));
