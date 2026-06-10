import React, { useState, useEffect } from "react";
import { X, Save, Pencil } from "lucide-react";
import { GameSpec, Locale } from "../types";
import { synth } from "../utils/AudioSynth";
import { UI_COPY } from "../utils/uiCopy";
import { ensureGameplayManifest } from "../utils/gameplayManifest";

interface PrdPanelProps {
  gameSpec: GameSpec | null;
  locale: Locale;
  onSaveSpec: (newSpec: GameSpec) => Promise<void>;
  addLog: (text: string) => void;
}

const cloneGameSpec = (spec: GameSpec): GameSpec => JSON.parse(JSON.stringify(spec)) as GameSpec;

const formInputClass = "w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500";
const formTextareaClass = "w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[74px] resize-y";

export function PrdPanel({ gameSpec, locale, onSaveSpec, addLog }: PrdPanelProps) {
  const [isPrdEditing, setIsPrdEditing] = useState(false);
  const [prdDraft, setPrdDraft] = useState<GameSpec | null>(null);
  
  const copy = UI_COPY[locale];

  useEffect(() => {
    if (!isPrdEditing) {
      setPrdDraft(gameSpec ? cloneGameSpec(gameSpec) : null);
    }
  }, [gameSpec, isPrdEditing]);

  const startPrdEditing = () => {
    if (!gameSpec) return;
    setPrdDraft(cloneGameSpec(gameSpec));
    setIsPrdEditing(true);
    synth.playClick();
  };

  const cancelPrdEditing = () => {
    setPrdDraft(gameSpec ? cloneGameSpec(gameSpec) : null);
    setIsPrdEditing(false);
    synth.playClick();
  };

  const updatePrdDraft = (mutate: (draft: GameSpec) => void) => {
    setPrdDraft((prev) => {
      if (!prev) return prev;
      const next = cloneGameSpec(prev);
      mutate(next);
      return ensureGameplayManifest(next);
    });
  };

  const savePrdDraft = async () => {
    if (!prdDraft) return;
    const nextSpec = ensureGameplayManifest(prdDraft);
    setIsPrdEditing(false);
    await onSaveSpec(nextSpec);
    synth.playNodeSuccess();
  };

  const formatLevelLabel = (nodeId: number) => (
    locale === "zh"
      ? `${copy.prd.levelPrefix} ${nodeId} ${copy.prd.levelSuffix}`
      : `${copy.prd.levelPrefix} ${nodeId}`
  );

  const prdSpec = isPrdEditing && prdDraft ? prdDraft : gameSpec;

  if (!prdSpec) {
    return (
      <div className="text-slate-500 italic py-12 text-center text-xs">
        {copy.prd.empty}
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-900 p-6 space-y-6 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
      
      {/* Document header banner */}
      <div className="border-b border-rose-500/20 pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400 font-mono text-xs font-bold uppercase">
            {copy.prd.badge}
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-200">
              {copy.prd.file}
            </h2>
            <p className="text-xs text-slate-500">
              {copy.prd.desc}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPrdEditing ? (
            <>
              <button
                onClick={cancelPrdEditing}
                className="px-3 py-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-3xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {copy.prd.discard}
              </button>
              <button
                onClick={savePrdDraft}
                className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-3xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {copy.prd.save}
              </button>
            </>
          ) : (
            <button
              onClick={startPrdEditing}
              className="px-3 py-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-300 text-3xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              {copy.prd.edit}
            </button>
          )}
        </div>
      </div>

      {/* Decoded structured view of docs_PRD specification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-6 text-sm">
        <div className="space-y-4">
          <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
            {copy.prd.overview}
          </h4>
          <div className="bg-white dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-900/80 space-y-3">
            {isPrdEditing ? (
              <>
                <label className="block text-3xs text-slate-500 font-mono uppercase">
                  {copy.prd.title}
                  <input
                    value={prdSpec.title}
                    onChange={(event) => updatePrdDraft((draft) => { draft.title = event.target.value; })}
                    className={`${formInputClass} mt-1`}
                  />
                </label>
                <label className="block text-3xs text-slate-500 font-mono uppercase">
                  {copy.prd.currency}
                  <input
                    value={prdSpec.economy.currencyName}
                    onChange={(event) => updatePrdDraft((draft) => { draft.economy.currencyName = event.target.value; })}
                    className={`${formInputClass} mt-1`}
                  />
                </label>
                <label className="block text-3xs text-slate-500 font-mono uppercase">
                  {copy.prd.themeColor}
                  <div className="mt-1 flex gap-2">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(prdSpec.themeColor) ? prdSpec.themeColor : "#10b981"}
                      onChange={(event) => updatePrdDraft((draft) => { draft.themeColor = event.target.value; })}
                      className="h-9 w-12 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    />
                    <input
                      value={prdSpec.themeColor}
                      onChange={(event) => updatePrdDraft((draft) => { draft.themeColor = event.target.value; })}
                      className={formInputClass}
                    />
                  </div>
                </label>
                <div className="space-y-2">
                  <div className="text-3xs text-slate-500 font-mono uppercase">{copy.prd.resources}</div>
                  {prdSpec.economy.resources.map((resource, rid) => (
                    <input
                      key={rid}
                      value={resource}
                      onChange={(event) => updatePrdDraft((draft) => { draft.economy.resources[rid] = event.target.value; })}
                      placeholder={`${copy.prd.resource} ${rid + 1}`}
                      className={formInputClass}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400">{copy.prd.title}: <strong className="text-slate-900 dark:text-slate-200">{prdSpec.title}</strong></p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{copy.prd.currency}: <strong className="text-slate-900 dark:text-slate-200">{prdSpec.economy.currencyName}</strong></p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{copy.prd.themeColor}: <span className="inline-block w-3 h-3 rounded-full align-middle ml-1" style={{ backgroundColor: prdSpec.themeColor }} /> <code className="text-slate-900 dark:text-slate-200 ml-1">{prdSpec.themeColor}</code></p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{copy.prd.resources}: <strong className="text-slate-900 dark:text-slate-200">{prdSpec.economy.resources.join(" / ")}</strong></p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
            {copy.prd.realms}
          </h4>
          <div className="bg-white dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-900/80">
            {isPrdEditing ? (
              <div className="space-y-2">
                {prdSpec.economy.realms.map((realm, rid) => (
                  <label key={rid} className="grid grid-cols-[72px_1fr] items-center gap-2 text-xs">
                    <span className="text-slate-500 font-mono">{copy.prd.realm} {rid + 1}</span>
                    <input
                      value={realm}
                      onChange={(event) => updatePrdDraft((draft) => { draft.economy.realms[rid] = event.target.value; })}
                      className={formInputClass}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <ul className="space-y-1 text-xs">
                {prdSpec.economy.realms.map((realm, rid) => (
                  <li key={rid} className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono">{copy.prd.realm} {rid + 1}:</span>
                    <span className="text-slate-900 dark:text-slate-200 font-medium">{realm}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
          {copy.prd.nodes}
        </h4>
        <div className="space-y-3">
          {prdSpec.nodes.map((node) => {
            const mechanicsLabels: { [key: string]: string } = {
              tap_reaction: `⚡ ${copy.mechanics.tap_reaction}`,
              collect_dodge: `🍃 ${copy.mechanics.collect_dodge}`,
              memory_sequence: `🔮 ${copy.mechanics.memory_sequence}`
            };
            return (
              <div key={node.id} className="bg-white/90 dark:bg-slate-950/80 p-4 rounded-lg border border-slate-200 dark:border-slate-900 text-xs flex flex-col gap-4">
                {isPrdEditing ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                        {copy.prd.nodeTitle}
                        <input
                          value={node.title}
                          onChange={(event) => updatePrdDraft((draft) => {
                            const target = draft.nodes.find((item) => item.id === node.id);
                            if (target) target.title = event.target.value;
                          })}
                          className={`${formInputClass} mt-1`}
                        />
                      </label>
                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                        {copy.prd.mechanics}
                        <select
                          value={node.mechanics}
                          onChange={(event) => updatePrdDraft((draft) => {
                            const target = draft.nodes.find((item) => item.id === node.id);
                            if (target) target.mechanics = event.target.value as any;
                          })}
                          className={`${formInputClass} mt-1`}
                        >
                          <option value="tap_reaction">{copy.mechanics.tap_reaction}</option>
                          <option value="collect_dodge">{copy.mechanics.collect_dodge}</option>
                          <option value="memory_sequence">{copy.mechanics.memory_sequence}</option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-3xs text-slate-500 font-mono uppercase">
                      {copy.prd.intro}
                      <textarea
                        value={node.intro}
                        onChange={(event) => updatePrdDraft((draft) => {
                          const target = draft.nodes.find((item) => item.id === node.id);
                          if (target) target.intro = event.target.value;
                        })}
                        className={`${formTextareaClass} mt-1`}
                      />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                        {copy.prd.goal}
                        <input
                          type="number"
                          min={1}
                          value={node.goalValue}
                          onChange={(event) => updatePrdDraft((draft) => {
                            const target = draft.nodes.find((item) => item.id === node.id);
                            if (target) target.goalValue = Number(event.target.value) || 1;
                          })}
                          className={`${formInputClass} mt-1`}
                        />
                      </label>
                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                        {copy.prd.reward}
                        <input
                          value={node.rewards}
                          onChange={(event) => updatePrdDraft((draft) => {
                            const target = draft.nodes.find((item) => item.id === node.id);
                            if (target) target.rewards = event.target.value;
                          })}
                          className={`${formInputClass} mt-1`}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <h5 className="font-semibold text-slate-900 dark:text-slate-200">
                        {formatLevelLabel(node.id)}: {node.title}
                      </h5>
                      <p className="text-slate-600 dark:text-slate-400 pr-4 leading-relaxed">{node.intro}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 shrink-0 text-left md:text-right border-t md:border-t-0 border-slate-200 dark:border-slate-900 pt-2 md:pt-0 max-w-xs w-full md:w-auto">
                      <span className="text-slate-500">{copy.prd.mechanics}:</span>
                      <span className="text-emerald-400 font-semibold">{mechanicsLabels[node.mechanics] || node.mechanics}</span>
                      <span className="text-slate-500">{copy.prd.goal}:</span>
                      <span className="text-slate-900 dark:text-slate-200">{node.goalValue}</span>
                      <span className="text-slate-500">{copy.prd.reward}:</span>
                      <span className="text-amber-500 font-medium">{node.rewards}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
