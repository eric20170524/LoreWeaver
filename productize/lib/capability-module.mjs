import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CARDS_ROOT = path.join(LORE_ROOT, "minigame_master/gameplay/cards");
const EXECUTABLE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".html"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Capability source must be a JSON object: ${file}`);
  }
  return value;
}

function normalizeCheckKind(tags = [], fallback = "runtime") {
  const normalized = new Set((tags || []).map((item) => String(item).toLowerCase()));
  if (normalized.has("production") || normalized.has("release")) return "release";
  if (normalized.has("performance") || normalized.has("soak")) return "performance";
  if (normalized.has("visual")) return "visual";
  if (normalized.has("browser") || normalized.has("e2e")) return "browser";
  if (normalized.has("static") || normalized.has("schema")) return "static";
  return fallback;
}

function patchPolicyFromSource(source) {
  const explicitAllowed = source.patchPolicy?.defaultAllowedLevels;
  const derived = [];
  for (const spec of Object.values(source.knobs || {})) {
    const level = spec && typeof spec === "object" ? spec.patchLevel : null;
    if (["L0", "L1", "L2"].includes(level)) derived.push(level);
  }
  const allowed = uniqueStrings(
    Array.isArray(explicitAllowed) && explicitAllowed.length
      ? explicitAllowed.filter((level) => ["L0", "L1", "L2"].includes(level))
      : ["L0", ...derived]
  );
  return {
    defaultAllowedLevels: allowed.length ? allowed : ["L0"],
    requiresReview: uniqueStrings(source.patchPolicy?.requiresReview || ["L3", "L4"])
      .filter((level) => ["L3", "L4"].includes(level))
  };
}

function checksFromSource(source) {
  const checks = [];
  if (source.testFixture?.path) {
    checks.push({
      id: String(source.testFixture.type || "fixture"),
      kind: normalizeCheckKind(source.testFixture.assertions || [], "runtime"),
      ref: String(source.testFixture.path)
    });
  }
  for (const scenario of source.testScenarios || []) {
    if (!scenario?.id) continue;
    checks.push({
      id: String(scenario.id),
      kind: normalizeCheckKind(scenario.tags || []),
      ref: `testScenario:${scenario.id}`
    });
  }
  for (const combination of source.verifiedCombinations || []) {
    checks.push({
      id: `combination:${combination}`,
      kind: "static",
      ref: String(combination)
    });
  }
  const seen = new Set();
  return checks.filter((check) => {
    const key = `${check.id}\u0000${check.kind}\u0000${check.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferKind(source, requestedKind = null) {
  if (requestedKind) return requestedKind;
  if (Array.isArray(source.compatibleBaseCards) || Array.isArray(source.modifierFor)) {
    return "modifier";
  }
  return "gameplay_card";
}

export function capabilityModuleDescriptorFromSource(source, {
  kind = null,
  sourcePath = null
} = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Capability source must be an object");
  }
  const resolvedKind = inferKind(source, kind);
  if (!["gameplay_card", "modifier", "runtime_feature", "presentation"].includes(resolvedKind)) {
    throw new Error(`Unsupported capability module kind: ${resolvedKind}`);
  }
  const sourceType = resolvedKind === "gameplay_card"
    ? "gameplay_card"
    : resolvedKind === "modifier"
      ? "modifier"
      : resolvedKind === "runtime_feature"
        ? "runtime_feature_pack"
        : "presentation_contract";
  const compatibleWith = uniqueStrings(source.compatibleBaseCards || source.modifierFor || []);
  const outputs = resolvedKind === "gameplay_card"
    ? uniqueStrings([
        ...(source.objectives || []),
        ...Object.keys(source.resultContract || {})
      ])
    : uniqueStrings(source.emits || source.outputs || []);
  const maturityNotes = uniqueStrings([
    source.maturityImpact?.notes,
    ...(source.exportPolicy?.certificationNotes || []),
    source.exportPolicy?.blockReason
  ]);

  const descriptor = {
    schemaVersion: "loreweaver.capability-module.v1",
    id: String(source.id || "").trim(),
    title: String(source.title || source.id || "").trim(),
    kind: resolvedKind,
    status: String(source.status || "experimental"),
    sourceRef: {
      type: sourceType,
      path: String(sourcePath || "").trim()
    },
    runtimeBinding: {
      authority: "LoreWeaverRuntimeKernel",
      adapter: source.runtime?.adapter ? String(source.runtime.adapter) : null,
      engineTargets: uniqueStrings(source.runtime?.engineTargets || [])
    },
    publicInterface: {
      inputs: clone(source.inputs || Object.keys(source.knobs || {})),
      outputs,
      compatibleWith
    },
    config: clone(source.knobs || source.config || {}),
    requiredSystems: uniqueStrings(source.requiredCoreSystems || source.requiredSystems || []),
    patchAuthority: patchPolicyFromSource(source),
    checks: checksFromSource(source),
    provenance: uniqueStrings(source.sourceProvenance || []),
    fit: {
      goodFor: uniqueStrings(source.fit?.goodFor || []),
      poorFor: uniqueStrings(source.fit?.poorFor || [])
    },
    knownRisks: uniqueStrings(source.knownRisks || []),
    maturity: {
      legacyStatus: String(source.status || "experimental"),
      productionReady: source.exportPolicy?.productionReady === true,
      notes: maturityNotes
    }
  };
  const validation = validateCapabilityModuleDescriptor(descriptor);
  if (!validation.valid) {
    throw new Error(`Invalid CapabilityModule descriptor: ${validation.errors.join(", ")}`);
  }
  return descriptor;
}

