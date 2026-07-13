import React from "react";
import {
  Layers, CheckCircle2, XCircle, AlertTriangle, Code,
  Cpu, Zap, GitPullRequest, Settings
} from "lucide-react";
import { GameSpec, Locale, ManifestPatch, GameplayAssignment } from "../types";
import { UI_COPY } from "../utils/uiCopy";
import {
  GAMEPLAY_CARD_OPTIONS,
  ensureGameplayManifest,
  toggleModifier,
  GameplayCardOption
} from "../utils/gameplayManifest";

interface GameplayPanelProps {
  gameSpec: GameSpec | null;
  locale: Locale;
  pendingPatch: ManifestPatch | null;
  setPendingPatch: (patch: ManifestPatch | null) => void;
  onApprovePendingPatch: () => Promise<void>;
  onQueueGameplayPatch: (nodeId: number, nextGameplay: GameplayAssignment, reason: string) => void;
}

const renderKnobInput = (
  def: any,
  value: any,
  onChange: (val: any) => void
) => {
  switch (def.type) {
    case "boolean":
      const boolVal = !!value;
      return (
        <button
          type="button"
          onClick={() => onChange(!boolVal)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-emerald-500/40 ${
            boolVal ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              boolVal ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      );
    case "enum":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full max-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 text-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500/40 text-slate-850 dark:text-slate-200 font-sans"
        >
          {def.values?.map((val: string) => (
            <option key={val} value={val}>{val}</option>
          ))}
        </select>
      );
    case "number":
    case "integer":
      const numVal = typeof value === "number" ? value : Number(value) || def.default || 0;
      const step = def.type === "integer" ? 1 : 0.1;
      const min = def.min !== undefined ? def.min : 0;
      const max = def.max !== undefined ? def.max : 100;
      return (
        <div className="flex items-center gap-3 w-full font-sans">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={numVal}
            onChange={(e) => onChange(def.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
            className="flex-1 accent-emerald-500 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={numVal}
            onChange={(e) => {
              const v = def.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
              if (!isNaN(v)) onChange(v);
            }}
            className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5 text-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500/40 text-slate-800 dark:text-slate-200 text-center font-mono"
          />
        </div>
      );
    case "array":
      const arrVal = Array.isArray(value) ? value : [value];
      return (
        <input
          type="text"
          value={arrVal.join(", ")}
          onChange={(e) => {
            const list = e.target.value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
            const parsedList = list.map(x => isNaN(Number(x)) ? x : Number(x));
            onChange(parsedList);
          }}
          placeholder="e.g. 0.66, 0.33"
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/40 text-slate-800 dark:text-slate-200 font-mono"
        />
      );
    default:
      return (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 text-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500/40 text-slate-800 dark:text-slate-200"
        />
      );
  }
};

export function GameplayPanel({
  gameSpec,
  locale,
  pendingPatch,
  setPendingPatch,
  onApprovePendingPatch,
  onQueueGameplayPatch
}: GameplayPanelProps) {
  const copy = UI_COPY[locale];

  if (!gameSpec) {
    return (
      <div className="text-slate-500 italic py-12 text-center text-xs">
        {copy.gameplay.empty}
      </div>
    );
  }

  const baseGameplayOptions = GAMEPLAY_CARD_OPTIONS.filter((card) => card.category === "base");
  const modifierOptions = GAMEPLAY_CARD_OPTIONS.filter((card) => card.category === "modifier");
  const normalizedSpec = ensureGameplayManifest(gameSpec);

  const lc = LOCAL_COPY[locale];

  // Helper: get semantic summary for active configuration
  const getSemanticSummary = (gameplay: GameplayAssignment) => {
    const baseCard = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === gameplay.cardId);
    const activeMods = gameplay.modifiers
      .map((m) => GAMEPLAY_CARD_OPTIONS.find((c) => c.id === m.id))
      .filter(Boolean) as GameplayCardOption[];

    const systems = new Set<string>(baseCard?.requires || []);
    activeMods.forEach((m) => {
      m.requires?.forEach((s) => systems.add(s));
    });

    let victory = baseCard?.victory || (locale === "zh" ? "完成关卡目标" : "Complete objectives");
    let victoryEn = baseCard?.victoryEn || "Complete level objectives";

    if (activeMods.some((m) => m.id === "boss_phases")) {
      victory += " 并击败所有阶段 Boss";
      victoryEn += " and defeat all Boss phases";
    }
    if (activeMods.some((m) => m.id === "escort_npc")) {
      victory += " 并保护 NPC 安全抵达终点";
      victoryEn += " and protect NPC to destination";
    }

    const failures = [baseCard?.failure || (locale === "zh" ? "角色生命值归零" : "Player HP <= 0")];
    const failuresEn = [baseCard?.failureEn || "Player dies (HP <= 0)"];

    if (activeMods.some((m) => m.id === "defend_core")) {
      failures.push(locale === "zh" ? "防守核心 HP 归零" : "Defend core HP reaches 0");
      failuresEn.push("Defend core HP reaches 0");
    }
    if (activeMods.some((m) => m.id === "escort_npc")) {
      failures.push(locale === "zh" ? "被护送的 NPC 死亡" : "Escorted NPC dies");
      failuresEn.push("Escorted NPC dies");
    }
    if (activeMods.some((m) => m.id === "poison_fog")) {
      failures.push(locale === "zh" ? "在安全区外窒息 (HP 归零)" : "Suffocate outside safe zone");
      failuresEn.push("Suffocate outside safe zone");
    }
    if (activeMods.some((m) => m.id === "laser_warning")) {
      failures.push(locale === "zh" ? "被激光预警击中 (致命伤害)" : "Hit by laser warning");
      failuresEn.push("Hit by laser warning");
    }

    const hasDesignOnly = activeMods.some((m) => m.implementationStatus === "design_only");

    return {
      victory: locale === "zh" ? victory : victoryEn,
      failures: locale === "zh" ? failures : failuresEn,
      systems: Array.from(systems),
      hasDesignOnly,
      adapter: baseCard?.adapter || "phaser"
    };
  };

  // Helper: get patch diff details for UI display
  const getGameplayDiff = (before: GameplayAssignment, after: GameplayAssignment) => {
    const beforeBase = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === before.cardId);
    const afterBase = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === after.cardId);

    const summaries: string[] = [];

    if (before.cardId !== after.cardId) {
      if (locale === "zh") {
        summaries.push(`基础玩法: ${beforeBase?.title || before.cardId} ➔ ${afterBase?.title || after.cardId}`);
      } else {
        summaries.push(`Base Card: ${beforeBase?.titleEn || before.cardId} ➔ ${afterBase?.titleEn || after.cardId}`);
      }
    }

    const beforeMods = (before.modifiers || []).map((m) => m.id);
    const afterMods = (after.modifiers || []).map((m) => m.id);

    const added = afterMods.filter((m) => !beforeMods.includes(m));
    const removed = beforeMods.filter((m) => !afterMods.includes(m));

    if (added.length > 0) {
      const names = added
        .map((id) => {
          const card = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === id);
          return locale === "zh" ? card?.title : card?.titleEn;
        })
        .join(", ");
      summaries.push(locale === "zh" ? `挂载机制 [+]: ${names}` : `Added Modifiers: ${names}`);
    }

    if (removed.length > 0) {
      const names = removed
        .map((id) => {
          const card = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === id);
          return locale === "zh" ? card?.title : card?.titleEn;
        })
        .join(", ");
      summaries.push(locale === "zh" ? `移出机制 [-]: ${names}` : `Removed Modifiers: ${names}`);
    }

    if (summaries.length === 0) {
      return locale === "zh" ? "微调了玩法参数 (Knobs)" : "Tuned gameplay parameters (Knobs)";
    }

    return summaries.join(" | ");
  };

  const getPatchDiffSummary = (patch: ManifestPatch) => {
    if (!patch.target.endsWith(".gameplay") || typeof patch.before !== "object" || typeof patch.after !== "object") {
      if (locale === "zh") {
        return `微调属性 ${patch.target}`;
      } else {
        return `Modified property ${patch.target}`;
      }
    }
    return getGameplayDiff(patch.before as GameplayAssignment, patch.after as GameplayAssignment);
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-900 p-6 space-y-5 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-sm font-display font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {copy.tabs.gameplay}
          </h2>
          <p className="text-3xs text-slate-500 mt-1">
            {copy.gameplay.desc}
          </p>
        </div>
        <div className="flex items-center gap-2 text-3xs font-mono">
          <span className="px-2 py-1 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            {copy.gameplay.cards} {normalizedSpec.gameplayCards?.length || 0}
          </span>
          <span className="px-2 py-1 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            {copy.gameplay.revisions} {normalizedSpec.workbench?.revisions.length || 0}
          </span>
          <span className="px-2 py-1 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400">
            {copy.gameplay.manual}
          </span>
        </div>
      </div>

      {pendingPatch && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-4 space-y-3 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <GitPullRequest className="w-4 h-4 text-amber-500" />
                {copy.gameplay.pendingPatch}
              </div>
              <div className="text-3xs font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                {pendingPatch.target} · {pendingPatch.patchLevel} · invalidates {pendingPatch.invalidates.join(", ")}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingPatch(null)}
                className="px-3 py-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-3xs font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition"
              >
                {copy.gameplay.discard}
              </button>
              <button
                onClick={onApprovePendingPatch}
                className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-3xs font-bold cursor-pointer hover:opacity-90 transition"
              >
                {copy.gameplay.apply}
              </button>
            </div>
          </div>
          
          <div className="text-2xs bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/15 p-2 rounded text-slate-700 dark:text-slate-350">
            <span className="font-bold text-amber-700 dark:text-amber-400">{lc.patchSummary}:</span>{" "}
            <span className="font-medium">{getPatchDiffSummary(pendingPatch)}</span>
          </div>

          <pre className="bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 p-3 text-3xs text-slate-600 dark:text-slate-400 overflow-x-auto max-h-[120px] scrollbar-thin">
            {JSON.stringify({ before: pendingPatch.before, after: pendingPatch.after }, null, 2)}
          </pre>
        </div>
      )}

      <div className="space-y-4">
        {normalizedSpec.nodes.map((node) => {
          const gameplay = node.gameplay!;
          const summary = getSemanticSummary(gameplay);
          const baseCard = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === gameplay.cardId);

          return (
            <div
              key={node.id}
              className="bg-white/95 dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-900 p-5 space-y-4 shadow-sm hover:shadow-md transition duration-200"
            >
              {/* Header section */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-350 text-[10px] font-mono font-bold">
                      #{node.id}
                    </span>
                    {node.title}
                  </h3>
                  <p className="text-3xs text-slate-500 mt-0.5 line-clamp-1">{node.intro}</p>
                </div>
                <div className="text-3xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-950/60 px-2 py-1 rounded border border-slate-200/50 dark:border-slate-850 shrink-0 self-start sm:self-center">
                  {copy.gameplay.adapter}: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{gameplay.adapter}</span>
                </div>
              </div>

              {/* Main Combination Editor Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* Left Column: Editor controls */}
                <div className="lg:col-span-7 space-y-4 border-r-0 lg:border-r border-slate-100 dark:border-slate-850/60 lg:pr-5">
                  
                  {/* Base Card dropdown select */}
                  <label className="flex flex-col gap-1.5 text-3xs text-slate-500 uppercase font-mono tracking-wider font-bold cursor-pointer">
                    {copy.gameplay.baseCard}
                    <div className="relative mt-1 normal-case font-sans text-slate-800 dark:text-slate-200">
                      <select
                        value={gameplay.cardId}
                        onChange={(event) => {
                          const card = GAMEPLAY_CARD_OPTIONS.find((item) => item.id === event.target.value);
                          // Auto strip incompatible modifiers
                          const nextModifiers = gameplay.modifiers.filter((mod) => {
                            const modOpt = GAMEPLAY_CARD_OPTIONS.find((item) => item.id === mod.id);
                            return !modOpt?.modifierFor || modOpt.modifierFor.includes(event.target.value);
                          });
                          
                          const nextGameplay: GameplayAssignment = {
                            ...gameplay,
                            cardId: event.target.value,
                            adapter: card?.adapter || gameplay.adapter,
                            modifiers: nextModifiers,
                            patchLevel: "L2"
                          };
                          onQueueGameplayPatch(node.id, nextGameplay, `Change node ${node.id} base gameplay card`);
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 text-2xs transition"
                      >
                        {baseGameplayOptions.map((card) => (
                          <option key={card.id} value={card.id}>
                            {locale === "en" ? card.titleEn || card.title : card.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  {/* Modifiers List */}
                  <div className="space-y-2.5">
                    <label className="text-3xs text-slate-500 uppercase font-mono tracking-wider font-bold">
                      {lc.mountedMechanics}
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {modifierOptions.map((modifier) => {
                        const checked = gameplay.modifiers.some((item) => item.id === modifier.id);
                        const isImplemented = modifier.implementationStatus === "implemented";
                        
                        // Compatibility check
                        const isCompatible = !modifier.modifierFor || modifier.modifierFor.includes(gameplay.cardId);
                        
                        // Conflict check
                        const activeModIds = gameplay.modifiers.map(m => m.id);
                        const conflicts = modifier.conflicts?.filter(id => activeModIds.includes(id)) || [];
                        const hasConflict = conflicts.length > 0;
                        
                        const titleSuffix = isImplemented ? "" : (locale === "en" ? " (Design)" : " (设计)");
                        const cardTitle = (locale === "en" ? modifier.titleEn || modifier.title : modifier.title) + titleSuffix;

                        const handleToggle = () => {
                          if (!isCompatible) return;
                          
                          let nextMods = [...gameplay.modifiers];
                          if (checked) {
                            nextMods = nextMods.filter((item) => item.id !== modifier.id);
                          } else {
                            nextMods.push({ id: modifier.id, knobs: {} });
                          }
                          
                          const nextGameplay: GameplayAssignment = {
                            ...gameplay,
                            modifiers: nextMods,
                            patchLevel: "L2"
                          };
                          onQueueGameplayPatch(node.id, nextGameplay, `Toggle ${modifier.id} modifier`);
                        };

                        return (
                          <label
                            key={modifier.id}
                            className={`group flex flex-col p-3 rounded-lg border text-3xs transition-all select-none duration-150 relative cursor-pointer ${
                              !isCompatible
                                ? "border-slate-100 dark:border-slate-900 bg-slate-100/10 dark:bg-slate-950/10 text-slate-400 dark:text-slate-655 cursor-not-allowed opacity-50"
                                : checked
                                ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-250 shadow-sm shadow-emerald-500/5"
                                : "border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-450"
                            }`}
                          >
                            {/* Checkbox and Title */}
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!isCompatible}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleToggle();
                                  }}
                                  className="rounded text-emerald-500 focus:ring-emerald-500/20 cursor-pointer disabled:cursor-not-allowed shrink-0"
                                />
                                <span className="font-bold truncate">{cardTitle}</span>
                              </div>
                              <span className={`px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold shrink-0 ${
                                isImplemented
                                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-350 border border-emerald-500/10"
                                  : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-500/10"
                              }`}>
                                {isImplemented ? lc.implemented : lc.designOnly}
                              </span>
                            </div>

                            {/* Brief Description */}
                            <p className="text-slate-500 dark:text-slate-500 text-[10px] mt-1.5 leading-relaxed">
                              {locale === "en" ? modifier.effectSummaryEn || modifier.effectSummary : modifier.effectSummary}
                            </p>

                            {/* relational parameters */}
                            {isCompatible && (
                              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-850/50 flex flex-col gap-1 text-[9px] text-slate-400">
                                {modifier.changes && (
                                  <div>
                                    <span className="text-slate-500 font-medium">{lc.changesLabel}</span>{" "}
                                    <span className="text-slate-600 dark:text-slate-400">{locale === "en" ? modifier.changesEn : modifier.changes}</span>
                                  </div>
                                )}
                                {modifier.requires && modifier.requires.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 font-medium">{lc.requiresLabel}</span>{" "}
                                    <code className="text-slate-600 dark:text-slate-455 font-mono bg-slate-50 dark:bg-slate-950 px-1 py-0.2 rounded border border-slate-200/40 dark:border-slate-850">{modifier.requires.join(", ")}</code>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Incompatibility Overlay warning */}
                            {!isCompatible && (
                              <div className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 rounded-lg flex items-center justify-center p-2 text-center text-[10px] font-bold text-slate-500 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-850">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mr-1.5 shrink-0" />
                                {lc.incompatible}
                              </div>
                            )}

                            {/* Conflict notice overlay/tag */}
                            {isCompatible && hasConflict && checked && (
                              <div className="mt-2 text-[9px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 border border-amber-500/10 bg-amber-500/5 p-1 rounded">
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                {lc.conflictWith(
                                  conflicts.map(id => {
                                    const c = GAMEPLAY_CARD_OPTIONS.find(x => x.id === id);
                                    return locale === "zh" ? c?.title : c?.titleEn;
                                  }).join(", ")
                                )}
                              </div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Preview & Summary */}
                <div className="lg:col-span-5 bg-slate-50/50 dark:bg-slate-950/30 rounded-lg border border-slate-200/50 dark:border-slate-850/60 p-4 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-3xs font-bold text-slate-500 uppercase font-mono tracking-wider">
                      {lc.comboPreview}
                    </h4>

                    {/* Flowchart Combination Pipeline */}
                    <div className="flex flex-wrap items-center gap-1 text-3xs font-mono bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-850 p-2.5 rounded-lg shadow-inner">
                      <span className="px-2 py-0.8 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 font-bold border border-blue-500/20">
                        {locale === "en" ? baseCard?.titleEn || gameplay.cardId : baseCard?.title || gameplay.cardId}
                      </span>
                      
                      {gameplay.modifiers.map((m) => {
                        const mCard = GAMEPLAY_CARD_OPTIONS.find((item) => item.id === m.id);
                        return (
                          <React.Fragment key={m.id}>
                            <span className="text-slate-400 dark:text-slate-600 font-bold">+</span>
                            <span className={`px-2 py-0.8 rounded border font-bold ${
                              mCard?.implementationStatus === "design_only"
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-350 border-emerald-500/20"
                            }`}>
                              {locale === "en" ? mCard?.titleEn || m.id : mCard?.title || m.id}
                            </span>
                          </React.Fragment>
                        );
                      })}
                      
                      <span className="text-slate-400 dark:text-slate-655 font-bold">➔</span>
                      <span className="px-2 py-0.8 rounded bg-slate-500/10 text-slate-700 dark:text-slate-355 font-bold border border-slate-500/20">
                        {summary.adapter}
                      </span>
                    </div>

                    {/* Semantic Combination Attributes */}
                    <div className="space-y-2.5 text-2xs leading-normal">
                      
                      {/* Victory Conditions */}
                      <div className="space-y-1">
                        <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 font-sans">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          {lc.victoryConds}
                        </span>
                        <div className="pl-5 text-slate-700 dark:text-slate-300 font-medium font-sans">
                          {summary.victory}
                        </div>
                      </div>

                      {/* Failure Conditions */}
                      <div className="space-y-1">
                        <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 font-sans">
                          <XCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                          {lc.failureConds}
                        </span>
                        <ul className="pl-5 list-disc space-y-0.5 text-slate-700 dark:text-slate-300 font-medium font-sans">
                          {summary.failures.map((f, idx) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Required systems */}
                      <div className="space-y-1 pt-1">
                        <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 font-sans">
                          <Cpu className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          {lc.sysDeps}
                        </span>
                        <div className="pl-5 flex flex-wrap gap-1">
                          {summary.systems.map((sys) => (
                            <code key={sys} className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[9px] font-mono text-slate-600 dark:text-slate-400">
                              {sys}
                            </code>
                          ))}
                          {summary.systems.length === 0 && (
                            <span className="text-slate-500 italic text-3xs">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Readiness State display banner */}
                  <div className={`mt-2 border p-2.5 rounded-lg flex items-center gap-2 text-3xs ${
                    summary.hasDesignOnly
                      ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400"
                      : "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-400"
                  }`}>
                    {summary.hasDesignOnly ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="font-medium">{lc.designOnlyWarning}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="font-medium">{lc.readyToRun}</span>
                      </>
                    )}
                  </div>
                </div>

              </div>
              
              {/* Knobs configuration panel at the bottom of the card */}
              {(() => {
                const baseCardOpt = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === gameplay.cardId);
                const baseHasKnobs = baseCardOpt && baseCardOpt.knobs && Object.keys(baseCardOpt.knobs).length > 0;
                const activeModsWithKnobs = gameplay.modifiers.map((modSpec) => {
                  const opt = GAMEPLAY_CARD_OPTIONS.find((c) => c.id === modSpec.id);
                  return { modSpec, opt };
                }).filter(({ opt }) => opt && opt.knobs && Object.keys(opt.knobs).length > 0);

                if (!baseHasKnobs && activeModsWithKnobs.length === 0) return null;

                return (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60 space-y-4">
                    <div className="flex items-center gap-2 text-2xs uppercase tracking-wider font-mono font-bold text-slate-500">
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      {lc.knobsTitle}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Base Card Knobs */}
                      {baseHasKnobs && baseCardOpt?.knobs && (
                        <div className="bg-slate-50/40 dark:bg-slate-950/20 rounded-lg p-3.5 border border-slate-200/50 dark:border-slate-850/50 space-y-3">
                          <div className="text-2xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200/40 dark:border-slate-800/40 pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {lc.baseKnobs}
                          </div>
                          <div className="space-y-3.5">
                            {Object.entries(baseCardOpt.knobs).map(([key, def]: [string, any]) => {
                              const val = gameplay.knobs?.[key] !== undefined ? gameplay.knobs[key] : def.default;
                              return (
                                <div key={key} className="space-y-1.5">
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-bold text-slate-600 dark:text-slate-400 font-mono">{key}</span>
                                    <span className="text-slate-500">{locale === "en" ? def.descriptionEn : def.description}</span>
                                  </div>
                                  {renderKnobInput(
                                    def,
                                    val,
                                    (newVal: any) => {
                                      const nextGameplay = {
                                        ...gameplay,
                                        knobs: {
                                          ...(gameplay.knobs || {}),
                                          [key]: newVal
                                        },
                                        patchLevel: "L2" as const
                                      };
                                      onQueueGameplayPatch(node.id, nextGameplay, `Update base card knob: ${key} = ${newVal}`);
                                    }
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Modifiers Knobs */}
                      {activeModsWithKnobs.length > 0 && (
                        <div className="bg-slate-50/40 dark:bg-slate-950/20 rounded-lg p-3.5 border border-slate-200/50 dark:border-slate-850/50 space-y-4">
                          {activeModsWithKnobs.map(({ modSpec, opt }) => (
                            <div key={modSpec.id} className="space-y-3">
                              <div className="text-2xs font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200/40 dark:border-slate-800/40 pb-1.5 flex items-center gap-1.5 font-sans">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {locale === "zh" ? `机制参数 - ${opt?.title}` : `Modifier - ${opt?.titleEn || opt?.title}`}
                              </div>
                              <div className="space-y-3.5 font-sans">
                                {Object.entries(opt!.knobs!).map(([key, def]: [string, any]) => {
                                  const val = modSpec.knobs?.[key] !== undefined ? modSpec.knobs[key] : def.default;
                                  return (
                                    <div key={key} className="space-y-1.5">
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="font-bold text-slate-600 dark:text-slate-400 font-mono">{key}</span>
                                        <span className="text-slate-500">{locale === "en" ? def.descriptionEn : def.description}</span>
                                      </div>
                                      {renderKnobInput(
                                        def,
                                        val,
                                        (newVal: any) => {
                                          const nextMods = gameplay.modifiers.map((m) => {
                                            if (m.id === modSpec.id) {
                                              return {
                                                ...m,
                                                knobs: {
                                                  ...(m.knobs || {}),
                                                  [key]: newVal
                                                }
                                              };
                                            }
                                            return m;
                                          });
                                          const nextGameplay = {
                                            ...gameplay,
                                            modifiers: nextMods,
                                            patchLevel: "L2" as const
                                          };
                                          onQueueGameplayPatch(node.id, nextGameplay, `Update modifier ${modSpec.id} knob: ${key} = ${newVal}`);
                                        }
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-900 p-4">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-300 mb-2">{copy.gameplay.patchPolicy}</h3>
          <div className="space-y-1 text-3xs text-slate-500 leading-5">
            <div>{copy.gameplay.policy1}</div>
            <div>{copy.gameplay.policy2}</div>
            <div>{copy.gameplay.policy3}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-900 p-4">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-300 mb-2">{copy.gameplay.latest}</h3>
          <div className="space-y-2">
            {[...(normalizedSpec.workbench?.revisions || [])].reverse().slice(0, 4).map((revision) => (
              <div key={revision.id} className="text-3xs text-slate-500 border border-slate-200 dark:border-slate-900 rounded p-2">
                <div className="font-mono text-slate-700 dark:text-slate-300">{revision.id}</div>
                <div>{revision.createdAt}</div>
                <div>build {revision.gateResults.build} · e2e {revision.gateResults.e2e}</div>
              </div>
            ))}
            {(!normalizedSpec.workbench?.revisions || normalizedSpec.workbench.revisions.length === 0) && (
              <div className="text-3xs text-slate-600 italic">{copy.gameplay.noRevision}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const LOCAL_COPY = {
  zh: {
    comboEditor: "玩法组合编辑器",
    mountedMechanics: "挂载机制 (Modifiers)",
    comboPreview: "组合结果预览",
    victoryConds: "胜利条件 (Victory)",
    failureConds: "失败条件 (Failure)",
    sysDeps: "物理内核系统依赖",
    runStatus: "仿真运行状态",
    patchSummary: "本次组合变更摘要",
    implemented: "已实现",
    designOnly: "仅设计",
    incompatible: "与当前基础玩法卡不兼容",
    conflictWith: (name: string) => `与挂载的“${name}”发生冲突`,
    previewTitle: "组合链路流程",
    dependenciesText: "所需核心系统",
    readyToRun: "就绪 (支持模拟器完整还原)",
    designOnlyWarning: "草案 (包含仅设计机制，模拟器将只运行基础玩法)",
    noModifier: "未选择挂载机制",
    requiresLabel: "依赖:",
    changesLabel: "改变领域:",
    knobsTitle: "配置参数 (Gameplay Knobs)",
    baseKnobs: "基础玩法参数"
  },
  en: {
    comboEditor: "Gameplay Combination Editor",
    mountedMechanics: "Mounted Modifiers",
    comboPreview: "Combination Preview",
    victoryConds: "Victory Conditions",
    failureConds: "Failure Conditions",
    sysDeps: "Engine System Dependencies",
    runStatus: "Emulator Readiness",
    patchSummary: "Combination Change Summary",
    implemented: "Implemented",
    designOnly: "Design Only",
    incompatible: "Incompatible with Base Card",
    conflictWith: (name: string) => `Conflicts with active ${name}`,
    previewTitle: "Combination Pipeline",
    dependenciesText: "Required Systems",
    readyToRun: "Ready (Fully supported in emulator)",
    designOnlyWarning: "Draft (Contains design-only modifiers, emulator will run base card only)",
    noModifier: "No modifiers active",
    requiresLabel: "Requires:",
    changesLabel: "Changes:",
    knobsTitle: "Gameplay Knobs",
    baseKnobs: "Base Gameplay Parameters"
  }
};

