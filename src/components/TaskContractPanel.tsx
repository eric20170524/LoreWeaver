import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  RefreshCw,
  ShieldAlert,
  TerminalSquare
} from "lucide-react";
import { Locale } from "../types";

type TaskSummary = {
  id: string;
  title: string;
  status: string;
  sourceSpecHash?: string;
  requestedPatchLevel?: string;
  roundCount?: number;
  lastRoundHash?: string | null;
  blockers?: string[];
  valid?: boolean;
  validationErrors?: string[];
};

type EvidenceRef = {
  id: string;
  kind: string;
  path: string;
  status: string;
  criterionIds?: string[];
  fixture?: boolean;
  synthetic?: boolean;
  stale?: boolean;
};

type HandoffRound = {
  round: number;
  role: string;
  verdict: string;
  summary: string;
  evidenceRefs?: EvidenceRef[];
  findings?: string[];
  previousRoundHash?: string | null;
  roundHash?: string;
};

type AcceptanceCriterion = {
  id: string;
  description: string;
  evidenceKinds: string[];
};

type TaskContract = {
  schemaVersion: string;
  id: string;
  title: string;
  sourceSpecHash: string;
  productIntent: {
    goal: string;
    userVisibleOutcome: string;
    nonGoals?: string[];
  };
  acceptanceCriteria: AcceptanceCriterion[];
  dependencies?: string[];
  context?: Record<string, Array<{ file: string; reason: string }>>;
  runtimeStateContract?: {
    fields?: Array<{ path: string; type: string; reason: string }>;
    inputActions?: string[];
  };
  patchAuthority?: {
    maxAutoLevel?: string;
    requestedLevel?: string;
  };
  status: string;
  resumeRole?: string | null;
  handoffRounds?: HandoffRound[];
  blockers?: string[];
};

type AcceptanceResult = {
  status?: string;
  accepted?: boolean;
  coverage?: Record<string, Record<string, boolean>>;
  blockers?: string[];
  handoffRoundCount?: number;
  lastRoundHash?: string | null;
};

function statusClass(status: string) {
  if (["accepted", "reviewed", "runtime_verified", "static_verified"].includes(status)) {
    return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (["blocked", "escalated"].includes(status)) {
    return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300";
  }
  return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
}

function roleLabel(role: string, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    architect: ["架构", "Architect"],
    programmer: ["程序", "Programmer"],
    auditor: ["静态审计", "Auditor"],
    player: ["运行试玩", "Player"],
    reviewer: ["独立评审", "Reviewer"],
    orchestrator: ["总控验收", "Orchestrator"]
  };
  return labels[role]?.[zh ? 0 : 1] || role;
}

