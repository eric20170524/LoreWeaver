import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { spawn, spawnSync } from "child_process";

dotenv.config();

const app = express();

function readPort(envName: string, fallback: number) {
  const value = process.env[envName];
  if (!value) return fallback;
  const port = Number.parseInt(value, 10);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  console.warn(`Invalid ${envName} value "${value}", using ${fallback}.`);
  return fallback;
}

const PORT = readPort("PORT", 3000);
const VITE_DEV_PORT = readPort("VITE_DEV_PORT", 5173);
const PYTHON_BACKEND_PORT = readPort("PYTHON_BACKEND_PORT", 8000);

app.use(express.json({ limit: "10mb" }));

let pythonProcess: any = null;
let viteProcess: any = null;

function getPythonCommand(): string {
  const isWindows = process.platform === "win32";
  const binDir = isWindows ? "Scripts" : "bin";
  const pythonExe = isWindows ? "python.exe" : "python";
  const python3Exe = isWindows ? "python.exe" : "python3";

  if (process.env.VIRTUAL_ENV) {
    const envPython = path.join(process.env.VIRTUAL_ENV, binDir, pythonExe);
    if (fs.existsSync(envPython)) return envPython;
    const envPython3 = path.join(process.env.VIRTUAL_ENV, binDir, python3Exe);
    if (fs.existsSync(envPython3)) return envPython3;
  }

  const localDotVenv = path.join(process.cwd(), ".venv");
  const localDotVenvPython = path.join(localDotVenv, binDir, pythonExe);
  if (fs.existsSync(localDotVenvPython)) return localDotVenvPython;
  const localDotVenvPython3 = path.join(localDotVenv, binDir, python3Exe);
  if (fs.existsSync(localDotVenvPython3)) return localDotVenvPython3;

  const localVenv = path.join(process.cwd(), "venv");
  const localPython = path.join(localVenv, binDir, pythonExe);
  if (fs.existsSync(localPython)) return localPython;
  const localPython3 = path.join(localVenv, binDir, python3Exe);
  if (fs.existsSync(localPython3)) return localPython3;

  const parentVenv = path.join(process.cwd(), "..", "venv");
  const parentPython = path.join(parentVenv, binDir, pythonExe);
  if (fs.existsSync(parentPython)) return parentPython;
  const parentPython3 = path.join(parentVenv, binDir, python3Exe);
  if (fs.existsSync(parentPython3)) return parentPython3;

  return isWindows ? "python" : "python3";
}

