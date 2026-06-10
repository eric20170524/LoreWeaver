import express from "express";
import path from "path";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const app = express();
const PORT = 3000;
const VITE_DEV_PORT = 5173;

app.use(express.json({ limit: "10mb" }));

// 🐍 Python FastAPI Bridge & Process Manager
let pythonProcess: any = null;
let viteProcess: any = null;

function tryLaunchPythonBackend() {
  console.log("Attempting to spawn Python FastAPI backend on port 8000...");
  
  try {
    pythonProcess = spawn("python3", ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"]);
  } catch (err) {
    try {
      pythonProcess = spawn("python", ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"]);
    } catch (e) {
      console.error("❌ Failed to initiate Python backend process launcher:", e);
    }
  }

  if (pythonProcess) {
    pythonProcess.stdout.on("data", (data: any) => {
      console.log(`[Python stdout]: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on("data", (data: any) => {
      console.error(`[Python stderr]: ${data.toString().trim()}`);
    });

    pythonProcess.on("error", (err: any) => {
      console.error("⚠️ Python background process error:", err);
    });
  }
}

// Fire pre-emptive background parser thread
tryLaunchPythonBackend();

function pipeChildLogs(label: string, child: any) {
  child.stdout?.on("data", (data: any) => {
    console.log(`[${label} stdout]: ${data.toString().trim()}`);
  });
  child.stderr?.on("data", (data: any) => {
    console.error(`[${label} stderr]: ${data.toString().trim()}`);
  });
  child.on("error", (err: any) => {
    console.error(`⚠️ ${label} process error:`, err);
  });
}

function tryLaunchViteFrontend() {
  const viteBin = path.join(process.cwd(), "node_modules", ".bin", "vite");
  console.log(`Attempting to spawn Vite frontend on port ${VITE_DEV_PORT}...`);
  viteProcess = spawn(viteBin, [
    "--host",
    "127.0.0.1",
    "--port",
    String(VITE_DEV_PORT),
    "--strictPort"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DISABLE_HMR: "true"
    }
  });
  pipeChildLogs("Vite", viteProcess);
}

function shutdownChildren() {
  for (const child of [viteProcess, pythonProcess]) {
    if (child && child.exitCode === null) {
      child.kill();
    }
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

// Smart Gateway Proxy middleware to direct all APIs to the Python database engine
app.use("/api", async (req, res) => {
  const targetUrl = `http://127.0.0.1:8000/api${req.url}`;
  try {
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === "string") {
        headers[key] = val;
      } else if (Array.isArray(val)) {
        headers[key] = val.join(", ");
      }
    }

    const options: any = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const proxyRes = await fetch(targetUrl, options);
    res.status(proxyRes.status);
    
    proxyRes.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });

    const bodyText = await proxyRes.text();
    return res.send(bodyText);
  } catch (proxyError: any) {
    console.error("Gateway proxy to Python has failed:", proxyError.message);
    return res.status(502).json({ 
      success: false, 
      error: "FastAPI Backend is still starting up or encounters an exception. Cleaned duplicate express fallbacks." 
    });
  }
});

// Serve and integrate Vite development server
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LoreWeaver platform dev proxy successfully running on http://localhost:${PORT}`);
  });
}

startServer();