function nextRole(task: TaskContract | null) {
  if (!task) return null;
  if (task.status === "blocked") return task.resumeRole || null;
  const map: Record<string, string> = {
    draft: "architect",
    planned: "programmer",
    implemented: "auditor",
    static_verified: "player",
    runtime_verified: "reviewer",
    reviewed: "orchestrator"
  };
  return map[task.status] || null;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function Hash({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <code className="break-all text-[9px] text-slate-500">{value.slice(0, 16)}…</code>;
}

export function TaskContractPanel({
  workspaceId,
  locale
}: {
  workspaceId: string;
  locale: Locale;
}) {
  const zh = locale === "zh";
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskContract | null>(null);
  const [acceptance, setAcceptance] = useState<AcceptanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks`);
      const payload = await readJson(response);
      if (!response.ok || payload.status !== "passed") {
        throw new Error(payload.reason || `HTTP ${response.status}`);
      }
      const nextTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      setTasks(nextTasks);
      setSelectedId((current) => {
        if (current && nextTasks.some((item: TaskSummary) => item.id === current)) return current;
        return nextTasks[0]?.id || null;
      });
    } catch (cause: any) {
      setError(cause?.message || String(cause));
      setTasks([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadTask = useCallback(async () => {
    if (!workspaceId || !selectedId) {
      setTask(null);
      setAcceptance(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [taskResponse, acceptanceResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/tasks/${selectedId}`),
        fetch(`/api/workspaces/${workspaceId}/tasks/${selectedId}/acceptance`)
      ]);
      const [taskPayload, acceptancePayload] = await Promise.all([
        readJson(taskResponse),
        readJson(acceptanceResponse)
      ]);
      if (!taskResponse.ok || taskPayload.status !== "passed") {
        throw new Error(taskPayload.reason || `HTTP ${taskResponse.status}`);
      }
      if (!acceptanceResponse.ok || acceptancePayload.status !== "passed") {
        throw new Error(acceptancePayload.reason || `HTTP ${acceptanceResponse.status}`);
      }
      setTask(taskPayload.task || null);
      setAcceptance(acceptancePayload.acceptance || null);
    } catch (cause: any) {
      setTask(null);
      setAcceptance(null);
      setError(cause?.message || String(cause));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const currentRole = nextRole(task);
  const coverage = acceptance?.coverage || {};
  const coveredCount = useMemo(
    () => Object.values(coverage).flatMap((value) => Object.values(value)).filter(Boolean).length,
    [coverage]
  );
  const coverageTotal = useMemo(
    () => Object.values(coverage).flatMap((value) => Object.values(value)).length,
    [coverage]
  );

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/15">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {zh ? "任务合同 · 角色交接" : "Task Contracts · role handoffs"}
            </div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              {zh
                ? "产品意图 → 计划 → 实现 → 静态审计 → 运行试玩 → 独立评审 → 验收。"
                : "Intent → plan → implementation → static audit → runtime play → independent review → acceptance."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-cyan-200 px-2 py-0.5 font-mono text-[9px] text-cyan-700 dark:border-cyan-800 dark:text-cyan-300">
            {tasks.length}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-cyan-200 pt-4 dark:border-cyan-900/60">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-mono text-slate-500">
              {zh ? "Workspace 任务仓库" : "Workspace task repository"}
            </div>
            <button
              type="button"
              onClick={loadList}
              disabled={loading}
              className="rounded border border-slate-200 p-1.5 text-slate-500 disabled:opacity-50 dark:border-slate-800"
              title={zh ? "刷新任务" : "Refresh tasks"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />{error}
            </div>
          )}

          {!loading && tasks.length === 0 && !error && (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-[10px] leading-5 text-slate-500 dark:border-slate-700">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                {zh ? "当前 Workspace 还没有 TaskContract。" : "This Workspace has no TaskContract yet."}
              </div>
              <p className="mt-1">
                {zh
                  ? "可通过受控 API 或 CLI 创建；L3/L4 会立即升级人工，不能自动执行。"
                  : "Create one through the controlled API or CLI. L3/L4 immediately escalate to human review."}
              </p>
              <code className="mt-2 block overflow-x-auto rounded bg-slate-100 px-2 py-1.5 text-[9px] dark:bg-slate-900">
                npm run task:contract -- list --workspace-id={workspaceId}
              </code>
            </div>
          )}

          {tasks.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-2">
                {tasks.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedId === item.id
                        ? "border-cyan-400 bg-white shadow-sm dark:border-cyan-700 dark:bg-slate-950"
                        : "border-slate-200 bg-white/60 hover:border-cyan-300 dark:border-slate-800 dark:bg-slate-950/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{item.title}</div>
                        <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">{item.id}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono ${statusClass(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
                      <span>{item.requestedPatchLevel || "—"}</span>
                      <span>{item.roundCount || 0} {zh ? "轮" : "rounds"}</span>
                    </div>
                    {item.valid === false && (
                      <div className="mt-2 text-[9px] text-rose-600">{zh ? "合同校验失败" : "Invalid contract"}</div>
                    )}
                  </button>
                ))}
              </div>

              {task && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{task.title}</div>
                      <div className="mt-1 font-mono text-[9px] text-slate-400">{task.id} · spec {task.sourceSpecHash?.slice(0, 12)}…</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono ${statusClass(task.status)}`}>{task.status}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[9px] font-mono text-slate-500 dark:border-slate-700">
                        {task.patchAuthority?.requestedLevel || "—"} / auto≤{task.patchAuthority?.maxAutoLevel || "L2"}
                      </span>
                    </div>
                  </div>

                  {currentRole && (
                    <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 text-[10px] text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-300">
                      {zh ? "下一责任角色" : "Next owner"}: <strong>{roleLabel(currentRole, zh)}</strong>
                    </div>
                  )}

                  {(task.blockers || []).length > 0 && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
                      <div className="font-bold"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{zh ? "阻塞" : "Blockers"}</div>
                      {(task.blockers || []).map((item) => <div key={item} className="mt-1 break-all">• {item}</div>)}
                    </div>
                  )}

                  <section>
                    <div className="text-[10px] font-mono font-bold uppercase text-slate-500">Product Intent</div>
                    <div className="mt-2 space-y-1 text-[10px] leading-4 text-slate-600 dark:text-slate-300">
                      <p><strong>{zh ? "目标" : "Goal"}:</strong> {task.productIntent?.goal}</p>
                      <p><strong>{zh ? "用户结果" : "Outcome"}:</strong> {task.productIntent?.userVisibleOutcome}</p>
                      {(task.productIntent?.nonGoals || []).length > 0 && (
                        <p><strong>Non-goals:</strong> {(task.productIntent.nonGoals || []).join(" · ")}</p>
                      )}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono font-bold uppercase text-slate-500">
                      <span>Acceptance</span>
                      <span>{coveredCount}/{coverageTotal || task.acceptanceCriteria.length}</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {(task.acceptanceCriteria || []).map((criterion) => (
                        <div key={criterion.id} className="rounded border border-slate-200 p-2.5 dark:border-slate-800">
                          <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{criterion.id} · {criterion.description}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(criterion.evidenceKinds || []).map((kind) => {
                              const passed = coverage[criterion.id]?.[kind] === true;
                              return (
                                <span key={kind} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] ${passed ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300" : "border-slate-200 text-slate-400 dark:border-slate-700"}`}>
                                  {passed && <CheckCircle2 className="h-3 w-3" />}{kind}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="text-[10px] font-mono font-bold uppercase text-slate-500">Runtime State Contract</div>
                    <div className="mt-2 rounded border border-slate-200 p-2.5 text-[9px] leading-4 text-slate-500 dark:border-slate-800">
                      {(task.runtimeStateContract?.fields || []).map((field) => (
                        <div key={field.path}><code>{field.path}</code> : {field.type} — {field.reason}</div>
                      ))}
                      <div className="mt-1">{zh ? "输入动作" : "Inputs"}: {(task.runtimeStateContract?.inputActions || []).join(" · ") || "—"}</div>
                    </div>
                  </section>

                  <section>
                    <div className="text-[10px] font-mono font-bold uppercase text-slate-500">Role Context</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {Object.entries(task.context || {}).filter(([, entries]) => entries.length > 0).map(([role, entries]) => (
                        <div key={role} className="rounded border border-slate-200 p-2 dark:border-slate-800">
                          <div className="text-[9px] font-bold text-slate-600 dark:text-slate-300">{roleLabel(role, zh)}</div>
                          {entries.map((entry) => (
                            <div key={`${entry.file}:${entry.reason}`} className="mt-1 break-all text-[9px] leading-4 text-slate-500">
                              <code>{entry.file}</code> — {entry.reason}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono font-bold uppercase text-slate-500">
                      <span>Handoff Rounds</span>
                      <Hash value={acceptance?.lastRoundHash} />
                    </div>
                    <div className="mt-2 space-y-2">
                      {(task.handoffRounds || []).length === 0 && (
                        <div className="rounded border border-dashed border-slate-300 p-3 text-[10px] text-slate-400 dark:border-slate-700">
                          {zh ? "尚未交接；必须从 Architect 开始。" : "No handoff yet; Architect must start."}
                        </div>
                      )}
                      {(task.handoffRounds || []).map((round) => (
                        <div key={round.roundHash || round.round} className="rounded border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                              #{round.round} · {roleLabel(round.role, zh)} · {round.verdict}
                            </div>
                            <Hash value={round.roundHash} />
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-slate-500">{round.summary}</p>
                          {(round.evidenceRefs || []).map((evidence) => (
                            <div key={evidence.id} className="mt-1.5 flex items-start gap-1.5 text-[9px] text-slate-500">
                              <FileCheck2 className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="break-all">{evidence.kind} · {evidence.status} · {evidence.path}</span>
                            </div>
                          ))}
                          {(round.findings || []).map((finding) => (
                            <div key={finding} className="mt-1 text-[9px] text-rose-600">• {finding}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[9px] leading-4 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <TerminalSquare className="mr-1 inline h-3.5 w-3.5" />
                    {zh
                      ? "写操作使用同一受控 API/CLI，并要求当前 lastRoundHash；旧进程不能覆盖新交接。"
                      : "Writes use the same controlled API/CLI and require the current lastRoundHash; stale processes cannot overwrite newer handoffs."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}