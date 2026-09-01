import type express from "express";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";

type RegisterCapabilityPromotionRoutesOptions = {
  app: express.Express;
  cwd: string;
  timeoutMs?: number;
};

function safeRepoRelative(root: string, value: unknown, field: string) {
  const raw = typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
  if (!raw || raw.startsWith("/") || raw.split("/").includes("..")) {
    return { ok: false, reason: `${field}_unsafe_or_missing`, path: null as string | null };
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, raw);
  if (!`${resolved}${path.sep}`.startsWith(`${resolvedRoot}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, reason: `${field}_missing_or_outside_repository`, path: null as string | null };
  }
  if (path.extname(resolved).toLowerCase() !== ".json") {
    return { ok: false, reason: `${field}_must_be_json`, path: null as string | null };
  }
  return { ok: true, reason: null, path: raw };
}

function parseJsonOutput(stdout: string) {
  const raw = String(stdout || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const starts: number[] = [];
  for (let index = 0; index < raw.length; index += 1) if (raw[index] === "{") starts.push(index);
  for (const start of starts.reverse()) {
    try { return JSON.parse(raw.slice(start)); } catch {}
  }
  return null;
}

function runPromotionCli({
  cwd,
  mode,
  promotionPath,
  candidatePath,
  approvalToken,
  timeoutMs
}: {
  cwd: string;
  mode: "preview" | "commit";
  promotionPath: string;
  candidatePath: string;
  approvalToken?: string | null;
  timeoutMs: number;
}) {
  const script = path.join(cwd, "productize", "promote-capability.mjs");
  const cliArgs = [
    script,
    `--mode=${mode}`,
    `--promotion=${promotionPath}`,
    `--candidate=${candidatePath}`
  ];
  if (mode === "commit" && approvalToken) cliArgs.push(`--approval-token=${approvalToken}`);
  const result = spawnSync(process.execPath, cliArgs, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: timeoutMs,
    shell: false
  });
  const payload = parseJsonOutput(result.stdout || "") || {
    status: "blocked",
    reason: "promotion_cli_non_json_output",
    stdout: String(result.stdout || "").slice(-4000),
    stderr: String(result.stderr || "").slice(-4000)
  };
  const succeeded = result.status === 0 && payload.status !== "blocked";
  return {
    statusCode: succeeded ? (mode === "commit" && payload.status === "promoted" ? 201 : 200) : 422,
    payload: {
      ...payload,
      gateway: {
        mode,
        explicitSecondPhaseRequired: true,
        tokenAutoSubmitted: false
      }
    }
  };
}

export function registerCapabilityPromotionRoutes({
  app,
  cwd,
  timeoutMs = 30_000
}: RegisterCapabilityPromotionRoutesOptions) {
  app.post("/api/capability-promotions/preview", (req, res) => {
    const promotion = safeRepoRelative(cwd, req.body?.promotionPath, "promotion_path");
    const candidate = safeRepoRelative(cwd, req.body?.candidatePath, "candidate_path");
    if (!promotion.ok || !candidate.ok) {
      return res.status(400).json({
        status: "blocked",
        reason: promotion.reason || candidate.reason,
        gateway: { mode: "preview", explicitSecondPhaseRequired: true, tokenAutoSubmitted: false }
      });
    }
    const result = runPromotionCli({
      cwd,
      mode: "preview",
      promotionPath: promotion.path!,
      candidatePath: candidate.path!,
      timeoutMs
    });
    return res.status(result.statusCode).json(result.payload);
  });

  app.post("/api/capability-promotions/commit", (req, res) => {
    const promotion = safeRepoRelative(cwd, req.body?.promotionPath, "promotion_path");
    const candidate = safeRepoRelative(cwd, req.body?.candidatePath, "candidate_path");
    const approvalToken = typeof req.body?.approvalToken === "string" ? req.body.approvalToken.trim() : "";
    if (!promotion.ok || !candidate.ok) {
      return res.status(400).json({
        status: "blocked",
        reason: promotion.reason || candidate.reason,
        gateway: { mode: "commit", explicitSecondPhaseRequired: true, tokenAutoSubmitted: false }
      });
    }
    if (!/^[0-9a-f]{64}$/.test(approvalToken)) {
      return res.status(400).json({
        status: "blocked",
        reason: "approval_token_required",
        gateway: { mode: "commit", explicitSecondPhaseRequired: true, tokenAutoSubmitted: false }
      });
    }
    const result = runPromotionCli({
      cwd,
      mode: "commit",
      promotionPath: promotion.path!,
      candidatePath: candidate.path!,
      approvalToken,
      timeoutMs
    });
    return res.status(result.statusCode).json(result.payload);
  });
}
