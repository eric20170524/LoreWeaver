import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Code, Eye, FileText, Layers, Play, Rocket, Terminal, Users, X } from "lucide-react";
import { useWorkbench } from "./store";
import { synth } from "./utils/AudioSynth";
import { Header } from "./components/Header";
import { CreatorJourneyBar, CreatorStep } from "./components/CreatorJourneyBar";
import { CreatorRevisionPanel } from "./components/CreatorRevisionPanel";
import { PublishPanel } from "./components/PublishPanel";
import { PrdPanel } from "./components/PrdPanel";
import { GameplayPanel } from "./components/GameplayPanel";
import { EmulatorPanel } from "./components/EmulatorPanel";
import { PipelinePanel } from "./components/PipelinePanel";
import { DepartmentPrepPanel } from "./components/DepartmentPrepPanel";
import { VlmPanel } from "./components/VlmPanel";

function creatorModeFromStorage() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("loreweaver_expert_mode") === "1";
}

export default function CreatorApp() {
  const {
    themeMode, setThemeMode,
    themeInput, setThemeInput,
    activeTab, setActiveTab,
    isEmulatorWindowOpen, setIsEmulatorWindowOpen,
    emulatorSize, setEmulatorSize, currentEmuWidth,
    activeWorkspace, currentJob, isOrchestrating, orchestrationLogs,
    gameSpec, setGameSpec, pendingPatch, setPendingPatch, playerState,
    auditReport, isAuditing, isExporting, isExportingRelease,
    isLogPanelOpen, setIsLogPanelOpen,
    locale, setLocale, copy, setPhaserContainer,
    addLog, handleLoadWorkspace, handleExportWorkspace, handleExportRelease,
    handleRefreshJob, runOrchestrationPipeline, restartGameInstance,
    triggerVisualAudit, handleResetProgress, handleSaveSpec,
    queueGameplayPatch, approvePendingPatch, getLogLineClass
  } = useWorkbench();

  const [expertMode, setExpertMode] = useState(creatorModeFromStorage);
  const [creatorStep, setCreatorStep] = useState<CreatorStep>("idea");
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);
  const [expertPublishOpen, setExpertPublishOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wasOrchestrating = useRef(false);

  useEffect(() => {
    localStorage.setItem("loreweaver_expert_mode", expertMode ? "1" : "0");
    if (!expertMode) {
      setExpertPublishOpen(false);
      setIsLogPanelOpen(false);
    }
  }, [expertMode, setIsLogPanelOpen]);

  useEffect(() => {
    if (themeInput === "原创逆天修行传说，主打突破境界与十二重天劫" && !isOrchestrating) {
      setThemeInput("紫色星空下，圆滚滚动物守护梦幻花园的竖屏生存游戏");
    }
  }, [themeInput, isOrchestrating, setThemeInput]);

  useEffect(() => {
    if (wasOrchestrating.current && !isOrchestrating && gameSpec) {
      setCreatorStep("design");
      setActiveTab("prd");
    }
    wasOrchestrating.current = isOrchestrating;
  }, [isOrchestrating, gameSpec, setActiveTab]);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [orchestrationLogs, isLogPanelOpen]);

  const toggleExpertMode = () => {
    setExpertMode((current) => {
      const next = !current;
      if (next) {
        setActiveTab(creatorStep === "modify" ? "gameplay" : "prd");
        if (creatorStep === "play") setIsEmulatorWindowOpen(true);
      }
      return next;
    });
  };

  const onCreatorStepChange = (step: CreatorStep) => {
    setCreatorStep(step);
    if (step === "design") setActiveTab("prd");
    if (step === "modify") setActiveTab("gameplay");
    setIsEmulatorWindowOpen(step === "play");
    synth.playClick();
  };

  const loadWorkspace = async (workspace: any) => {
    await handleLoadWorkspace(workspace);
    setCreatorStep("design");
    setActiveTab("prd");
  };

  const updateRecipeNode = ({ nodeId, node }: { nodeId: number; node: any }) => {
    if (!gameSpec) return;
    const nextNodes = (gameSpec.nodes || []).map((existing: any) => {
      if (Number(existing.id) !== Number(nodeId)) return existing;
      return {
        ...existing,
        title: node.title ?? existing.title,
        intro: node.intro ?? existing.intro,
        mechanics: node.mechanics ?? existing.mechanics,
        durationLimit: node.durationLimit ?? existing.durationLimit,
        goalValue: node.goalValue ?? existing.goalValue,
        difficulty: node.difficulty ?? existing.difficulty,
        gameplay: node.gameplay ?? existing.gameplay
      };
    });
    setGameSpec({ ...gameSpec, nodes: nextNodes });
    addLog(locale === "zh" ? `节点 #${nodeId} 已从 Level Recipe 刷新` : `Node #${nodeId} refreshed from Level Recipe`);
  };

  const renderDesign = () => (
    <PrdPanel gameSpec={gameSpec} locale={locale} onSaveSpec={handleSaveSpec} addLog={addLog} />
  );

  const renderExpertGameplay = () => (
    <GameplayPanel
      gameSpec={gameSpec}
      locale={locale}
      workspaceId={activeWorkspace?.id || null}
      pendingPatch={pendingPatch}
      setPendingPatch={setPendingPatch}
      onApprovePendingPatch={approvePendingPatch}
      onQueueGameplayPatch={queueGameplayPatch}
      addLog={addLog}
      onRecipeApplied={updateRecipeNode}
    />
  );

  const renderCreatorModify = () => (
    <CreatorRevisionPanel
      workspace={activeWorkspace}
      gameSpec={gameSpec}
      locale={locale}
      onUpdateSpec={(nextSpec) => setGameSpec(nextSpec)}
      onRevisionApplied={() => setPipelineRefreshKey((value) => value + 1)}
      addLog={addLog}
    />
  );

  const renderPlay = (layout: "embedded" | "window" = "embedded") => (
    <EmulatorPanel
      gameSpec={gameSpec}
      playerState={playerState}
      emulatorSize={emulatorSize}
      setEmulatorSize={setEmulatorSize}
      currentEmuWidth={currentEmuWidth}
      setPhaserContainer={setPhaserContainer}
      handleResetProgress={handleResetProgress}
      triggerVisualAudit={triggerVisualAudit}
      isAuditing={isAuditing}
      copy={copy}
      themeMode={themeMode}
      layout={layout}
    />
  );

  const renderPublish = () => (
    <PublishPanel
      workspace={activeWorkspace}
      locale={locale}
      onExportWorkspace={handleExportWorkspace}
      onExportCandidate={handleExportRelease}
      isExporting={isExporting}
      isExportingCandidate={isExportingRelease}
      refreshKey={pipelineRefreshKey}
    />
  );

  const renderIdea = () => (
    <div className="mx-auto w-full max-w-3xl py-8">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-7 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/20 dark:to-slate-950">
        <p className="text-xs font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          {locale === "zh" ? "从一句话开始" : "Start from one sentence"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          {locale === "zh" ? "描述你想做的游戏，LoreWeaver 先做出一个可玩的竖切片。" : "Describe your game and let LoreWeaver build a playable vertical slice first."}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {locale === "zh"
            ? "先验证核心循环，再继续改玩法、视觉和发布证据；不要求你理解 Manifest、部门或 Gate。"
            : "Validate the core loop first, then refine gameplay, visuals, and release evidence—without requiring you to understand manifests, departments, or gates."}
        </p>
        <div className="mt-5 rounded-xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-[11px] font-mono uppercase text-slate-400">Current idea</p>
          <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{themeInput}</p>
        </div>
        <button
          type="button"
          onClick={runOrchestrationPipeline}
          disabled={isOrchestrating || !activeWorkspace || !themeInput.trim()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-4 w-4" />
          {isOrchestrating
            ? (locale === "zh" ? "正在生成可玩蓝图…" : "Creating playable blueprint…")
            : (locale === "zh" ? "生成第一个可玩版本" : "Create first playable version")}
        </button>
        {!activeWorkspace && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {locale === "zh" ? "请先在右上角创建或选择一个 Workspace。" : "Create or select a Workspace first."}
          </p>
        )}
      </div>
    </div>
  );

  const renderSimpleContent = () => {
    if (creatorStep === "idea") return renderIdea();
    if (creatorStep === "design") return renderDesign();
    if (creatorStep === "play") return renderPlay("embedded");
    if (creatorStep === "modify") return renderCreatorModify();
    return renderPublish();
  };

  const expertTabs = [
    { id: "departments" as const, label: copy.tabs.departments, icon: Users },
    { id: "prd" as const, label: copy.tabs.prd, icon: FileText },
    { id: "gameplay" as const, label: copy.tabs.gameplay, icon: Layers },
    { id: "manifest" as const, label: copy.tabs.manifest, icon: Code },
    { id: "vlm" as const, label: copy.tabs.vlm, icon: Eye }
  ];

  const renderExpertBody = () => {
    if (expertPublishOpen) return renderPublish();
    if (activeTab === "prd") return renderDesign();
    if (activeTab === "gameplay") return renderExpertGameplay();
    if (activeTab === "departments") {
      return (
        <DepartmentPrepPanel
          workspaceId={activeWorkspace?.id || null}
          locale={locale}
          addLog={addLog}
          jobId={currentJob?.id}
          jobStatus={currentJob?.status}
          onRefreshJob={handleRefreshJob}
          onUpdateSpec={(newSpec) => {
            setGameSpec(newSpec);
            restartGameInstance(newSpec);
          }}
          onDeskChanged={() => setPipelineRefreshKey((value) => value + 1)}
        />
      );
    }
    if (activeTab === "manifest") {
      return gameSpec ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-mono font-bold">manifest.json</h2>
              <p className="text-xs text-slate-500">{copy.manifest.desc}</p>
            </div>
            <span className="rounded border border-emerald-500/20 bg-emerald-50 px-2 py-1 text-[10px] font-mono text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{copy.manifest.valid}</span>
          </div>
          <pre className="max-h-[58vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-[11px] leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">{JSON.stringify(gameSpec, null, 2)}</pre>
        </div>
      ) : <div className="py-10 text-center text-sm text-slate-500">{copy.manifest.empty}</div>;
    }
    return (
      <VlmPanel
        gameSpec={gameSpec}
        locale={locale}
        auditReport={auditReport}
        isAuditing={isAuditing}
        triggerVisualAudit={triggerVisualAudit}
        pendingPatch={pendingPatch}
        setPendingPatch={setPendingPatch}
        onApprovePendingPatch={approvePendingPatch}
        onGoToGameplay={() => setActiveTab("gameplay")}
        addLog={addLog}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased transition-colors duration-250 dark:bg-slate-950 dark:text-slate-100">
      <Header
        themeInput={themeInput}
        setThemeInput={setThemeInput}
        isOrchestrating={isOrchestrating}
        runOrchestrationPipeline={runOrchestrationPipeline}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        locale={locale}
        setLocale={setLocale}
        copy={copy}
        activeWorkspace={activeWorkspace}
        handleLoadWorkspace={loadWorkspace}
        expertMode={expertMode}
        onToggleExpertMode={toggleExpertMode}
      />

      {!expertMode ? (
        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-8">
          <CreatorJourneyBar
            activeStep={creatorStep}
            onStepChange={onCreatorStepChange}
            locale={locale}
            hasWorkspace={Boolean(activeWorkspace)}
            hasGameSpec={Boolean(gameSpec)}
          />
          <div className="mt-5 min-h-[68vh] rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-900 dark:bg-slate-900/20 md:p-6">
            <AnimatePresence mode="wait">
              <motion.div key={creatorStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full">
                {renderSimpleContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-[1800px] grid-cols-1 gap-6 px-4 py-6 md:px-8 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-4 2xl:col-span-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">Expert Mode</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {locale === "zh" ? "这里显示部门、Manifest、Gate/VLM 和执行日志。普通创作不需要进入这里。" : "Departments, manifest, gates/VLM, and execution logs live here. Normal creation does not require this view."}
              </p>
            </div>
            <PipelinePanel
              locale={locale}
              workspaceId={activeWorkspace?.id || null}
              currentJob={currentJob}
              isOrchestrating={isOrchestrating}
              copy={copy}
              refreshKey={pipelineRefreshKey}
              onOpenDepartments={() => {
                setExpertPublishOpen(false);
                setActiveTab("departments");
              }}
            />
          </div>

          <div className="min-h-[72vh] rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-900 dark:bg-slate-900/30 md:p-6 lg:col-span-8 2xl:col-span-9">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-900">
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                {expertTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = !expertPublishOpen && activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setExpertPublishOpen(false);
                        setActiveTab(tab.id);
                        synth.playClick();
                      }}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpertPublishOpen(false);
                    setIsEmulatorWindowOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                >
                  <Play className="h-3.5 w-3.5" />
                  {locale === "zh" ? "试玩" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => setExpertPublishOpen(true)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${expertPublishOpen ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300" : "border-slate-200 text-slate-500 dark:border-slate-800"}`}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  {locale === "zh" ? "发布" : "Publish"}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={expertPublishOpen ? "publish" : activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {renderExpertBody()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      )}

      <AnimatePresence>
        {expertMode && isEmulatorWindowOpen && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-5 right-5 z-[70] max-h-[86vh] w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold"><Play className="h-4 w-4 text-emerald-500" />WebGL H5</div>
              <button onClick={() => setIsEmulatorWindowOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[78vh] overflow-auto p-4">{renderPlay("window")}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {expertMode && (
        <div className="fixed bottom-5 left-5 z-[75]">
          <button onClick={() => setIsLogPanelOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-lg dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
            <Terminal className="h-4 w-4" />{copy.logs.button}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-950">{orchestrationLogs.length}</span>
          </button>
          <AnimatePresence>
            {isLogPanelOpen && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-12 left-0 w-[min(520px,90vw)] overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
                <div className="border-b border-slate-200 px-4 py-3 text-xs font-bold dark:border-slate-800">{copy.logs.title}</div>
                <div className="max-h-[48vh] space-y-2 overflow-auto p-3 font-mono text-[11px]">
                  {orchestrationLogs.length === 0 ? <div className="py-8 text-center text-slate-500">{copy.logs.empty}</div> : orchestrationLogs.map((log, index) => <div key={index} className={getLogLineClass(log)}>{log}</div>)}
                  <div ref={logsEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-[11px] font-mono text-slate-500 dark:border-slate-900 dark:bg-slate-950">
        {expertMode
          ? "LoreWeaver · Expert Mode · Evidence-driven vertical-slice compiler"
          : (locale === "zh" ? "LoreWeaver · 创意 → 设计 → 试玩 → 修改 → 发布" : "LoreWeaver · Idea → Design → Play → Modify → Publish")}
      </footer>
    </div>
  );
}
