import React, { useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, CheckCircle2, ArrowRight, Check } from "lucide-react";
import { GameSpec, Locale, AuditReport, ManifestPatch } from "../types";
import { UI_COPY } from "../utils/uiCopy";
import { getSpecValueByPath, isPatchAlreadyApplied } from "../utils/gameplayManifest";
import { synth } from "../utils/AudioSynth";

interface VlmPanelProps {
  gameSpec: GameSpec | null;
  locale: Locale;
  auditReport: AuditReport | null;
  isAuditing: boolean;
  triggerVisualAudit: () => Promise<void>;
  pendingPatch: ManifestPatch | null;
  setPendingPatch: (patch: ManifestPatch | null) => void;
  onApprovePendingPatch: () => Promise<void> | void;
  onGoToGameplay: () => void;
  addLog: (text: string) => void;
}

type PatchRowState = "manual" | "applied" | "pending" | "available";

export function VlmPanel({
  gameSpec,
  locale,
  auditReport,
  isAuditing,
  triggerVisualAudit,
  pendingPatch,
  setPendingPatch,
  onApprovePendingPatch,
  onGoToGameplay,
  addLog
}: VlmPanelProps) {
  const copy = UI_COPY[locale];
  const zh = locale === "zh";
  /** Targets applied this session (or detected from manifest). */
  const [appliedTargets, setAppliedTargets] = useState<Record<string, true>>({});
  const [importHint, setImportHint] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // When gameSpec already matches a proposed after value, mark as applied.
  useEffect(() => {
    if (!gameSpec || !auditReport?.proposed_patches?.length) return;
    setAppliedTargets((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of auditReport.proposed_patches!) {
        if (p.patchLevel === "L3" || p.patchLevel === "L4") continue;
        if (isPatchAlreadyApplied(gameSpec, p) && !next[p.target]) {
          next[p.target] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [gameSpec, auditReport]);

  // New audit report → clear stale session flags only for targets no longer matching.
  useEffect(() => {
    setImportHint(null);
  }, [auditReport]);

  const buildFinalPatch = (patch: ManifestPatch): ManifestPatch => {
    const resolvedBefore = gameSpec
      ? getSpecValueByPath(gameSpec, patch.target)
      : undefined;
    return {
      ...patch,
      id: `patch_vlm_${Date.now()}_${patch.target.replace(/[^a-zA-Z0-9]/g, "_")}`,
      before: resolvedBefore !== undefined ? resolvedBefore : patch.before,
      status: "proposed",
      createdAt: new Date().toISOString()
    };
  };

  const rowState = (patch: ManifestPatch): PatchRowState => {
    if (patch.patchLevel === "L3" || patch.patchLevel === "L4") return "manual";
    if (appliedTargets[patch.target] || isPatchAlreadyApplied(gameSpec, patch)) return "applied";
    if (pendingPatch?.target === patch.target) return "pending";
    return "available";
  };

  const handleImport = (patch: ManifestPatch) => {
    const state = rowState(patch);
    if (state === "applied" || state === "manual") return;
    if (state === "pending") {
      setImportHint(
        zh
          ? `「${patch.target}」已在待确认队列，请点下方「确认应用并写回」。`
          : `"${patch.target}" is already pending — confirm apply below.`
      );
      return;
    }
    const finalPatch = buildFinalPatch(patch);
    setPendingPatch(finalPatch);
    setImportHint(
      zh
        ? `已载入待确认提案：${finalPatch.target}（${finalPatch.patchLevel}）。点「确认应用并写回」才会改 manifest。`
        : `Loaded pending: ${finalPatch.target} (${finalPatch.patchLevel}). Apply to write manifest.`
    );
    addLog(
      zh
        ? `📥 已载入 VLM 提案：${finalPatch.target} → 请确认应用`
        : `📥 Loaded VLM proposal: ${finalPatch.target}`
    );
    synth.playClick();
  };

  const handleApplyNow = async () => {
    if (!pendingPatch || applying) return;
    const target = pendingPatch.target;
    setApplying(true);
    try {
      await onApprovePendingPatch();
      setAppliedTargets((prev) => ({ ...prev, [target]: true }));
      setImportHint(
        zh
          ? `已应用并写回：${target}。该提案标记为「已应用」，不可重复导入。`
          : `Applied & saved: ${target}. Marked applied — re-import disabled.`
      );
      synth.playClick();
    } catch (e: any) {
      setImportHint(
        zh
          ? `应用失败：${e?.message || e}`
          : `Apply failed: ${e?.message || e}`
      );
    } finally {
      setApplying(false);
    }
  };

  const appliedCount = useMemo(() => {
    if (!auditReport?.proposed_patches) return 0;
    return auditReport.proposed_patches.filter((p) => rowState(p) === "applied").length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditReport, appliedTargets, pendingPatch, gameSpec]);

  return (
    <div className="w-full space-y-6">
      <div className="bg-white/80 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-900 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-900 pb-4 gap-4">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              {copy.vlm.title}
            </h2>
            <p className="text-3xs text-slate-500 mt-0.5">
              {copy.vlm.desc}
            </p>
          </div>
          <button
            onClick={triggerVisualAudit}
            disabled={isAuditing || !gameSpec}
            className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold rounded text-2xs transition disabled:opacity-40 select-none uppercase inline-flex items-center gap-1.5 cursor-pointer"
          >
            {isAuditing ? (
              <>
                <RefreshCw className="w-3 animate-spin" />
                {copy.vlm.running}
              </>
            ) : (
              <>
                <CameraIcon className="w-3 h-3" />
                {copy.vlm.run}
              </>
            )}
          </button>
        </div>

        <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 leading-relaxed">
          {zh ? (
            <>
              <strong className="text-slate-800 dark:text-slate-200">结果用途：</strong>
              视觉审计检查加载帧/HUD 是否裁切、重叠、可读。
              流程：<strong>导入提案</strong>（入队）→ <strong>确认应用并写回</strong>（改 manifest）→ 按钮变「已应用」且不可重复点。
            </>
          ) : (
            <>
              <strong>Flow: </strong>
              Import → Apply & save → row becomes Applied (not clickable again).
            </>
          )}
        </div>

        {importHint && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{importHint}</span>
            </div>
            {pendingPatch && (
              <div className="flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  disabled={applying}
                  onClick={handleApplyNow}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-50"
                >
                  {applying
                    ? zh
                      ? "应用中…"
                      : "Applying…"
                    : zh
                      ? "确认应用并写回"
                      : "Apply & save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onGoToGameplay();
                    addLog(zh ? "➡️ 已切换到玩法面板确认 patch" : "➡️ Switched to gameplay for patch confirm");
                  }}
                  className="px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1"
                >
                  {zh ? "去玩法面板" : "Open Gameplay"}
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingPatch(null);
                    setImportHint(null);
                  }}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 text-[11px]"
                >
                  {zh ? "丢弃" : "Discard"}
                </button>
              </div>
            )}
          </div>
        )}

        {auditReport ? (
          <div className="space-y-6 text-xs leading-relaxed">
            <div className="p-4 bg-cyan-950/20 rounded-lg border border-cyan-500/20 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-cyan-700 dark:text-cyan-300">{copy.vlm.result}</p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">{auditReport.vlm_feedback}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {auditReport.checks.map((chk, cid) => (
                <div key={cid} className="bg-white/90 dark:bg-slate-950/80 p-4 rounded-lg border border-slate-200 dark:border-slate-900 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">{chk.name}</span>
                    <span className={`px-2 py-0.5 rounded text-3xs font-bold ${
                      chk.status === "PASS"
                        ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                    }`}>
                      {chk.status === "PASS" ? copy.vlm.pass : copy.vlm.notice}
                    </span>
                  </div>
                  <p className="text-slate-500">{chk.remarks}</p>
                </div>
              ))}
            </div>

            {auditReport.proposed_patches && auditReport.proposed_patches.length > 0 && gameSpec && (
              <div className="space-y-3 mt-4">
                <h4 className="text-3xs uppercase font-mono tracking-wider text-slate-500 flex items-center justify-between gap-2">
                  <span>
                    {zh ? "VLM 建议的修复 Patch" : "Proposed patches"}
                  </span>
                  {appliedCount > 0 && (
                    <span className="normal-case text-emerald-600 dark:text-emerald-400 font-bold">
                      {zh
                        ? `已应用 ${appliedCount}/${auditReport.proposed_patches.length}`
                        : `Applied ${appliedCount}/${auditReport.proposed_patches.length}`}
                    </span>
                  )}
                </h4>
                <div className="space-y-3">
                  {auditReport.proposed_patches.map((patch, idx) => {
                    const resolvedBefore = getSpecValueByPath(gameSpec, patch.target);
                    const state = rowState(patch);
                    const borderCls =
                      state === "applied"
                        ? "border-emerald-500/50 ring-1 ring-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20"
                        : state === "pending"
                          ? "border-amber-500/40 ring-1 ring-amber-500/20"
                          : "border-slate-200 dark:border-slate-800";

                    return (
                      <div
                        key={`${patch.target}-${idx}`}
                        className={`p-3 bg-white/90 dark:bg-slate-950/80 rounded-lg border flex items-start justify-between gap-4 text-2xs leading-relaxed ${borderCls}`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300 break-all">
                              {patch.target}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-4xs font-bold font-mono ${
                              patch.patchLevel === "L3" || patch.patchLevel === "L4"
                                ? "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                                : "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            }`}>
                              {patch.patchLevel}
                            </span>
                            {state === "applied" && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-0.5">
                                <Check className="w-3 h-3" />
                                {zh ? "已应用" : "Applied"}
                              </span>
                            )}
                            {state === "pending" && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                {zh ? "待确认" : "Pending"}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 dark:text-slate-400">{patch.reason}</p>
                          <div className="flex items-center gap-2 font-mono text-3xs text-slate-500 mt-1 flex-wrap">
                            <span className="line-through">
                              {JSON.stringify(
                                state === "applied"
                                  ? patch.before
                                  : resolvedBefore !== undefined
                                    ? resolvedBefore
                                    : patch.before
                              )}
                            </span>
                            <span>→</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              {JSON.stringify(patch.after)}
                            </span>
                            {state === "applied" && (
                              <span className="text-slate-400">
                                {zh ? "（当前值已对齐）" : "(in sync)"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {state === "manual" ? (
                            <span
                              title={zh
                                ? "L3/L4 须在代码库中手动修改"
                                : "L3/L4 require manual code edits"}
                              className="px-2.5 py-1.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-400 font-bold text-3xs cursor-help select-none"
                            >
                              {zh ? "手动核对" : "Manual"}
                            </span>
                          ) : state === "applied" ? (
                            <span
                              className="px-2.5 py-1.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold text-3xs select-none inline-flex items-center gap-1"
                              title={zh ? "已写入 manifest，不可重复导入" : "Already written to manifest"}
                            >
                              <Check className="w-3 h-3" />
                              {zh ? "已应用" : "Applied"}
                            </span>
                          ) : state === "pending" ? (
                            <button
                              type="button"
                              disabled={applying}
                              onClick={handleApplyNow}
                              className="px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-3xs shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {applying
                                ? zh
                                  ? "应用中…"
                                  : "…"
                                : zh
                                  ? "确认应用"
                                  : "Apply"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleImport(patch)}
                              className="px-2.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-3xs transition-colors shadow-sm cursor-pointer"
                            >
                              {zh ? "导入提案" : "Import"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-3xs uppercase font-mono tracking-wider text-slate-500">
                {copy.vlm.prompt}
              </h4>
              <div className="bg-white dark:bg-slate-950 rounded p-4 border border-rose-500/10 font-mono text-2xs text-rose-600 dark:text-rose-400 leading-relaxed whitespace-pre">
                <strong>{copy.vlm.promptAdd}</strong>
                <br />{auditReport.prompt_reflow_diff}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500 text-xs italic">
            {copy.vlm.empty}
          </div>
        )}
      </div>
    </div>
  );
}

function CameraIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
