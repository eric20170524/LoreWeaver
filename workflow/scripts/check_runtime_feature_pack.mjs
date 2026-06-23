import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const loreRoot = path.resolve(scriptDir, "../..");
const reportsDir = path.join(loreRoot, "workflow", "reports");

const REQUIRED_ARTIFACTS = [
  "abilityCatalog",
  "passiveSkillCatalog",
  "characterDesignCatalog",
  "enemyDesignCatalog",
  "skillEffectCatalog",
  "audioCueCatalog",
  "runtimeSkillFeedback",
  "runtimeAbilityUnlocks",
  "runtimeSkillHud",
  "nodeSkillPreview",
  "runtimeCharacterSprites",
  "runtimeEnemySprites",
  "firstNodeRunSkillLoop"
];

const RECOMMENDED_ARTIFACTS = [
  "floatingSimulatorPreview",
  "simulatorFullscreenPreview",
  "assetPipelineMetadata",
  "abilityVfxVoicePipeline",
  "artAssetPipeline",
  "audioAssetPipeline",
  "assetPipelineVerification"
];

const FRESH_STATUSES = new Set(["fresh", "approved", "validated"]);
const ABILITY_UNLOCK_SOURCES = new Set(["initial", "mainline", "node_reward", "hybrid", "finale"]);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath, errors, label) {
  if (!pathExists(filePath)) {
    errors.push(`${label} is missing: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function readOptionalJson(filePath, errors, label) {
  if (!pathExists(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addIfText(target, value) {
  if (hasText(value)) target.add(value);
}

function requireText(object, field, label, errors) {
  if (!hasText(object?.[field])) errors.push(`${label}.${field} must be a non-empty string.`);
}

function requireNonEmptyList(object, field, label, errors) {
  if (!Array.isArray(object?.[field]) || object[field].length === 0) {
    errors.push(`${label}.${field} must be a non-empty array.`);
  }
}

function checkUniqueIds(catalog, label, errors) {
  const ids = new Set();
  for (const item of asArray(catalog)) {
    if (!hasText(item?.id)) {
      errors.push(`${label} contains an entry without id.`);
      continue;
    }
    if (ids.has(item.id)) errors.push(`${label} contains duplicate id: ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function checkCatalogArray(catalog, label, errors) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    return false;
  }
  return true;
}

function loadWorkspace() {
  const workspaceArg = argValue("--workspace") || process.env.LW_WORKSPACE || process.cwd();
  const workspaceRoot = path.resolve(process.cwd(), workspaceArg);
  const reportArg = argValue("--report");
  const reportPath = reportArg
    ? path.resolve(process.cwd(), reportArg)
    : path.join(reportsDir, "runtime_feature_pack_latest.json");

  return {
    workspaceRoot,
    reportPath,
    jsonOnly: process.argv.includes("--json")
  };
}

function scanDataRegistry(workspaceRoot, runtimeSkillIds, warnings) {
  const dataPath = path.join(workspaceRoot, "js", "data.js");
  if (!pathExists(dataPath)) return null;

  const source = fs.readFileSync(dataPath, "utf8");
  const skillPoolStart = source.indexOf("export const SKILL_POOL_REGISTRY");
  const passiveStart = source.indexOf("export const PASSIVE_SKILL_REGISTRY");
  const nodeStart = source.indexOf("export const NODE_REGISTRY");

  if (skillPoolStart === -1 || passiveStart === -1) {
    warnings.push("js/data.js exists, but SKILL_POOL_REGISTRY or PASSIVE_SKILL_REGISTRY was not found.");
    return null;
  }

  const skillPoolSource = source.slice(skillPoolStart, passiveStart);
  const passiveSource = nodeStart === -1 ? source.slice(passiveStart) : source.slice(passiveStart, nodeStart);
  const skillIds = new Set([...skillPoolSource.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]));
  const vfxIds = new Set([...skillPoolSource.matchAll(/vfx:\s*"([^"]+)"/g)].map((match) => match[1]));
  const sfxIds = new Set([...skillPoolSource.matchAll(/sfx:\s*"([^"]+)"/g)].map((match) => match[1]));
  const passiveIds = new Set([...passiveSource.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]));

  for (const skillId of skillIds) runtimeSkillIds.add(skillId);

  return { skillIds, vfxIds, sfxIds, passiveIds };
}

function validateAssetPipeline(assetPipeline, errors, warnings) {
  if (!assetPipeline) return null;

  if (assetPipeline.schemaVersion !== "1.0") {
    errors.push("asset-pipeline.json.schemaVersion must be 1.0.");
  }

  const ability = assetPipeline.abilityVfxVoice || {};
  requireText(ability, "abilitySpecPath", "assetPipeline.abilityVfxVoice", errors);
  requireText(ability, "calloutFallback", "assetPipeline.abilityVfxVoice", errors);
  requireNonEmptyList(ability, "playerAbilityCoverage", "assetPipeline.abilityVfxVoice", errors);
  requireNonEmptyList(ability, "enemyAbilityEffects", "assetPipeline.abilityVfxVoice", errors);
  requireNonEmptyList(ability, "runtimeHooks", "assetPipeline.abilityVfxVoice", errors);
  requireNonEmptyList(ability, "verification", "assetPipeline.abilityVfxVoice", errors);
  if (!hasText(ability.voiceManifestPath) && ability.calloutFallback === "voice") {
    warnings.push("assetPipeline.abilityVfxVoice uses voice fallback but has no voiceManifestPath.");
  }

  const art = assetPipeline.artAssets || {};
  requireText(art, "manifestPath", "assetPipeline.artAssets", errors);
  requireText(art, "runtimeBinding", "assetPipeline.artAssets", errors);
  requireNonEmptyList(art, "groups", "assetPipeline.artAssets", errors);
  requireNonEmptyList(art, "verification", "assetPipeline.artAssets", errors);
  if (!asArray(art.groups).some((group) => ["heroes", "characters", "actors"].includes(group))) {
    warnings.push("assetPipeline.artAssets.groups does not mention heroes, characters, or actors.");
  }
  if (!asArray(art.groups).includes("enemies")) {
    warnings.push("assetPipeline.artAssets.groups does not mention enemies.");
  }

  const audio = assetPipeline.audioAssets || {};
  requireText(audio, "manifestPath", "assetPipeline.audioAssets", errors);
  requireText(audio, "runtimeBinding", "assetPipeline.audioAssets", errors);
  requireNonEmptyList(audio, "channels", "assetPipeline.audioAssets", errors);
  requireNonEmptyList(audio, "coverageMatrix", "assetPipeline.audioAssets", errors);
  requireNonEmptyList(audio, "verification", "assetPipeline.audioAssets", errors);
  if (!hasText(audio.creditsPath)) {
    warnings.push("assetPipeline.audioAssets.creditsPath is empty; generated/searched audio needs provenance before public export.");
  }

  return {
    abilityPlayerCoverage: asArray(ability.playerAbilityCoverage).length,
    abilityEnemyEffects: asArray(ability.enemyAbilityEffects).length,
    artGroups: asArray(art.groups).length,
    audioChannels: asArray(audio.channels).length,
    audioCoverage: asArray(audio.coverageMatrix).length
  };
}

const { workspaceRoot, reportPath, jsonOnly } = loadWorkspace();
const errors = [];
const warnings = [];

const manifest = readJson(path.join(workspaceRoot, "manifest.json"), errors, "manifest.json");
const abilityCatalog = readJson(path.join(workspaceRoot, "loreweaver", "ability-catalog.json"), errors, "ability-catalog.json");
const passiveSkillCatalog = readJson(path.join(workspaceRoot, "loreweaver", "passive-skill-catalog.json"), errors, "passive-skill-catalog.json");
const characterDesignCatalog = readJson(path.join(workspaceRoot, "loreweaver", "character-design-catalog.json"), errors, "character-design-catalog.json");
const enemyDesignCatalog = readJson(path.join(workspaceRoot, "loreweaver", "enemy-design-catalog.json"), errors, "enemy-design-catalog.json");
const skillEffectCatalog = readJson(path.join(workspaceRoot, "loreweaver", "skill-effect-catalog.json"), errors, "skill-effect-catalog.json");
const audioCueCatalog = readJson(path.join(workspaceRoot, "loreweaver", "audio-cue-catalog.json"), errors, "audio-cue-catalog.json");
const workbench = readJson(path.join(workspaceRoot, "loreweaver", "workbench.json"), errors, "workbench.json");
const assetPipelineFile = readOptionalJson(path.join(workspaceRoot, "loreweaver", "asset-pipeline.json"), errors, "asset-pipeline.json");
const assetPipeline = assetPipelineFile || manifest?.runtimeFeaturePack?.assetPipeline || null;
const requireAssetPipeline = process.argv.includes("--require-asset-pipeline");

checkCatalogArray(abilityCatalog, "ability-catalog.json", errors);
checkCatalogArray(passiveSkillCatalog, "passive-skill-catalog.json", errors);
checkCatalogArray(characterDesignCatalog, "character-design-catalog.json", errors);
checkCatalogArray(enemyDesignCatalog, "enemy-design-catalog.json", errors);
checkCatalogArray(skillEffectCatalog, "skill-effect-catalog.json", errors);
checkCatalogArray(audioCueCatalog, "audio-cue-catalog.json", errors);

const manifestNodes = asArray(manifest?.nodes);
const nodeIds = new Set(manifestNodes.map((node) => Number(node.id)).filter(Boolean));
const abilityIds = checkUniqueIds(abilityCatalog, "Ability catalog", errors);
const passiveIds = checkUniqueIds(passiveSkillCatalog, "Passive skill catalog", errors);
const characterIds = checkUniqueIds(characterDesignCatalog, "Character design catalog", errors);
const enemyIds = checkUniqueIds(enemyDesignCatalog, "Enemy design catalog", errors);
const effectIds = checkUniqueIds(skillEffectCatalog, "Skill effect catalog", errors);
const audioIds = checkUniqueIds(audioCueCatalog, "Audio cue catalog", errors);
const runtimeSkillIds = new Set();
const abilityRuntimeSkillIds = new Map();
const rawNodeRunSkillIds = new Set();
const nodeRunSkillIds = new Set();

for (const node of manifestNodes) {
  for (const skillId of asArray(node?.planning?.runSkillPool)) addIfText(rawNodeRunSkillIds, skillId);
}

for (const ability of asArray(abilityCatalog)) {
  if (!hasText(ability.name)) errors.push(`Ability ${ability.id || "(missing id)"} is missing name.`);
  if (!hasText(ability.description)) errors.push(`Ability ${ability.id || "(missing id)"} is missing description.`);
  if (!ABILITY_UNLOCK_SOURCES.has(ability.unlockSource)) {
    errors.push(`Ability ${ability.id || "(missing id)"} has invalid unlockSource: ${ability.unlockSource}.`);
  }
  if (!hasText(ability.unlockCondition)) {
    errors.push(`Ability ${ability.id || "(missing id)"} is missing unlockCondition.`);
  }
  if (!Array.isArray(ability.runtimeSkillIds) || ability.runtimeSkillIds.length === 0) {
    errors.push(`Ability ${ability.id || "(missing id)"} must bind at least one runtimeSkillId.`);
  }
  const abilityRuntimeIds = [];
  for (const skillId of asArray(ability.runtimeSkillIds)) {
    addIfText(runtimeSkillIds, skillId);
    if (hasText(skillId)) abilityRuntimeIds.push(skillId);
  }
  if (hasText(ability.id)) abilityRuntimeSkillIds.set(ability.id, abilityRuntimeIds);
  if (!Array.isArray(ability.affectedNodeIds) || ability.affectedNodeIds.length === 0) {
    errors.push(`Ability ${ability.id || "(missing id)"} must list affectedNodeIds.`);
  }
  for (const nodeId of asArray(ability.affectedNodeIds)) {
    if (!nodeIds.has(Number(nodeId))) {
      errors.push(`Ability ${ability.id || "(missing id)"} references unknown node id: ${nodeId}.`);
    }
  }
  if (!ability.vfxConcept?.palette?.length && !ability.vfxConcept?.shapeLanguage) {
    warnings.push(`Ability ${ability.id || "(missing id)"} has no vfxConcept palette or shapeLanguage.`);
  }
  if (!Array.isArray(ability.sfxCues) || ability.sfxCues.length === 0) {
    warnings.push(`Ability ${ability.id || "(missing id)"} has no sfxCues.`);
  }
}

for (const skillOrAbilityId of rawNodeRunSkillIds) {
  const mappedSkillIds = abilityRuntimeSkillIds.get(skillOrAbilityId);
  if (mappedSkillIds?.length) {
    mappedSkillIds.forEach((skillId) => nodeRunSkillIds.add(skillId));
  } else {
    nodeRunSkillIds.add(skillOrAbilityId);
  }
}

for (const passive of asArray(passiveSkillCatalog)) {
  if (!hasText(passive.name)) errors.push(`Passive ${passive.id || "(missing id)"} is missing name.`);
  if (!hasText(passive.treeTier)) errors.push(`Passive ${passive.id || "(missing id)"} is missing treeTier.`);
  if (!Number.isFinite(Number(passive.cost))) errors.push(`Passive ${passive.id || "(missing id)"} is missing numeric cost.`);
  if (hasText(passive.requires) && !passiveIds.has(passive.requires)) {
    errors.push(`Passive ${passive.id || "(missing id)"} requires unknown passive: ${passive.requires}.`);
  }
  if (!Array.isArray(passive.effects) || passive.effects.length === 0) {
    errors.push(`Passive ${passive.id || "(missing id)"} must define effects.`);
  }
  if (!hasText(passive.uiCopy)) warnings.push(`Passive ${passive.id || "(missing id)"} has no uiCopy.`);
}

for (const character of asArray(characterDesignCatalog)) {
  if (!hasText(character.combatIdentity)) errors.push(`Character ${character.id || "(missing id)"} is missing combatIdentity.`);
  if (!character.visualDesign?.palette?.length) errors.push(`Character ${character.id || "(missing id)"} is missing visualDesign.palette.`);
  if (!hasText(character.visualDesign?.silhouette)) errors.push(`Character ${character.id || "(missing id)"} is missing visualDesign.silhouette.`);
  if (!Array.isArray(character.animationCues) || character.animationCues.length === 0) {
    errors.push(`Character ${character.id || "(missing id)"} must define animationCues.`);
  }
  for (const nodeId of asArray(character.appearsNodeIds)) {
    if (!nodeIds.has(Number(nodeId))) {
      errors.push(`Character ${character.id || "(missing id)"} references unknown node id: ${nodeId}.`);
    }
  }
  for (const abilityId of asArray(character.skillConnections)) {
    if (!abilityIds.has(abilityId)) {
      errors.push(`Character ${character.id || "(missing id)"} references unknown ability: ${abilityId}.`);
    }
  }
}

for (const enemy of asArray(enemyDesignCatalog)) {
  if (!hasText(enemy.runtimeEnemyId)) errors.push(`Enemy ${enemy.id || "(missing id)"} is missing runtimeEnemyId.`);
  if (!hasText(enemy.silhouette)) errors.push(`Enemy ${enemy.id || "(missing id)"} is missing silhouette.`);
  if (!Array.isArray(enemy.palette) || enemy.palette.length === 0) errors.push(`Enemy ${enemy.id || "(missing id)"} is missing palette.`);
  if (!hasText(enemy.combatRead)) errors.push(`Enemy ${enemy.id || "(missing id)"} is missing combatRead.`);
}

const effectRuntimeIds = new Set();
for (const effect of asArray(skillEffectCatalog)) {
  addIfText(effectRuntimeIds, effect.runtimeSkillId);
  if (!runtimeSkillIds.has(effect.runtimeSkillId)) {
    warnings.push(`VFX ${effect.id || "(missing id)"} references a runtime skill not present in ability catalog: ${effect.runtimeSkillId}.`);
  }
  if (!Array.isArray(effect.palette) || effect.palette.length === 0) {
    errors.push(`VFX ${effect.id || "(missing id)"} is missing palette.`);
  }
  if (!hasText(effect.implementation)) {
    errors.push(`VFX ${effect.id || "(missing id)"} is missing implementation notes.`);
  }
}

const audioRuntimeIds = new Set();
for (const cue of asArray(audioCueCatalog)) {
  addIfText(audioRuntimeIds, cue.runtimeSkillId);
  if (!runtimeSkillIds.has(cue.runtimeSkillId)) {
    warnings.push(`SFX ${cue.id || "(missing id)"} references a runtime skill not present in ability catalog: ${cue.runtimeSkillId}.`);
  }
  if (!Array.isArray(cue.synth?.frequencies) || cue.synth.frequencies.length === 0) {
    errors.push(`SFX ${cue.id || "(missing id)"} is missing synth.frequencies.`);
  }
  if (!Number.isFinite(Number(cue.synth?.durationMs))) {
    errors.push(`SFX ${cue.id || "(missing id)"} is missing synth.durationMs.`);
  }
  if (!hasText(cue.mixRole)) errors.push(`SFX ${cue.id || "(missing id)"} is missing mixRole.`);
}

for (const skillId of nodeRunSkillIds) {
  if (!runtimeSkillIds.has(skillId)) {
    errors.push(`Node planning.runSkillPool references unknown ability or runtime skill: ${skillId}.`);
  }
  if (!effectRuntimeIds.has(skillId)) {
    errors.push(`First-class runtime skill ${skillId} is missing a VFX entry.`);
  }
  if (!audioRuntimeIds.has(skillId)) {
    errors.push(`First-class runtime skill ${skillId} is missing an SFX entry.`);
  }
}

const firstNode = manifestNodes
  .slice()
  .sort((a, b) => Number(a.id) - Number(b.id))[0];
if (!firstNode) {
  errors.push("manifest.json must include at least one playable node.");
} else {
  const firstNodeSkills = asArray(firstNode?.planning?.runSkillPool);
  if (firstNodeSkills.length === 0) {
    errors.push(`First node ${firstNode.id} must expose planning.runSkillPool for in-run unlock/use/upgrade testing.`);
  }
  const firstNodeRewardUnlocks = asArray(firstNode?.planning?.rewardUnlocks);
  if (firstNodeRewardUnlocks.length === 0) {
    warnings.push(`First node ${firstNode.id} does not unlock any ability; confirm the first MVP session still demonstrates progression.`);
  }
  for (const abilityId of firstNodeRewardUnlocks) {
    if (!abilityIds.has(abilityId)) {
      errors.push(`First node ${firstNode.id} unlocks unknown ability: ${abilityId}.`);
    }
  }
}

for (const node of manifestNodes) {
  if (!node?.gameplay?.cardId) errors.push(`Node ${node.id || "(missing id)"} is missing gameplay.cardId.`);
  if (!Array.isArray(node?.planning?.runSkillPool) || node.planning.runSkillPool.length === 0) {
    errors.push(`Node ${node.id || "(missing id)"} is missing planning.runSkillPool.`);
  }
  for (const skillOrAbilityId of asArray(node?.planning?.runSkillPool)) {
    if (!abilityIds.has(skillOrAbilityId) && !runtimeSkillIds.has(skillOrAbilityId)) {
      errors.push(`Node ${node.id || "(missing id)"} runSkillPool references unknown ability or runtime skill: ${skillOrAbilityId}.`);
    }
  }
  for (const abilityId of asArray(node?.planning?.rewardUnlocks)) {
    if (!abilityIds.has(abilityId)) {
      errors.push(`Node ${node.id || "(missing id)"} unlocks unknown ability: ${abilityId}.`);
    }
  }
}

const registryScan = scanDataRegistry(workspaceRoot, runtimeSkillIds, warnings);
if (registryScan) {
  for (const passiveId of passiveIds) {
    if (!registryScan.passiveIds.has(passiveId)) {
      errors.push(`Passive ${passiveId} is missing from runtime PASSIVE_SKILL_REGISTRY.`);
    }
  }
  for (const runtimeSkillId of nodeRunSkillIds) {
    if (!registryScan.skillIds.has(runtimeSkillId)) {
      errors.push(`Node runtime skill ${runtimeSkillId} is missing from SKILL_POOL_REGISTRY.`);
    }
  }
  for (const vfxId of registryScan.vfxIds) {
    if (!effectIds.has(vfxId)) errors.push(`Runtime SKILL_POOL_REGISTRY references unknown VFX id: ${vfxId}.`);
  }
  for (const sfxId of registryScan.sfxIds) {
    if (!audioIds.has(sfxId)) errors.push(`Runtime SKILL_POOL_REGISTRY references unknown SFX id: ${sfxId}.`);
  }
}

const artifactStatus = workbench?.artifactStatus || {};
for (const artifact of REQUIRED_ARTIFACTS) {
  if (!FRESH_STATUSES.has(artifactStatus[artifact])) {
    errors.push(`workbench.artifactStatus.${artifact} must be fresh, approved, or validated.`);
  }
}
for (const artifact of RECOMMENDED_ARTIFACTS) {
  if (!FRESH_STATUSES.has(artifactStatus[artifact])) {
    warnings.push(`Recommended artifact is not marked fresh yet: ${artifact}.`);
  }
}

let assetPipelineSummary = null;
if (!assetPipeline) {
  const message = "loreweaver/asset-pipeline.json is missing; ability VFX/voice, generated art, and audio manifest pipelines are not recorded.";
  if (requireAssetPipeline) {
    errors.push(message);
  } else {
    warnings.push(message);
  }
} else {
  assetPipelineSummary = validateAssetPipeline(assetPipeline, errors, warnings);
}

if (requireAssetPipeline) {
  const requiredPipelineArtifacts = [
    "assetPipelineMetadata",
    "abilityVfxVoicePipeline",
    "artAssetPipeline",
    "audioAssetPipeline",
    "assetPipelineVerification"
  ];
  for (const artifact of requiredPipelineArtifacts) {
    if (!FRESH_STATUSES.has(artifactStatus[artifact])) {
      errors.push(`workbench.artifactStatus.${artifact} must be fresh, approved, or validated when --require-asset-pipeline is used.`);
    }
  }
}

const report = {
  gate: "runtime_feature_pack",
  status: errors.length === 0 ? "passed" : "failed",
  createdAt: new Date().toISOString(),
  workspaceRoot,
  schema: path.join(loreRoot, "docs", "contracts", "runtime_feature_pack.schema.json"),
  summary: {
    nodes: manifestNodes.length,
    abilities: asArray(abilityCatalog).length,
    passiveSkills: asArray(passiveSkillCatalog).length,
    characters: asArray(characterDesignCatalog).length,
    enemies: asArray(enemyDesignCatalog).length,
    skillEffects: asArray(skillEffectCatalog).length,
    audioCues: asArray(audioCueCatalog).length,
    nodeRunSkills: nodeRunSkillIds.size,
    assetPipeline: Boolean(assetPipeline),
    assetPipelineSummary
  },
  requiredArtifacts: REQUIRED_ARTIFACTS,
  recommendedArtifacts: RECOMMENDED_ARTIFACTS,
  errors,
  warnings
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Runtime feature pack check ${report.status}: ${workspaceRoot}`);
  console.log(`- nodes: ${report.summary.nodes}`);
  console.log(`- abilities/passives: ${report.summary.abilities}/${report.summary.passiveSkills}`);
  console.log(`- characters/enemies: ${report.summary.characters}/${report.summary.enemies}`);
  console.log(`- VFX/SFX cues: ${report.summary.skillEffects}/${report.summary.audioCues}`);
  console.log(`- asset pipeline: ${report.summary.assetPipeline ? "present" : "missing"}`);
  console.log(`- report: ${reportPath}`);
  if (warnings.length) {
    console.log("Warnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }
  if (errors.length) {
    console.error("Errors:");
    errors.forEach((error) => console.error(`- ${error}`));
  }
}

if (errors.length) process.exit(1);
