import React, { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { WorkspaceMeta } from "./WorkspaceSelector";

interface PublishPanelProps {
  workspace: WorkspaceMeta | null;
  locale: "zh" | "en";
  onExportWorkspace: () => Promise<void>;
  onExportCandidate: () => Promise<void>;
  isExporting: boolean;
  isExportingCandidate: boolean;
  refreshKey?: number;
}

type ReleaseDecision = {
  exportAllowed?: boolean;
  releaseCertified?: boolean;
  certificationTier?: string;
  blockers?: string[];
  missingEvidence?: string[];
};

type ReleaseStatusResponse = {
  status?: string;
  decision?: ReleaseDecision;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function PublishPanel({
  workspace,
  locale,
  onExportWorkspace,
  onExportCandidate,
  isExporting,
  isExportingCandidate,
  refreshKey = 0
}: PublishPanelProps) {
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatusResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isExportingCertified, setIsExportingCertified] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!workspace?.id) {
      setReleaseStatus(null);
      return () => { cancelled = true; };
    }
    setIsChecking(true);
    fetch(`/api/workspaces/${workspace.id}/release-status`)
      .then(async (res) => {
        const payload = await res.json();
        if (!cancelled) setReleaseStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setReleaseStatus(null);
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });
    return () => { cancelled = true; };
  }, [workspace?.id, refreshKey, manualRefresh, isExportingCandidate]);

  const decision = releaseStatus?.decision;
  const canCertified = releaseStatus?.status === "release_certified"
    && decision?.exportAllowed === true
    && decision?.releaseCertified === true;
  const missing = decision?.missingEvidence || [];
  const blockers = decision?.blockers || [];

  const exportCertified = async () => {
    if (!workspace || !canCertified || isExportingCertified) return;
    setIsExportingCertified(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/export-certified`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const reason = payload?.blockers || payload?.decision?.blockers || [];
        throw new Error(reason.length ? reason.join("\n") : `HTTP ${res.status}`);
      }
      downloadBlob(await res.blob(), `loreweaver-${workspace.id}-certified.zip`);
      setManualRefresh((value) => value + 1);
    } catch (error: any) {
      window.alert(
        locale === "zh"
          ? `Certified Export 被阻止：\n${error?.message || error}`
          : `Certified Export blocked:\n${error?.message || error}`
      );
    } finally {
      setIsExportingCertified(false);
    }
  };

  if (!workspace) {
    return (
      <div className="w-full rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
        {locale === "zh" ? "先创建或选择一个作品，再进入发布。" : "Create or select a project before publishing."}
      </div>
    );
  }

  const tier = decision?.certificationTier || "unverified";

  return (
    <div className="w-full space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Release</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              {locale === "zh" ? "发布你的可玩版本" : "Publish your playable build"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {locale === "zh"
                ? "候选包随时可导出；正式认证包必须通过浏览器、视觉、真人和真机证据。"
                : "Candidate builds can be exported anytime. Certified builds require browser, visual, human, and physical-device evidence."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualRefresh((value) => value + 1)}
            disabled={isChecking}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-emerald-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
            {locale === "zh" ? "刷新状态" : "Refresh"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-[11px] font-mono uppercase text-slate-500">Status</p>
            <p className={`mt-2 text-sm font-bold ${canCertified ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {isChecking ? "checking…" : tier}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-[11px] font-mono uppercase text-slate-500">Missing Evidence</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">{missing.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-[11px] font-mono uppercase text-slate-500">Blockers</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">{blockers.length}</p>
          </div>
        </div>

        {!canCertified && (missing.length > 0 || blockers.length > 0) && (
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-bold">{locale === "zh" ? "正式认证仍缺：" : "Certified release still needs:"}</p>
            <div className="mt-2 space-y-1 font-mono break-all">
              {missing.slice(0, 6).map((item) => <div key={`missing-${item}`}>• {item}</div>)}
              {blockers.slice(0, 4).map((item) => <div key={`blocker-${item}`}>• {item}</div>)}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={onExportCandidate}
          disabled={isExportingCandidate || isExportingCertified}
          className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 text-left transition hover:border-amber-500 disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5 text-amber-600" />
          <div className="mt-3 font-bold text-slate-900 dark:text-slate-100">
            {isExportingCandidate
              ? (locale === "zh" ? "正在构建候选包…" : "Building candidate…")
              : (locale === "zh" ? "导出候选 H5" : "Export Candidate H5")}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {locale === "zh" ? "可分享试玩，但明确标记 UNVERIFIED_CANDIDATE。" : "Shareable for playtesting, explicitly marked UNVERIFIED_CANDIDATE."}
          </p>
        </button>

        <button
          type="button"
          onClick={exportCertified}
          disabled={!canCertified || isExportingCertified || isExportingCandidate}
          className={`rounded-xl border p-5 text-left transition disabled:opacity-50 ${
            canCertified
              ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 hover:border-emerald-500"
              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40"
          }`}
        >
          <ShieldCheck className={`h-5 w-5 ${canCertified ? "text-emerald-600" : "text-slate-400"}`} />
          <div className="mt-3 font-bold text-slate-900 dark:text-slate-100">
            {isExportingCertified
              ? (locale === "zh" ? "正在认证导出…" : "Exporting certified…")
              : (locale === "zh" ? "导出 Certified H5" : "Export Certified H5")}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {locale === "zh" ? "只有 exact Candidate 的全部证据 fresh/matched 才会解锁。" : "Unlocks only when all exact-Candidate evidence is fresh and matched."}
          </p>
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onExportWorkspace}
          disabled={isExporting || isExportingCandidate || isExportingCertified}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {isExporting
            ? (locale === "zh" ? "备份中…" : "Backing up…")
            : (locale === "zh" ? "源码备份" : "Source Backup")}
        </button>
      </div>
    </div>
  );
}
