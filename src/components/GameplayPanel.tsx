import React from "react";
import { Layers } from "lucide-react";
import { GameSpec, Locale, ManifestPatch, GameplayAssignment } from "../types";
import { UI_COPY } from "../utils/uiCopy";
import {
  GAMEPLAY_CARD_OPTIONS,
  ensureGameplayManifest,
  toggleModifier
} from "../utils/gameplayManifest";

interface GameplayPanelProps {
  gameSpec: GameSpec | null;
  locale: Locale;
  pendingPatch: ManifestPatch | null;
  setPendingPatch: (patch: ManifestPatch | null) => void;
  onApprovePendingPatch: () => Promise<void>;
  onQueueGameplayPatch: (nodeId: number, nextGameplay: GameplayAssignment, reason: string) => void;
}

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
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">{copy.gameplay.pendingPatch}</div>
              <div className="text-3xs font-mono text-slate-600 dark:text-slate-400">
                {pendingPatch.target} · {pendingPatch.patchLevel} · invalidates {pendingPatch.invalidates.join(", ")}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingPatch(null)}
                className="px-3 py-1.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-3xs font-bold cursor-pointer"
              >
                {copy.gameplay.discard}
              </button>
              <button
                onClick={onApprovePendingPatch}
                className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-3xs font-bold cursor-pointer"
              >
                {copy.gameplay.apply}
              </button>
            </div>
          </div>
          <pre className="bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 p-3 text-3xs text-slate-600 dark:text-slate-400 overflow-x-auto">
            {JSON.stringify({ before: pendingPatch.before, after: pendingPatch.after }, null, 2)}
          </pre>
        </div>
      )}

      <div className="space-y-3">
        {normalizedSpec.nodes.map((node) => {
          const gameplay = node.gameplay!;
          return (
            <div key={node.id} className="bg-white/90 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-900 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200">
                    {copy.gameplay.node} {node.id}: {node.title}
                  </h3>
                  <p className="text-3xs text-slate-500 mt-1 line-clamp-2">{node.intro}</p>
                </div>
                <div className="text-3xs font-mono text-slate-500 shrink-0">
                  {copy.gameplay.adapter} <span className="text-emerald-600 dark:text-emerald-400">{gameplay.adapter}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
                <label className="flex flex-col gap-1 text-3xs text-slate-500 uppercase font-mono">
                  {copy.gameplay.baseCard}
                  <select
                    value={gameplay.cardId}
                    onChange={(event) => {
                      const card = GAMEPLAY_CARD_OPTIONS.find((item) => item.id === event.target.value);
                      const nextGameplay: GameplayAssignment = {
                        ...gameplay,
                        cardId: event.target.value,
                        adapter: card?.adapter || gameplay.adapter,
                        patchLevel: "L2"
                      };
                      onQueueGameplayPatch(node.id, nextGameplay, `Change node ${node.id} base gameplay card`);
                    }}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-2 text-slate-800 dark:text-slate-200 normal-case focus:outline-none"
                  >
                    {baseGameplayOptions.map((card) => (
                      <option key={card.id} value={card.id}>
                        {locale === "en" ? card.titleEn || card.title : card.title}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap gap-2">
                  {modifierOptions.map((modifier) => {
                    const checked = gameplay.modifiers.some((item) => item.id === modifier.id);
                    const isImplemented = ["hazard_telegraph", "defend_core"].includes(modifier.id);
                    const titleSuffix = isImplemented ? "" : (locale === "en" ? " (Design-only)" : " (仅设计)");
                    return (
                      <label
                        key={modifier.id}
                        className={`px-2.5 py-1.5 rounded border text-3xs select-none ${
                          !isImplemented
                            ? "border-slate-100 dark:border-slate-900 bg-slate-100/30 dark:bg-slate-950/20 text-slate-400 dark:text-slate-650 cursor-not-allowed opacity-60"
                            : checked
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 cursor-pointer"
                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-500 cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!isImplemented}
                          onChange={() => {
                            if (!isImplemented) return;
                            const nextGameplay: GameplayAssignment = {
                              ...gameplay,
                              modifiers: toggleModifier(gameplay.modifiers, modifier.id),
                              patchLevel: "L2"
                            };
                            onQueueGameplayPatch(node.id, nextGameplay, `Toggle ${modifier.id} modifier`);
                          }}
                          className="mr-1.5 align-middle cursor-pointer"
                        />
                        {(locale === "en" ? modifier.titleEn || modifier.title : modifier.title) + titleSuffix}
                      </label>
                    );
                  })}
                </div>
              </div>
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
