import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sliders } from "lucide-react";
import { motion } from "motion/react";
import { Locale } from "../types";
import {
  DepartmentDeskPayload,
  DepartmentStatus,
  fetchDepartmentDesk,
  statusLabel
} from "../utils/departmentPrep";

/** Canonical pipeline steps shown in the left rail (1.1–3.3). */
export const PIPELINE_STEPS = [
  {
    id: "1.1",
    nameZh: "DNA 萃取 (1.1)",
    nameEn: "DNA & Economy (1.1)",
    descZh: "世界观 / 经济 / 境界 — 对应部门：世界观组",
    descEn: "World DNA — World dept"
  },
  {
    id: "1.2",
    nameZh: "大纲规划 (1.2)",
    nameEn: "Outline (1.2)",
    descZh: "节点叙事与玩法映射 — 叙事组 · 玩法组",
    descEn: "Nodes & cards — Narrative · Gameplay"
  },
  {
    id: "2.1",
    nameZh: "宿主架设 (2.1)",
    nameEn: "Host shell (2.1)",
    descZh: "720×1280 / shell — 架构组",
    descEn: "Shell contract — Architecture"
  },
  {
    id: "2.2",
    nameZh: "状态注入 (2.2)",
    nameEn: "State registry (2.2)",
    descZh: "store / registry — 架构组 · 能力组",
    descEn: "Registry — Architecture · Ability"
  },
  {
    id: "2.3",
    nameZh: "特性包 (2.3)",
    nameEn: "Feature pack (2.3)",
    descZh: "RFP / catalogs — 架构 · 玩法 · 能力",
    descEn: "RFP catalogs — Arch · Gameplay · Ability"
  },
  {
    id: "3.1",
    nameZh: "物理编译 (3.1)",
    nameEn: "Mechanics (3.1)",
    descZh: "Adapter / 节点实现 — 代码组 · 玩法组",
    descEn: "Adapters — Code · Gameplay"
  },
  {
    id: "3.2",
    nameZh: "视听强化 (3.2)",
    nameEn: "Art & Audio (3.2)",
    descZh: "美术 / 音频接线 — 美术组 · 音频组 · 代码组",
    descEn: "Art/Audio wiring — Art · Audio · Code"
  },
  {
    id: "3.3",
    nameZh: "多模审计 (3.3)",
    nameEn: "QA (3.3)",
    descZh: "Gate / VLM / 合规 — 质检组 · 合规组",
    descEn: "Gates & compliance — QA · Compliance"
  }
] as const;

type StepTone = "idle" | "active" | "ready" | "done" | "blocked";

function aggregateStepTone(statuses: DepartmentStatus[]): StepTone {
  if (!statuses.length) return "idle";
  if (statuses.some((s) => s === "blocked")) return "blocked";
  if (statuses.every((s) => s === "confirmed")) return "done";
  if (statuses.some((s) => s === "ready_for_review" || s === "drafting" || s === "stale"))
    return "ready";
  if (statuses.some((s) => s === "confirmed")) return "active";
  return "idle";
}

interface PipelinePanelProps {
  locale: Locale;
  workspaceId: string | null;
  /** Cold-start job (optional) */
  currentJob?: { status?: string; stage_index?: number; progress?: string } | null;
  isOrchestrating?: boolean;
  copy: {
    pipelineTitle: string;
    pipelineBadge: string;
    progressLabel: string;
    compiling?: string;
    coldStartHint?: string;
  };
  onOpenDepartments?: () => void;
  /** Bump to refetch desk (e.g. after auto-prep) */
  refreshKey?: number;
}

