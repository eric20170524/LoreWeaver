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
  themeMode
}: EmulatorPanelProps) {
  return (
    <motion.div
      key="tab_emu"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="w-full flex flex-col items-center py-2 relative"
    >
      {gameSpec ? (
        <div className="flex flex-col items-center gap-6 w-full relative">
          
          {/* Ambient background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] rounded-full bg-teal-500/5 blur-[100px] pointer-events-none" />

          {/* Emulator Size Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800/80 text-xs shadow-inner z-30">
            <span className="text-[10px] font-mono text-slate-500 px-2.5 font-bold uppercase tracking-wider">
              {copy.emulator.sizeLabel}:
            </span>
            {(["compact", "standard", "large"] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => {
                  setEmulatorSize(sz);
                  synth.playClick();
                }}
                className={`px-3 py-1.5 rounded-lg text-3xs font-semibold font-display transition cursor-pointer select-none ${
                  emulatorSize === sz
                    ? "bg-emerald-500 text-slate-950 shadow font-bold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {copy.emulator.sizes[sz]}
              </button>
            ))}
          </div>

          {/* Phone visual chassis simulator mockup */}
          <div 
            style={{
              maxWidth: `min(${currentEmuWidth}px, 82vw, calc((100vh - 280px) * 9 / 16))`
            }}
            className="relative w-full aspect-[9/16] bg-slate-200 dark:bg-slate-950 rounded-[40px] p-2.5 shadow-2xl ring-[14px] ring-slate-300/90 dark:ring-slate-900/90 flex flex-col border border-slate-300 dark:border-slate-800/80 overflow-hidden shadow-emerald-500/5 hover:scale-[1.01] transition-transform duration-300"
          >
            
            {/* Audio Speaker notch */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5.5 bg-white dark:bg-slate-950 rounded-full z-40 flex items-center justify-center border border-slate-300 dark:border-slate-900 shadow-inner">
              <div className="w-8 h-1 bg-slate-600 dark:bg-slate-800 rounded-full" />
              <div className="w-1.5 h-1.5 bg-slate-600 dark:bg-slate-800 rounded-full ml-2" />
            </div>

            {/* Custom canvas host */}
            <div className="flex-1 rounded-[32px] overflow-hidden relative bg-slate-950 flex items-center justify-center shadow-inner pt-3">
              <div
                ref={(node) => {
                  setPhaserContainer(node);
                }}
                id="phaser-canvas-container"
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Emulator widgets */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/40 px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-900 w-full max-w-xl text-xs shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-lg">
                <Compass className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-3xs text-slate-500 uppercase tracking-wider">{copy.emulator.status}</span>
                <span className="text-2xs font-semibold text-slate-700 dark:text-slate-300">{copy.emulator.engine}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3.5 text-2xs font-mono bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-900/60 px-4 py-2 rounded-lg text-slate-650 dark:text-slate-400">
              <div>{copy.emulator.unlocked}: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{playerState.unlockedNodeIds.length} / 12</strong></div>
              <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-800/80" />
              <div>{copy.emulator.completed}: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{playerState.completedNodeIds.length} / 12</strong></div>
              <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-800/80" />
              <div>{copy.emulator.realm}: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{playerState.currentRealmIndex + 1} / 6</strong></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={triggerVisualAudit}
                disabled={isAuditing}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-750 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-emerald-300/40 rounded-lg text-3xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                title="触发 VLM 视觉大模型布局审计"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>审计</span>
              </button>
              
              <button
                onClick={handleResetProgress}
                className="px-3.5 py-2 bg-white hover:bg-red-50 dark:bg-slate-950 dark:hover:bg-red-950/20 hover:text-red-500 dark:hover:text-red-400 text-slate-650 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900/40 flex items-center gap-1.5 transition rounded-lg text-3xs font-bold uppercase tracking-wider cursor-pointer shadow"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {copy.emulator.reset}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-slate-500 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-10 text-center max-w-sm mt-12 bg-white/60 dark:bg-slate-900/10 shadow-inner">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3.5 animate-bounce" />
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{copy.emulator.emptyTitle}</p>
          <p className="text-xs text-slate-500 leading-relaxed">{copy.emulator.emptyDesc}</p>
        </div>
      )}
    </motion.div>
  );
}
