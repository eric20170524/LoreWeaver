import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  Boxes,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  ShieldCheck
} from "lucide-react";
import blueprintCatalog from "../../minigame_master/capabilities/blueprints/catalog.json";
import contractCatalog from "../../minigame_master/capabilities/contracts/catalog.json";
import survivorHorde from "../../minigame_master/gameplay/cards/survivor_horde.json";
import hazardTelegraph from "../../minigame_master/gameplay/cards/modifiers/hazard_telegraph.json";
import defendCore from "../../minigame_master/gameplay/cards/modifiers/defend_core.json";
import bossPhases from "../../minigame_master/gameplay/cards/modifiers/boss_phases.json";
import laserWarning from "../../minigame_master/gameplay/cards/modifiers/laser_warning.json";
import { Locale } from "../types";

type CatalogEntry = {
  id: string;
  title: string;
  status: string;
  summary?: string;
  missingCapabilities?: string[];
  source?: { license?: string; adaptation?: string };
};

type ModuleSource = {
  id: string;
  title?: string;
  status?: string;
  exportPolicy?: { productionReady?: boolean };
  compatibleBaseCards?: string[];
  modifierFor?: string[];
  runtime?: { adapter?: string };
};

function StatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const verified = ["runtime_verified", "verified", "promoted"].includes(status);
  const supported = status === "runtime_supported";
  const candidate = status === "alignment_candidate" || status === "planned";
  const label = verified
    ? (zh ? "已验证" : "Verified")
    : supported
      ? (zh ? "可运行" : "Supported")
      : candidate
        ? (zh ? "待补能力" : "Planned")
        : status;
  const className = verified
    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
    : supported
      ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300"
      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
  return <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono ${className}`}>{label}</span>;
}

function CapabilityEntry({ entry, zh }: { entry: CatalogEntry; zh: boolean }) {
  const missing = entry.missingCapabilities || [];
  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{entry.title}</div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">{entry.id}</div>
        </div>
        <StatusBadge status={entry.status} zh={zh} />
      </div>
      {entry.summary && <p className="mt-2 text-[10px] leading-4 text-slate-500">{entry.summary}</p>}
      {missing.length > 0 && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-2 py-1.5 text-[9px] leading-4 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {zh ? "缺失" : "Missing"}: {missing.slice(0, 3).join(" · ")}{missing.length > 3 ? ` +${missing.length - 3}` : ""}
        </div>
      )}
    </div>
  );
}

export function CapabilityLibrarySummary({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const [open, setOpen] = useState(false);
  const blueprints = (blueprintCatalog.entries || []) as CatalogEntry[];
  const contracts = (contractCatalog.entries || []) as CatalogEntry[];
  const modules = useMemo(
    () => [
      { kind: "Gameplay Card", source: survivorHorde as ModuleSource },
      { kind: "Modifier", source: hazardTelegraph as ModuleSource },
      { kind: "Modifier", source: defendCore as ModuleSource },
      { kind: "Modifier", source: bossPhases as ModuleSource },
      { kind: "Modifier", source: laserWarning as ModuleSource }
    ],
    []
  );
  const verifiedBlueprints = blueprints.filter((entry) => ["runtime_supported", "runtime_verified", "promoted"].includes(entry.status));
  const alignmentCandidates = blueprints.filter((entry) => entry.status === "alignment_candidate");
  const verifiedContracts = contracts.filter((entry) => ["runtime_supported", "verified", "promoted"].includes(entry.status));

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm dark:border-indigo-900/60 dark:bg-indigo-950/15">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {zh ? "能力库 · VibeGame 对齐" : "Capability Library · VibeGame alignment"}
            </div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              {zh
                ? "骨架已映射为 Blueprint，模块复用现有 Card/Modifier，生产方法沉淀为 Contract。"
                : "Skeletons map to Blueprints, modules reuse Cards/Modifiers, and production methods become Contracts."}
            </p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-indigo-200 bg-white/70 px-2 py-2 dark:border-indigo-900 dark:bg-slate-950/30">
          <div className="text-sm font-black text-indigo-600 dark:text-indigo-300">{verifiedBlueprints.length}</div>
          <div className="text-[9px] text-slate-500">Blueprint</div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-white/70 px-2 py-2 dark:border-indigo-900 dark:bg-slate-950/30">
          <div className="text-sm font-black text-indigo-600 dark:text-indigo-300">{modules.length}</div>
          <div className="text-[9px] text-slate-500">Module</div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-white/70 px-2 py-2 dark:border-indigo-900 dark:bg-slate-950/30">
          <div className="text-sm font-black text-indigo-600 dark:text-indigo-300">{verifiedContracts.length}</div>
          <div className="text-[9px] text-slate-500">Contract</div>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-indigo-200 pt-4 dark:border-indigo-900/60">
          <section>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono font-bold uppercase text-slate-500">
              <Boxes className="h-3.5 w-3.5" />
              {zh ? "Blueprint / 可运行骨架" : "Blueprint / runnable skeleton"}
            </div>
            <div className="space-y-2">
              {verifiedBlueprints.map((entry) => <CapabilityEntry key={entry.id} entry={entry} zh={zh} />)}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono font-bold uppercase text-slate-500">
              <Boxes className="h-3.5 w-3.5" />
              {zh ? "Capability Module / 现有执行能力" : "Capability Module / existing runtime capability"}
            </div>
            <div className="space-y-2">
              {modules.map(({ kind, source }) => (
                <div key={source.id} className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{source.title || source.id}</div>
                      <div className="mt-0.5 font-mono text-[9px] text-slate-400">{kind} · {source.id}</div>
                    </div>
                    <StatusBadge status={source.status || "experimental"} zh={zh} />
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-slate-500">
                    {kind === "Gameplay Card"
                      ? `${zh ? "唯一运行时" : "Runtime authority"}: LoreWeaverRuntimeKernel · ${source.runtime?.adapter || "adapter"}`
                      : `${zh ? "兼容" : "Compatible"}: ${(source.compatibleBaseCards || source.modifierFor || []).join(", ")}`}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono font-bold uppercase text-slate-500">
              <FileCheck2 className="h-3.5 w-3.5" />
              {zh ? "Production Contract / 跨角色合同" : "Production Contract / cross-role contract"}
            </div>
            <div className="space-y-2">
              {contracts.map((entry) => <CapabilityEntry key={entry.id} entry={entry} zh={zh} />)}
            </div>
          </section>

          <section>
            <div className="mb-2 text-[10px] font-mono font-bold uppercase text-slate-500">
              {zh ? "VibeGame 类型对齐候选" : "VibeGame subtype candidates"}
            </div>
            <div className="space-y-2">
              {alignmentCandidates.map((entry) => <CapabilityEntry key={entry.id} entry={entry} zh={zh} />)}
            </div>
          </section>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[10px] leading-4 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
            {zh
              ? "边界：唯一 RuntimeKernel；Blueprint 不嵌入脚本；L3/L4 只能人工审查；alignment_candidate 不代表已支持。"
              : "Boundary: one RuntimeKernel; no scripts in Blueprints; L3/L4 require human review; alignment_candidate is not a support claim."}
          </div>
        </div>
      )}
    </div>
  );
}