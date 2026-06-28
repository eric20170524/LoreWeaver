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

export interface ProgressionSystemSpec {
  id: string;
  title: string;
  resource: string;
  action: string;
  unlocks: string[];
  nodePayloadEffect: string;
}

export type AbilityUnlockSource = "initial" | "mainline" | "node_reward" | "hybrid" | "finale";

export interface AbilitySpec {
  id: string;
  name: string;
  description: string;
  category?: string;
  lineage?: string;
  unlockSource: AbilityUnlockSource;
  unlockCondition: string;
  gameplayTags: string[];
  tags?: string[];
  runtimeSkillIds: string[];
  affectedNodeIds: number[];
  designRole?: string;
  characterHooks?: string[];
  vfxConcept?: {
    palette?: string[];
    shapeLanguage?: string;
    runtimeNotes?: string;
  };
  sfxCues?: string[];
  balanceBudget?: {
    phase?: string;
    powerCurve?: string;
    counterplay?: string;
  };
}

export interface PassiveSkillEffectSpec {
  target: string;
  op: "add" | "multiply" | "set" | string;
  value: number | string | boolean;
}

export interface PassiveSkillSpec {
  id: string;
  name: string;
  treeTier: string;
  cost: number;
  requires?: string | null;
  runtimeStatus?: "planned" | "implemented" | "validated" | string;
  effects: PassiveSkillEffectSpec[];
  affectedRuntimeSkillIds: string[];
  description: string;
  uiCopy?: string;
  vfxConcept?: string;
  sfxCue?: string;
}

export interface RuntimeVisualDesignSpec {
  silhouette: string;
  palette: string[];
  stageVariants?: Array<{
    realmRange: [number, number] | number[];
    look: string;
  }>;
}

export interface CharacterDesignSpec {
  id: string;
  name: string;
  role: string;
  appearsNodeIds: number[];
  combatIdentity: string;
  visualDesign: RuntimeVisualDesignSpec;
  animationCues: string[];
  skillConnections: string[];
  audioDirection?: string;
}

export interface EnemyDesignSpec {
  id: string;
  name: string;
  runtimeEnemyId: string;
  silhouette: string;
  palette: string[];
  combatRead: string;
}

export interface SkillEffectSpec {
  id: string;
  runtimeSkillId: string;
  shape: string;
  palette: string[];
  screenShake?: {
    durationMs: number;
    intensity: number;
  };
  implementation: string;
  upgradeNote?: string;
}

export interface AudioCueSpec {
  id: string;
  runtimeSkillId: string;
  synth: {
    frequencies: number[];
    wave: "sine" | "square" | "sawtooth" | "triangle" | string;
    durationMs: number;
    volume: number;
  };
  mixRole: string;
  description: string;
}

export interface AbilityVfxVoicePipelineSpec {
  abilitySpecPath: string;
  voiceManifestPath?: string;
  calloutFallback: string;
  playerAbilityCoverage: string[];
  enemyAbilityEffects: string[];
  runtimeHooks: string[];
  verification: string[];
}

export interface ArtAssetPipelineSpec {
  manifestPath: string;
  scriptManifestPath?: string;
  groups: string[];
  spriteClips?: string[];
  runtimeBinding: string;
  verification: string[];
}

export interface AudioAssetPipelineSpec {
  manifestPath: string;
  creditsPath?: string;
  channels: string[];
  coverageMatrix: string[];
  runtimeBinding: string;
  verification: string[];
}

export interface RuntimeAssetPipelineSpec {
  schemaVersion: string;
  abilityVfxVoice: AbilityVfxVoicePipelineSpec;
  artAssets: ArtAssetPipelineSpec;
  audioAssets: AudioAssetPipelineSpec;
}

export interface RuntimeFeaturePackSpec {
  schemaVersion: string;
  abilityCatalog: AbilitySpec[];
  passiveSkillCatalog: PassiveSkillSpec[];
  characterDesignCatalog: CharacterDesignSpec[];
  enemyDesignCatalog: EnemyDesignSpec[];
  skillEffectCatalog: SkillEffectSpec[];
  audioCueCatalog: AudioCueSpec[];
  requiredWorkbenchArtifacts: string[];
  acceptanceGates: string[];
  assetPipeline?: RuntimeAssetPipelineSpec;
}

export interface NodePlanningSpec {
  mainlineHooks: string[];
  rewardUnlocks: string[];
  runSkillPool: string[];
  notes?: string;
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
  planning?: NodePlanningSpec;
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
  progressionSystems?: ProgressionSystemSpec[];
  abilityCatalog?: AbilitySpec[];
  passiveSkillCatalog?: PassiveSkillSpec[];
  characterDesignCatalog?: CharacterDesignSpec[];
  enemyDesignCatalog?: EnemyDesignSpec[];
  skillEffectCatalog?: SkillEffectSpec[];
  audioCueCatalog?: AudioCueSpec[];
  runtimeFeaturePack?: RuntimeFeaturePackSpec;
  gameplayCards?: string[];
  workbench?: WorkbenchState;
}

export interface PlayerState {
  currentRealmIndex: number; // Index of current realm (0 - 5)
  mainCurrencyCount: number; // Passive accumulation primary resource
  secondaryResources: { [key: string]: number }; // Material resources key-value
  unlockedNodeIds: number[]; // e.g. [1] (node 1 is unlocked by default, node 2 opens upon clear, etc.)
  completedNodeIds: number[]; // Nodes fully beaten
  unlockedAbilities?: string[]; // Long-term abilities unlocked from mainline or node rewards
  activeMultiplier: number; // Combined multipliers based on nodes cleared
  clickPower: number; // Click cultivation reward multiplier
  storyFlags?: string[]; // Story flags or decisions
  unlockedPassives?: string[]; // Passive skills unlocked from tree
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

export interface NodeResult {
  success: boolean;
  reason?: string;
  rewards?: {
    multiplierGain?: number;
    secondaryResources?: { [key: string]: number };
    unlockedAbilities?: string[];
    unlockedPassives?: string[];
    storyFlags?: string[];
    unlockNextNode?: boolean;
  };
}
