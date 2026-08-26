import React, { useMemo, useState } from "react";
import { CheckCircle2, Download, Eye, FlaskConical, MonitorSmartphone, PlayCircle, RefreshCw, Users } from "lucide-react";
import { WorkspaceMeta } from "./WorkspaceSelector";

type CardDecision = {
  cardId?: string;
  maturity?: {
    evidence?: {
      browserVerified?: boolean;
      visualVerified?: boolean;
      humanPlaytested?: boolean;
      deviceVerified?: boolean;
    };
  };
};

export type EvidenceReleaseDecision = {
  packageBrowserReport?: string | null;
  packageVisualReport?: string | null;
  exactCandidateReady?: boolean;
  cardDecisions?: CardDecision[];
};

interface ReleaseEvidencePanelProps {
  workspace: WorkspaceMeta;
  locale: "zh" | "en";
  decision?: EvidenceReleaseDecision | null;
  onRefresh: () => void;
}

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function jsonOrText(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { status: "failed", reason: text || `HTTP ${response.status}` }; }
}

function EvidenceState({ passed, label }: { passed: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-mono ${
      passed
        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
    }`}>
      {passed && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function ReleaseEvidencePanel({ workspace, locale, decision, onRefresh }: ReleaseEvidencePanelProps) {
  const zh = locale === "zh";
  const cards = useMemo(
    () => [...new Set((decision?.cardDecisions || []).map((item) => item.cardId).filter(Boolean) as string[])],
    [decision?.cardDecisions]
  );
  const [selectedCard, setSelectedCard] = useState("");
  const cardId = selectedCard || cards[0] || "";
  const browserReady = Boolean(decision?.packageBrowserReport);
  const vlmReady = Boolean(decision?.packageVisualReport);
  const humanReady = cards.length > 0 && (decision?.cardDecisions || []).every((item) => item.maturity?.evidence?.humanPlaytested === true);
  const deviceReady = cards.length > 0 && (decision?.cardDecisions || []).every((item) => item.maturity?.evidence?.deviceVerified === true);

  const [isVerifying, setIsVerifying] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [humanOpen, setHumanOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [isRecording, setIsRecording] = useState<"human" | "device" | null>(null);

  const [humanAttested, setHumanAttested] = useState(false);
  const [completed, setCompleted] = useState(true);
  const [understood, setUnderstood] = useState(true);
  const [wouldReplay, setWouldReplay] = useState(true);
  const [completionSeconds, setCompletionSeconds] = useState(360);
  const [understandingSeconds, setUnderstandingSeconds] = useState(30);
  const [difficulty, setDifficulty] = useState(3);
  const [fun, setFun] = useState(4);
  const [clarity, setClarity] = useState(4);
  const [blockingIssues, setBlockingIssues] = useState("");
  const [failureReasons, setFailureReasons] = useState("");
  const [suggestions, setSuggestions] = useState("");

  const [deviceAttested, setDeviceAttested] = useState(false);
  const [deviceClass, setDeviceClass] = useState("mobile");
  const [deviceModel, setDeviceModel] = useState("");
  const [osName, setOsName] = useState("");
  const [browserName, setBrowserName] = useState("");
  const [viewportWidth, setViewportWidth] = useState(720);
  const [viewportHeight, setViewportHeight] = useState(1280);
  const [deviceCompleted, setDeviceCompleted] = useState(true);
  const [interactionOk, setInteractionOk] = useState(true);
  const [consoleErrors, setConsoleErrors] = useState(0);
  const [fpsP50, setFpsP50] = useState(60);
  const [fpsP95, setFpsP95] = useState(55);
  const [fpsMin, setFpsMin] = useState(40);
  const [minP50Budget, setMinP50Budget] = useState(50);
  const [minFpsBudget, setMinFpsBudget] = useState(30);

  const verifyCandidate = async () => {
    setIsVerifying(true);
    setActionMessage(zh ? "正在构建并验证 exact Candidate…" : "Building and verifying exact Candidate…");
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/verify-candidate`, { method: "POST" });
      const payload = await jsonOrText(response);
      if (!response.ok || payload.status !== "passed") {
        throw new Error(payload.reason || payload.error || `HTTP ${response.status}`);
      }
      setActionMessage(zh ? `浏览器验证通过 · ${payload.stageResults?.length || 0} 个节点 · zero /api` : `Browser verification passed · ${payload.stageResults?.length || 0} nodes · zero /api`);
      onRefresh();
    } catch (error: any) {
      setActionMessage(zh ? `浏览器验证失败：${error?.message || error}` : `Browser verification failed: ${error?.message || error}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const downloadVerifiedCandidate = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/verified-candidate`);
      if (!response.ok) {
        const payload = await jsonOrText(response);
        throw new Error(payload.reason || `HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `loreweaver-${workspace.id}-verified-candidate.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setActionMessage(zh ? `下载 verified Candidate 失败：${error?.message || error}` : `Verified Candidate download failed: ${error?.message || error}`);
    }
  };

  const recordHuman = async () => {
    if (!browserReady || !cardId || !humanAttested) return;
    setIsRecording("human");
    try {
      const body = {
        kind: "human_playtest",
        humanObserved: true,
        fixture: false,
        synthetic: false,
        cardId,
        sessions: [{
          sessionId: `human-${Date.now()}`,
          completed,
          understoodCoreLoop: understood,
          wouldReplay,
          completionSeconds,
          understandingSeconds,
          difficulty,
          fun,
          clarity,
          blockingIssues: splitLines(blockingIssues),
          failureReasons: splitLines(failureReasons),
          suggestions: splitLines(suggestions)
        }]
      };
      const response = await fetch(`/api/workspaces/${workspace.id}/record-evidence/human`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await jsonOrText(response);
      setActionMessage(
        response.ok
          ? (zh ? `真人试玩 Evidence 已记录并通过：${cardId}` : `Human playtest evidence recorded and passed: ${cardId}`)
          : (zh ? `真人试玩 Evidence 已记录但未通过：${payload.reason || payload.status || "failed"}` : `Human evidence recorded but not eligible: ${payload.reason || payload.status || "failed"}`)
      );
      onRefresh();
    } finally {
      setIsRecording(null);
    }
  };

  const recordDevice = async () => {
    if (!browserReady || !cardId || !deviceAttested) return;
    setIsRecording("device");
    try {
      const body = {
        kind: "device_verification",
        deviceObserved: true,
        fixture: false,
        synthetic: false,
        headless: false,
        emulated: false,
        cardId,
        performanceBudget: { minP50Fps: minP50Budget, minMinFps: minFpsBudget },
        runs: [{
          physicalDevice: true,
          headless: false,
          emulated: false,
          deviceClass,
          deviceModel,
          os: osName,
          browser: browserName,
          viewport: { width: viewportWidth, height: viewportHeight },
          completed: deviceCompleted,
          interactionOk,
          consoleErrors,
          fps: { p50: fpsP50, p95: fpsP95, min: fpsMin }
        }]
      };
      const response = await fetch(`/api/workspaces/${workspace.id}/record-evidence/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await jsonOrText(response);
      setActionMessage(
        response.ok
          ? (zh ? `真机 Evidence 已记录并通过：${cardId}` : `Physical-device evidence recorded and passed: ${cardId}`)
          : (zh ? `真机 Evidence 已记录但未通过：${payload.reason || payload.status || "failed"}` : `Device evidence recorded but not eligible: ${payload.reason || payload.status || "failed"}`)
      );
      onRefresh();
    } finally {
      setIsRecording(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Evidence Checklist</p>
          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
            {zh ? "让 Candidate 逐步达到可认证" : "Move the Candidate toward certification"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {zh ? "所有步骤绑定同一个 Candidate ZIP / payloadHash。修改游戏后这些证据会自动失效。" : "Every step binds to the same Candidate ZIP and payloadHash. Editing the game automatically invalidates old evidence."}
          </p>
        </div>
        <button type="button" onClick={onRefresh} className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-800" title={zh ? "刷新" : "Refresh"}>
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <EvidenceState passed={browserReady} label={zh ? "1 浏览器" : "1 Browser"} />
        <EvidenceState passed={vlmReady} label={zh ? "2 真实 VLM" : "2 Real VLM"} />
        <EvidenceState passed={humanReady} label={zh ? "3 真人试玩" : "3 Human"} />
        <EvidenceState passed={deviceReady} label={zh ? "4 真机" : "4 Device"} />
      </div>

      <div className="mt-5 space-y-3">
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <PlayCircle className="mt-0.5 h-5 w-5 text-cyan-600" />
              <div>
                <div className="text-sm font-bold">{zh ? "1. 构建并验证 exact Candidate" : "1. Build and verify exact Candidate"}</div>
                <p className="mt-1 text-xs text-slate-500">{zh ? "静态 Host + Chromium 逐节点运行，捕获 screenshot、payloadHash 和 ZIP SHA。" : "Static host + Chromium runs every node and captures screenshot, payloadHash, and ZIP SHA."}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={verifyCandidate} disabled={isVerifying} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {isVerifying ? (zh ? "验证中…" : "Verifying…") : browserReady ? (zh ? "重新验证" : "Re-verify") : (zh ? "验证 Candidate" : "Verify Candidate")}
              </button>
              <button type="button" onClick={downloadVerifiedCandidate} disabled={!browserReady} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-slate-800">
                <Download className="h-3.5 w-3.5" />{zh ? "下载同一 Candidate" : "Download exact Candidate"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 h-5 w-5 text-violet-600" />
            <div className="flex-1">
              <div className="text-sm font-bold">{zh ? "2. 真实 VLM 审查" : "2. Real VLM review"}</div>
              <p className="mt-1 text-xs text-slate-500">
                {vlmReady
                  ? (zh ? "exact screenshot 已由真实视觉模型完成审查。" : "The exact screenshot has passed a real visual-model review.")
                  : (zh ? "需要 XAI_API_KEY 或可用 Codex CLI。没有真实 provider 时只能保持 unavailable，不能认证。" : "Requires XAI_API_KEY or an available Codex CLI. Without a real provider it remains unavailable and cannot certify.")}
              </p>
              {!vlmReady && browserReady && (
                <code className="mt-2 block overflow-x-auto rounded bg-slate-100 px-3 py-2 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  python3 productize/jobs/run-workspace-vlm-audit.py --workspace-id={workspace.id}
                </code>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <button type="button" onClick={() => setHumanOpen((value) => !value)} disabled={!browserReady} className="flex w-full items-start gap-3 text-left disabled:opacity-50">
            <Users className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div className="flex-1"><div className="text-sm font-bold">{zh ? "3. 记录真人试玩" : "3. Record human playtest"}</div><p className="mt-1 text-xs text-slate-500">{zh ? "必须是真实玩家实际试玩 verified Candidate；测试失败也可以如实记录。" : "Must come from a real player using the verified Candidate; failed sessions should be recorded honestly too."}</p></div>
          </button>
          {humanOpen && browserReady && (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 dark:border-slate-900 md:grid-cols-3">
              {cards.length > 1 && <label className="text-xs">Card<select value={cardId} onChange={(e) => setSelectedCard(e.target.value)} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900">{cards.map((id) => <option key={id}>{id}</option>)}</select></label>}
              <label className="text-xs">{zh ? "通关耗时(秒)" : "Completion sec"}<input type="number" value={completionSeconds} onChange={(e) => setCompletionSeconds(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "理解核心循环耗时(秒)" : "Understanding sec"}<input type="number" value={understandingSeconds} onChange={(e) => setUnderstandingSeconds(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "趣味度 1-5" : "Fun 1-5"}<input type="number" min={1} max={5} value={fun} onChange={(e) => setFun(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "清晰度 1-5" : "Clarity 1-5"}<input type="number" min={1} max={5} value={clarity} onChange={(e) => setClarity(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "难度 1-5" : "Difficulty 1-5"}<input type="number" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />{zh ? "完成试玩" : "Completed"}</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />{zh ? "理解核心循环" : "Understood core loop"}</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={wouldReplay} onChange={(e) => setWouldReplay(e.target.checked)} />{zh ? "愿意再玩" : "Would replay"}</label>
              <label className="text-xs md:col-span-3">{zh ? "阻塞问题（每行一个）" : "Blocking issues"}<textarea value={blockingIssues} onChange={(e) => setBlockingIssues(e.target.value)} rows={2} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs md:col-span-3">{zh ? "失败原因" : "Failure reasons"}<textarea value={failureReasons} onChange={(e) => setFailureReasons(e.target.value)} rows={2} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs md:col-span-3">{zh ? "修改建议" : "Suggestions"}<textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} rows={2} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="flex items-start gap-2 text-xs md:col-span-3"><input className="mt-0.5" type="checkbox" checked={humanAttested} onChange={(e) => setHumanAttested(e.target.checked)} /><span>{zh ? "我确认以上来自真实玩家对刚刚下载的 verified Candidate 的实际试玩，不是模拟、fixture 或自动生成。" : "I confirm these observations came from a real player using the verified Candidate, not simulation, fixtures, or generated data."}</span></label>
              <button type="button" onClick={recordHuman} disabled={!humanAttested || isRecording !== null} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 md:col-span-3">{isRecording === "human" ? (zh ? "记录中…" : "Recording…") : (zh ? "记录真人 Evidence" : "Record human evidence")}</button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <button type="button" onClick={() => setDeviceOpen((value) => !value)} disabled={!browserReady} className="flex w-full items-start gap-3 text-left disabled:opacity-50">
            <MonitorSmartphone className="mt-0.5 h-5 w-5 text-blue-600" />
            <div className="flex-1"><div className="text-sm font-bold">{zh ? "4. 记录物理真机" : "4. Record physical device"}</div><p className="mt-1 text-xs text-slate-500">{zh ? "禁止浏览器模拟器/headless 代替真机；填写实际设备、浏览器和 FPS 统计。" : "Browser emulation and headless runs cannot replace a physical device. Enter the real device, browser, and FPS statistics."}</p></div>
          </button>
          {deviceOpen && browserReady && (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 dark:border-slate-900 md:grid-cols-3">
              {cards.length > 1 && <label className="text-xs">Card<select value={cardId} onChange={(e) => setSelectedCard(e.target.value)} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900">{cards.map((id) => <option key={id}>{id}</option>)}</select></label>}
              <label className="text-xs">{zh ? "设备类别" : "Device class"}<input value={deviceClass} onChange={(e) => setDeviceClass(e.target.value)} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "设备型号" : "Device model"}<input value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">OS<input value={osName} onChange={(e) => setOsName(e.target.value)} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">Browser<input value={browserName} onChange={(e) => setBrowserName(e.target.value)} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">Viewport W<input type="number" value={viewportWidth} onChange={(e) => setViewportWidth(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">Viewport H<input type="number" value={viewportHeight} onChange={(e) => setViewportHeight(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">FPS p50<input type="number" value={fpsP50} onChange={(e) => setFpsP50(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">FPS p95<input type="number" value={fpsP95} onChange={(e) => setFpsP95(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">FPS min<input type="number" value={fpsMin} onChange={(e) => setFpsMin(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "预算 p50 ≥" : "Budget p50 ≥"}<input type="number" value={minP50Budget} onChange={(e) => setMinP50Budget(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "预算 min ≥" : "Budget min ≥"}<input type="number" value={minFpsBudget} onChange={(e) => setMinFpsBudget(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="text-xs">{zh ? "Console Error 数" : "Console errors"}<input type="number" min={0} value={consoleErrors} onChange={(e) => setConsoleErrors(Number(e.target.value))} className="mt-1 w-full rounded border p-2 dark:border-slate-700 dark:bg-slate-900" /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={deviceCompleted} onChange={(e) => setDeviceCompleted(e.target.checked)} />{zh ? "完成全流程" : "Completed"}</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={interactionOk} onChange={(e) => setInteractionOk(e.target.checked)} />{zh ? "交互正常" : "Interaction OK"}</label>
              <label className="flex items-start gap-2 text-xs md:col-span-3"><input className="mt-0.5" type="checkbox" checked={deviceAttested} onChange={(e) => setDeviceAttested(e.target.checked)} /><span>{zh ? "我确认以上数据来自一台真实物理设备运行同一个 verified Candidate，不是 headless、浏览器设备模拟或 synthetic 数据。" : "I confirm these measurements came from a real physical device running the same verified Candidate, not headless, browser emulation, or synthetic data."}</span></label>
              <button type="button" onClick={recordDevice} disabled={!deviceAttested || !deviceModel.trim() || !osName.trim() || !browserName.trim() || isRecording !== null} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 md:col-span-3">{isRecording === "device" ? (zh ? "记录中…" : "Recording…") : (zh ? "记录真机 Evidence" : "Record device evidence")}</button>
            </div>
          )}
        </div>
      </div>

      {actionMessage && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><FlaskConical className="mr-1 inline h-3.5 w-3.5" />{actionMessage}</div>}
    </div>
  );
}
