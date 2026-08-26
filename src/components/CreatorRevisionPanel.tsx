import React, { useState } from "react";
import { CheckCircle2, RotateCcw, Send, ShieldAlert, Sparkles } from "lucide-react";
import { GameSpec } from "../types";
import { WorkspaceMeta } from "./WorkspaceSelector";

type RevisionResult = {
  status?: "applied" | "blocked" | "rolled_back" | "failed";
  reason?: string;
  patchLevel?: string;
  agentRole?: string;
  diff?: Array<{
    path?: string;
    kind?: string;
    before?: unknown;
    after?: unknown;
  }>;
  validation?: {
    validator?: string;
    status?: string;
    report?: any;
    evidence?: string;
  };
  policy?: {
    blockers?: string[];
    patch_level?: string;
    agent_role?: string;
  };
  spec?: GameSpec;
  beforeSpecHash?: string;
  afterSpecHash?: string;
  releaseEvidenceInvalidated?: boolean;
};

interface CreatorRevisionPanelProps {
  workspace: WorkspaceMeta | null;
  gameSpec: GameSpec | null;
  locale: "zh" | "en";
  onUpdateSpec: (spec: GameSpec) => void;
  onRevisionApplied?: () => void;
  addLog: (message: string) => void;
}

function formatValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function CreatorRevisionPanel({
  workspace,
  gameSpec,
  locale,
  onUpdateSpec,
  onRevisionApplied,
  addLog
}: CreatorRevisionPanelProps) {
  const zh = locale === "zh";
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RevisionResult | null>(null);

  const submit = async () => {
    if (!workspace || !gameSpec || !message.trim() || isRunning) return;
    const instruction = message.trim();
    setIsRunning(true);
    setResult(null);
    addLog(zh ? `✨ [Creator Revision] ${instruction}` : `✨ [Creator Revision] ${instruction}`);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/creator-revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: instruction })
      });
      const payload: RevisionResult = await response.json();
      setResult(payload);

      if (response.ok && payload.status === "applied" && payload.spec) {
        onUpdateSpec(payload.spec);
        onRevisionApplied?.();
        setMessage("");
        addLog(
          zh
            ? `✅ 修改已通过 ${payload.validation?.validator || "validation"}，已应用 ${payload.diff?.length || 0} 项 Diff；旧 Release Evidence 已失效。`
            : `✅ Revision passed ${payload.validation?.validator || "validation"}; applied ${payload.diff?.length || 0} diff item(s) and invalidated old release evidence.`
        );
      } else if (payload.status === "rolled_back") {
        addLog(zh ? "↩️ 修改未通过验证，已自动回滚，当前可玩版本未改变。" : "↩️ Revision failed validation and was rolled back; the playable version is unchanged.");
      } else {
        addLog(zh ? `🛑 修改未应用：${payload.reason || "policy blocked"}` : `🛑 Revision not applied: ${payload.reason || "policy blocked"}`);
      }
    } catch (error: any) {
      const failure = { status: "failed" as const, reason: error?.message || String(error) };
      setResult(failure);
      addLog(zh ? `❌ 一句话修改失败：${failure.reason}` : `❌ Natural-language revision failed: ${failure.reason}`);
    } finally {
      setIsRunning(false);
    }
  };

  if (!workspace || !gameSpec) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-800">
        {zh ? "先生成或加载一个可玩版本，再进行一句话修改。" : "Create or load a playable build before revising it."}
      </div>
    );
  }

  const applied = result?.status === "applied";
  const rolledBack = result?.status === "rolled_back";
  const blockers = result?.policy?.blockers || [];
  const diff = result?.diff || [];

  return (
    <div className="w-full space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-violet-600 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {zh ? "一句话修改" : "Revise in one sentence"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {zh
                ? "先生成修改提案，再做权限检查和真实 Node Smoke。只有验证通过才写入；失败会自动回滚。"
                : "LoreWeaver proposes a change, checks authority, and runs real Node Smoke. Only validated changes commit; failures roll back automatically."}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={isRunning}
            rows={3}
            placeholder={zh
              ? "例如：第三段 Boss 太难，降低一点难度，但不要延长关卡时间。"
              : "Example: The stage-3 boss is too hard. Lower the difficulty without making the level longer."}
            className="min-h-[92px] flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={submit}
            disabled={isRunning || !message.trim()}
            className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 md:self-stretch"
          >
            <Send className={`h-4 w-4 ${isRunning ? "animate-pulse" : ""}`} />
            {isRunning ? (zh ? "生成并验证…" : "Propose & validate…") : (zh ? "修改并验证" : "Revise & Validate")}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono text-slate-500">
          <span className="rounded border border-slate-200 px-2 py-1 dark:border-slate-800">L1 numeric/copy ✓</span>
          <span className="rounded border border-slate-200 px-2 py-1 dark:border-slate-800">L2 card/modifier ✓</span>
          <span className="rounded border border-slate-200 px-2 py-1 dark:border-slate-800">Topology / Adapter / Runtime → Expert</span>
        </div>
      </div>

      {result && (
        <div className={`rounded-2xl border p-5 ${
          applied
            ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20"
            : rolledBack
              ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
              : "border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20"
        }`}>
          <div className="flex items-start gap-3">
            {applied ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : rolledBack ? <RotateCcw className="mt-0.5 h-5 w-5 text-amber-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600" />}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                {applied
                  ? (zh ? "验证通过，修改已应用" : "Validated and applied")
                  : rolledBack
                    ? (zh ? "验证失败，已自动回滚" : "Validation failed; rolled back")
                    : (zh ? "修改被策略阻止" : "Revision blocked by policy")}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono">
                {(result.patchLevel || result.policy?.patch_level) && <span className="rounded bg-white/70 px-2 py-1 dark:bg-slate-950/50">{result.patchLevel || result.policy?.patch_level}</span>}
                {(result.agentRole || result.policy?.agent_role) && <span className="rounded bg-white/70 px-2 py-1 dark:bg-slate-950/50">Agent: {result.agentRole || result.policy?.agent_role}</span>}
                {result.validation?.validator && <span className="rounded bg-white/70 px-2 py-1 dark:bg-slate-950/50">{result.validation.validator}: {result.validation.status}</span>}
                {applied && result.releaseEvidenceInvalidated && <span className="rounded bg-white/70 px-2 py-1 dark:bg-slate-950/50">release evidence → stale</span>}
              </div>

              {blockers.length > 0 && (
                <div className="mt-3 space-y-1 text-xs font-mono text-rose-700 dark:text-rose-300">
                  {blockers.map((blocker) => <div key={blocker}>• {blocker}</div>)}
                </div>
              )}
            </div>
          </div>

          {diff.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold dark:border-slate-800">
                {zh ? `最终 Diff · ${diff.length} 项` : `Final Diff · ${diff.length} item(s)`}
              </div>
              <div className="max-h-[360px] divide-y divide-slate-100 overflow-auto dark:divide-slate-900">
                {diff.slice(0, 80).map((item, index) => (
                  <div key={`${item.path}-${index}`} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[minmax(160px,0.8fr)_1fr_24px_1fr]">
                    <code className="break-all text-violet-700 dark:text-violet-300">{item.path}</code>
                    <div className="break-words text-slate-500 line-through decoration-slate-300">{formatValue(item.before)}</div>
                    <div className="text-center text-slate-400">→</div>
                    <div className="break-words font-medium text-slate-800 dark:text-slate-200">{formatValue(item.after)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
