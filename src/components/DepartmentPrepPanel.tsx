import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  MessageSquareWarning,
  ClipboardList,
  FileWarning,
  Users,
  MessageSquare
} from "lucide-react";
import { Locale } from "../types";
import {
  DepartmentDeskPayload,
  DepartmentHandoff,
  DepartmentMeta,
  DepartmentRuntimeState,
  confirmDepartment,
  createHandoff,
  fetchDepartmentDesk,
  fetchAdvanceGate,
  advanceDepartmentStage,
  resolveHandoff,
  runAutoPrep,
  runSingleDepartmentPrep,
  setDepartmentStatus,
  statusLabel,
  statusTone,
  AutoPrepResult,
  AdvanceGate,
  CHAT_AGENT_LABELS,
  STAGE_ADVANCE_BUTTONS,
  stageButtonMode,
  normalizeStageId
} from "../utils/departmentPrep";
import { synth } from "../utils/AudioSynth";
import { AgentChatPanel } from "./AgentChatPanel";

interface DepartmentPrepPanelProps {
  workspaceId: string | null;
  locale?: Locale;
  addLog: (msg: string) => void;
  jobId?: string;
  jobStatus?: string;
  onRefreshJob?: () => void;
  onUpdateSpec?: (spec: any) => void;
  /** Notify parent (pipeline rail) after desk mutations */
  onDeskChanged?: () => void;
}

type DetailTab = "prepNotes" | "chat" | "qaReport" | "handoffs";

