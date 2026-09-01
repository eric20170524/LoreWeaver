import React from "react";
import { FileText, Gamepad2, PencilLine, Rocket, Sparkles } from "lucide-react";

export type CreatorStep = "idea" | "design" | "play" | "modify" | "publish";

interface CreatorJourneyBarProps {
  activeStep: CreatorStep;
  onStepChange: (step: CreatorStep) => void;
  locale: "zh" | "en";
  hasWorkspace: boolean;
  hasGameSpec: boolean;
}

export function CreatorJourneyBar({
  activeStep,
  onStepChange,
  locale,
  hasWorkspace,
  hasGameSpec
}: CreatorJourneyBarProps) {
  const steps = [
    {
      id: "idea" as const,
      label: locale === "zh" ? "创意" : "Idea",
      hint: locale === "zh" ? "描述你想做的游戏" : "Describe the game",
      icon: Sparkles,
      enabled: true
    },
    {
      id: "design" as const,
      label: locale === "zh" ? "设计" : "Design",
      hint: locale === "zh" ? "查看并调整方案" : "Review the design",
      icon: FileText,
      enabled: hasWorkspace && hasGameSpec
    },
    {
      id: "play" as const,
      label: locale === "zh" ? "试玩" : "Play",
      hint: locale === "zh" ? "立即运行可玩版本" : "Run the playable build",
      icon: Gamepad2,
      enabled: hasWorkspace && hasGameSpec
    },
    {
      id: "modify" as const,
      label: locale === "zh" ? "修改" : "Modify",
      hint: locale === "zh" ? "调整玩法与参数" : "Tune gameplay",
      icon: PencilLine,
      enabled: hasWorkspace && hasGameSpec
    },
    {
      id: "publish" as const,
      label: locale === "zh" ? "发布" : "Publish",
      hint: locale === "zh" ? "导出候选或认证版本" : "Export a release",
      icon: Rocket,
      enabled: hasWorkspace && hasGameSpec
    }
  ];

  return (
    <div className="grid grid-cols-5 gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70 p-1.5 shadow-sm">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = activeStep === step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => step.enabled && onStepChange(step.id)}
            disabled={!step.enabled}
            className={`relative flex min-w-0 flex-col items-center justify-center rounded-lg px-2 py-2.5 text-center transition ${
              active
                ? "bg-emerald-500 text-slate-950 shadow-sm"
                : step.enabled
                  ? "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  : "text-slate-300 dark:text-slate-700 cursor-not-allowed"
            }`}
            title={step.hint}
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-mono ${active ? "text-slate-900/70" : "text-slate-400"}`}>{index + 1}</span>
              <Icon className="h-4 w-4 shrink-0" />
            </div>
            <span className="mt-1 truncate text-xs font-bold">{step.label}</span>
            <span className={`mt-0.5 hidden max-w-full truncate text-[10px] lg:block ${active ? "text-slate-900/70" : "text-slate-400"}`}>
              {step.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
