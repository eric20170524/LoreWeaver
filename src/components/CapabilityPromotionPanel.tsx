import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileDiff, ShieldCheck, UploadCloud } from "lucide-react";
import { Locale } from "../types";

type PromotionPreview = {
  status?: string;
  promotionId?: string;
  capabilityId?: string;
  kind?: string;
  destination?: string;
  candidateHash?: string;
  approvalToken?: string | null;
  blockers?: string[];
  warnings?: string[];
  diff?: {
    operation?: string;
    path?: string;
    before?: unknown;
    afterSha256?: string;
    bytes?: number;
  };
  policy?: {
    authority?: {
      requestedPatchLevel?: string | null;
      maxAutomaticPatchLevel?: string;
      requiresExplicitApproval?: boolean;
    };
    evidenceSummary?: {
      usageCount?: number;
      eligibleCount?: number;
      ineligibleCount?: number;
      eligibleKinds?: string[];
    };
  };
  written?: {
    path?: string;
    sha256?: string;
    atomic?: boolean;
    overwrite?: boolean;
  };
  reason?: string;
  gateway?: {
    mode?: "preview" | "commit";
    explicitSecondPhaseRequired?: boolean;
    tokenAutoSubmitted?: boolean;
  };
};

function shortHash(value?: string | null) {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => null)) as PromotionPreview | null;
  return {
    ok: response.ok,
    status: response.status,
    payload: payload || { status: "blocked", reason: `non_json_response:${response.status}` }
  };
}