export function loadCapabilityModuleDescriptor({
  id,
  kind = "gameplay_card",
  cardsRoot = DEFAULT_CARDS_ROOT
}) {
  const sourcePath = kind === "modifier"
    ? path.join(cardsRoot, "modifiers", `${id}.json`)
    : path.join(cardsRoot, `${id}.json`);
  if (!fs.existsSync(sourcePath)) throw new Error(`Capability source not found: ${sourcePath}`);
  const relative = path.relative(LORE_ROOT, sourcePath).split(path.sep).join("/");
  return capabilityModuleDescriptorFromSource(readJson(sourcePath), {
    kind,
    sourcePath: relative
  });
}

export function validateCapabilityModuleDescriptor(descriptor) {
  const errors = [];
  const warnings = [];
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    return { valid: false, status: "failed", errors: ["descriptor_not_object"], warnings };
  }
  if (descriptor.schemaVersion !== "loreweaver.capability-module.v1") {
    errors.push("schema_version_invalid");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(descriptor.id || ""))) {
    errors.push("capability_id_invalid");
  }
  if (!["gameplay_card", "modifier", "runtime_feature", "presentation"].includes(descriptor.kind)) {
    errors.push(`capability_kind_invalid:${descriptor.kind || "missing"}`);
  }
  if (descriptor.runtimeBinding?.authority !== "LoreWeaverRuntimeKernel") {
    errors.push("runtime_authority_must_be_LoreWeaverRuntimeKernel");
  }
  const sourcePath = String(descriptor.sourceRef?.path || "");
  if (!sourcePath) errors.push("source_ref_path_missing");
  if (EXECUTABLE_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) {
    errors.push(`executable_source_ref_forbidden:${sourcePath}`);
  }
  if (path.isAbsolute(sourcePath) || sourcePath.includes("..")) {
    errors.push(`source_ref_must_be_repo_relative:${sourcePath}`);
  }

  const allowed = descriptor.patchAuthority?.defaultAllowedLevels || [];
  const review = descriptor.patchAuthority?.requiresReview || [];
  if (!Array.isArray(allowed) || allowed.some((level) => !["L0", "L1", "L2"].includes(level))) {
    errors.push("automatic_patch_authority_must_be_L0_L2");
  }
  if (!Array.isArray(review) || !["L3", "L4"].every((level) => review.includes(level))) {
    errors.push("L3_L4_review_requirement_missing");
  }
  if (descriptor.kind === "gameplay_card" && !descriptor.runtimeBinding?.adapter) {
    errors.push("gameplay_card_adapter_missing");
  }
  if (descriptor.kind === "modifier" && !(descriptor.publicInterface?.compatibleWith || []).length) {
    errors.push("modifier_compatibility_missing");
  }
  if (!(descriptor.checks || []).length) warnings.push("capability_checks_missing");
  if (!(descriptor.provenance || []).length) warnings.push("capability_provenance_missing");

  return {
    schemaVersion: "loreweaver.capability-module-validation.v1",
    status: errors.length ? "failed" : "passed",
    valid: errors.length === 0,
    capabilityId: descriptor.id || null,
    kind: descriptor.kind || null,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)]
  };
}
