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
  createCrossBuildDeterminismEvidence,
  evaluateCrossBuildDeterminismReadiness
} from "../../minigame_master/core/lib/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACE_ID = "__golden_survivor_vertical_slice_ci";
const WORKSPACE_REL = `data/workspaces/${WORKSPACE_ID}`;
const WORKSPACE = path.join(ROOT, WORKSPACE_REL);
const SEED = "golden-survivor-cross-build-v2";
const ADVANCE_FRAMES = 120;
const REQUIRED_BROWSERS = ["chromium", "firefox"];
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
function getPath(root, expression) {
  const tokens = String(expression || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let value = root;
  for (const token of tokens) {
    if (value == null || !(token in value)) return { exists: false, value: null };
    value = value[token];
  }
  return { exists: true, value };
}
function projectState(state) {
  const projection = {};
  for (const pathExpression of PROJECTION_PATHS) {
    const resolved = getPath(state, pathExpression);
    if (!resolved.exists) throw new Error(`projection_path_missing:${pathExpression}`);
    projection[pathExpression] = resolved.value;
  }
  return projection;
}
function browserEngine(browserName, browserVersion) {
  if (browserName === "chromium") return `Blink/${browserVersion}`;
  if (browserName === "firefox") return `Gecko/${browserVersion}`;
  return `WebKit/${browserVersion}`;
}

function compileCandidate(label) {
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const result = spawnSync(tsx, [
    path.join(ROOT, "productize/release-compiler.mjs"),
    `--workspace=${WORKSPACE_REL}`,
    "--mode=candidate"
  ], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 180000 });
  if (result.status !== 0) fail(`candidate_${label}_compile_failed`, {
    stdout: result.stdout?.slice(-3000),
    stderr: result.stderr?.slice(-3000)
  });
  const compiler = parseLastJson(result.stdout);
  const exporter = parseLastJson(compiler?.exporterOutput);
  if (!exporter?.stage || !exporter?.artifact) fail(`candidate_${label}_compiler_output_invalid`, { compiler });
  const stage = path.resolve(exporter.stage);
  const artifact = path.resolve(ROOT, exporter.artifact);
  if (!fs.existsSync(stage) || !fs.existsSync(artifact)) fail(`candidate_${label}_artifact_missing`);
  const payload = hashExecutablePayloadManifest(walkFiles(stage));
  const releaseManifest = readJson(path.join(stage, "release-manifest.json"));
  const assetEntries = (releaseManifest.files || [])
    .filter((entry) => String(entry.path || "").startsWith("assets/"))
    .map((entry) => ({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 }));
  return {
    id: label,
    stage,
    artifact,
    artifactSha256: sha256File(artifact),
    payloadHash: payload.payloadHash,
    specHash: releaseManifest.specHash,
    runtimeVersion: releaseManifest.runtimeVersion,
    assetManifestHash: sha256Json(assetEntries)
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
const physicsSettings = {
  engine: "phaser-arcade",
  fixedStep: true,
  stepMs: 1000 / 60,
  scope: "paused adapter-state verification scenario",
  advanceFrames: ADVANCE_FRAMES
};
const declaration = {
  schemaVersion: "loreweaver.runtime-determinism.v1",
  scope: "adapter_state_trace",
  runtimeAuthority: "LoreWeaverRuntimeKernel",
  random: {
    controlled: true,
    source: "seeded_prng",
    seed: SEED,
    scope: "adapter",
    algorithm: "fnv1a32+mulberry32-v1",
    stateHandoff: "seed_replay"
  },
  time: { controlled: true, mode: "exact_frame", hostWallClockSettleAllowed: false },
  input: { controlled: true, mode: "semantic" },
  stateProjection: { id: "survivor-cross-build-state-v2", paths: PROJECTION_PATHS },
  presentation: { controlled: false, randomSource: "Phaser.Math/host", screenshotTimingControlled: false },
  engine: { name: "Phaser", version: "4.1.0", renderer: "runtime-selected" },
  physics: {
    engine: physicsSettings.engine,
    deterministic: true,
    fixedStep: physicsSettings.fixedStep,
    stepMs: physicsSettings.stepMs,
    settingsHash: sha256Json(physicsSettings)
  },
  host: { mode: "static_candidate", version: "v1" },
  metadata: {
    evidenceScope: "adapter state only; visual-frame determinism is explicitly excluded",
    physicsClaimScope: "empirical equality of the declared projection under exact-frame paused verification, not a universal Phaser physics guarantee"
  }
};

async function executeBuild(playwright, browserName, build) {
  const browserType = playwright[browserName];
  if (!browserType) throw new Error(`playwright_browser_type_missing:${browserName}`);
  const port = await findOpenPort();
  const server = await startStaticServer(build.stage, port);
  let browser = null;
  try {
    browser = await browserType.launch({ headless: true });
    const browserVersion = browser.version();
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
    await page.waitForFunction(
      () => window.__LOREWEAVER_GAME__ && Array.isArray(window.__LOREWEAVER_EMBEDDED_SPEC__?.nodes),
      null,
      { timeout: 30000 }
    );

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

    const paused = await page.evaluate(
      () => window.__LOREWEAVER_RUNTIME_OBSERVATION__?.pause?.({ reason: "cross_build_determinism_probe" })
    );
    if (paused?.status !== "passed") throw new Error(`determinism_pause_failed:${JSON.stringify(paused)}`);

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
    if (outcome.after?.state?.status !== "paused") {
      throw new Error(`determinism_scene_not_paused_after_advance:${outcome.after?.state?.status}`);
    }
    if (outcome.before?.sessionId !== outcome.after?.sessionId || outcome.after?.sessionId !== outcome.trace?.sessionId) {
      throw new Error("determinism_same_session_identity_failed");
    }
    const random = outcome.after?.state?.determinism?.random;
    if (
      random?.controlled !== true
      || random?.source !== "seeded_prng"
      || random?.algorithm !== declaration.random.algorithm
      || !String(random.seed || "").includes(SEED)
    ) {
      throw new Error(`seeded_random_not_observed:${JSON.stringify(random)}`);
    }
    if (errors.length) throw new Error(`browser_errors:${JSON.stringify(errors)}`);

    const projection = projectState(outcome.after.state);
    return {
      status: "passed",
      passed: true,
      browser: browserName,
      browserVersion,
      engineVersion: browserEngine(browserName, browserVersion),
      scenarioId: scenario.id,
      scenarioHash,
      runtimeAuthority: outcome.after.runtimeAuthority,
      sessionId: outcome.after.sessionId,
      capabilities: outcome.capabilities,
      initialSnapshot: outcome.before,
      finalSnapshot: outcome.after,
      stateProjection: projection,
      stateFingerprint: sha256Json(projection),
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

function buildRef(build) {
  return {
    id: build.id,
    payloadHash: build.payloadHash,
    artifactSha256: build.artifactSha256,
    specHash: build.specHash,
    runtimeVersion: build.runtimeVersion,
    assetManifestHash: build.assetManifestHash
  };
}

function compactComparison(comparison, extra) {
  return {
    ...extra,
    schemaVersion: comparison.schemaVersion,
    status: comparison.status,
    deterministic: comparison.deterministic,
    blockers: comparison.blockers,
    stateMatches: comparison.comparison?.stateMatches ?? false,
    visualMatches: comparison.comparison?.visualMatches ?? null
  };
}

async function main() {
  if (!fs.existsSync(WORKSPACE)) fail("golden_workspace_missing_run_golden_candidate_first");
  let playwright;
  try { playwright = await import("playwright"); }
  catch (error) { fail("playwright_not_installed", { error: error?.message || String(error) }); }

  const buildA = compileCandidate("build-a");
  await sleep(1100);
  const buildB = compileCandidate("build-b");
  if (
    buildA.specHash !== buildB.specHash
    || buildA.runtimeVersion !== buildB.runtimeVersion
    || buildA.assetManifestHash !== buildB.assetManifestHash
  ) {
    fail("independent_build_source_identity_mismatch", { buildA, buildB });
  }

  const runs = [];
  for (const browserName of REQUIRED_BROWSERS) {
    runs.push(await executeBuild(playwright, browserName, buildA));
    runs.push(await executeBuild(playwright, browserName, buildB));
  }

  const controlReadiness = evaluateRuntimeDeterminismReadiness({
    scenario,
    declaration,
    capabilities: runs[0].capabilities
  });
  if (!controlReadiness.ready || controlReadiness.crossBuildDeterministicClaimAllowed !== false) {
    fail("golden_determinism_control_readiness_invalid", { controlReadiness });
  }

  const perBrowser = REQUIRED_BROWSERS.map((browserName) => {
    const browserRuns = runs.filter((run) => run.browser === browserName);
    const comparison = createCrossBuildDeterminismEvidence({
      readiness: controlReadiness,
      baselineResult: browserRuns[0],
      candidateResult: browserRuns[1],
      baselineBuild: buildRef(buildA),
      candidateBuild: buildRef(buildB)
    });
    return compactComparison(comparison, { browser: browserName });
  });

  const crossBrowser = [buildA, buildB].map((build, buildIndex) => {
    const buildRuns = REQUIRED_BROWSERS.map((browserName) =>
      runs.filter((run) => run.browser === browserName)[buildIndex]
    );
    const comparison = createCrossBuildDeterminismEvidence({
      readiness: controlReadiness,
      baselineResult: buildRuns[0],
      candidateResult: buildRuns[1],
      baselineBuild: buildRef(build),
      candidateBuild: buildRef(build)
    });
    return compactComparison(comparison, { buildId: build.id });
  });

  const pairwiseDeterministic = [...perBrowser, ...crossBrowser].every(
    (comparison) => comparison.status === "passed" && comparison.deterministic === true
  );
  const expectedIdentity = {
    specHash: buildA.specHash,
    runtimeVersion: buildA.runtimeVersion,
    assetManifestHash: buildA.assetManifestHash
  };
  const createdAt = new Date().toISOString();
  const cells = [];
  for (const browserName of REQUIRED_BROWSERS) {
    const browserRuns = runs.filter((run) => run.browser === browserName);
    for (const [index, run] of browserRuns.entries()) {
      const build = index === 0 ? buildA : buildB;
      cells.push({
        browser: browserName,
        browserVersion: run.browserVersion,
        engineVersion: run.engineVersion,
        buildId: build.id,
        sessionId: run.sessionId,
        status: run.status,
        payloadHash: build.payloadHash,
        artifactSha256: build.artifactSha256,
        specHash: build.specHash,
        runtimeVersion: build.runtimeVersion,
        assetManifestHash: build.assetManifestHash,
        stateFingerprint: run.stateFingerprint
      });
    }
  }

  const evidence = {
    schemaVersion: "loreweaver.cross-build-determinism-evidence.v2",
    status: pairwiseDeterministic ? "passed" : "failed",
    deterministic: pairwiseDeterministic,
    createdAt,
    fixture: false,
    synthetic: false,
    stale: false,
    freshness: "fresh",
    headless: true,
    releaseEligible: false,
    waivers: [],
    runtimeAuthority: "LoreWeaverRuntimeKernel",
    scope: declaration.scope,
    scenarioId: scenario.id,
    scenarioHash,
    projectionId: declaration.stateProjection.id,
    identity: expectedIdentity,
    matrix: {
      requiredBrowsers: REQUIRED_BROWSERS,
      requiredBuildCount: 2,
      cells
    },
    comparisons: {
      perBrowser,
      crossBrowser
    }
  };
  const evidenceReadiness = evaluateCrossBuildDeterminismReadiness({
    controlReadiness,
    evidence,
    expectedIdentity,
    requiredBrowsers: REQUIRED_BROWSERS,
    requiredBuildCount: 2,
    now: createdAt,
    waivers: []
  });

  const report = {
    ...evidence,
    schemaVersion: "loreweaver.golden-cross-build-determinism-report.v2",
    workspaceId: WORKSPACE_ID,
    replayReady: evidenceReadiness.replayReady,
    evidenceMeaning: "Two independently compiled Candidate stages executed in independent Chromium and Firefox sessions with the same explicit verification seed, semantic input, paused target Scene and exact Phaser frame advancement. The declared adapter-state projection is compared across builds inside each browser and across browsers for each build. Visual-frame determinism and release certification are explicitly excluded.",
    declaration,
    controlReadiness,
    evidenceReadiness,
    builds: [buildA, buildB],
    runs: runs.map((run) => ({
      browser: run.browser,
      browserVersion: run.browserVersion,
      engineVersion: run.engineVersion,
      sessionId: run.sessionId,
      stateFingerprint: run.stateFingerprint,
      finalState: run.finalSnapshot.state
    }))
  };
  const reportPath = path.join(WORKSPACE, "reports/cross_build_determinism_latest.json");
  writeJson(reportPath, report);

  console.log(JSON.stringify({
    status: evidenceReadiness.status,
    deterministic: evidence.deterministic,
    replayReady: evidenceReadiness.replayReady,
    claim: evidenceReadiness.claim,
    releaseEligible: evidenceReadiness.releaseEligible,
    scope: evidence.scope,
    workspaceId: WORKSPACE_ID,
    scenarioHash,
    browsers: REQUIRED_BROWSERS,
    buildIds: [buildA.id, buildB.id],
    matrixCells: cells.length,
    perBrowser,
    crossBrowser,
    blockers: evidenceReadiness.blockers,
    warnings: evidenceReadiness.warnings,
    report: path.relative(ROOT, reportPath).split(path.sep).join("/")
  }, null, 2));
  if (!evidenceReadiness.replayReady) process.exit(2);
}

main().catch((error) => fail("golden_cross_build_determinism_error", {
  error: error?.stack || error?.message || String(error)
}));
