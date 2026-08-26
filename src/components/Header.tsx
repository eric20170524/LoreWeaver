import React from "react";
import { Sparkles, Cpu, Flame, Sun, Moon, Languages, Settings2 } from "lucide-react";
import { Locale } from "../types";
import { WorkspaceSelector, WorkspaceMeta } from "./WorkspaceSelector";

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
  expertMode: boolean;
  onToggleExpertMode: () => void;
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
  expertMode,
  onToggleExpertMode
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-900 bg-white/90 dark:bg-slate-950/90 px-4 py-3 backdrop-blur-md transition-colors duration-250 md:px-8">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-xl">
              LoreWeaver
            </h1>
            <p className="truncate text-[11px] font-mono text-slate-500">
              {locale === "zh" ? "AI 游戏竖切片工作台" : "AI game vertical-slice workbench"}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row xl:max-w-3xl">
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={themeInput}
              onChange={(e) => setThemeInput(e.target.value)}
              placeholder={copy.themePlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-800 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              disabled={isOrchestrating}
            />
            <Sparkles className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          </div>
          <button
            onClick={runOrchestrationPipeline}
            disabled={isOrchestrating || !themeInput.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-display font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Flame className={`h-3.5 w-3.5 ${isOrchestrating ? "animate-spin" : ""}`} />
            {isOrchestrating
              ? (locale === "zh" ? "正在生成…" : "Creating…")
              : (locale === "zh" ? "生成可玩蓝图" : "Create Playable Blueprint")}
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <WorkspaceSelector
            activeWorkspaceId={activeWorkspace?.id || null}
            onSelectWorkspace={handleLoadWorkspace}
            locale={locale}
          />

          <button
            onClick={onToggleExpertMode}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              expertMode
                ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            }`}
            title={locale === "zh" ? "显示部门、Manifest、VLM、日志等工程细节" : "Show departments, manifest, VLM, logs, and engineering details"}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {locale === "zh" ? (expertMode ? "专家模式" : "简单模式") : (expertMode ? "Expert" : "Simple")}
          </button>

          <button
            onClick={() => setLocale((current) => current === "zh" ? "en" : "zh")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:border-cyan-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title={copy.languageLabel}
          >
            <Languages className="h-3.5 w-3.5 text-cyan-500" />
            {copy.languageValue}
          </button>

          <button
            onClick={() => setThemeMode((current) => current === "light" ? "dark" : "light")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title={themeMode === "light" ? "Dark" : "Light"}
          >
            {themeMode === "light" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
          </button>
        </div>
      </div>
    </header>
  );
}