function tryLaunchPythonBackend() {
  const pythonCmd = getPythonCommand();
  console.log(`Attempting to spawn Python FastAPI backend using "${pythonCmd}" on port ${PYTHON_BACKEND_PORT}...`);
  try {
    pythonProcess = spawn(pythonCmd, ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", String(PYTHON_BACKEND_PORT)]);
  } catch (err) {
    console.warn(`⚠️ Failed to spawn Python backend using "${pythonCmd}":`, err);
    console.log("Trying system 'python' fallback...");
    try {
      pythonProcess = spawn("python", ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", String(PYTHON_BACKEND_PORT)]);
    } catch (e) {
      console.error("❌ Failed to initiate Python backend process launcher:", e);
    }
  }

  if (pythonProcess) {
    pythonProcess.stdout.on("data", (data: any) => console.log(`[Python stdout]: ${data.toString().trim()}`));
    pythonProcess.stderr.on("data", (data: any) => console.error(`[Python stderr]: ${data.toString().trim()}`));
    pythonProcess.on("error", (err: any) => console.error("⚠️ Python background process error:", err));
  }
}

tryLaunchPythonBackend();

function pipeChildLogs(label: string, child: any) {
  child.stdout?.on("data", (data: any) => console.log(`[${label} stdout]: ${data.toString().trim()}`));
  child.stderr?.on("data", (data: any) => console.error(`[${label} stderr]: ${data.toString().trim()}`));
  child.on("error", (err: any) => console.error(`⚠️ ${label} process error:`, err));
}

function tryLaunchViteFrontend() {
  const isWindows = process.platform === "win32";
  const viteBin = path.join(process.cwd(), "node_modules", ".bin", isWindows ? "vite.cmd" : "vite");
  console.log(`Attempting to spawn Vite frontend on port ${VITE_DEV_PORT}...`);
  viteProcess = spawn(viteBin, ["--host", "127.0.0.1", "--port", String(VITE_DEV_PORT), "--strictPort"], {
    cwd: process.cwd(),
    env: { ...process.env, DISABLE_HMR: "true" },
    shell: isWindows
  });
  pipeChildLogs("Vite", viteProcess);
}

function shutdownChildren() {
  for (const child of [viteProcess, pythonProcess]) {
    if (child && child.exitCode === null) child.kill();
  }
}

process.on("SIGTERM", () => {
  shutdownChildren();
  process.exit(0);
});
process.on("SIGINT", () => {
  shutdownChildren();
  process.exit(0);
});

function isSafeWorkspaceId(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function parseJsonOutput(stdout: string) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

function releaseCompilerCommand(workspaceId: string, mode: "candidate" | "certified", dryRun = false) {
  const isWindows = process.platform === "win32";
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", isWindows ? "tsx.cmd" : "tsx");
  const compiler = path.join(process.cwd(), "productize", "release-compiler.mjs");
  const compilerArgs = [
    compiler,
    `--workspace=data/workspaces/${workspaceId}`,
    `--mode=${mode}`
  ];
  if (dryRun) compilerArgs.push("--dry-run");
  return { isWindows, tsxBin, compilerArgs };
}

function validateReleaseWorkspace(workspaceId: string) {
  if (!isSafeWorkspaceId(workspaceId)) {
    return { ok: false, statusCode: 400, payload: { status: "failed", reason: "invalid_workspace_id" } };
  }
  const workspaceDir = path.join(process.cwd(), "data", "workspaces", workspaceId);
  if (!fs.existsSync(workspaceDir)) {
    return { ok: false, statusCode: 404, payload: { status: "failed", reason: "workspace_not_found" } };
  }
  return { ok: true, statusCode: 200, payload: null };
}

function runReleaseStatus(workspaceId: string) {
  const validation = validateReleaseWorkspace(workspaceId);
  if (!validation.ok) return validation;
  const { isWindows, tsxBin, compilerArgs } = releaseCompilerCommand(workspaceId, "certified", true);
  const result = spawnSync(tsxBin, compilerArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    shell: isWindows,
    timeout: 60_000
  });
  const payload = parseJsonOutput(result.stdout || "");
  if (payload) {
    return { ok: true, statusCode: 200, payload };
  }
  return {
    ok: false,
    statusCode: 500,
    payload: {
      status: "failed",
      reason: "release_status_non_json_output",
      stdout: (result.stdout || "").slice(-4000),
      stderr: (result.stderr || "").slice(-4000)
    }
  };
}

function runReleaseCompiler(workspaceId: string, mode: "candidate" | "certified") {
  const validation = validateReleaseWorkspace(workspaceId);
  if (!validation.ok) return validation;
  const { isWindows, tsxBin, compilerArgs } = releaseCompilerCommand(workspaceId, mode, false);
  const result = spawnSync(tsxBin, compilerArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    shell: isWindows,
    timeout: 180_000
  });

  const payload = parseJsonOutput(result.stdout || "") || {
    status: "failed",
    reason: "release_compiler_non_json_output",
    stdout: (result.stdout || "").slice(-4000),
    stderr: (result.stderr || "").slice(-4000)
  };
  if (result.status !== 0) {
    return { ok: false, statusCode: payload.status === "blocked" ? 422 : 500, payload };
  }

  const exporterPayload = typeof payload.exporterOutput === "string"
    ? parseJsonOutput(payload.exporterOutput)
    : null;
  const artifactRel = exporterPayload?.artifact;
  if (!artifactRel) {
    return { ok: false, statusCode: 500, payload: { ...payload, reason: "release_compiler_missing_artifact_path" } };
  }
  const artifactPath = path.resolve(process.cwd(), artifactRel);
  const allowedExportsRoot = `${path.resolve(process.cwd(), "productize", "exports")}${path.sep}`;
  if (!`${artifactPath}${path.sep}`.startsWith(allowedExportsRoot) || !fs.existsSync(artifactPath)) {
    return { ok: false, statusCode: 500, payload: { ...payload, reason: "release_artifact_outside_allowed_root_or_missing" } };
  }
  return { ok: true, statusCode: 200, payload, artifactPath };
}

function sendReleaseArtifact(req: express.Request, res: express.Response, mode: "candidate" | "certified") {
  const workspaceId = String(req.params.wsId || "");
  const result = runReleaseCompiler(workspaceId, mode);
  if (!result.ok || !result.artifactPath) return res.status(result.statusCode).json(result.payload);
  const suffix = mode === "certified" ? "certified" : "candidate";
  const filename = `loreweaver-${workspaceId}-${suffix}.zip`;
  res.setHeader("X-LoreWeaver-Release-Mode", mode);
  res.setHeader("X-LoreWeaver-Certification-Tier", String(result.payload.certificationTier || "unknown"));
  if (result.payload.nonReleaseMarker) {
    res.setHeader("X-LoreWeaver-Non-Release-Marker", String(result.payload.nonReleaseMarker));
  }
  return res.download(result.artifactPath, filename);
}

function runCreatorRevision(workspaceId: string, body: unknown): Promise<{ statusCode: number; payload: any }> {
  return new Promise((resolve) => {
    const validation = validateReleaseWorkspace(workspaceId);
    if (!validation.ok) {
      resolve({ statusCode: validation.statusCode, payload: validation.payload });
      return;
    }
    const message = typeof (body as any)?.message === "string" ? (body as any).message.trim() : "";
    if (!message) {
      resolve({ statusCode: 400, payload: { status: "blocked", reason: "message_required" } });
      return;
    }

    const python = getPythonCommand();
    const runner = path.join(process.cwd(), "productize", "jobs", "run-creator-revision.py");
    const child = spawn(python, [runner, `--workspace-id=${workspaceId}`], {
      cwd: process.cwd(),
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill();
    }, 120_000);

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        statusCode: 500,
        payload: { status: "failed", reason: "creator_revision_process_error", error: error.message }
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const payload = parseJsonOutput(stdout) || {
        status: "failed",
        reason: "creator_revision_non_json_output",
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000)
      };
      if (code === 0 && payload.status === "applied") {
        resolve({ statusCode: 200, payload });
      } else if (payload.status === "blocked" || payload.status === "rolled_back") {
        resolve({ statusCode: 422, payload });
      } else {
        resolve({ statusCode: 500, payload: { ...payload, stderr: stderr.slice(-4000) } });
      }
    });
    child.stdin.end(JSON.stringify({ message }));
  });
}

