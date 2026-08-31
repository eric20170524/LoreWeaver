#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashExecutablePayloadManifest } from "../lib/executable-payload.mjs";
import { markCandidateReselectionEvidenceStale } from "../lib/mark-gate-reports-stale.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const WORKSPACES_ROOT = path.join(LORE_ROOT, "data/workspaces");
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

function fail(reason, extra = {}, code = 2) {
  console.log(JSON.stringify({ status: "failed", reason, ...extra }, null, 2));
  process.exit(code);
}
function safeWorkspaceId(value) {
  return /^[A-Za-z0-9._-]+$/.test(value || "") && value !== "." && value !== "..";
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function readJsonSafe(file) {
  try {
    return fs.existsSync(file) ? readJson(file) : null;
  } catch {
    return null;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function parseLastJson(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const starts = [];
  for (let i = 0; i < raw.length; i += 1) if (raw[i] === "{") starts.push(i);
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
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
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
function repoRelative(file) {
  return path.relative(LORE_ROOT, file).split(path.sep).join("/");
}

async function main() {
  const workspaceId = String(valueArg("--workspace-id") || "").trim();
  if (!safeWorkspaceId(workspaceId)) fail("invalid_workspace_id");
  const workspace = path.join(WORKSPACES_ROOT, workspaceId);
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) fail("workspace_not_found");

  const reportsDir = path.join(workspace, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const genericPath = path.join(reportsDir, "standalone_browser_report.json");
  const previousBrowserReport = readJsonSafe(genericPath);
  const canonicalScreenshotPath = path.join(reportsDir, "candidate_final_stage.png");
  const attemptScreenshotPath = path.join(reportsDir, `.candidate_final_stage_attempt_${process.pid}_${Date.now()}.png`);
  const attemptReportPath = path.join(reportsDir, "candidate_verification_attempt_latest.json");

  const tsxBin = path.join(LORE_ROOT, "node_modules/.bin/tsx");
  const compile = spawnSync(tsxBin, [
    path.join(LORE_ROOT, "productize/release-compiler.mjs"),
    `--workspace=data/workspaces/${workspaceId}`,
    "--mode=candidate"
  ], { cwd: LORE_ROOT, encoding: "utf8", env: process.env, timeout: 180000 });
  if (compile.status !== 0) {
    fail("candidate_compile_failed", {
      stdout: (compile.stdout || "").slice(-4000),
      stderr: (compile.stderr || "").slice(-4000)
    });
  }
  const compilerResult = parseLastJson(compile.stdout);
  const exporterResult = parseLastJson(compilerResult?.exporterOutput);
  if (!exporterResult?.stage || !exporterResult?.artifact) {
    fail("candidate_compiler_missing_stage_or_artifact", { compilerResult });
  }
  const stage = path.resolve(exporterResult.stage);
  const artifactPath = path.resolve(LORE_ROOT, exporterResult.artifact);
  if (!fs.existsSync(stage) || !fs.existsSync(artifactPath)) fail("candidate_artifact_or_stage_missing");

  const releaseManifest = readJson(path.join(stage, "release-manifest.json"));
  const releaseStatus = readJson(path.join(stage, "RELEASE_STATUS.json"));
  if (releaseStatus.artifactLabel !== "UNVERIFIED_CANDIDATE" || releaseStatus.releaseEligible !== false) {
    fail("candidate_package_missing_unverified_marker");
  }
  const payloadIdentity = hashExecutablePayloadManifest(walkFiles(stage));
  if (!payloadIdentity.fileCount) fail("candidate_payload_identity_empty");
  const artifactSha256 = sha256File(artifactPath);
  if (exporterResult.sha256 && exporterResult.sha256 !== artifactSha256) {
    fail("candidate_artifact_sha_mismatch", { exporter: exporterResult.sha256, actual: artifactSha256 });
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    fail("playwright_not_installed", { error: error?.message || String(error) });
  }

  const port = await findOpenPort();
  const server = await startStaticServer(stage, port);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const errors = { console: [], page: [], requests: [] };
  const apiRequests = [];
  const stageResults = [];
  let resolvedContract = [];
  let browser = null;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("favicon")) errors.console.push(msg.text());
    });
    page.on("pageerror", (error) => errors.page.push(error.message || String(error)));
    page.on("request", (request) => {
      const url = request.url();
      if (/\/api(?:\/|$|\?)/.test(url)) apiRequests.push(url);
    });
    page.on("requestfailed", (request) => errors.requests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || "failed"}`));

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__LOREWEAVER_GAME__ != null, null, { timeout: 30000 });
    await page.waitForFunction(() => Array.isArray(window.__LOREWEAVER_EMBEDDED_SPEC__?.nodes), null, { timeout: 10000 });
    await page.waitForTimeout(800);

    resolvedContract = await page.evaluate(() =>
      (window.__LOREWEAVER_EMBEDDED_SPEC__?.nodes || []).map((node) => ({
        id: node.id,
        title: node.title,
        introType: typeof node.intro,
        tauntsIsArray: Array.isArray(node.taunts),
        cardId: node.gameplay?.cardId || null,
        modifierIds: (node.gameplay?.modifiers || [])
          .map((modifier) => typeof modifier === "string" ? modifier : modifier?.id)
          .filter(Boolean)
      }))
    );
    if (!resolvedContract.length || resolvedContract.some((node) => !node.tauntsIsArray || node.introType !== "string" || !node.cardId)) {
      throw new Error(`resolved_runtime_node_contract_invalid:${JSON.stringify(resolvedContract)}`);
    }

    for (let index = 0; index < resolvedContract.length; index += 1) {
      const expected = resolvedContract[index];
      await page.evaluate((runtimeNodeId) => {
        const game = window.__LOREWEAVER_GAME__;
        const spec = window.__LOREWEAVER_EMBEDDED_SPEC__;
        if (!game || !spec?.nodes?.length) throw new Error("resolved_game_or_spec_missing");
        const node = spec.nodes.find((candidate) => Number(candidate.id) === Number(runtimeNodeId));
        if (!node) throw new Error(`resolved_node_missing:${runtimeNodeId}`);
        try { game.scene.stop("LevelActiveScene"); } catch {}
        game.scene.start("LevelActiveScene", { node });
      }, expected.id);

      for (let click = 0; click < 6; click += 1) {
        const ready = await page.evaluate((expectedCardId) => {
          const game = window.__LOREWEAVER_GAME__;
          const scene = game?.scene?.keys?.LevelActiveScene;
          const hooks = window.__LOREWEAVER_TEST_HOOKS__ || {};
          const active = Boolean(game?.scene?.isActive?.("LevelActiveScene"));
          const cardMatches = scene?.node?.gameplay?.cardId === expectedCardId;
          const runtimeReady = hooks?.status === "running" || scene?.adapter?.status === "running";
          return active && cardMatches && runtimeReady;
        }, expected.cardId);
        if (ready) break;
        const canvas = await page.locator("canvas").boundingBox().catch(() => null);
        if (canvas) await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
        await page.waitForTimeout(400);
      }

      const exactFrameRequired = expected.cardId === "survivor_horde";
      const exactFrameProbe = await page.evaluate(({ required, frames }) => {
        const api = window.__LOREWEAVER_RUNTIME_OBSERVATION__;
        const capabilities = typeof api?.capabilities === "function" ? api.capabilities() : null;
        const probe = {
          schemaVersion: "loreweaver.exact-frame-browser-probe.v1",
          required,
          requestedFrames: frames,
          capability: capabilities?.exactFrameAdvance === true,
          passed: !required,
          reason: null,
          before: null,
          paused: null,
          advance: null,
          after: null,
          trace: null,
          resume: null,
          final: null
        };
        if (!api || typeof api.snapshot !== "function" || typeof api.trace !== "function") {
          probe.passed = false;
          probe.reason = "runtime_observation_api_missing";
          return probe;
        }
        if (!probe.capability) {
          probe.reason = required ? "exact_frame_capability_missing" : "exact_frame_optional_and_unavailable";
          return probe;
        }

        let pauseSucceeded = false;
        try {
          probe.before = api.snapshot();
          probe.paused = api.pause({ reason: "candidate_exact_frame_probe" });
          pauseSucceeded = probe.paused?.status === "passed";
          if (!pauseSucceeded) {
            probe.reason = `pause_${probe.paused?.status || "missing"}`;
          } else {
            const pausedSnapshot = api.snapshot();
            probe.advance = api.advanceFrames({ frames });
            probe.after = api.snapshot();
            probe.trace = api.trace();
            const result = probe.advance?.result || {};
            const sameSession = Boolean(
              probe.before?.sessionId
              && probe.before.sessionId === pausedSnapshot?.sessionId
              && probe.before.sessionId === probe.after?.sessionId
              && probe.before.sessionId === probe.trace?.sessionId
            );
            const frameDelta = Number(result.finalFrame) - Number(result.initialFrame);
            const exactCount = probe.advance?.status === "passed"
              && result.frames === frames
              && frameDelta === frames;
            const exactDelta = Number(result.simulatedDeltaMs) > 0
              && Math.abs(Number(result.simulatedDeltaMs) - Number(result.deltaMs) * frames) <= 0.05;
            const remainedPaused = result.targetSceneStatus === "paused"
              && probe.after?.state?.status === "paused";
            const observationAdvanced = Number(probe.after?.sequence) > Number(probe.before?.sequence);
            probe.passed = Boolean(
              pauseSucceeded
              && sameSession
              && exactCount
              && exactDelta
              && remainedPaused
              && observationAdvanced
            );
            if (!probe.passed) {
              probe.reason = `exact_frame_assertion_failed:${JSON.stringify({ sameSession, exactCount, exactDelta, remainedPaused, observationAdvanced, frameDelta })}`;
            }
          }
        } catch (error) {
          probe.passed = false;
          probe.reason = error?.message || String(error);
        } finally {
          if (pauseSucceeded) {
            try {
              probe.resume = api.resume({ reason: "candidate_exact_frame_probe_complete" });
              if (probe.resume?.status !== "passed") {
                probe.passed = false;
                probe.reason = probe.reason || `resume_${probe.resume?.status || "missing"}`;
              }
            } catch (error) {
              probe.passed = false;
              probe.reason = probe.reason || `resume_error:${error?.message || String(error)}`;
            }
          }
          try { probe.final = api.snapshot(); } catch {}
          if (pauseSucceeded && probe.final?.state?.status !== "running") {
            probe.passed = false;
            probe.reason = probe.reason || `final_runtime_status_not_running:${probe.final?.state?.status}`;
          }
        }
        return probe;
      }, { required: exactFrameRequired, frames: 2 });

      const observed = await page.evaluate(() => {
        const game = window.__LOREWEAVER_GAME__;
        const scene = game?.scene?.keys?.LevelActiveScene;
        const hooks = window.__LOREWEAVER_TEST_HOOKS__ || {};
        const observationApi = window.__LOREWEAVER_RUNTIME_OBSERVATION__;
        const observationSnapshot = typeof observationApi?.snapshot === "function"
          ? observationApi.snapshot()
          : null;
        const observationTrace = typeof observationApi?.trace === "function"
          ? observationApi.trace()
          : null;
        const observation = observationSnapshot && observationTrace
          ? {
              schemaVersion: observationApi.schemaVersion || null,
              runtimeAuthority: observationSnapshot.runtimeAuthority || null,
              snapshotSessionId: observationSnapshot.sessionId || null,
              traceSessionId: observationTrace.sessionId || null,
              sequence: observationSnapshot.sequence ?? null,
              traceEntryCount: observationTrace.entryCount ?? null,
              traceFirstSequence: observationTrace.firstSequence ?? null,
              traceLastSequence: observationTrace.lastSequence ?? null,
              sourceHooksKey: observationSnapshot.sourceHooksKey || null,
              capabilities: observationSnapshot.capabilities || null,
              state: observationSnapshot.state || null
            }
          : null;
        return {
          active: Boolean(game?.scene?.isActive?.("LevelActiveScene")),
          cardId: scene?.node?.gameplay?.cardId || null,
          modifierIds: (scene?.node?.gameplay?.modifiers || []).map((m) => typeof m === "string" ? m : m?.id).filter(Boolean),
          status: hooks.status || scene?.adapter?.status || null,
          adapterId: hooks.adapterId || null,
          runtimeContract: {
            introType: typeof scene?.node?.intro,
            tauntsIsArray: Array.isArray(scene?.node?.taunts)
          },
          observation
        };
      });
      const modsMatch = expected.modifierIds.every((id) => observed.modifierIds.includes(id));
      const contractValid = observed.runtimeContract.introType === "string" && observed.runtimeContract.tauntsIsArray;
      const runtimeRunning = observed.status === "running";
      const observationValid = Boolean(
        observed.observation
        && observed.observation.schemaVersion === "loreweaver.runtime-observation.v1"
        && observed.observation.runtimeAuthority === "LoreWeaverRuntimeKernel"
        && observed.observation.snapshotSessionId
        && observed.observation.snapshotSessionId === observed.observation.traceSessionId
        && Number(observed.observation.sequence) >= 1
        && Number(observed.observation.traceEntryCount) >= 1
        && observed.observation.capabilities?.snapshot === true
        && observed.observation.capabilities?.trace === true
        && observed.observation.sourceHooksKey === "__LOREWEAVER_TEST_HOOKS__"
      );
      const exactFrameValid = Boolean(
        exactFrameProbe?.passed === true
        && (!exactFrameRequired || exactFrameProbe.capability === true)
      );
      const stagePassed = observed.active
        && observed.cardId === expected.cardId
        && modsMatch
        && contractValid
        && runtimeRunning
        && observationValid
        && exactFrameValid;
      stageResults.push({
        stage: index + 1,
        nodeId: expected.id,
        cardId: expected.cardId,
        passed: stagePassed,
        expectedModifiers: expected.modifierIds,
        assertions: { modsMatch, contractValid, runtimeRunning, observationValid, exactFrameValid },
        exactFrameProbe,
        observed
      });
      if (!stagePassed) throw new Error(`stage_${index + 1}_failed:${JSON.stringify(stageResults.at(-1))}`);

      if (index === resolvedContract.length - 1) await page.screenshot({ path: attemptScreenshotPath, fullPage: true });

      await page.evaluate(() => {
        const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
        if (typeof scene?.safeRetreat === "function") scene.safeRetreat();
        else window.__LOREWEAVER_GAME__?.scene?.start?.("MainScene");
      });
      await page.waitForTimeout(350);
    }
  } catch (error) {
    errors.page.push(error?.message || String(error));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const passed = errors.console.length === 0
    && errors.page.length === 0
    && errors.requests.length === 0
    && apiRequests.length === 0
    && stageResults.length === resolvedContract.length
    && stageResults.every((item) => item.passed)
    && fs.existsSync(attemptScreenshotPath);
  const screenshotSha256 = fs.existsSync(attemptScreenshotPath) ? sha256File(attemptScreenshotPath) : null;
  const cardIds = [...new Set(resolvedContract.map((node) => node.cardId).filter(Boolean))].sort();
  const observationSessions = stageResults.map((result) => ({
    stage: result.stage,
    nodeId: result.nodeId,
    cardId: result.cardId,
    sessionId: result.observed?.observation?.snapshotSessionId || null,
    sequence: result.observed?.observation?.sequence ?? null,
    traceEntryCount: result.observed?.observation?.traceEntryCount ?? null,
    runtimeAuthority: result.observed?.observation?.runtimeAuthority || null,
    capabilities: result.observed?.observation?.capabilities || null,
    exactFrameProbe: result.exactFrameProbe || null
  }));
  const common = {
    schemaVersion: "loreweaver.standalone-browser-report.v4",
    status: passed ? "passed" : "failed",
    createdAt: new Date().toISOString(),
    workspaceId,
    releaseEligible: passed,
    evidenceMeaning: "exact Candidate executable payload passed static-host browser validation; runtime state, trace, and required survivor exact-frame probe are captured from the same RuntimeObservation session while screenshot remains host-owned",
    specHash: releaseManifest.specHash,
    runtimeVersion: releaseManifest.runtimeVersion,
    payloadHash: payloadIdentity.payloadHash,
    payloadFileCount: payloadIdentity.fileCount,
    payloadTotalBytes: payloadIdentity.totalBytes,
    zeroApiRequests: apiRequests.length === 0,
    staticHostOnly: true,
    offlineBackendRequired: false,
    runtimeObservation: {
      schemaVersion: "loreweaver.runtime-observation-bundle.v2",
      runtimeAuthority: "LoreWeaverRuntimeKernel",
      sessionCount: observationSessions.length,
      sessions: observationSessions,
      exactFrameRequiredCards: ["survivor_horde"],
      screenshotOwner: "PlaywrightHost"
    },
    runtimeNodeContract: resolvedContract,
    stageResults,
    screenshot: repoRelative(canonicalScreenshotPath),
    screenshotSha256,
    errors,
    apiRequests,
    artifact: repoRelative(artifactPath),
    artifactSha256,
    candidateMarker: releaseStatus.nonReleaseMarker,
    cardIds
  };

  if (!passed) {
    fs.rmSync(attemptScreenshotPath, { force: true });
    const attempt = {
      ...common,
      screenshot: null,
      screenshotSha256: null,
      reason: "candidate_browser_validation_failed",
      preservedPreviousVerifiedCandidate: Boolean(previousBrowserReport?.status === "passed")
    };
    writeJson(attemptReportPath, attempt);
    console.log(JSON.stringify({
      status: "failed",
      reason: attempt.reason,
      workspaceId,
      stageResults,
      errors,
      preservedPreviousVerifiedCandidate: attempt.preservedPreviousVerifiedCandidate,
      attemptReport: repoRelative(attemptReportPath)
    }, null, 2));
    process.exit(2);
  }

  // Commit the new verified Browser anchor only after the entire runtime validation
  // has succeeded. A failed re-verification never overwrites the previous anchor.
  fs.renameSync(attemptScreenshotPath, canonicalScreenshotPath);
  const nextGenericReport = { ...common, cardId: cardIds.length === 1 ? cardIds[0] : null };
  writeJson(genericPath, nextGenericReport);
  for (const cardId of cardIds) {
    writeJson(path.join(reportsDir, `standalone_browser_report_${cardId}.json`), { ...common, cardId });
  }

  const invalidation = markCandidateReselectionEvidenceStale({
    workspaceReportsDir: reportsDir,
    cardIds,
    previousBrowserReport,
    nextBrowserReport: nextGenericReport
  });
  fs.rmSync(attemptReportPath, { force: true });

  const result = {
    status: "passed",
    workspaceId,
    artifact: repoRelative(artifactPath),
    artifactSha256,
    payloadHash: payloadIdentity.payloadHash,
    screenshot: common.screenshot,
    screenshotSha256,
    zeroApiRequests: common.zeroApiRequests,
    runtimeObservationSessions: observationSessions,
    cardIds,
    stageResults,
    report: repoRelative(genericPath),
    downloadReady: true,
    downstreamEvidenceInvalidation: invalidation
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => fail("workspace_candidate_verifier_error", { error: error?.stack || error?.message || String(error) }));
