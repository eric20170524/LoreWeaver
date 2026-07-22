export type DepartmentStatus =
  | "idle"
  | "drafting"
  | "ready_for_review"
  | "confirmed"
  | "blocked"
  | "stale";

export type HandoffType = "request" | "ack" | "reject" | "escalate";

export interface DepartmentMeta {
  id: string;
  title: string;
  titleEn?: string;
  avatar?: string;
  group?: string;
  legacyAgentIds?: string[];
  /** Maps to AgentChatPanel selectedAgent id */
  chatAgentId?: string;
  pipelineSteps?: string[];
  owns?: string[];
  defaultPatchLevels?: string[];
  dependsOn?: string[];
  systemPromptRole?: string;
  uiTabs?: string[];
}

export interface DepartmentRuntimeState {
  id: string;
  status: DepartmentStatus;
  version: number;
  qaScore: number | null;
  prepNotes: string;
  artifacts: string[];
  openHandoffCount: number;
  updatedAt?: string | null;
  confirmedAt?: string | null;
}

export interface DepartmentDeskState {
  schemaVersion: string;
  unitId: string;
  unitType?: string;
  stageId: string;
  departments: Record<string, DepartmentRuntimeState>;
  requiredDepartmentIds: string[];
  confirmedCount: number;
  requiredCount: number;
  updatedAt?: string;
}

export interface DepartmentHandoff {
  id: string;
  from: string;
  to: string;
  unitId?: string;
  type: HandoffType;
  summary: string;
  payloadRef?: string;
  needs?: string[];
  blockers?: string[];
  patchLevelMax?: string;
  createdAt: string;
  status: "open" | "resolved" | "wontfix";
  resolvedAt?: string;
  resolveNote?: string;
}

export interface DepartmentRegistry {
  schemaVersion: string;
  title?: string;
  stages?: Array<{ id: string; title: string; titleEn?: string }>;
  departments: DepartmentMeta[];
  autoPrepPolicy?: {
    defaultStopAt?: string;
    requireHumanConfirm?: boolean;
    minQaScoreToReady?: number;
  };
}

export interface DepartmentDeskPayload {
  registry: DepartmentRegistry;
  state: DepartmentDeskState;
  handoffs: DepartmentHandoff[];
}

const API_BASE = "";

export async function fetchDepartmentDesk(workspaceId: string): Promise<DepartmentDeskPayload> {
  const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data as DepartmentDeskPayload;
}

export async function confirmDepartment(
  workspaceId: string,
  deptId: string,
  body: {
    prepNotes?: string;
    qaScore?: number;
    reprepDownstream?: boolean;
    applyPatches?: boolean;
  } = {}
): Promise<{
  state: DepartmentDeskState;
  staleDownstream?: string[];
  reprepLog?: AutoPrepResult["runLog"];
  reprepPatches?: AutoPrepResult["patchesApplied"];
  patchesSaved?: boolean;
}> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/${encodeURIComponent(deptId)}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reprepDownstream: true, applyPatches: true, ...body })
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return {
    state: json.data as DepartmentDeskState,
    staleDownstream: json.staleDownstream || [],
    reprepLog: json.reprepLog || [],
    reprepPatches: json.reprepPatches || [],
    patchesSaved: json.patchesSaved
  };
}

/** Human labels for AgentChatPanel roles */
export const CHAT_AGENT_LABELS: Record<string, { zh: string; en: string }> = {
  world_builder: { zh: "世界编制官", en: "World Builder" },
  narrative: { zh: "剧本大纲师", en: "Narrative" },
  sandbox: { zh: "沙盒架构师", en: "Sandbox" },
  code_foundry: { zh: "代码铸造厂", en: "Code Foundry" },
  auditor: { zh: "多模审计官", en: "Auditor" }
};