export function DepartmentPrepPanel({
  workspaceId,
  locale = "zh",
  addLog,
  jobId,
  jobStatus,
  onRefreshJob,
  onUpdateSpec,
  onDeskChanged
}: DepartmentPrepPanelProps) {
  const zh = locale === "zh";
  const [desk, setDesk] = useState<DepartmentDeskPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string>("director");
  const [detailTab, setDetailTab] = useState<DetailTab>("prepNotes");
  const [notesDraft, setNotesDraft] = useState("");
  const [qaDraft, setQaDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunLog, setLastRunLog] = useState<AutoPrepResult["runLog"]>([]);
  const [gate, setGate] = useState<AdvanceGate | null>(null);
  const [lastPatches, setLastPatches] = useState<AutoPrepResult["patchesApplied"]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"idle" | "refresh" | "auto" | "dept" | "other">("idle");

  // New handoff form
  const [hoTo, setHoTo] = useState("art");
  const [hoSummary, setHoSummary] = useState("");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    setBusyAction((a) => (a === "idle" ? "refresh" : a));
    try {
      const data = await fetchDepartmentDesk(workspaceId);
      setDesk(data);
      const ids = data.registry.departments.map((d) => d.id);
      if (!ids.includes(selectedId) && ids[0]) setSelectedId(ids[0]);
      try {
        setGate(await fetchAdvanceGate(workspaceId));
      } catch {
        setGate(null);
      }
      setStatusMsg(zh ? "已刷新部门状态" : "Desk refreshed");
      onDeskChanged?.();
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatusMsg(null);
    } finally {
      setLoading(false);
      setBusyAction((a) => (a === "refresh" ? "idle" : a));
    }
  }, [workspaceId, selectedId, zh, onDeskChanged]);

  useEffect(() => {
    load();
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const metaList: DepartmentMeta[] = desk?.registry.departments || [];
  const state = desk?.state;
  const selectedMeta = metaList.find((d) => d.id === selectedId) || metaList[0];
  const selectedRuntime: DepartmentRuntimeState | undefined =
    selectedMeta && state?.departments?.[selectedMeta.id];

  useEffect(() => {
    if (selectedRuntime) {
      setNotesDraft(selectedRuntime.prepNotes || "");
      setQaDraft(
        selectedRuntime.qaScore == null ? "" : String(selectedRuntime.qaScore)
      );
    }
  }, [selectedId, selectedRuntime?.version, selectedRuntime?.prepNotes, selectedRuntime?.qaScore]);

  const handoffsForSelected: DepartmentHandoff[] = useMemo(() => {
    if (!desk || !selectedMeta) return [];
    return (desk.handoffs || []).filter(
      (h) => h.to === selectedMeta.id || h.from === selectedMeta.id
    );
  }, [desk, selectedMeta]);

  const openHandoffs = useMemo(
    () => (desk?.handoffs || []).filter((h) => h.status === "open"),
    [desk]
  );

  const stages = desk?.registry.stages || [];

  if (!workspaceId) {
    return (
      <div className="w-full text-center text-slate-500 py-16 text-sm">
        {zh ? "请先加载或编译一个 workspace，再进入部门筹备台。" : "Load a workspace first."}
      </div>
    );
  }

  const titleOf = (m: DepartmentMeta) => (zh ? m.title : m.titleEn || m.title);

  const onConfirm = async () => {
    if (!selectedMeta || busy) return;
    setBusy(true);
    try {
      const score = qaDraft === "" ? undefined : Number(qaDraft);
      const result = await confirmDepartment(workspaceId, selectedMeta.id, {
        prepNotes: notesDraft,
        qaScore: Number.isFinite(score as number) ? (score as number) : undefined,
        reprepDownstream: true
      });
      setDesk((prev) => (prev ? { ...prev, state: result.state } : prev));
      if (result.reprepLog?.length) setLastRunLog(result.reprepLog);
      if (result.reprepPatches?.length) setLastPatches(result.reprepPatches);
      const ver = result.state.departments[selectedMeta.id]?.version;
      const stale = result.staleDownstream || [];
      const reprepped = (result.reprepLog || []).filter((x) => !x.skipped).map((x) => x.id);
      addLog(
        zh
          ? `✅ 部门【${selectedMeta.title}】已确认 V${ver}${stale.length ? ` · 下游过期: ${stale.join(", ")}` : ""}${reprepped.length ? ` · 已重跑草案: ${reprepped.join(", ")}` : ""}`
          : `Confirmed ${selectedMeta.id} V${ver}${stale.length ? ` · stale: ${stale.join(",")}` : ""}${reprepped.length ? ` · reprepped: ${reprepped.join(",")}` : ""}`
      );
      synth.playClick();
      onDeskChanged?.();
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onMarkReady = async () => {
    if (!selectedMeta || busy) return;
    setBusy(true);
    try {
      const score = qaDraft === "" ? 80 : Number(qaDraft);
      const next = await setDepartmentStatus(workspaceId, selectedMeta.id, {
        status: "ready_for_review",
        prepNotes: notesDraft,
        qaScore: Number.isFinite(score) ? score : 80
      });
      setDesk((prev) => (prev ? { ...prev, state: next } : prev));
      addLog(zh ? `📋 ${selectedMeta.title} → 待确认` : `${selectedMeta.id} ready for review`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAutoPrep = async () => {
    if (busy || !workspaceId) return;
    setBusy(true);
    setBusyAction("auto");
    setError(null);
    setStatusMsg(
      zh
        ? "自动筹备进行中：按拓扑逐个调用 LLM（约 10 个部门，可能需要 1–3 分钟），请勿关闭页面…"
        : "Auto-prep running: calling LLM per department (may take 1–3 min)…"
    );
    try {
      addLog(zh ? "🎬 导演组开始拓扑调度各部门 Agent…" : "Director scheduling departments…");
      // force:true so re-running is not a silent no-op / stale procedural pass
      const data = await runAutoPrep(workspaceId, { force: true });
      setDesk((prev) => (prev ? { ...prev, state: data.state } : prev));
      setLastRunLog(data.runLog || []);
      setLastPatches(data.patchesApplied || []);
      if (data.gate) setGate(data.gate);
      const llmN = (data.runLog || []).filter((x) => x.source === "llm").length;
      const fallbackN = (data.runLog || []).filter(
        (x) => x.source === "procedural" || x.source === "procedural_fallback"
      ).length;
      const handN = data.createdHandoffs?.length || 0;
      const patchN = data.patchesApplied?.length || 0;
      const summary = zh
        ? `🎬 自动筹备完成：${data.updatedDepartments.length} 部门（LLM ${llmN} · 程序回退 ${fallbackN}）· 交接 ${handN} · patch ${patchN}${data.patchesSaved ? "（已写入 manifest）" : ""}`
        : `Auto-prep done: ${data.updatedDepartments.length} depts (LLM ${llmN}, fallback ${fallbackN}), HO ${handN}, patches ${patchN}`;
      addLog(summary);
      setStatusMsg(summary);
      synth.playClick();
      onDeskChanged?.();
      // Soft refresh of gate only — state already applied above
      try {
        setGate(await fetchAdvanceGate(workspaceId));
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      setStatusMsg(null);
      addLog(zh ? `❌ 自动筹备失败：${msg}` : `Auto-prep failed: ${msg}`);
    } finally {
      setBusy(false);
      setBusyAction("idle");
    }
  };

  const onRunThisDept = async () => {
    if (!selectedMeta || busy || !workspaceId) return;
    setBusy(true);
    setBusyAction("dept");
    setError(null);
    setStatusMsg(zh ? `正在调度【${selectedMeta.title}】…` : `Running ${selectedMeta.id}…`);
    try {
      addLog(zh ? `▶ 调度部门 ${selectedMeta.title}…` : `Running ${selectedMeta.id}…`);
      const data = await runSingleDepartmentPrep(workspaceId, selectedMeta.id, { force: true });
      setDesk((prev) => (prev ? { ...prev, state: data.state } : prev));
      setLastRunLog(data.runLog || []);
      setLastPatches(data.patchesApplied || []);
      const src = (data.runLog || []).find((x) => x.id === selectedMeta.id)?.source || "?";
      const msg = zh
        ? `✓ ${selectedMeta.title} 草案已更新（source=${src}${data.patchesApplied?.length ? ` · patch ${data.patchesApplied.length}` : ""}）`
        : `${selectedMeta.id} prep updated (${src})`;
      addLog(msg);
      setStatusMsg(msg);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      setStatusMsg(null);
      addLog(zh ? `❌ 部门调度失败：${msg}` : `Dept prep failed: ${msg}`);
    } finally {
      setBusy(false);
      setBusyAction("idle");
    }
  };

  const onCreateHandoff = async () => {
    if (!selectedMeta || !hoSummary.trim() || busy) return;
    setBusy(true);
    try {
      await createHandoff(workspaceId, {
        from: selectedMeta.id,
        to: hoTo,
        summary: hoSummary.trim(),
        type: "request"
      });
      setHoSummary("");
      addLog(zh ? `📨 交接已创建：${selectedMeta.id} → ${hoTo}` : `Handoff ${selectedMeta.id} → ${hoTo}`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onResolve = async (id: string) => {
    setBusy(true);
    try {
      await resolveHandoff(workspaceId, id, { status: "resolved" });
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmed = state?.confirmedCount ?? 0;
  const required = state?.requiredCount ?? 0;
  const stageId = normalizeStageId(state?.stageId || gate?.stageId || "production_prep");
  const nextStageId = gate?.nextStageId ?? null;
  const nextTransition =
    (nextStageId && gate?.transitions?.[nextStageId as keyof NonNullable<AdvanceGate["transitions"]>]) ||
    null;
  const nextBlocked = Boolean(
    nextStageId && nextTransition && !nextTransition.allowed && !gate?.terminal
  );

  const openRejectHandoffs = openHandoffs.filter((h) => h.type === "reject");

  const onResolveAllRejects = async () => {
    if (!workspaceId || !openRejectHandoffs.length) return;
    setBusy(true);
    setBusyAction("other");
    try {
      for (const h of openRejectHandoffs) {
        await resolveHandoff(workspaceId, h.id, {
          status: "resolved",
          note: zh
            ? "人工确认：reject 已登记为后续优化，不阻断后续阶段"
            : "Acknowledged: reject deferred; does not block later stages"
        });
      }
      addLog(
        zh
          ? `✅ 已关闭 ${openRejectHandoffs.length} 条 REJECT 交接`
          : `✅ Resolved ${openRejectHandoffs.length} reject handoff(s)`
      );
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setBusyAction("idle");
    }
  };

  const onAdvanceStage = async (target: "asset_confirm" | "runtime_stage") => {
    if (busy || !workspaceId) return;
    const mode = stageButtonMode(stageId, target, gate?.transitions?.[target]);
    if (mode === "done" || mode === "locked") return;
    setBusy(true);
    setError(null);
    try {
      const data = await advanceDepartmentStage(workspaceId, {
        stageId: target,
        // only asset_confirm forces smoke by default on server; others skip unless needed
        runNodeSmoke: target === "asset_confirm"
      });
      setDesk((prev) => (prev ? { ...prev, state: data.state } : prev));
      setGate(data.gate);
      addLog(
        zh
          ? `➡️ 阶段已推进：${data.state.stageId}`
          : `Stage advanced → ${data.state.stageId}`
      );
      synth.playClick();
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
      try {
        setGate(await fetchAdvanceGate(workspaceId));
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Stage strip */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {stages.map((s, i) => {
          const curIdx = stages.findIndex(
            (x) => normalizeStageId(x.id) === normalizeStageId(state?.stageId)
          );
          const active = curIdx === i;
          const past = curIdx > i;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span className="text-slate-400">→</span>}
              <span
                className={`px-2.5 py-1 rounded-full border font-mono ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : past
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700/70 dark:text-emerald-400/70"
                      : "border-slate-200 dark:border-slate-800 text-slate-500"
                }`}
              >
                {i + 1}. {zh ? s.title : s.titleEn || s.title}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold font-display flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-500" />
            {zh ? "制作筹备 · 部门 Agent 台" : "Production Prep Desk"}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
            unit: {state?.unitId || "—"} · {zh ? "已确认" : "confirmed"}{" "}
            <span className="text-emerald-500 font-bold">
              {confirmed}/{required}
            </span>
            {openHandoffs.length > 0 && (
              <span className="ml-2 text-amber-500">
                · {zh ? "开放交接" : "open handoffs"} {openHandoffs.length}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => {
              setBusyAction("refresh");
              load();
            }}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || busyAction === "refresh" ? "animate-spin" : ""}`} />
            {loading || busyAction === "refresh" ? (zh ? "刷新中…" : "Refreshing…") : zh ? "刷新" : "Refresh"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAutoPrep}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 shadow disabled:opacity-60"
          >
            <Sparkles className={`w-3.5 h-3.5 ${busyAction === "auto" ? "animate-pulse" : ""}`} />
            {busyAction === "auto"
              ? zh
                ? "筹备中…"
                : "Preparing…"
              : zh
                ? "一键自动筹备"
                : "Auto Prep"}
          </button>
        </div>
      </div>

      {/* Multi-stage advance buttons (同级: 资产确认 / 节拍板 / 运行导出) */}
      <div className="flex flex-wrap items-center gap-2">
        {STAGE_ADVANCE_BUTTONS.map((btn) => {
          const tGate = gate?.transitions?.[btn.target];
          const mode = stageButtonMode(stageId, btn.target, tGate);
          const blockers = tGate?.blockers || [];
          const disabled = busy || mode === "done" || mode === "locked" || mode === "blocked";
          const className =
            mode === "done"
              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 cursor-default"
              : mode === "ready"
                ? "border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/15"
                : mode === "blocked"
                  ? "border-rose-300/50 text-rose-400 dark:text-rose-400/80 bg-rose-500/5 cursor-not-allowed"
                  : "border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed";
          const title =
            mode === "done"
              ? zh
                ? `已完成：当前阶段 ≥ ${btn.target}`
                : `Done: stage ≥ ${btn.target}`
              : mode === "ready"
                ? zh
                  ? `门禁通过 · ${btn.hintZh}`
                  : `Gate open · ${btn.hintEn}`
                : mode === "blocked"
                  ? zh
                    ? `门禁阻断：${blockers.slice(0, 3).join("; ") || "未通过"}`
                    : `Blocked: ${blockers.slice(0, 3).join("; ") || "fail"}`
                  : zh
                    ? `需先完成上一阶段（当前 ${stageId}）· ${btn.hintZh}`
                    : `Complete previous stage first (now ${stageId})`;
          return (
            <button
              key={btn.target}
              type="button"
              disabled={disabled}
              title={title}
              onClick={() => onAdvanceStage(btn.target)}
              className={`px-3 py-1.5 text-xs rounded-lg font-semibold flex items-center gap-1.5 border ${className}`}
            >
              {mode === "done" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              {mode === "done"
                ? zh
                  ? btn.doneZh
                  : btn.doneEn
                : zh
                  ? btn.labelZh
                  : btn.labelEn}
            </button>
          );
        })}
      </div>

      {normalizeStageId(state?.stageId) === "runtime_stage" && (
        <div className="text-xs text-emerald-850 dark:text-emerald-250 bg-emerald-500/15 border border-emerald-500/30 rounded-xl px-4 py-3 flex flex-col gap-1.5 shadow-sm">
          <div className="font-bold flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <span>🎉</span>
            {zh ? "恭喜！『运行与导出』阶段门禁已通过" : "Congratulations! 'Runtime & Export' Gate Passed"}
          </div>
          <div className="opacity-90 leading-relaxed font-sans">
            {zh
              ? "当前版本已成功通过全部测试。请点击页面右上角顶栏的【 📥 导出 】(Export) 按钮，即可打包下载独立的本地单页 H5 游戏 ZIP 包！"
              : "The current version has successfully passed all tests. Please click the [ 📥 Export ] button in the top-right header to package and download your standalone H5 game ZIP!"}
          </div>
        </div>
      )}

      {statusMsg && !error && (
        <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {busyAction === "auto" || busyAction === "dept" ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
              {statusMsg}
            </span>
          ) : (
            statusMsg
          )}
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
          {error}
        </div>
      )}

      {gate && (
        <div
          className={`rounded-xl border px-3 py-2 text-[11px] font-mono ${
            gate.terminal || gate.allowed
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : nextBlocked
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300"
          }`}
        >
          {zh ? "阶段门禁" : "Stage gate"}:{" "}
          <strong>
            {gate.terminal
              ? zh
                ? `已在终点 ${stageId}`
                : `terminal ${stageId}`
              : nextStageId
                ? zh
                  ? `下一步 → ${nextStageId} ${gate.allowed ? "可通过" : "阻断"}`
                  : `next → ${nextStageId} ${gate.allowed ? "OPEN" : "BLOCKED"}`
                : stageId}
          </strong>
          {gate.qaScore != null && ` · QA ${gate.qaScore}`}
          {nextBlocked && gate.blockers?.length ? (
            <span className="block mt-1 opacity-90">
              blockers: {gate.blockers.slice(0, 6).join(" · ")}
              {gate.blockers.length > 6 ? "…" : ""}
            </span>
          ) : null}
          {!!gate.warnings?.length && (
            <span className="block mt-1 text-amber-700 dark:text-amber-300 opacity-95">
              warnings: {gate.warnings.slice(0, 4).join(" · ")}
              {gate.warnings.length > 4 ? "…" : ""}
            </span>
          )}
          {/* Per-transition mini status */}
          {gate.transitions && (
            <div className="mt-2 flex flex-wrap gap-1.5 not-italic font-sans">
              {STAGE_ADVANCE_BUTTONS.map((btn) => {
                const t = gate.transitions?.[btn.target];
                const mode = stageButtonMode(stageId, btn.target, t);
                const tone =
                  mode === "done"
                    ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                    : mode === "ready"
                      ? "border-cyan-500/30 text-cyan-600 bg-cyan-500/10"
                      : mode === "blocked"
                        ? "border-rose-400/40 text-rose-500 bg-rose-500/5"
                        : "border-slate-300 text-slate-400";
                return (
                  <span
                    key={btn.target}
                    className={`text-[10px] px-2 py-0.5 rounded border font-mono ${tone}`}
                    title={(t?.blockers || []).join("; ") || btn.hintZh}
                  >
                    {btn.target}:{" "}
                    {mode === "done"
                      ? "✓"
                      : mode === "ready"
                        ? zh
                          ? "可进"
                          : "ready"
                        : mode === "blocked"
                          ? zh
                            ? "阻断"
                            : "block"
                          : zh
                            ? "锁定"
                            : "lock"}
                  </span>
                );
              })}
            </div>
          )}
          {openRejectHandoffs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 not-italic font-sans">
              <span className="text-amber-700 dark:text-amber-300">
                {zh
                  ? `${openRejectHandoffs.length} 条开放 REJECT（仅阻断「进入资产确认」）`
                  : `${openRejectHandoffs.length} open REJECT (blocks asset_confirm only)`}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={onResolveAllRejects}
                className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold hover:bg-amber-500/10 disabled:opacity-50"
              >
                {zh ? "确认并关闭 REJECT" : "Resolve REJECT(s)"}
              </button>
            </div>
          )}
        </div>
      )}

      {!!lastRunLog?.length && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 px-3 py-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
            {zh ? "最近调度日志（拓扑）" : "Last schedule log"}
            {lastPatches?.length ? ` · patches ${lastPatches.length}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lastRunLog.map((entry, i) => (
              <span
                key={`${entry.id}-${i}`}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  entry.skipped
                    ? "border-slate-300 text-slate-400"
                    : entry.source === "llm"
                      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                }`}
                title={entry.reason || entry.risks?.join(", ") || entry.source}
              >
                {entry.id}
                {entry.skipped ? " skip" : ` ${entry.source || "ok"}`}
                {entry.qaScore != null ? ` ${entry.qaScore}` : ""}
                {entry.patchesApplied ? ` p${entry.patchesApplied}` : ""}
              </span>
            ))}
          </div>
          {!!lastPatches?.length && (
            <div className="mt-2 max-h-24 overflow-y-auto text-[10px] text-slate-500 font-mono space-y-0.5">
              {lastPatches.slice(0, 12).map((p, i) => (
                <div key={i}>
                  [{p.department}] {p.path} ← {JSON.stringify(p.value)} ({p.level})
                </div>
              ))}
              {lastPatches.length > 12 && <div>… +{lastPatches.length - 12}</div>}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[520px]">
        {/* Left: department list */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-1.5 bg-white/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-2 max-h-[640px] overflow-y-auto">
          <div className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 flex justify-between">
            <span>{zh ? "部门列表" : "Departments"}</span>
            <span>
              {confirmed}/{required}
            </span>
          </div>
          {metaList.map((m) => {
            const rt = state?.departments?.[m.id];
            const st = (rt?.status || "idle") as any;
            const active = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedId(m.id);
                  setDetailTab("prepNotes");
                  synth.playClick();
                }}
                className={`text-left px-3 py-2.5 rounded-lg border transition flex items-start gap-2 ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/50"
                }`}
              >
                <span className="text-base leading-none mt-0.5">{m.avatar || "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">{titleOf(m)}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${statusTone(st)}`}>
                      {statusLabel(st, zh ? "zh" : "en")}
                      {rt?.version ? ` · V${rt.version}` : ""}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex gap-2 font-mono">
                    {rt?.qaScore != null && <span>QA {rt.qaScore}</span>}
                    {(rt?.openHandoffCount || 0) > 0 && (
                      <span className="text-amber-500">
                        {zh ? "交接" : "HO"} {rt?.openHandoffCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: detail */}
        <div className="lg:col-span-8 xl:col-span-9 bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 md:p-5 flex flex-col gap-4">
          {selectedMeta && selectedRuntime ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{selectedMeta.avatar}</span>
                    <div>
                      <h3 className="text-base font-bold font-display">
                        {titleOf(selectedMeta)}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {selectedMeta.id}
                        {selectedRuntime.version > 0 && ` · V${selectedRuntime.version}`}
                        {selectedMeta.pipelineSteps?.length
                          ? ` · Step ${selectedMeta.pipelineSteps.join("/")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">
                    {selectedMeta.systemPromptRole}
                  </p>
                  {!!selectedMeta.owns?.length && (
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">
                      owns: {selectedMeta.owns.slice(0, 4).join(" · ")}
                      {selectedMeta.owns.length > 4 ? "…" : ""}
                    </p>
                  )}
                  {(() => {
                    const chatId =
                      selectedMeta.chatAgentId ||
                      selectedMeta.legacyAgentIds?.[0] ||
                      "";
                    const label = chatId
                      ? CHAT_AGENT_LABELS[chatId]?.[zh ? "zh" : "en"] || chatId
                      : null;
                    return label ? (
                      <p className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-1 font-mono">
                        {zh ? "神识通道" : "Chat channel"}: {label}{" "}
                        <span className="opacity-70">({chatId})</span>
                        <span className="opacity-60">
                          {zh ? " · 见下方「神识对话」页签" : " · see Chat tab"}
                        </span>
                      </p>
                    ) : null;
                  })()}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[11px] font-mono px-2 py-1 rounded border ${statusTone(selectedRuntime.status)}`}>
                    {statusLabel(selectedRuntime.status, zh ? "zh" : "en")}
                  </span>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onRunThisDept}
                      className="px-3 py-1.5 text-xs rounded-lg border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-40 flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {zh ? "调度本部门 Agent" : "Run this agent"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || selectedRuntime.status === "confirmed"}
                      onClick={onMarkReady}
                      className="px-3 py-1.5 text-xs rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
                    >
                      {zh ? "标为待确认" : "Mark ready"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || selectedRuntime.status === "confirmed"}
                      onClick={onConfirm}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {zh ? "确认部门" : "Confirm"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 flex-wrap">
                {(
                  [
                    { id: "prepNotes" as const, label: zh ? "筹备意见" : "Prep notes", icon: ClipboardList },
                    { id: "chat" as const, label: zh ? "神识对话" : "Chat", icon: MessageSquare },
                    { id: "qaReport" as const, label: zh ? "质检报告" : "QA", icon: FileWarning },
                    {
                      id: "handoffs" as const,
                      label: zh
                        ? `交接与问题 (${handoffsForSelected.filter((h) => h.status === "open").length})`
                        : `Handoffs (${handoffsForSelected.filter((h) => h.status === "open").length})`,
                      icon: MessageSquareWarning
                    }
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  const active = detailTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDetailTab(t.id)}
                      className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 -mb-px ${
                        active
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {detailTab === "prepNotes" && (
                <div className="flex flex-col gap-2 flex-1">
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={12}
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/50 px-3 py-2 font-sans leading-relaxed resize-y min-h-[200px]"
                    placeholder={
                      zh
                        ? "本部门总体方案、边界与对下游的要求…"
                        : "Department plan, boundaries, downstream needs…"
                    }
                  />
                  <p className="text-[10px] text-slate-500">
                    {zh
                      ? "确认时会写入 prepNotes 并提升版本号。自动筹备只生成草案，不会自动确认。日常微调请用「神识对话」。"
                      : "Confirm writes prepNotes and bumps version. Use Chat tab for refinements."}
                  </p>
                </div>
              )}

              {detailTab === "chat" && workspaceId && (
                <div className="flex flex-col gap-2">
                  {selectedMeta.chatAgentId || selectedMeta.legacyAgentIds?.[0] ? (
                    <AgentChatPanel
                      embedded
                      locale={locale}
                      workspaceId={workspaceId}
                      departmentId={selectedMeta.id}
                      agentRole={
                        selectedMeta.chatAgentId ||
                        selectedMeta.legacyAgentIds![0]
                      }
                      departmentTitle={titleOf(selectedMeta)}
                      jobId={jobId}
                      status={jobStatus}
                      onRefreshJob={onRefreshJob || (() => undefined)}
                      onUpdateSpec={onUpdateSpec || (() => undefined)}
                      addLog={addLog}
                    />

                  ) : (
                    <p className="text-xs text-slate-500 py-8 text-center">
                      {zh
                        ? "导演组不绑定内容微调通道；请选择具体制作部门。"
                        : "Director has no content chat channel; pick a production department."}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500">
                    {zh
                      ? "神识对话已沉入部门详情，不再使用独立五官会商面板。写回范围由后端 agent_role 约束；部门确认仍在本台完成。"
                      : "HITL chat lives inside the department. Confirm still happens on this desk."}
                  </p>
                </div>
              )}

              {detailTab === "qaReport" && (
                <div className="flex flex-col gap-3">
                  <label className="text-xs text-slate-500 flex items-center gap-2">
                    {zh ? "质检分数 (0–100)" : "QA score (0–100)"}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={qaDraft}
                      onChange={(e) => setQaDraft(e.target.value)}
                      className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
                    />
                  </label>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 font-mono bg-slate-50 dark:bg-slate-950/40 rounded-lg p-3 border border-slate-200 dark:border-slate-800">
                    <div>
                      {zh ? "依赖" : "dependsOn"}:{" "}
                      {(selectedMeta.dependsOn || []).join(", ") || "—"}
                    </div>
                    <div>
                      {zh ? "默认可写 patch" : "patch levels"}:{" "}
                      {(selectedMeta.defaultPatchLevels || []).join(", ") || "—"}
                    </div>
                    <div>
                      {zh ? "最近更新" : "updated"}: {selectedRuntime.updatedAt || "—"}
                    </div>
                    <div>
                      {zh ? "确认时间" : "confirmed"}: {selectedRuntime.confirmedAt || "—"}
                    </div>
                    <div className="pt-2 text-slate-500">
                      {zh
                        ? "完整 gate 报告仍来自 workflow/reports；此处为部门台分数占位，后续可绑定 e2e/art coverage。"
                        : "Full gates stay in workflow/reports; score here is a desk placeholder."}
                    </div>
                  </div>
                </div>
              )}

              {detailTab === "handoffs" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {zh ? "新建交接（从本部门发出）" : "New handoff from this department"}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[11px] text-slate-500">{selectedMeta.id} →</span>
                      <select
                        value={hoTo}
                        onChange={(e) => setHoTo(e.target.value)}
                        className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"
                      >
                        {metaList
                          .filter((m) => m.id !== selectedMeta.id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {titleOf(m)}
                            </option>
                          ))}
                      </select>
                    </div>
                    <input
                      value={hoSummary}
                      onChange={(e) => setHoSummary(e.target.value)}
                      placeholder={zh ? "交接摘要，例如：Node4 需要 laser 预警圈美术" : "Summary…"}
                      className="w-full text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5"
                    />
                    <button
                      type="button"
                      disabled={busy || !hoSummary.trim()}
                      onClick={onCreateHandoff}
                      className="self-start px-3 py-1.5 text-xs rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold disabled:opacity-40"
                    >
                      {zh ? "发送交接" : "Send handoff"}
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                    {handoffsForSelected.length === 0 && (
                      <p className="text-xs text-slate-500 py-6 text-center">
                        {zh ? "暂无与本部门相关的交接。" : "No handoffs for this department."}
                      </p>
                    )}
                    {handoffsForSelected.map((h) => (
                      <div
                        key={h.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-500">
                            {h.from} → {h.to} · {h.type}
                          </span>
                          <span
                            className={
                              h.status === "open"
                                ? "text-amber-500 font-semibold"
                                : "text-slate-400"
                            }
                          >
                            {h.status}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{h.summary}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>{h.createdAt}</span>
                          {h.status === "open" && (
                            <button
                              type="button"
                              className="text-emerald-600 dark:text-emerald-400 hover:underline"
                              onClick={() => onResolve(h.id)}
                            >
                              {zh ? "标记已解决" : "Resolve"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              {loading ? (zh ? "加载中…" : "Loading…") : zh ? "无部门数据" : "No department data"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
