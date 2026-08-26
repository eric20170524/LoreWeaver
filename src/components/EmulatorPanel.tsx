import React from "react";
import { motion } from "motion/react";
import { AlertTriangle, RotateCcw, Compass, Eye } from "lucide-react";
import { GameSpec, PlayerState } from "../types";
import { synth } from "../utils/AudioSynth";

interface EmulatorPanelProps {
  gameSpec: GameSpec | null;
  playerState: PlayerState;
  emulatorSize: "compact" | "standard" | "large";
  setEmulatorSize: (size: "compact" | "standard" | "large") => void;
  currentEmuWidth: number;
  setPhaserContainer: (el: HTMLDivElement | null) => void;
  handleResetProgress: () => void;
  triggerVisualAudit: () => Promise<void>;
  isAuditing: boolean;
  copy: any;
  themeMode: "light" | "dark";
  layout?: "embedded" | "window";
}

export function EmulatorPanel({
  gameSpec,
  playerState,
  emulatorSize,
  setEmulatorSize,
  currentEmuWidth,
  setPhaserContainer,
  handleResetProgress,
  triggerVisualAudit,
  isAuditing,
  copy,
  themeMode,
  layout = "embedded"
}: EmulatorPanelProps) {
  const emulatorFrameMaxWidth = layout === "window"
    ? `min(${currentEmuWidth}px, 92vw)`
    : `min(${currentEmuWidth}px, 82vw, calc((100vh - 280px) * 9 / 16))`;
  const emulatorControlsMaxWidth = `min(max(${currentEmuWidth}px, 360px), 92vw)`;
  const nodeCount = Math.max(1, gameSpec?.nodes?.length || 0);
  const progressionStages = Array.isArray((gameSpec as any)?.economy?.realms)
    ? (gameSpec as any).economy.realms.length
    : 0;
  const progressionTotal = Math.max(1, progressionStages || nodeCount);
  const currentProgression = Math.min(progressionTotal, Math.max(1, playerState.currentRealmIndex + 1));

  return (
    <motion.div
      key="tab_emu"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className={`relative flex w-full flex-col items-center ${layout === "window" ? "py-3" : "py-2"}`}
    >
      {gameSpec ? (
        <div className="relative flex w-full flex-col items-center gap-5">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-[120px]" />
          <div className="relative flex w-full justify-center pt-10">
            <div
              style={{ maxWidth: emulatorControlsMaxWidth }}
              className="absolute left-1/2 top-0 z-50 flex w-full -translate-x-1/2 justify-center px-3"
            >
              <div className="pointer-events-auto flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/90 p-1 text-xs shadow-xl backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/90">
                <span className="shrink-0 whitespace-nowrap px-2 text-[10px] font-bold font-mono uppercase tracking-wider text-slate-500">
                  {copy.emulator.sizeLabel}:
                </span>
                {(["compact", "standard", "large"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={emulatorSize === size}
                    onClick={() => {
                      setEmulatorSize(size);
                      synth.playClick();
                    }}
                    className={`min-w-[70px] flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${
                      emulatorSize === size
                        ? "bg-emerald-500 font-bold text-slate-950 shadow"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {copy.emulator.sizes[size]}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{ maxWidth: emulatorFrameMaxWidth }}
              className="relative flex aspect-[9/16] w-full flex-col overflow-hidden rounded-[40px] border border-slate-300 bg-slate-200 p-2.5 shadow-2xl ring-[14px] ring-slate-300/90 transition-transform duration-300 hover:scale-[1.01] dark:border-slate-800/80 dark:bg-slate-950 dark:ring-slate-900/90"
            >
              <div className="absolute left-1/2 top-2.5 z-40 flex h-5.5 w-28 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white shadow-inner dark:border-slate-900 dark:bg-slate-950">
                <div className="h-1 w-8 rounded-full bg-slate-600 dark:bg-slate-800" />
                <div className="ml-2 h-1.5 w-1.5 rounded-full bg-slate-600 dark:bg-slate-800" />
              </div>
              <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[32px] bg-slate-950 pt-3 shadow-inner">
                <div
                  ref={(node) => setPhaserContainer(node)}
                  id="phaser-canvas-container"
                  className="h-full w-full"
                />
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-2xl flex-col items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/80 px-5 py-4 text-xs shadow-lg backdrop-blur-sm dark:border-slate-900 dark:bg-slate-900/40 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800/80 dark:bg-slate-950">
                <Compass className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{copy.emulator.status}</span>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{copy.emulator.engine}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-mono text-slate-500 dark:border-slate-900/60 dark:bg-slate-950/60 dark:text-slate-400">
              <div>{copy.emulator.unlocked}: <strong className="text-emerald-600 dark:text-emerald-400">{playerState.unlockedNodeIds.length} / {nodeCount}</strong></div>
              <div className="h-3.5 w-px bg-slate-300 dark:bg-slate-800" />
              <div>{copy.emulator.completed}: <strong className="text-emerald-600 dark:text-emerald-400">{playerState.completedNodeIds.length} / {nodeCount}</strong></div>
              <div className="h-3.5 w-px bg-slate-300 dark:bg-slate-800" />
              <div>{copy.emulator.realm}: <strong className="text-emerald-600 dark:text-emerald-400">{currentProgression} / {progressionTotal}</strong></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={triggerVisualAudit}
                disabled={isAuditing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-emerald-300/40 hover:bg-emerald-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-emerald-950/20"
                title="Visual audit"
              >
                <Eye className="h-3.5 w-3.5" />
                {isAuditing ? "…" : (copy.vlm?.run || "Audit")}
              </button>
              <button
                onClick={handleResetProgress}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-red-950/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {copy.emulator.reset}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-12 max-w-sm rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-slate-500 shadow-inner dark:border-slate-800 dark:bg-slate-900/10">
          <AlertTriangle className="mx-auto mb-3.5 h-10 w-10 text-amber-500" />
          <p className="mb-1 font-semibold text-slate-700 dark:text-slate-300">{copy.emulator.emptyTitle}</p>
          <p className="text-xs leading-relaxed text-slate-500">{copy.emulator.emptyDesc}</p>
        </div>
      )}
    </motion.div>
  );
}