export async function fetchAdvanceGate(workspaceId: string): Promise<AdvanceGate> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/gate`
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data as AdvanceGate;
}

export async function advanceDepartmentStage(
  workspaceId: string,
  body: { stageId?: string; force?: boolean; runNodeSmoke?: boolean } = {}
): Promise<{ state: DepartmentDeskState; gate: AdvanceGate; message?: string }> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/advance-stage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const err = JSON.parse(text);
      throw new Error(JSON.stringify(err.detail || err));
    } catch (e: any) {
      if (e?.message?.startsWith("{")) throw e;
      throw new Error(text);
    }
  }
  const json = await res.json();
  return json.data as { state: DepartmentDeskState; gate: AdvanceGate };
}

export async function setDepartmentStatus(
  workspaceId: string,
  deptId: string,
  body: { status: DepartmentStatus; prepNotes?: string; qaScore?: number }
): Promise<DepartmentDeskState> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/${encodeURIComponent(deptId)}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data as DepartmentDeskState;
}

export async function createHandoff(
  workspaceId: string,
  handoff: Partial<DepartmentHandoff> & { from: string; to: string; summary: string }
): Promise<DepartmentHandoff> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/handoffs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(handoff)
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data as DepartmentHandoff;
}

export async function resolveHandoff(
  workspaceId: string,
  handoffId: string,
  body: { status?: string; note?: string } = {}
): Promise<DepartmentHandoff> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/handoffs/${encodeURIComponent(handoffId)}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data as DepartmentHandoff;
}

/** Canonical production stage chain (advance buttons). beat_board removed. */
export const STAGE_CHAIN = [
  "import_source",
  "production_prep",
  "asset_confirm",
  "runtime_stage"
] as const;

export type ProductionStageId = (typeof STAGE_CHAIN)[number] | string;
export type AdvanceTargetStage = "asset_confirm" | "runtime_stage";

export interface StageTransitionGate {
  allowed: boolean;
  blockers: string[];
  warnings?: string[];
  alreadyAtTarget?: boolean;
  targetStageId?: string;
  fromStageId?: string;
  openRejects?: number;
  qaScore?: number | null;
}

export interface AdvanceGate {
  allowed: boolean;
  blockers: string[];
  warnings?: string[];
  confirmedCount?: number;
  requiredCount?: number;
  qaScore?: number | null;
  nextStageId?: string | null;
  minQa?: number;
  openRejects?: number;
  /** Current desk stageId from server */
  stageId?: string;
  /** True when at terminal stage (runtime_stage) */
  alreadyAtTarget?: boolean;
  alreadyAdvanced?: boolean;
  terminal?: boolean;
  /** Whether the immediate next-stage advance is allowed */
  allowedForAdvance?: boolean;
  /** Per-target transition gates for multi-button UI */
  transitions?: Partial<Record<AdvanceTargetStage, StageTransitionGate>>;
  stageChain?: string[];
}

export const STAGE_ADVANCE_BUTTONS: Array<{
  target: AdvanceTargetStage;
  labelZh: string;
  labelEn: string;
  doneZh: string;
  doneEn: string;
  hintZh: string;
  hintEn: string;
}> = [
  {
    target: "asset_confirm",
    labelZh: "进入资产确认",
    labelEn: "Asset Confirm",
    doneZh: "已在资产确认",
    doneEn: "At Asset Confirm",
    hintZh: "部门确认 + node smoke + 门禁",
    hintEn: "Dept confirms + node smoke"
  },
  {
    target: "runtime_stage",
    labelZh: "运行就绪验证",
    labelEn: "Verify Runtime Ready",
    doneZh: "已在运行就绪",
    doneEn: "At Runtime Ready",
    hintZh: "通过可玩合同/smoke/构建测试，右上角【导出】即可解锁可用",
    hintEn: "Pass playability/smoke/build tests, enabling Export in top-right"
  }
];

const STAGE_ORDER: string[] = [
  "import_source",
  "production_prep",
  "asset_confirm",
  "runtime_stage"
];

const STAGE_ALIASES: Record<string, string> = {
  // Removed ceremony stage — same position as asset_confirm
  beat_board: "asset_confirm",
  build: "runtime_stage",
  export: "runtime_stage",
  shipped: "runtime_stage",
  done: "runtime_stage"
};

export function normalizeStageId(stageId?: string | null): string {
  const sid = (stageId || "production_prep").trim() || "production_prep";
  return STAGE_ALIASES[sid] || sid;
}

export function stageIndex(stageId?: string | null): number {
  const sid = normalizeStageId(stageId);
  const i = STAGE_ORDER.indexOf(sid);
  return i >= 0 ? i : STAGE_ORDER.indexOf("production_prep");
}

/** Button UI mode for a target stage */
export function stageButtonMode(
  currentStageId: string | undefined,
  target: AdvanceTargetStage,
  transition?: StageTransitionGate | null
): "done" | "ready" | "blocked" | "locked" {
  const cur = stageIndex(currentStageId);
  const tgt = stageIndex(target);
  if (cur >= tgt || transition?.alreadyAtTarget) return "done";
  if (cur === tgt - 1) {
    return transition?.allowed ? "ready" : "blocked";
  }
  return "locked"; // must complete previous stages first
}

export interface AutoPrepResult {
  state: DepartmentDeskState;
  updatedDepartments: string[];
  runLog?: Array<{
    id: string;
    skipped?: boolean;
    reason?: string;
    source?: string;
    qaScore?: number;
    missingUpstream?: string[];
    risks?: string[];
    patchesApplied?: number;
  }>;
  createdHandoffs?: DepartmentHandoff[];
  patchesApplied?: Array<Record<string, any>>;
  patchesSaved?: boolean;
  gate?: AdvanceGate;
  staleDownstream?: string[];
}

export async function runAutoPrep(
  workspaceId: string,
  body: { unitId?: string; force?: boolean; only?: string[] } = {}
): Promise<AutoPrepResult> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/auto-prep`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data as AutoPrepResult;
}

export async function runSingleDepartmentPrep(
  workspaceId: string,
  deptId: string,
  body: { force?: boolean } = {}
): Promise<AutoPrepResult> {
  const res = await fetch(
    `${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/departments/${encodeURIComponent(deptId)}/run-prep`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return {
    state: json.data.state,
    updatedDepartments: (json.data.runLog || [])
      .filter((x: any) => !x.skipped)
      .map((x: any) => x.id),
    runLog: json.data.runLog,
    patchesApplied: json.data.patchesApplied || [],
    patchesSaved: json.data.patchesSaved
  };
}

export function statusLabel(status: DepartmentStatus, locale: "zh" | "en" = "zh"): string {
  const map: Record<DepartmentStatus, { zh: string; en: string }> = {
    idle: { zh: "空闲", en: "Idle" },
    drafting: { zh: "起草中", en: "Drafting" },
    ready_for_review: { zh: "待确认", en: "Ready" },
    confirmed: { zh: "已确认", en: "Confirmed" },
    blocked: { zh: "阻塞", en: "Blocked" },
    stale: { zh: "已过期", en: "Stale" }
  };
  return map[status]?.[locale] || status;
}

export function statusTone(status: DepartmentStatus): string {
  switch (status) {
    case "confirmed":
      return "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    case "ready_for_review":
      return "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10";
    case "blocked":
      return "text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10";
    case "stale":
      return "text-orange-600 dark:text-orange-400 border-orange-500/30 bg-orange-500/10";
    case "drafting":
      return "text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10";
    default:
      return "text-slate-500 border-slate-500/20 bg-slate-500/5";
  }
}
