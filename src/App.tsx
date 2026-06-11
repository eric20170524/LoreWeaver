import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, 
  FileText, 
  Code, 
  Sliders, 
  Terminal, 
  Eye, 
  Layers
} from "lucide-react";
import { useWorkbench } from "./store";
import { synth } from "./utils/AudioSynth";

// Modularized child panels
import { PrdPanel } from "./components/PrdPanel";
import { GameplayPanel } from "./components/GameplayPanel";
import { VlmPanel } from "./components/VlmPanel";
import { Header } from "./components/Header";
import { EmulatorPanel } from "./components/EmulatorPanel";
import { AgentChatPanel } from "./components/AgentChatPanel";

export default function App() {
  const {
    themeMode,
    setThemeMode,
    themeInput,
    setThemeInput,
    activeTab,
    setActiveTab,
    emulatorSize,
    setEmulatorSize,
    currentEmuWidth,
    activeWorkspace,
    currentJob,
    isOrchestrating,
    orchestrationLogs,
    gameSpec,
    setGameSpec,
    pendingPatch,
    setPendingPatch,
    playerState,
    auditReport,
    isAuditing,
    isExporting,
    isLogPanelOpen,
    setIsLogPanelOpen,
    locale,
    setLocale,
    copy,
    setPhaserContainer,

    addLog,
    handleLoadWorkspace,
    handleExportWorkspace,
    handleRefreshJob,
    runOrchestrationPipeline,
    restartGameInstance,
    triggerVisualAudit,
    handleResetProgress,
    handleSaveSpec,
    queueGameplayPatch,
    approvePendingPatch,
    getLogLineClass
  } = useWorkbench();

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Scroll logs to bottom automatically
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [orchestrationLogs, isLogPanelOpen]);

  return (
    <div className="lw-app min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950 transition-colors duration-250">
      
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
        handleLoadWorkspace={handleLoadWorkspace}
        onExportWorkspace={handleExportWorkspace}
        isExporting={isExporting}
      />

      {/* Main Orchestration Dashboard Layout Grid */}
      <main className="flex-1 w-full max-w-[1800px] 2xl:max-w-[95vw] mx-auto px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Pipeline overview */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col gap-6">
          
          {/* Animated DAG Graph View */}
          <div className="bg-white/90 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-900/90 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {copy.pipelineTitle}
              </h3>
              <span className="text-3xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                {copy.pipelineBadge}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 my-0.5 relative">
              {/* Connected vertical line track */}
              <div className="absolute left-[9px] top-[12px] bottom-[12px] w-0.5 bg-slate-200 dark:bg-slate-950">
                {currentJob && (
                  <motion.div 
                    initial={{ height: "0%" }}
                    animate={{ 
                      height: `${Math.min(100, Math.max(0, (currentJob.stage_index ?? 0) * 16.66))}%` 
                    }}
                    className="bg-gradient-to-b from-emerald-500 to-teal-400 w-full"
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                )}
              </div>

              {copy.stages.map((stage: any, id: number) => {
                const node = { ...stage, id };
                const activeStageIdx = currentJob ? (currentJob.stage_index ?? 0) : null;
                const isUnderReview = currentJob && currentJob.status === "pending_approval" && node.id === 1;
                const isActive = (isOrchestrating || (currentJob && currentJob.status === "running")) && activeStageIdx === node.id;
                const isPassed = currentJob && currentJob.status === 'completed' ? true : (activeStageIdx !== null && activeStageIdx > node.id);
                
                let dotClass = "border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-400 dark:text-slate-650";
                let textTitleClass = "text-slate-550";
                let descClass = "text-slate-600";

                if (isActive) {
                  dotClass = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/15 animate-pulse font-mono";
                  textTitleClass = "text-emerald-600 dark:text-emerald-400 font-bold";
                  descClass = "text-slate-700 dark:text-slate-300";
                } else if (isUnderReview) {
                  dotClass = "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 ring-4 ring-amber-500/15 font-mono";
                  textTitleClass = "text-amber-600 dark:text-amber-400 font-bold";
                  descClass = "text-slate-700 dark:text-slate-300";
                } else if (isPassed) {
                  dotClass = "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-500 font-mono";
                  textTitleClass = "text-slate-700 dark:text-slate-300 font-semibold";
                  descClass = "text-slate-500";
                }

                return (
                  <div key={node.id} className="flex gap-2.5 px-0.5 items-start group">
                    <div className={`w-5.5 h-5.5 rounded-full border-2 flex items-center justify-center text-3xs font-bold shrink-0 transition-all duration-300 ${dotClass}`}>
                      {node.id + 1}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-3xs font-display tracking-tight transition-all duration-300 ${textTitleClass} flex items-center justify-between`}>
                        <span>{node.name}</span>
                        {isUnderReview && <span className="font-mono text-[9px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-500/20">{copy.reviewState}</span>}
                        {isActive && <span className="font-mono text-[9px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-500/20">{copy.runningState}</span>}
                      </span>
                      {(isActive || isUnderReview) && (
                        <span className={`text-[10px] leading-relaxed mt-0.5 font-sans block transition-all duration-300 ${descClass}`}>
                          {node.desc}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Live progress indicator footer */}
            {currentJob && (
              <div className="border-t border-slate-200 dark:border-slate-900 pt-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-3xs font-mono text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {copy.progressLabel}: {Math.round(((currentJob?.stage_index ?? 0) + 1) * 14.28)}%
                  </span>
                  <span className="text-emerald-500 font-semibold uppercase">{currentJob.status}</span>
                </div>
                <div className="text-3xs text-slate-650 dark:text-slate-400 font-sans italic line-clamp-1">{currentJob.progress}</div>
              </div>
            )}
          </div>

          {activeWorkspace && (
            <div className="2xl:hidden">
              <AgentChatPanel
                compact
                locale={locale}
                jobId={currentJob?.id}
                status={currentJob?.status}
                stageName={currentJob?.stage === 'world_building' ? 'World Builder' : 'QA Audit'}
                workspaceId={activeWorkspace.id}
                onRefreshJob={handleRefreshJob}
                onUpdateSpec={(newSpec) => {
                  setGameSpec(newSpec);
                  restartGameInstance(newSpec);
                }}
                addLog={addLog}
              />
            </div>
          )}

        </div>

        {/* Right Side: Primary Viewport Tabs and Display panel */}
        <div className="lg:col-span-8 2xl:col-span-6 bg-white/70 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-900/80 p-4 md:p-6 overflow-hidden min-h-[70vh] flex flex-col gap-6 transition-colors duration-250">
          
          {/* Workspace Tabs selectors */}
          <div className="flex border-b border-slate-200 dark:border-slate-900 pb-2 overflow-x-auto gap-1">
            {[
              { id: "emulator", label: copy.tabs.emulator, icon: Play },
              { id: "prd", label: copy.tabs.prd, icon: FileText },
              { id: "gameplay", label: copy.tabs.gameplay, icon: Layers },
              { id: "manifest", label: copy.tabs.manifest, icon: Code },
              { id: "vlm", label: copy.tabs.vlm, icon: Eye }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    synth.playClick();
                  }}
                  className={`px-4 py-2 rounded text-xs font-semibold font-display tracking-wide whitespace-nowrap transition flex items-center gap-2 cursor-pointer shrink-0 border-b-2 ${
                    activeTab === tab.id
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/5 font-bold"
                      : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/30"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Interactive viewport layers */}
          <div className="flex-1 flex flex-col items-center justify-center">
            
            <AnimatePresence mode="wait">
              {activeTab === "emulator" && (
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
                />
              )}

              {activeTab === "prd" && (
                <motion.div
                  key="tab_prd"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  <PrdPanel
                    gameSpec={gameSpec}
                    locale={locale}
                    onSaveSpec={handleSaveSpec}
                    addLog={addLog}
                  />
                </motion.div>
              )}

              {activeTab === "gameplay" && (
                <motion.div
                  key="tab_gameplay"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  <GameplayPanel
                    gameSpec={gameSpec}
                    locale={locale}
                    pendingPatch={pendingPatch}
                    setPendingPatch={setPendingPatch}
                    onApprovePendingPatch={approvePendingPatch}
                    onQueueGameplayPatch={queueGameplayPatch}
                  />
                </motion.div>
              )}

              {activeTab === "manifest" && (
                <motion.div
                  key="tab_manifest"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  {gameSpec ? (
                    <div className="bg-white/80 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-900 p-6 space-y-3">
                      <div className="flex items-center justify-between border-b border-emerald-500/10 pb-3">
                        <div>
                          <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-200">
                            docs/manifest.json
                          </h2>
                          <p className="text-3xs text-slate-500">
                            {copy.manifest.desc}
                          </p>
                        </div>
                        <span className="text-2xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                          {copy.manifest.valid}
                        </span>
                      </div>
                      <pre className="bg-white dark:bg-slate-950 p-4 rounded-lg font-mono text-2xs text-slate-600 dark:text-slate-400 max-h-[calc(100vh-340px)] overflow-y-auto border border-slate-200 dark:border-slate-900 leading-relaxed">
                        {JSON.stringify(gameSpec, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-slate-500 italic py-12 text-center text-xs">
                      {copy.manifest.empty}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "vlm" && (
                <motion.div
                  key="tab_vlm"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full space-y-6"
                >
                  <VlmPanel
                    gameSpec={gameSpec}
                    locale={locale}
                    auditReport={auditReport}
                    isAuditing={isAuditing}
                    triggerVisualAudit={triggerVisualAudit}
                    setPendingPatch={setPendingPatch}
                    addLog={addLog}
                  />
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        {/* Extra Column for 2xl screens: Static HITL Chat Panel */}
        {activeWorkspace && (
          <div className="hidden 2xl:flex 2xl:col-span-3 flex-col gap-6">
            <AgentChatPanel
              locale={locale}
              jobId={currentJob?.id}
              status={currentJob?.status}
              stageName={currentJob?.stage === 'world_building' ? 'World Builder' : 'QA Audit'}
              workspaceId={activeWorkspace.id}
              onRefreshJob={handleRefreshJob}
              onUpdateSpec={(newSpec) => {
                setGameSpec(newSpec);
                restartGameInstance(newSpec);
              }}
              addLog={addLog}
            />
          </div>
        )}
      </main>

      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3 pointer-events-none">
        <AnimatePresence>
          {isLogPanelOpen && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              className="pointer-events-auto w-[min(92vw,520px)] max-h-[60vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 shadow-2xl shadow-slate-300/60 dark:shadow-slate-950/70 backdrop-blur-md overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                <h3 className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  {copy.logs.title}
                </h3>
                <button
                  onClick={() => setIsLogPanelOpen(false)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-3xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-700 transition cursor-pointer"
                >
                  {copy.logs.collapse}
                </button>
              </div>

              <div className="max-h-[46vh] overflow-y-auto p-3 font-mono text-2xs space-y-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800">
                {orchestrationLogs.length === 0 ? (
                  <div className="min-h-[160px] text-slate-500 italic flex items-center justify-center text-center leading-5">
                    {copy.logs.empty}
                    <br />{copy.logs.hint}
                  </div>
                ) : (
                  orchestrationLogs.map((log: string, index: number) => (
                    <div key={index} className={`leading-5 whitespace-pre-wrap break-all select-all selection:bg-slate-200 dark:selection:bg-slate-800 ${getLogLineClass(log)}`}>
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsLogPanelOpen((open) => !open)}
          className={`pointer-events-auto rounded-full border px-4 py-2.5 shadow-xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
            isLogPanelOpen
              ? "border-teal-400/50 bg-teal-400 text-slate-950"
              : "border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 hover:border-teal-400/40 hover:text-teal-600 dark:hover:text-teal-300"
          }`}
        >
          <Terminal className="w-4 h-4" />
          {copy.logs.button}
          <span className={`rounded-full px-1.5 py-0.5 text-4xs font-mono ${
            isLogPanelOpen ? "bg-slate-950/15 text-slate-950" : "bg-slate-100 dark:bg-slate-950 text-teal-700 dark:text-teal-300"
          }`}>
            {orchestrationLogs.length}
          </span>
        </button>
      </div>

      {/* Aesthetic Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-4 text-center text-xs text-slate-600 font-mono">
        {copy.footer}
      </footer>
    </div>
  );
}
