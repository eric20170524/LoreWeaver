import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRecipeGraph } from "./recipe-graph.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CARDS_ROOT = path.join(LORE_ROOT, "minigame_master/gameplay/cards");
const SCHEMA_VERSION = "loreweaver.vertical-slice-blueprint.v1";
const RUNTIME_STATUSES = new Set(["runtime_supported", "runtime_verified", "promoted"]);
const EXECUTABLE_KEYS = new Set([
  "script",
  "scriptPath",
  "entrypoint",
  "runtimeScript",
  "engineSource",
  "executableSource"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

export function blueprintHash(blueprint) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(blueprint ?? null)))
    .digest("hex");
}

function modifierId(value) {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    return String(value.id || value.modifierId || "").trim() || null;
  }
  return null;
}

function collectExecutableKeys(value, parent = "", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExecutableKeys(item, `${parent}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    const current = parent ? `${parent}.${key}` : key;
    if (EXECUTABLE_KEYS.has(key)) findings.push(current);
    collectExecutableKeys(child, current, findings);
  }
  return findings;
}

function validateStageComposition(stage, cardsRoot, errors, warnings) {
  const node = stage?.node;
  if (!node || typeof node !== "object") return;
  const gameplay = node.gameplay;
  if (!gameplay || typeof gameplay !== "object") {
    errors.push(`stage_gameplay_missing:${stage.id}`);
    return;
  }
  const cardId = String(gameplay.cardId || "").trim();
  if (!cardId) {
    errors.push(`stage_card_missing:${stage.id}`);
    return;
  }
  const card = readJsonSafe(path.join(cardsRoot, `${cardId}.json`));
  if (!card) {
    errors.push(`stage_card_not_found:${stage.id}:${cardId}`);
    return;
  }
  if (String(card.id || "") !== cardId) {
    errors.push(`stage_card_id_mismatch:${stage.id}:${cardId}`);
  }
  const authoredAdapter = String(gameplay.adapter || "").trim();
  const engineTargets = Array.isArray(card.runtime?.engineTargets)
    ? card.runtime.engineTargets.map((item) => String(item))
    : [];
  if (authoredAdapter && engineTargets.length && !engineTargets.includes(authoredAdapter)) {
    errors.push(`stage_engine_target_incompatible:${stage.id}:${cardId}:${authoredAdapter}`);
  }

  const modifiers = gameplay.modifiers || [];
  if (!Array.isArray(modifiers)) {
    errors.push(`stage_modifiers_not_array:${stage.id}`);
    return;
  }
  const seen = new Set();
  for (const raw of modifiers) {
    const id = modifierId(raw);
    if (!id) {
      errors.push(`stage_modifier_id_missing:${stage.id}`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`stage_modifier_duplicate:${stage.id}:${id}`);
      continue;
    }
    seen.add(id);
    const modifier = readJsonSafe(path.join(cardsRoot, "modifiers", `${id}.json`));
    if (!modifier) {
      errors.push(`stage_modifier_not_found:${stage.id}:${id}`);
      continue;
    }
    if (String(modifier.id || "") !== id) {
      errors.push(`stage_modifier_id_mismatch:${stage.id}:${id}`);
    }
    const declared = Array.isArray(modifier.compatibleBaseCards) && modifier.compatibleBaseCards.length
      ? modifier.compatibleBaseCards
      : modifier.modifierFor;
    const compatible = new Set((declared || []).map((item) => String(item)));
    if (!compatible.size) {
      errors.push(`stage_modifier_compatibility_undeclared:${stage.id}:${id}`);
    } else if (!compatible.has(cardId)) {
      errors.push(`stage_modifier_incompatible:${stage.id}:${id}:${cardId}`);
    }
    if (modifier.status !== "production_ready" && modifier.status !== "runtime_ready") {
      warnings.push(`stage_modifier_maturity_low:${stage.id}:${id}:${modifier.status || "missing"}`);
    }
  }
}

export function validateVerticalSliceBlueprint(blueprint, { cardsRoot = DEFAULT_CARDS_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) {
    return { status: "failed", valid: false, errors: ["blueprint_not_object"], warnings, stageCount: 0 };
  }
  if (blueprint.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schema_version_invalid:${blueprint.schemaVersion || "missing"}`);
  }
  const id = String(blueprint.id || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) errors.push(`blueprint_id_invalid:${id || "missing"}`);
  if (!String(blueprint.title || "").trim()) errors.push("blueprint_title_missing");
  if (!String(blueprint.summary || "").trim()) errors.push("blueprint_summary_missing");
  if (!["alignment_candidate", "runtime_supported", "runtime_verified", "promoted"].includes(blueprint.status)) {
    errors.push(`blueprint_status_invalid:${blueprint.status || "missing"}`);
  }

  const executableKeys = collectExecutableKeys(blueprint);
  for (const key of executableKeys) errors.push(`executable_payload_forbidden:${key}`);

  const requiredCapabilities = Array.isArray(blueprint.requiredCapabilities)
    ? blueprint.requiredCapabilities.map((item) => String(item)).filter(Boolean)
    : [];
  const missingCapabilities = Array.isArray(blueprint.missingCapabilities)
    ? blueprint.missingCapabilities.map((item) => String(item)).filter(Boolean)
    : [];
  for (const capability of requiredCapabilities) {
    if (missingCapabilities.includes(capability)) {
      errors.push(`capability_declared_and_missing:${capability}`);
    }
  }

  const stages = blueprint.stages;
  if (!Array.isArray(stages) || !stages.length) {
    errors.push("blueprint_stages_missing");
  } else {
    const stageIds = new Set();
    const nodeIds = new Set();
    for (const stage of stages) {
      if (!stage || typeof stage !== "object") {
        errors.push("blueprint_stage_not_object");
        continue;
      }
      const stageId = String(stage.id || "").trim();
      if (!stageId) errors.push("blueprint_stage_id_missing");
      else if (stageIds.has(stageId)) errors.push(`blueprint_stage_id_duplicate:${stageId}`);
      else stageIds.add(stageId);
      if (!String(stage.title || "").trim()) errors.push(`blueprint_stage_title_missing:${stageId || "unknown"}`);
      if (!String(stage.capabilityIntent || "").trim()) errors.push(`blueprint_stage_intent_missing:${stageId || "unknown"}`);
      if (!Array.isArray(stage.acceptance) || !stage.acceptance.length) {
        errors.push(`blueprint_stage_acceptance_missing:${stageId || "unknown"}`);
      }

      if (stage.node && typeof stage.node === "object") {
        const nodeId = Number(stage.node.id);
        if (!Number.isInteger(nodeId) || nodeId < 1) errors.push(`blueprint_node_id_invalid:${stageId}:${stage.node.id}`);
        else if (nodeIds.has(nodeId)) errors.push(`blueprint_node_id_duplicate:${nodeId}`);
        else nodeIds.add(nodeId);
        for (const field of ["title", "intro", "mechanics", "durationLimit", "goalValue", "difficulty", "gameplay"]) {
          if (stage.node[field] === undefined || stage.node[field] === null) {
            errors.push(`blueprint_node_field_missing:${stageId}:${field}`);
          }
        }
        validateStageComposition(stage, cardsRoot, errors, warnings);
      } else if (RUNTIME_STATUSES.has(blueprint.status)) {
        errors.push(`runtime_blueprint_stage_node_missing:${stageId || "unknown"}`);
      }
    }
  }

  if (RUNTIME_STATUSES.has(blueprint.status) && missingCapabilities.length) {
    errors.push(`runtime_blueprint_has_missing_capabilities:${missingCapabilities.join(",")}`);
  }
  if (blueprint.status === "alignment_candidate" && !missingCapabilities.length) {
    warnings.push("alignment_candidate_has_no_missing_capabilities");
  }
  const promotion = blueprint.promotion || {};
  const evidenceRefs = Array.isArray(promotion.evidenceRefs) ? promotion.evidenceRefs.filter(Boolean) : [];
  if (["runtime_verified", "promoted"].includes(blueprint.status) && !evidenceRefs.length) {
    errors.push("verified_blueprint_evidence_missing");
  }
  if (blueprint.status === "promoted") {
    if (promotion.state !== "promoted") errors.push("promoted_blueprint_state_invalid");
    if (!promotion.approvedBy || !promotion.approvedAt) errors.push("promoted_blueprint_approval_missing");
  }

  const runtime = blueprint.runtime || {};
  if (!runtime.viewport || !Number.isFinite(Number(runtime.viewport.width)) || !Number.isFinite(Number(runtime.viewport.height))) {
    errors.push("blueprint_viewport_invalid");
  }
  if (!Array.isArray(blueprint.acceptanceGates) || !blueprint.acceptanceGates.length) {
    errors.push("blueprint_acceptance_gates_missing");
  }

  return {
    schemaVersion: "loreweaver.vertical-slice-blueprint-validation.v1",
    status: errors.length ? "failed" : "passed",
    valid: errors.length === 0,
    blueprintId: id || null,
    blueprintStatus: blueprint.status || null,
    compilable: errors.length === 0 && RUNTIME_STATUSES.has(blueprint.status),
    stageCount: Array.isArray(stages) ? stages.length : 0,
    requiredCapabilities,
    missingCapabilities,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)]
  };
}

