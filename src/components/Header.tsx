import React from "react";
import { Sparkles, Cpu, Flame, Sun, Moon, Languages, Download } from "lucide-react";
import { Locale } from "../types";
import { WorkspaceSelector, WorkspaceMeta } from "./WorkspaceSelector";
import { synth } from "../utils/AudioSynth";

interface HeaderProps {
  themeInput: string;
  setThemeInput: (val: string) => void;
  isOrchestrating: boolean;
  runOrchestrationPipeline: () => Promise<void>;
  themeMode: "light" | "dark";
  setThemeMode: (mode: "light" | "dark" | ((curr: "light" | "dark") => "light" | "dark")) => void;
  locale: Locale;
  setLocale: (loc: Locale | ((curr: Locale) => Locale)) => void;
  copy: any;
  activeWorkspace: WorkspaceMeta | null;
  handleLoadWorkspace: (ws: WorkspaceMeta) => Promise<void>;
  onExportWorkspace: () => Promise<void>;
  isExporting: boolean;
  onExportRelease: () => Promise<void>;
  isExportingRelease: boolean;
}

export function Header({
  themeInput,
  setThemeInput,
  isOrchestrating,
  runOrchestrationPipeline,
  themeMode,
  setThemeMode,
  locale,
  setLocale,
  copy,
  activeWorkspace,
  handleLoadWorkspace,
  onExportWorkspace,
  isExporting,
  onExportRelease,
  isExportingRelease
}: HeaderProps) {
  return (
    <header className="border-b border-slate-200 dark:border-slate-900 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors duration-250">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <Cpu className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-700 dark:from-emerald-400 dark:via-teal-400 dark:to-cyan-400 tracking-tight transition-all duration-250">
            同人自构绘卷 LORE WEAVER
          </h1>
          <p className="text-xs text-slate-500 font-mono tracking-wider">
            {copy.subtitle}
          </p>
        </div>
      </div>

      {/* Global IP Setup Form */}
      <div className="flex flex-col sm:flex-row gap-2 max-w-xl w-full">
        <div className="relative flex-1">
          <input
            type="text"
            value={themeInput}
            onChange={(e) => setThemeInput(e.target.value)}
            placeholder={copy.themePlaceholder}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded px-3 py-2 pl-9 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium transition"
            disabled={isOrchestrating}
          />
          <Sparkles className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400 dark:text-slate-650" />
        </div>
        
        <button
          onClick={runOrchestrationPipeline}
          disabled={isOrchestrating}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-display font-semibold transition hover:opacity-95 px-4 py-2 rounded text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 select-none max-sm:w-full shrink-0 uppercase"
        >
          {isOrchestrating ? (
            <>
              <Flame className="w-3.5 h-3.5 animate-spin" />
              {copy.compiling}
            </>
          ) : (
            <>
              <Flame className="w-3.5 h-3.5" />
              ⚡ {copy.compile}
            </>
          )}
        </button>
      </div>
      
      {/* Workspace Context Display */}
      <div className="shrink-0 flex items-center justify-end gap-2">
        {/* Light/Dark Mode Toggle Button */}
        <button
          onClick={() => setThemeMode((current) => current === "light" ? "dark" : "light")}
          className="flex items-center gap-1.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 text-slate-800 dark:text-slate-300 px-3 py-1.5 rounded transition font-mono text-xs cursor-pointer"
          title={themeMode === "light" ? "切换至深色模式" : "切换至浅色模式"}
        >
          {themeMode === "light" ? (
            <>
              <Sun className="w-4 h-4 text-amber-500 animate-spin-slow" />
              <span>LIGHT</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>DARK</span>
            </>
          )}
        </button>
        
        <button
          onClick={() => setLocale((current) => current === "zh" ? "en" : "zh")}
          className="flex items-center gap-1.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-cyan-500/50 text-slate-800 dark:text-slate-300 px-3 py-1.5 rounded transition font-mono text-xs cursor-pointer"
          title={copy.languageLabel}
        >
          <Languages className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
          {copy.languageValue}
        </button>

        <button
          onClick={onExportWorkspace}
          disabled={!activeWorkspace || isExporting || isExportingRelease}
          className="flex items-center gap-1.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 text-slate-800 dark:text-slate-300 px-3 py-1.5 rounded transition font-mono text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title={locale === "zh" ? "导出当前工作区的源码备份 ZIP (未编译)" : "Export current workspace raw source ZIP"}
        >
          <Download className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          {isExporting ? (locale === "zh" ? "备份中" : "Backing up") : (locale === "zh" ? "备份源码" : "Backup Source")}
        </button>

        <button
          onClick={onExportRelease}
          disabled={!activeWorkspace || isExporting || isExportingRelease}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3.5 py-1.5 rounded font-display font-bold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow hover:scale-[1.01] transition-transform duration-150"
          title={locale === "zh" ? "编译并导出独立的 H5 游戏发布包 ZIP (支持直接离线试玩/部署发布)" : "Compile and export standalone H5 release ZIP"}
        >
          <Sparkles className={`w-4 h-4 text-slate-950 ${isExportingRelease ? "animate-spin" : ""}`} />
          {isExportingRelease ? (locale === "zh" ? "构建中…" : "Building…") : (locale === "zh" ? "导出发布包" : "Export Release")}
        </button>
        
        <WorkspaceSelector 
          activeWorkspaceId={activeWorkspace?.id || null} 
          onSelectWorkspace={handleLoadWorkspace} 
          locale={locale}
        />
      </div>
    </header>
  );
}
