export type PatchLevel = "L0" | "L1" | "L2" | "L3" | "L4";
export type Locale = "zh" | "en";

export interface GameplayModifierSpec {
  id: string;
  knobs?: Record<string, any>;
}

export interface GameplayAssignment {
  adapter: string;
  cardId: string;
  modifiers: GameplayModifierSpec[];
  knobs: Record<string, any>;
  patchLevel: PatchLevel;
}

export interface NodeSpec {
  id: number;
  title: string;
  intro: string;
  taunts: string[];
  mechanics: "tap_reaction" | "collect_dodge" | "memory_sequence" | string;
  rewards: string;
  goalValue: number;
  resourceMultiplier: number;
  difficulty: number;
  durationLimit: number;
  gameplay?: GameplayAssignment;
}

export interface ManifestPatch {
  id: string;
  target: string;
  operation: "replace" | "merge" | "add" | "remove";
  before: any;
  after: any;
  reason: string;
  invalidates: string[];
  patchLevel: PatchLevel;
  status: "proposed" | "approved" | "rejected" | "applied";
  createdAt: string;
}

export interface RevisionRecord {
  id: string;
  createdAt: string;
  patches: string[];
  manifestSnapshot: GameSpec;
  gateResults: {
    build: "pending" | "passed" | "failed";
    e2e: "pending" | "passed" | "failed";
  };
  artifactStatus: "fresh" | "stale" | "failed" | "approved";
}

export interface WorkbenchState {
  patches: ManifestPatch[];
  revisions: RevisionRecord[];
  artifactStatus: Record<string, "fresh" | "stale" | "failed" | "approved">;
}

export interface GameSpec {
  title: string;
  themeColor: string;
  economy: {
    currencyName: string;
    resources: string[]; // 3 resource names e.g., ["Spirit Stones", "Essence", "Sanity"]
    realms: string[]; // 6 realm names e.g., ["炼气期", "筑基期", "金丹期", "元婴期", "化神期", "返虚期"]
  };
  nodes: NodeSpec[];
  gameplayCards?: string[];
  workbench?: WorkbenchState;
}

export interface PlayerState {
  currentRealmIndex: number; // Index of current realm (0 - 5)
  mainCurrencyCount: number; // Passive accumulation primary resource
  secondaryResources: { [key: string]: number }; // Material resources key-value
  unlockedNodeIds: number[]; // e.g. [1] (node 1 is unlocked by default, node 2 opens upon clear, etc.)
  completedNodeIds: number[]; // Nodes fully beaten
  activeMultiplier: number; // Combined multipliers based on nodes cleared
  clickPower: number; // Click cultivation reward multiplier
}

export interface AuditCheck {
  id: string;
  name: string;
  status: "PASS" | "WARNING" | "FAIL";
  remarks: string;
}

export interface AuditReport {
  checks: AuditCheck[];
  vlm_feedback: string;
  prompt_reflow_diff: string;
  proposed_patches?: ManifestPatch[];
}
