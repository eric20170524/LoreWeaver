import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// 🐍 Python FastAPI Bridge & Process Manager
let pythonProcess: any = null;

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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