export function CapabilityPromotionPanel({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const [promotionPath, setPromotionPath] = useState("");
  const [candidatePath, setCandidatePath] = useState("");
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [committed, setCommitted] = useState<PromotionPreview | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewReady = preview?.status === "ready_for_explicit_write_approval"
    && typeof preview.approvalToken === "string"
    && /^[0-9a-f]{64}$/.test(preview.approvalToken)
    && preview.gateway?.explicitSecondPhaseRequired === true
    && preview.gateway?.tokenAutoSubmitted === false;

  const evidenceKinds = useMemo(
    () => preview?.policy?.evidenceSummary?.eligibleKinds || [],
    [preview]
  );

  const invalidatePreview = () => {
    setPreview(null);
    setCommitted(null);
    setApproved(false);
    setError(null);
  };

  const runPreview = async () => {
    if (!promotionPath.trim() || !candidatePath.trim()) {
      setError(zh ? "请填写 Promotion Contract 与 Candidate JSON 的仓库相对路径。" : "Enter repository-relative Promotion Contract and Candidate JSON paths.");
      return;
    }
    setLoading("preview");
    setError(null);
    setCommitted(null);
    setApproved(false);
    try {
      const result = await postJson("/api/capability-promotions/preview", {
        promotionPath: promotionPath.trim(),
        candidatePath: candidatePath.trim()
      });
      setPreview(result.payload);
      if (!result.ok) {
        setError(result.payload.reason || result.payload.blockers?.join(" · ") || `preview_failed:${result.status}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(null);
    }
  };

  const commitPromotion = async () => {
    if (!previewReady || !approved || !preview?.approvalToken) return;
    setLoading("commit");
    setError(null);
    try {
      // The token is submitted only from this explicit second user action. Preview
      // never writes and never invokes this route automatically.
      const result = await postJson("/api/capability-promotions/commit", {
        promotionPath: promotionPath.trim(),
        candidatePath: candidatePath.trim(),
        approvalToken: preview.approvalToken
      });
      setCommitted(result.payload);
      if (!result.ok || result.payload.status !== "promoted") {
        setError(result.payload.reason || result.payload.blockers?.join(" · ") || `promotion_commit_failed:${result.status}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(null);
      setApproved(false);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm dark:border-violet-900/60 dark:bg-violet-950/15">
      <div className="flex items-start gap-2.5">
        <UploadCloud className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
        <div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {zh ? "能力晋升 · 显式两阶段审批" : "Capability Promotion · explicit two-phase approval"}
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            {zh
              ? "第一步只预览 Policy、Evidence、目标路径与 Candidate Hash，零写入；第二步必须人工确认后才 create-only 写入公共能力库。"
              : "Step 1 previews policy, evidence, destination and candidate hash with zero writes. Step 2 requires explicit human approval before a create-only catalog write."}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="text-[9px] font-mono font-bold uppercase text-slate-500">Promotion Contract JSON</span>
          <input
            value={promotionPath}
            onChange={(event) => {
              setPromotionPath(event.target.value);
              invalidatePreview();
            }}
            placeholder="data/workspaces/.../loreweaver/promotions/foo.json"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[10px] text-slate-700 outline-none focus:border-violet-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          />
        </label>
        <label className="block">
          <span className="text-[9px] font-mono font-bold uppercase text-slate-500">Candidate JSON</span>
          <input
            value={candidatePath}
            onChange={(event) => {
              setCandidatePath(event.target.value);
              invalidatePreview();
            }}
            placeholder="data/workspaces/.../loreweaver/candidates/foo.json"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[10px] text-slate-700 outline-none focus:border-violet-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={runPreview}
        disabled={loading !== null}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-[10px] font-bold text-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:bg-slate-950 dark:text-violet-300"
      >
        <FileDiff className="h-3.5 w-3.5" />
        {loading === "preview" ? (zh ? "正在验证…" : "Validating…") : (zh ? "1. 预览晋升 Diff" : "1. Preview promotion diff")}
      </button>

      {preview && (
        <div className={`mt-3 rounded-lg border p-3 text-[10px] leading-4 ${previewReady
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200"
          : "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {previewReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {previewReady
              ? (zh ? "预览通过：仍未写入" : "Preview passed: nothing written yet")
              : (zh ? "晋升被阻止" : "Promotion blocked")}
          </div>

          {previewReady && (
            <div className="mt-2 grid gap-1 font-mono text-[9px] sm:grid-cols-2">
              <div>{zh ? "能力" : "Capability"}: <strong>{preview.capabilityId || "—"}</strong></div>
              <div>{zh ? "类型" : "Kind"}: <strong>{preview.kind || "—"}</strong></div>
              <div className="sm:col-span-2 break-all">{zh ? "目标" : "Destination"}: <strong>{preview.destination || "—"}</strong></div>
              <div>Candidate SHA: <strong>{shortHash(preview.candidateHash)}</strong></div>
              <div>{zh ? "写入字节" : "Bytes"}: <strong>{preview.diff?.bytes ?? "—"}</strong></div>
              <div>{zh ? "补丁级别" : "Patch level"}: <strong>{preview.policy?.authority?.requestedPatchLevel || "—"}</strong></div>
              <div>{zh ? "Evidence" : "Evidence"}: <strong>{evidenceKinds.join(", ") || "—"}</strong></div>
            </div>
          )}

          {!!preview.blockers?.length && (
            <div className="mt-2">
              <strong>{zh ? "阻塞" : "Blockers"}:</strong> {preview.blockers.join(" · ")}
            </div>
          )}
          {!!preview.warnings?.length && (
            <div className="mt-2 text-amber-700 dark:text-amber-300">
              <strong>{zh ? "警告" : "Warnings"}:</strong> {preview.warnings.join(" · ")}
            </div>
          )}
        </div>
      )}

      {previewReady && !committed?.written && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
          <label className="flex items-start gap-2 text-[10px] leading-4 text-rose-800 dark:text-rose-200">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {zh
                ? `我确认将 Candidate ${shortHash(preview.candidateHash)} 以 create-only 方式写入 ${preview.destination}。该动作不会覆盖已有文件。`
                : `I explicitly approve writing Candidate ${shortHash(preview.candidateHash)} to ${preview.destination} using create-only semantics. Existing files will never be overwritten.`}
            </span>
          </label>
          <button
            type="button"
            onClick={commitPromotion}
            disabled={!approved || loading !== null}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {loading === "commit" ? (zh ? "正在晋升…" : "Promoting…") : (zh ? "2. 明确批准并写入" : "2. Explicitly approve and write")}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {committed?.status === "promoted" && committed.written && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[10px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
          {zh ? "已晋升" : "Promoted"}: <span className="font-mono">{committed.written.path}</span>
          <div className="mt-1 font-mono text-[9px]">SHA {shortHash(committed.written.sha256)} · atomic={String(committed.written.atomic === true)} · overwrite={String(committed.written.overwrite === true)}</div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 p-2 text-[10px] leading-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{error}
        </div>
      )}

      <p className="mt-3 text-[9px] leading-4 text-slate-400">
        {zh
          ? "安全边界：路径必须是仓库内 JSON；preview 零写入；L3/L4、Evidence 不足、Candidate 变化或目标冲突都会 fail-closed；审批 token 在修改路径后立即失效。"
          : "Safety boundary: repository JSON paths only; preview is zero-write; L3/L4, missing evidence, candidate changes or destination conflicts fail closed; changing either path invalidates the approval token immediately."}
      </p>
    </div>
  );
}