export function PipelinePanel({
  locale,
  workspaceId,
  currentJob,
  isOrchestrating,
  copy,
  onOpenDepartments,
  refreshKey = 0
}: PipelinePanelProps) {
  const zh = locale === "zh";
  const [desk, setDesk] = useState<DepartmentDeskPayload | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setDesk(null);
      return;
    }
    try {
      const data = await fetchDepartmentDesk(workspaceId);
      setDesk(data);
    } catch {
      /* keep previous */
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const stepBindings = useMemo(() => {
    const map: Record<string, { deptIds: string[]; titles: string[]; statuses: DepartmentStatus[] }> =
      {};
    for (const step of PIPELINE_STEPS) {
      map[step.id] = { deptIds: [], titles: [], statuses: [] };
    }
    if (!desk) return map;
    for (const m of desk.registry.departments) {
      if (m.id === "director") continue;
      const steps = m.pipelineSteps || [];
      const st = (desk.state.departments?.[m.id]?.status || "idle") as DepartmentStatus;
      for (const sid of steps) {
        if (!map[sid]) map[sid] = { deptIds: [], titles: [], statuses: [] };
        map[sid].deptIds.push(m.id);
        map[sid].titles.push(zh ? m.title : m.titleEn || m.title);
        map[sid].statuses.push(st);
      }
    }
    return map;
  }, [desk, zh]);

  const confirmed = desk?.state.confirmedCount ?? 0;
  const required = desk?.state.requiredCount ?? 0;
  const stageId = desk?.state.stageId || "production_prep";
  const stageTitle =
    desk?.registry.stages?.find((s) => s.id === stageId)?.[zh ? "title" : "titleEn"] ||
    stageId;

  const coldRunning =
    Boolean(isOrchestrating) ||
    currentJob?.status === "running" ||
    currentJob?.status === "pending_approval";

  const coldPct = currentJob
    ? Math.min(100, Math.max(0, ((currentJob.stage_index ?? 0) + 1) * (100 / 7)))
    : 0;

  const prepPct = required > 0 ? Math.round((confirmed / required) * 100) : 0;

  return (
    <div className="bg-white/90 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-900/90 flex flex-col gap-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          {copy.pipelineTitle}
        </h3>
        <span className="text-3xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full shrink-0">
          {copy.pipelineBadge}
        </span>
      </div>

      {/* Production stage strip */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 px-3 py-2">
        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">
          {zh ? "制作阶段" : "Production stage"}
        </div>
        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
          {stageTitle}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>
            {zh ? "部门确认" : "Dept confirmed"}{" "}
            <strong className="text-emerald-500">
              {confirmed}/{required || "—"}
            </strong>
          </span>
          <span>{prepPct}%</span>
        </div>
        <div className="mt-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${prepPct}%` }}
          />
        </div>
        {onOpenDepartments && (
          <button
            type="button"
            onClick={onOpenDepartments}
            className="mt-2 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
          >
            {zh ? "打开部门筹备台 →" : "Open prep desk →"}
          </button>
        )}
      </div>

      {/* Cold-start job strip */}
      {(coldRunning || currentJob) && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
          <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
            {zh ? "冷启动 / 生成蓝图" : "Cold start"}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
            {currentJob?.progress ||
              (zh ? "顶栏「生成蓝图」整包重建 GDD" : "Header rebuilds full GDD")}
          </div>
          <div className="mt-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <motion.div
              className="h-full bg-amber-500"
              initial={false}
              animate={{ width: `${coldPct}%` }}
            />
          </div>
          <div className="text-[9px] font-mono text-slate-500 mt-1 uppercase">
            {currentJob?.status || "—"}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed">
        {copy.coldStartHint ||
          (zh
            ? "步骤亮灯来自部门确认状态（制作主路径）。整包重建请用顶栏冷启动。"
            : "Step lights follow department confirmations. Use header cold-start to rebuild.")}
      </p>

      {/* 1.1–3.3 mapped to departments */}
      <div className="flex flex-col gap-2 relative">
        <div className="absolute left-[9px] top-[12px] bottom-[12px] w-0.5 bg-slate-200 dark:bg-slate-950" />
        {PIPELINE_STEPS.map((step, idx) => {
          const bind = stepBindings[step.id];
          const tone = aggregateStepTone(bind?.statuses || []);
          let dotClass =
            "border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-400";
          let titleClass = "text-slate-500";
          if (tone === "done") {
            dotClass =
              "border-emerald-500/70 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400";
            titleClass = "text-slate-700 dark:text-slate-200 font-semibold";
          } else if (tone === "ready") {
            dotClass =
              "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/15";
            titleClass = "text-amber-700 dark:text-amber-300 font-bold";
          } else if (tone === "active") {
            dotClass =
              "border-cyan-500 bg-cyan-50 dark:bg-cyan-950 text-cyan-600 ring-2 ring-cyan-500/15";
            titleClass = "text-cyan-700 dark:text-cyan-300 font-semibold";
          } else if (tone === "blocked") {
            dotClass =
              "border-rose-500 bg-rose-50 dark:bg-rose-950 text-rose-600";
            titleClass = "text-rose-600 font-semibold";
          } else if (coldRunning && (currentJob?.stage_index ?? -1) === idx) {
            dotClass =
              "border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 ring-4 ring-emerald-500/15 animate-pulse";
            titleClass = "text-emerald-600 dark:text-emerald-400 font-bold";
          }

          const name = zh ? step.nameZh : step.nameEn;
          const desc = zh ? step.descZh : step.descEn;
          const showDetail = tone !== "idle" || (coldRunning && (currentJob?.stage_index ?? -1) === idx);

          return (
            <div key={step.id} className="flex gap-2.5 items-start relative z-[1]">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold shrink-0 ${dotClass}`}
              >
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className={`text-[11px] font-display flex items-center justify-between gap-1 ${titleClass}`}>
                  <span className="truncate">{name}</span>
                  {tone === "done" && (
                    <span className="text-[9px] font-mono text-emerald-600 shrink-0">
                      {zh ? "部门齐" : "OK"}
                    </span>
                  )}
                  {tone === "ready" && (
                    <span className="text-[9px] font-mono text-amber-600 shrink-0">
                      {zh ? "待确认" : "Review"}
                    </span>
                  )}
                </div>
                {showDetail && (
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{desc}</p>
                )}
                {!!bind?.deptIds.length && tone !== "idle" && (
                  <p className="text-[9px] font-mono text-slate-400 mt-0.5 truncate">
                    {bind.titles
                      .map((t, i) => `${t}:${statusLabel(bind.statuses[i], zh ? "zh" : "en")}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
