import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_HELPER = path.join(ROOT, "productize/jobs/run-asset-vlm-operation.py");

function cleanedKey(value) {
  const text = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (!text || text === "xxx" || text === "changeme" || text.startsWith("MY_")) return null;
  return text;
}

function executableAvailable(command, env) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command) && fs.statSync(command).isFile();
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    env,
    timeout: 5000,
    stdio: "ignore"
  });
  return result.status === 0;
}

export function probeRealAssetVlmProvider({ env = process.env } = {}) {
  if (cleanedKey(env.XAI_API_KEY || env.GROK_API_KEY)) {
    return { available: true, provider: "grok", reason: "xai_api_key_present" };
  }
  const codex = env.CODEX_CLI || env.CHATGPT_CODEX_CLI || "codex";
  if (executableAvailable(codex, env)) {
    return { available: true, provider: "codex", reason: "codex_cli_available", executable: codex };
  }
  return { available: false, provider: null, reason: "no_real_vlm_provider" };
}

/**
 * Register `asset.vlm` only when a real provider is actually discoverable.
 * There is intentionally no deterministic/mock fallback. If the Map is empty,
 * AssetOperationExecutor will fail closed with `asset_operation_port_unregistered`.
 */
export function createRealAssetVlmOperationHandlers({
  env = process.env,
  python = env.PYTHON || env.PYTHON3 || (process.platform === "win32" ? "python" : "python3"),
  helperPath = DEFAULT_HELPER
} = {}) {
  const probe = probeRealAssetVlmProvider({ env });
  if (!probe.available) return new Map();

  return new Map([["asset.vlm", async (context) => {
    if (!context || !context.operation) throw new Error("asset_vlm_context_missing");
    if (context.inputs?.length !== 1 || context.operation.outputs?.length !== 1) {
      throw new Error(`asset_vlm_requires_single_input_output:${context.operation.id}`);
    }
    const input = context.inputs[0];
    if (!input?.absolutePath || !fs.existsSync(input.absolutePath)) {
      throw new Error(`asset_vlm_input_missing:${context.operation.id}`);
    }
    const extension = path.extname(input.path || input.absolutePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      throw new Error(`asset_vlm_input_type_unsupported:${extension || "missing"}`);
    }
    const outputId = context.operation.outputs[0];
    const out = context.resolveOutputPath(outputId, ".json");
    const summary = {
      purpose: "AssetRecipe real visual analysis",
      recipeId: context.recipe.id,
      operationId: context.operation.id,
      inputId: input.id,
      inputSha256: input.sha256,
      parameters: context.operation.parameters || {},
      providerRequested: probe.provider
    };
    const result = spawnSync(python, [
      helperPath,
      "--input", input.absolutePath,
      "--output", out.absolutePath
    ], {
      cwd: ROOT,
      encoding: "utf8",
      env,
      input: JSON.stringify(summary),
      timeout: 120000
    });
    if (result.status !== 0 || !fs.existsSync(out.absolutePath)) {
      throw new Error(
        `asset_vlm_provider_execution_failed:${probe.provider}:${result.status}:` +
        `${String(result.stdout || "").slice(-600)}:${String(result.stderr || "").slice(-600)}`
      );
    }
    const report = JSON.parse(fs.readFileSync(out.absolutePath, "utf8"));
    if (report.status !== "completed" || report.real !== true || !["grok", "codex"].includes(report.provider)) {
      throw new Error(`asset_vlm_report_not_real:${report.status}:${report.provider || "missing"}`);
    }
    return {
      outputs: [{
        id: outputId,
        path: out.relativePath,
        mime: "application/json",
        metadata: {
          evidenceKind: "real_vlm",
          provider: report.provider,
          model: report.model || null,
          auditStatus: report.auditStatus,
          inputSha256: report.input?.sha256 || null
        }
      }]
    };
  }]]);
}