export function compileVerticalSliceBlueprint(blueprint, options = {}) {
  const validation = validateVerticalSliceBlueprint(blueprint, options);
  if (!validation.valid) {
    throw new Error(`Invalid VerticalSliceBlueprint: ${validation.errors.join(", ")}`);
  }
  if (!validation.compilable) {
    throw new Error(`Blueprint is not runtime compilable: ${blueprint.status}`);
  }

  const stages = blueprint.stages;
  const graphNodes = stages.map((stage, index) => ({
    id: stage.id,
    kind: "gameplay",
    title: stage.title,
    recipeRef: stage.node?.gameplay?.cardId || null,
    sourceNodeId: stage.node.id,
    payload: clone(stage.node),
    metadata: {
      blueprintId: blueprint.id,
      blueprintStageIndex: index,
      capabilityIntent: stage.capabilityIntent,
      acceptance: clone(stage.acceptance),
      ...(stage.metadata || {})
    }
  }));
  const edges = [];
  for (let index = 0; index < graphNodes.length - 1; index += 1) {
    edges.push({
      from: graphNodes[index].id,
      to: graphNodes[index + 1].id,
      when: "success",
      priority: 0
    });
  }
  const durationSeconds = stages.reduce((total, stage) => total + Number(stage.node?.durationLimit || 0), 0);
  const recipeGraph = {
    schemaVersion: "loreweaver.recipe-graph.v1",
    entryNodeId: graphNodes[0].id,
    sessionTargetMinutes: Math.max(1, Math.round((durationSeconds / 60) * 10) / 10),
    cyclePolicy: "forbid",
    nodes: graphNodes,
    edges,
    completionRules: {
      type: "reach_any",
      nodeIds: [graphNodes[graphNodes.length - 1].id]
    },
    metadata: {
      recipeId: blueprint.designRecipeId,
      blueprintId: blueprint.id,
      blueprintHash: blueprintHash(blueprint),
      runtimeCompatibility: "resolved_linear_nodes",
      sourceProject: blueprint.source?.project || null,
      sourceRevision: blueprint.source?.sourceRevision || null
    }
  };
  const graphValidation = validateRecipeGraph(recipeGraph);
  if (!graphValidation.valid) {
    throw new Error(`Blueprint compiled invalid RecipeGraph: ${graphValidation.errors.join(", ")}`);
  }

  return {
    schemaVersion: "loreweaver.blueprint-compilation.v1",
    blueprintId: blueprint.id,
    blueprintHash: blueprintHash(blueprint),
    designRecipeId: blueprint.designRecipeId,
    recipeGraph,
    nodes: stages.map((stage) => clone(stage.node)),
    gameplayCards: [...new Set(stages.map((stage) => stage.node.gameplay.cardId))].sort(),
    requiredCapabilities: clone(blueprint.requiredCapabilities || []),
    acceptanceGates: clone(blueprint.acceptanceGates || []),
    runtime: clone(blueprint.runtime),
    source: clone(blueprint.source)
  };
}
