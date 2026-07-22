import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, 
  FileText, 
  Code, 
  Terminal, 
  Eye, 
  Layers,
  Users,
  Maximize2,
  Minimize2,
  X
} from "lucide-react";
import { useWorkbench } from "./store";
import { synth } from "./utils/AudioSynth";

// Modularized child panels
import { PrdPanel } from "./components/PrdPanel";
import { GameplayPanel } from "./components/GameplayPanel";
import { VlmPanel } from "./components/VlmPanel";
import { Header } from "./components/Header";
import { EmulatorPanel } from "./components/EmulatorPanel";
import { DepartmentPrepPanel } from "./components/DepartmentPrepPanel";
import { PipelinePanel } from "./components/PipelinePanel";

export default function App() {
  const {
    themeMode,
    setThemeMode,
    themeInput,
    setThemeInput,
    activeTab,
    setActiveTab,
    isEmulatorWindowOpen,
    setIsEmulatorWindowOpen,
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
    isExportingRelease,
    isLogPanelOpen,
    setIsLogPanelOpen,
    locale,
    setLocale,
    copy,
    setPhaserContainer,

    addLog,
    handleLoadWorkspace,
    handleExportWorkspace,
    handleExportRelease,
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
  const [isEmulatorFullscreen, setIsEmulatorFullscreen] = useState(false);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

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
        onExportRelease={handleExportRelease}
        isExportingRelease={isExportingRelease}
      />

      {/* Main Orchestration Dashboard Layout Grid */}
      <main className="flex-1 w-full max-w-[1800px] 2xl:max-w-[95vw] mx-auto px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: stage progress (mapped to departments + cold-start) */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col gap-6">
          <PipelinePanel
            locale={locale}
            workspaceId={activeWorkspace?.id || null}
            currentJob={currentJob}
            isOrchestrating={isOrchestrating}
            copy={copy}
            refreshKey={pipelineRefreshKey}
            onOpenDepartments={() => {
              setActiveTab("departments");
              synth.playClick();
            }}
          />
        </div>

        {/* Right Side: Primary Viewport Tabs and Display panel */}
        <div className="lg:col-span-8 2xl:col-span-9 bg-white/70 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-900/80 p-4 md:p-6 overflow-hidden min-h-[70vh] flex flex-col gap-6 transition-colors duration-250">
          
          {/* Content tabs + dedicated emulator entry (not a tab) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-900 pb-2">
            <div className="flex overflow-x-auto gap-1 min-w-0 flex-1">
              {[
                { id: "departments" as const, label: copy.tabs.departments, icon: Users },
                { id: "prd" as const, label: copy.tabs.prd, icon: FileText },
                { id: "gameplay" as const, label: copy.tabs.gameplay, icon: Layers },
                { id: "manifest" as const, label: copy.tabs.manifest, icon: Code },
                { id: "vlm" as const, label: copy.tabs.vlm, icon: Eye }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      synth.playClick();
                    }}
                    className={`px-4 py-2 rounded text-xs font-semibold font-display tracking-wide whitespace-nowrap transition flex items-center gap-2 cursor-pointer shrink-0 border-b-2 ${
                      isActive
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

            <button
              type="button"
              onClick={() => {
                setIsEmulatorWindowOpen(true);
                synth.playClick();
                addLog(
                  locale === "zh"
                    ? "▶ 已打开 WebGL H5 模拟器窗口"
                    : "▶ Opened WebGL H5 emulator window"
                );
              }}
              className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold font-display tracking-wide transition cursor-pointer border shadow-sm ${
                isEmulatorWindowOpen
                  ? "border-emerald-500/50 bg-emerald-500 text-white shadow-emerald-500/20"
                  : "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              }`}
              title={copy.emulator.open}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">{copy.emulator.open}</span>
              <span className="sm:hidden">{copy.emulator.openShort}</span>
              {isEmulatorWindowOpen && (
                <span className="hidden md:inline text-[10px] font-mono font-normal opacity-90">
                  · {copy.emulator.running}
                </span>
              )}
            </button>
          </div>

          {/* Interactive viewport layers */}
          <div className="flex-1 flex flex-col items-center justify-center">
            
            <AnimatePresence mode="wait">
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

              {activeTab === "departments" && (
                <motion.div
                  key="tab_departments"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
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
                    onDeskChanged={() => setPipelineRefreshKey((k) => k + 1)}
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
                    pendingPatch={pendingPatch}
                    setPendingPatch={setPendingPatch}
                    onApprovePendingPatch={approvePendingPatch}
                    onGoToGameplay={() => setActiveTab("gameplay")}
                    addLog={addLog}
                  />
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </main>

      <AnimatePresence>
        {isEmulatorWindowOpen && (
          <motion.div
            key="emulator-window"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`fixed ${
              isEmulatorFullscreen
                ? "inset-3 md:inset-5 z-[80]"
                : "left-1/2 top-24 z-[60] w-[min(calc(100vw-2rem),760px)] -translate-x-1/2 max-h-[calc(100vh-7rem)] lg:left-auto lg:right-4 lg:top-28 lg:translate-x-0 lg:max-h-[calc(100vh-8rem)]"
            } rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 shadow-2xl shadow-slate-300/60 dark:shadow-slate-950/70 backdrop-blur-xl overflow-hidden`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <Play className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-bold font-display text-slate-800 dark:text-slate-200">
                    {copy.emulator.windowTitle}
                  </h2>
                  <p className="truncate text-3xs font-mono text-slate-500">
                    {copy.emulator.engine}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEmulatorFullscreen((expanded) => !expanded);
                    synth.playClick();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-500/40 dark:hover:text-emerald-300 cursor-pointer"
                  title={isEmulatorFullscreen ? "还原窗口" : "展开窗口"}
                >
                  {isEmulatorFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEmulatorWindowOpen(false);
                    setIsEmulatorFullscreen(false);
                    synth.playClick();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-red-300 hover:text-red-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:text-red-400 cursor-pointer"
                  title="关闭模拟器窗口"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className={`${isEmulatorFullscreen ? "h-[calc(100%-57px)]" : "max-h-[calc(100vh-10.75rem)] lg:max-h-[calc(100vh-11.75rem)]"} overflow-y-auto px-4 pb-4`}>
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
                layout="window"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3 pointer-events-none">
        {/* Quick open emulator when window is closed */}
        <AnimatePresence>
          {!isEmulatorWindowOpen && (
            <motion.button
              key="emulator-fab"
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              onClick={() => {
                setIsEmulatorWindowOpen(true);
                synth.playClick();
              }}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-900/25 hover:bg-emerald-500 transition cursor-pointer"
              title={copy.emulator.open}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {copy.emulator.openShort}
            </motion.button>
          )}
        </AnimatePresence>

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
