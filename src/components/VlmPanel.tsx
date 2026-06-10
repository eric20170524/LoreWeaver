import React from "react";
import { Eye, RefreshCw, CheckCircle2 } from "lucide-react";
import { GameSpec, Locale, AuditReport, ManifestPatch } from "../types";
import { UI_COPY } from "../utils/uiCopy";
import { getSpecValueByPath } from "../utils/gameplayManifest";
import { synth } from "../utils/AudioSynth";

interface VlmPanelProps {
  gameSpec: GameSpec | null;
  locale: Locale;
  auditReport: AuditReport | null;
  isAuditing: boolean;
  triggerVisualAudit: () => Promise<void>;
  setPendingPatch: (patch: ManifestPatch | null) => void;
  addLog: (text: string) => void;
}

export function VlmPanel({
  gameSpec,
  locale,
  auditReport,
  isAuditing,
  triggerVisualAudit,
  setPendingPatch,
  addLog
}: VlmPanelProps) {
  const copy = UI_COPY[locale];

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

        {auditReport ? (
          <div className="space-y-6 text-xs leading-relaxed">
            {/* Overall feedback dialog */}
            <div className="p-4 bg-cyan-950/20 rounded-lg border border-cyan-500/20 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-cyan-700 dark:text-cyan-300">{copy.vlm.result}</p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">{auditReport.vlm_feedback}</p>
              </div>
            </div>

            {/* Individual check grid */}
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

            {/* Proposed patches block */}
            {auditReport.proposed_patches && auditReport.proposed_patches.length > 0 && gameSpec && (
              <div className="space-y-3 mt-4">
                <h4 className="text-3xs uppercase font-mono tracking-wider text-slate-500">
                  VLM 建议的修复 Patch / Proposed Patches
                </h4>
                <div className="space-y-3">
                  {auditReport.proposed_patches.map((patch, idx) => {
                    const resolvedBefore = getSpecValueByPath(gameSpec, patch.target);
                    return (
                      <div key={idx} className="p-3 bg-white/90 dark:bg-slate-950/80 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 text-2xs leading-relaxed">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{patch.target}</span>
                            <span className={`px-1.5 py-0.5 rounded text-4xs font-bold font-mono ${
                              patch.patchLevel === "L3" || patch.patchLevel === "L4"
                                ? "bg-rose-50 dark:bg-rose-950/50 text-rose-750 dark:text-rose-400 border border-rose-500/20"
                                : "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            }`}>
                              {patch.patchLevel}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400">{patch.reason}</p>
                          <div className="flex items-center gap-2 font-mono text-3xs text-slate-500 mt-1">
                            <span className="line-through">{JSON.stringify(resolvedBefore !== undefined ? resolvedBefore : patch.before)}</span>
                            <span>→</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{JSON.stringify(patch.after)}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {patch.patchLevel === "L3" || patch.patchLevel === "L4" ? (
                            <span
                              title="L3/L4 patches concern core gameplay code or adapter files, which must be edited manually in the codebase rather than parameterized via the manifest."
                              className="px-2.5 py-1.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-650 font-bold text-3xs cursor-help select-none"
                            >
                              手动核对
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                const finalPatch = {
                                  ...patch,
                                  id: `patch_vlm_${Date.now()}_${patch.target.replace(/[^a-zA-Z0-9]/g, "_")}`,
                                  before: resolvedBefore !== undefined ? resolvedBefore : patch.before,
                                  createdAt: new Date().toISOString()
                                };
                                setPendingPatch(finalPatch);
                                addLog(`📥 已载入 VLM 建议的 ${patch.patchLevel} 修复提案为 pending patch: ${patch.target}`);
                                synth.playClick();
                              }}
                              className="px-2.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-650 active:bg-emerald-600 text-slate-950 font-bold text-3xs transition-colors shadow-sm cursor-pointer"
                            >
                              导入提案
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prompt Reflow Diff block */}
            <div className="space-y-2">
              <h4 className="text-3xs uppercase font-mono tracking-wider text-slate-500">
                {copy.vlm.prompt}
              </h4>
              <div className="bg-white dark:bg-slate-950 rounded p-4 border border-rose-500/10 font-mono text-2xs text-rose-600 dark:text-rose-400 leading-relaxed whitespace-pre bg-clip-text">
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
