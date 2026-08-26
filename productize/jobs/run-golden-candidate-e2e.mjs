#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashExecutablePayloadManifest } from "../lib/executable-payload.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const SOURCE_WORKSPACE_ID = "20260611-060754-719406";
const GOLDEN_WORKSPACE_ID = "__golden_survivor_vertical_slice_ci";
const SOURCE_WORKSPACE = path.join(LORE_ROOT, "data/workspaces", SOURCE_WORKSPACE_ID);
const GOLDEN_WORKSPACE = path.join(LORE_ROOT, "data/workspaces", GOLDEN_WORKSPACE_ID);
const GRAPH_PATH = path.join(LORE_ROOT, "productize/fixtures/recipes/survivor_vertical_slice_3.recipe-graph.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function parseLastJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const starts = [];
    for (let i = 0; i < raw.length; i += 1) if (raw[i] === "{") starts.push(i);
    for (const start of starts.reverse()) {
      try { return JSON.parse(raw.slice(start)); } catch { /* continue */ }
    }
    return null;
  }
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
  return files;
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
    const server = http.createServer((req, res) => {
      let requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (requestPath === "/") requestPath = "/index.html";
      const file = path.resolve(root, requestPath.replace(/^\/+/, ""));
      const normalizedRoot = `${path.resolve(root)}${path.sep}`;
      if (!`${file}${path.sep}`.startsWith(normalizedRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function materializeGoldenWorkspace() {
  if (!fs.existsSync(SOURCE_WORKSPACE)) throw new Error(`source workspace missing: ${SOURCE_WORKSPACE}`);
  const graph = readJson(GRAPH_PATH);
  const nodes = graph.nodes.map((node) => node.payload);
  fs.rmSync(GOLDEN_WORKSPACE, { recursive: true, force: true });
  fs.cpSync(SOURCE_WORKSPACE, GOLDEN_WORKSPACE, { recursive: true });

  const manifestPath = path.join(GOLDEN_WORKSPACE, "manifest.json");
  const manifest = readJson(manifestPath);
  manifest.title = "Golden Survivor Vertical Slice CI";
  manifest.nodes = nodes;
  manifest.recipeGraph = graph;
  manifest.workbench = {
    ...(manifest.workbench || {}),
    goldenPath: "survivor_vertical_slice_3",
    sourceWorkspaceId: SOURCE_WORKSPACE_ID
  };
  writeJson(manifestPath, manifest);

  const loreNodes = path.join(GOLDEN_WORKSPACE, "loreweaver/nodes");
  fs.mkdirSync(loreNodes, { recursive: true });
  for (const name of fs.readdirSync(loreNodes)) {
    if (name.endsWith(".json")) fs.rmSync(path.join(loreNodes, name), { force: true });
  }
  nodes.forEach((node, index) => writeJson(path.join(loreNodes, `node${index + 1}.json`), node));
  fs.rmSync(path.join(GOLDEN_WORKSPACE, "reports"), { recursive: true, force: true });
  fs.mkdirSync(path.join(GOLDEN_WORKSPACE, "reports"), { recursive: true });
  return { graph, nodes };
}

async function main() {
  const { nodes: authoredNodes } = materializeGoldenWorkspace();
  const tsxBin = path.join(LORE_ROOT, "node_modules/.bin/tsx");
  const compile = spawnSync(tsxBin, [
    path.join(LORE_ROOT, "productize/release-compiler.mjs"),
    `--workspace=data/workspaces/${GOLDEN_WORKSPACE_ID}`,
    "--mode=candidate"
  ], { cwd: LORE_ROOT, encoding: "utf8", env: process.env, timeout: 180000 });
  if (compile.status !== 0) {
    throw new Error(`candidate compile failed\n${compile.stdout}\n${compile.stderr}`);
  }
  const compilerResult = parseLastJson(compile.stdout);
  const exporterResult = parseLastJson(compilerResult?.exporterOutput);
  if (!exporterResult?.stage || !fs.existsSync(exporterResult.stage)) {
    throw new Error(`candidate stage missing: ${JSON.stringify(compilerResult)}`);
  }
  const stage = path.resolve(exporterResult.stage);
  const releaseManifest = readJson(path.join(stage, "release-manifest.json"));
  const releaseStatus = readJson(path.join(stage, "RELEASE_STATUS.json"));
  if (releaseStatus.artifactLabel !== "UNVERIFIED_CANDIDATE" || releaseStatus.releaseEligible !== false) {
    throw new Error("candidate package must be explicitly non-release");
  }

  const payloadIdentity = hashExecutablePayloadManifest(walkFiles(stage));
  if (!payloadIdentity.fileCount) throw new Error("executable payload identity is empty");

  const playwright = await import("playwright");
  const port = await findOpenPort();
  const server = await startStaticServer(stage, port);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const errors = { console: [], page: [], requests: [] };
  const apiRequests = [];
  const stageResults = [];
  let screenshotPath = null;
  let browser;

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
    await page.waitForFunction(
      () => Array.isArray(window.__LOREWEAVER_EMBEDDED_SPEC__?.nodes),
      null,
      { timeout: 10000 }
    );
    await page.waitForTimeout(1000);

    const resolvedContract = await page.evaluate(() =>
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
    if (resolvedContract.length !== authoredNodes.length || resolvedContract.some((node) => !node.tauntsIsArray || node.introType !== "string")) {
      throw new Error(`resolved runtime node contract invalid: ${JSON.stringify(resolvedContract)}`);
    }

    for (let index = 0; index < authoredNodes.length; index += 1) {
      const expectedNode = authoredNodes[index];
      const nodeId = expectedNode.id;

      await page.evaluate((runtimeNodeId) => {
        const game = window.__LOREWEAVER_GAME__;
        const spec = window.__LOREWEAVER_EMBEDDED_SPEC__;
        if (!game) throw new Error("game missing");
        if (!spec?.nodes?.length) throw new Error("embedded resolved game spec missing");
        const node = spec.nodes.find((candidate) => Number(candidate.id) === Number(runtimeNodeId));
        if (!node) throw new Error(`resolved runtime node missing: ${runtimeNodeId}`);
        if (!Array.isArray(node.taunts)) throw new Error(`resolved runtime taunts contract missing: ${runtimeNodeId}`);
        if (typeof node.intro !== "string") throw new Error(`resolved runtime intro contract missing: ${runtimeNodeId}`);
        try { game.scene.stop("LevelActiveScene"); } catch {}
        game.scene.start("LevelActiveScene", { node });
      }, nodeId);

      for (let click = 0; click < 5; click += 1) {
        const running = await page.evaluate(() => {
          const hooks = window.__LOREWEAVER_TEST_HOOKS__;
          const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
          return Boolean(
            window.__LOREWEAVER_GAME__?.scene?.isActive?.("LevelActiveScene") &&
            scene?.node?.gameplay?.cardId === "survivor_horde" &&
            (hooks?.status === "running" || scene?.adapter?.status === "running")
          );
        });
        if (running) break;
        const canvas = await page.locator("canvas").boundingBox().catch(() => null);
        if (canvas) await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
        await page.waitForTimeout(500);
      }

      const observed = await page.evaluate(() => {
        const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
        const hooks = window.__LOREWEAVER_TEST_HOOKS__ || {};
        return {
          active: Boolean(window.__LOREWEAVER_GAME__?.scene?.isActive?.("LevelActiveScene")),
          cardId: scene?.node?.gameplay?.cardId || null,
          modifierIds: (scene?.node?.gameplay?.modifiers || []).map((m) => typeof m === "string" ? m : m?.id).filter(Boolean),
          status: hooks.status || scene?.adapter?.status || null,
          adapterId: hooks.adapterId || null,
          runtimeContract: {
            introType: typeof scene?.node?.intro,
            tauntsIsArray: Array.isArray(scene?.node?.taunts)
          }
        };
      });
      const expectedMods = (expectedNode.gameplay?.modifiers || []).map((m) => typeof m === "string" ? m : m.id);
      const modsMatch = expectedMods.every((id) => observed.modifierIds.includes(id));
      const contractValid = observed.runtimeContract.introType === "string" && observed.runtimeContract.tauntsIsArray;
      const passed = observed.active && observed.cardId === "survivor_horde" && modsMatch && contractValid;
      stageResults.push({ stage: index + 1, nodeId, passed, expectedModifiers: expectedMods, observed });
      if (!passed) throw new Error(`stage ${index + 1} failed: ${JSON.stringify(stageResults.at(-1))}`);

      if (index === authoredNodes.length - 1) {
        screenshotPath = path.join(GOLDEN_WORKSPACE, "reports/golden_candidate_climax.png");
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      await page.evaluate(() => {
        const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
        if (typeof scene?.safeRetreat === "function") scene.safeRetreat();
        else window.__LOREWEAVER_GAME__?.scene?.start?.("MainScene");
      });
      await page.waitForTimeout(500);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const passed = errors.console.length === 0
    && errors.page.length === 0
    && errors.requests.length === 0
    && apiRequests.length === 0
    && stageResults.every((item) => item.passed);

  const report = {
    schemaVersion: "loreweaver.standalone-browser-report.v2",
    status: passed ? "passed" : "failed",
    createdAt: new Date().toISOString(),
    cardId: "survivor_horde",
    workspaceId: GOLDEN_WORKSPACE_ID,
    releaseEligible: passed,
    evidenceMeaning: "candidate executable payload passed static-host browser validation; this does not itself certify the artifact",
    specHash: releaseManifest.specHash,
    runtimeVersion: releaseManifest.runtimeVersion,
    payloadHash: payloadIdentity.payloadHash,
    payloadFileCount: payloadIdentity.fileCount,
    payloadTotalBytes: payloadIdentity.totalBytes,
    zeroApiRequests: apiRequests.length === 0,
    staticHostOnly: true,
    offlineBackendRequired: false,
    runtimeNodeContract: resolvedContract,
    stageResults,
    screenshot: screenshotPath ? path.relative(LORE_ROOT, screenshotPath).split(path.sep).join("/") : null,
    errors,
    apiRequests,
    artifact: exporterResult.artifact,
    artifactSha256: exporterResult.sha256,
    candidateMarker: releaseStatus.nonReleaseMarker
  };
  const reportPath = path.join(GOLDEN_WORKSPACE, "reports/standalone_browser_report.json");
  writeJson(reportPath, report);
  writeJson(path.join(GOLDEN_WORKSPACE, "reports/standalone_browser_report_survivor_horde.json"), report);

  console.log(JSON.stringify({
    status: report.status,
    workspaceId: GOLDEN_WORKSPACE_ID,
    stage,
    artifact: exporterResult.artifact,
    artifactSha256: exporterResult.sha256,
    payloadHash: report.payloadHash,
    zeroApiRequests: report.zeroApiRequests,
    stageResults,
    report: path.relative(LORE_ROOT, reportPath).split(path.sep).join("/")
  }, null, 2));
  if (!passed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