app.get("/api/workspaces/:wsId/release-status", (req, res) => {
  const result = runReleaseStatus(String(req.params.wsId || ""));
  return res.status(result.statusCode).json(result.payload);
});
app.get("/api/workspaces/:wsId/export-candidate", (req, res) => sendReleaseArtifact(req, res, "candidate"));
app.get("/api/workspaces/:wsId/export-certified", (req, res) => sendReleaseArtifact(req, res, "certified"));
app.get("/api/workspaces/:wsId/export-release", (req, res) => sendReleaseArtifact(req, res, "candidate"));
app.post("/api/workspaces/:wsId/creator-revise", async (req, res) => {
  const result = await runCreatorRevision(String(req.params.wsId || ""), req.body);
  return res.status(result.statusCode).json(result.payload);
});

app.use("/api", async (req, res) => {
  const targetUrl = `http://127.0.0.1:${PYTHON_BACKEND_PORT}/api${req.url}`;
  try {
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === "string") headers[key] = val;
      else if (Array.isArray(val)) headers[key] = val.join(", ");
    }

    const options: any = { method: req.method, headers };
    const contentType = headers["content-type"] || "";
    const contentLength = Number.parseInt(String(req.headers["content-length"] || "0"), 10);
    const hasReadableBody = Boolean(req.headers["transfer-encoding"]) || contentLength > 0;

    if (req.method !== "GET" && req.method !== "HEAD" && hasReadableBody) {
      if (contentType.includes("application/json") && req.body !== undefined) {
        delete headers["content-length"];
        options.headers = headers;
        options.body = JSON.stringify(req.body);
      } else {
        options.body = req;
        options.duplex = "half";
      }
    }

    const proxyRes = await fetch(targetUrl, options);
    res.status(proxyRes.status);
    proxyRes.headers.forEach((value, name) => res.setHeader(name, value));
    const bodyBuffer = Buffer.from(await proxyRes.arrayBuffer());
    return res.send(bodyBuffer);
  } catch (proxyError: any) {
    console.error("Gateway proxy to Python has failed:", proxyError.message);
    return res.status(502).json({
      success: false,
      error: "FastAPI Backend is still starting up or encounters an exception. Cleaned duplicate express fallbacks."
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    tryLaunchViteFrontend();
    app.use(async (req, res) => {
      const targetUrl = `http://127.0.0.1:${VITE_DEV_PORT}${req.originalUrl}`;
      try {
        const proxyRes = await fetch(targetUrl, {
          method: req.method,
          headers: req.headers as Record<string, string>
        });
        res.status(proxyRes.status);
        proxyRes.headers.forEach((value, name) => {
          if (!["connection", "content-encoding", "transfer-encoding"].includes(name.toLowerCase())) {
            res.setHeader(name, value);
          }
        });
        const body = Buffer.from(await proxyRes.arrayBuffer());
        return res.send(body);
      } catch (error: any) {
        return res.status(502).send(`Vite frontend is still starting: ${error.message || error}`);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LoreWeaver platform dev proxy successfully running on http://localhost:${PORT}`);
  });
}

startServer();
