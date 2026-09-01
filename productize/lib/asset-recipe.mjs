import path from "node:path";

const STATUS_ORDER = Object.freeze([
  "observed",
  "candidate",
  "verified",
  "approved",
  "promoted",
  "rejected"
]);
const OPERATION_TYPES = new Set([
  "analyze",
  "remove_background",
  "decompose",
  "cut_frames",
  "concatenate",
  "build_atlas",
  "edge_cleanup",
  "alpha_cleanup",
  "label",
  "upscale",
  "convert",
  "normalize_audio",
  "trim_audio",
  "mix_audio",
  "manual_review"
]);
const EXECUTABLE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".sh", ".bat", ".cmd"]);
const FORBIDDEN_PARAMETER_KEYS = new Set([
  "command",
  "shell",
  "script",
  "scriptPath",
  "entrypoint",
  "executable",
  "code"
]);
const PRIVATE_MARKERS = ["/users/", "/home/", "\\users\\", ".env", "secrets/", "credentials", "private/"];
const SHA256_RE = /^[0-9a-f]{64}$/;

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function unsafePath(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (path.isAbsolute(text) || text.split(/[\\/]+/).includes("..")) return true;
  const lower = text.toLowerCase();
  return PRIVATE_MARKERS.some((marker) => lower.includes(marker));
}

function executableLike(value) {
  const text = String(value || "").trim();
  return EXECUTABLE_EXTENSIONS.has(path.extname(text).toLowerCase());
}

function collectForbiddenParameterKeys(value, parent = "parameters", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenParameterKeys(item, `${parent}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    const current = `${parent}.${key}`;
    if (FORBIDDEN_PARAMETER_KEYS.has(key)) findings.push(current);
    collectForbiddenParameterKeys(child, current, findings);
  }
  return findings;
}

function sourceArtifactIds(source) {
  return [
    ...(source?.references || []),
    ...(source?.rawArtifacts || [])
  ].map((item) => String(item?.id || "").trim()).filter(Boolean);
}

function requiredVerificationKinds(recipe) {
  const kinds = new Set(["integrity", "runtime_usage", "license"]);
  if (["image", "sprite_sheet", "atlas", "mixed"].includes(recipe.assetKind)) {
    kinds.add("vlm");
    kinds.add("edges");
  }
  if (recipe.assetKind === "atlas" || recipe.assetKind === "sprite_sheet" || recipe.assetKind === "mixed") {
    kinds.add("atlas");
  }
  if (recipe.assetKind === "audio" || recipe.assetKind === "mixed") kinds.add("audio");
  return [...kinds];
}

function evidenceEligible(evidence) {
  return Boolean(
    evidence
    && evidence.status === "passed"
    && evidence.real === true
    && evidence.fixture !== true
    && evidence.synthetic !== true
    && evidence.stale !== true
    && !unsafePath(evidence.report)
  );
}

export function validateAssetRecipe(recipe) {
  const errors = [];
  const warnings = [];
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return {
      schemaVersion: "loreweaver.asset-recipe-validation.v1",
      status: "failed",
      valid: false,
      errors: ["asset_recipe_not_object"],
      warnings
    };
  }
  if (recipe.schemaVersion !== "loreweaver.asset-recipe.v1") errors.push("schema_version_invalid");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(recipe.id || ""))) errors.push("asset_recipe_id_invalid");
  if (!present(recipe.title)) errors.push("asset_recipe_title_missing");
  if (!STATUS_ORDER.includes(recipe.status)) errors.push(`asset_recipe_status_invalid:${recipe.status || "missing"}`);
  if (!["image", "sprite_sheet", "atlas", "audio", "mixed"].includes(recipe.assetKind)) {
    errors.push(`asset_kind_invalid:${recipe.assetKind || "missing"}`);
  }

  const source = recipe.source || {};
  if (!["generated", "reference_guided", "procedural", "imported", "mixed"].includes(source.mode)) {
    errors.push(`source_mode_invalid:${source.mode || "missing"}`);
  }
  if (!present(source.provider)) errors.push("source_provider_missing");
  if (!present(source.license)) errors.push("source_license_missing");
  const hasPrompt = present(source.rawPrompt);
  const hasReference = Array.isArray(source.references) && source.references.length > 0;
  const hasRawArtifact = Array.isArray(source.rawArtifacts) && source.rawArtifacts.length > 0;
  if (!hasPrompt && !hasReference && !hasRawArtifact) errors.push("source_trace_missing");
  if (source.mode === "generated" && !hasPrompt) errors.push("generated_source_raw_prompt_missing");
  if (source.mode === "reference_guided" && (!hasPrompt || !hasReference)) {
    errors.push("reference_guided_source_requires_prompt_and_reference");
  }

  const initialIds = new Set();
  for (const collectionName of ["references", "rawArtifacts"]) {
    const collection = Array.isArray(source[collectionName]) ? source[collectionName] : [];
    for (const artifact of collection) {
      const id = String(artifact?.id || "").trim();
      if (!id) errors.push(`${collectionName}_artifact_id_missing`);
      else if (initialIds.has(id)) errors.push(`source_artifact_id_duplicate:${id}`);
      else initialIds.add(id);
      if (unsafePath(artifact?.path)) errors.push(`source_artifact_path_unsafe:${id || "unknown"}`);
      if (!SHA256_RE.test(String(artifact?.sha256 || ""))) errors.push(`source_artifact_hash_invalid:${id || "unknown"}`);
      if (!present(artifact?.license)) errors.push(`source_artifact_license_missing:${id || "unknown"}`);
    }
  }

  const operations = Array.isArray(recipe.operations) ? recipe.operations : [];
  if (!operations.length) errors.push("asset_operations_missing");
  const knownIds = new Set(initialIds);
  const operationIds = new Set();
  for (const operation of operations) {
    const operationId = String(operation?.id || "").trim();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(operationId)) errors.push(`operation_id_invalid:${operationId || "missing"}`);
    else if (operationIds.has(operationId)) errors.push(`operation_id_duplicate:${operationId}`);
    else operationIds.add(operationId);
    if (!OPERATION_TYPES.has(operation?.type)) errors.push(`operation_type_invalid:${operationId}:${operation?.type || "missing"}`);
    if (!present(operation?.port)) errors.push(`operation_port_missing:${operationId || "unknown"}`);
    else if (unsafePath(operation.port) || executableLike(operation.port)) errors.push(`operation_port_must_be_tool_neutral:${operationId}:${operation.port}`);
    for (const key of collectForbiddenParameterKeys(operation?.parameters || {})) {
      errors.push(`executable_parameter_forbidden:${operationId}:${key}`);
    }
    const inputs = uniqueStrings(operation?.inputs || []);
    const outputs = uniqueStrings(operation?.outputs || []);
    if (!inputs.length) errors.push(`operation_inputs_missing:${operationId || "unknown"}`);
    if (!outputs.length) errors.push(`operation_outputs_missing:${operationId || "unknown"}`);
    for (const input of inputs) {
      if (!knownIds.has(input)) errors.push(`operation_input_unresolved:${operationId}:${input}`);
    }
    for (const output of outputs) {
      if (knownIds.has(output)) errors.push(`operation_output_duplicate:${operationId}:${output}`);
      knownIds.add(output);
    }
  }

  const outputs = recipe.outputs || {};
  if (unsafePath(outputs.manifestPath)) errors.push("output_manifest_path_unsafe");
  const finalAssets = Array.isArray(outputs.finalAssets) ? outputs.finalAssets : [];
  const manifestKeys = uniqueStrings(outputs.finalManifestKeys || []);
  if (!finalAssets.length) errors.push("final_assets_missing");
  if (!manifestKeys.length) errors.push("final_manifest_keys_missing");
  const finalKeys = new Set();
  const finalHashes = new Set();
  for (const asset of finalAssets) {
    const key = String(asset?.key || "").trim();
    if (!key) errors.push("final_asset_key_missing");
    else if (finalKeys.has(key)) errors.push(`final_asset_key_duplicate:${key}`);
    else finalKeys.add(key);
    if (!knownIds.has(key)) errors.push(`final_asset_not_produced_by_recipe:${key || "unknown"}`);
    if (unsafePath(asset?.path)) errors.push(`final_asset_path_unsafe:${key || "unknown"}`);
    const hash = String(asset?.sha256 || "");
    if (!SHA256_RE.test(hash)) errors.push(`final_asset_hash_invalid:${key || "unknown"}`);
    else finalHashes.add(hash);
    if (!Number.isInteger(asset?.bytes) || asset.bytes < 1) errors.push(`final_asset_bytes_invalid:${key || "unknown"}`);
    if (asset?.usedByRuntime === true && !(asset.usageRefs || []).length) {
      errors.push(`runtime_used_asset_usage_ref_missing:${key || "unknown"}`);
    }
  }
  for (const key of manifestKeys) {
    if (!finalKeys.has(key)) errors.push(`manifest_key_has_no_final_asset:${key}`);
  }
  for (const key of finalKeys) {
    if (!manifestKeys.includes(key)) errors.push(`final_asset_missing_manifest_key:${key}`);
  }

  const verification = Array.isArray(recipe.verification) ? recipe.verification : [];
  const eligibleByKind = new Map();
  for (const evidence of verification) {
    const id = String(evidence?.id || "").trim();
    if (!id) errors.push("verification_id_missing");
    if (unsafePath(evidence?.report)) errors.push(`verification_report_path_unsafe:${id || "unknown"}`);
    const outputHashes = new Set(evidence?.outputHashes || []);
    for (const hash of outputHashes) {
      if (!SHA256_RE.test(String(hash))) errors.push(`verification_output_hash_invalid:${id}:${hash}`);
      else if (!finalHashes.has(hash)) warnings.push(`verification_references_nonfinal_hash:${id}:${hash}`);
    }
    if (evidenceEligible(evidence)) {
      if (!eligibleByKind.has(evidence.kind)) eligibleByKind.set(evidence.kind, []);
      eligibleByKind.get(evidence.kind).push(evidence);
    }
  }

  const requiresVerifiedEvidence = ["verified", "approved", "promoted"].includes(recipe.status);
  if (requiresVerifiedEvidence) {
    for (const asset of finalAssets) {
      if (asset.usedByRuntime !== true) errors.push(`verified_recipe_contains_unused_asset:${asset.key}`);
      if (!(asset.usageRefs || []).length) errors.push(`verified_recipe_usage_ref_missing:${asset.key}`);
    }
    for (const kind of requiredVerificationKinds(recipe)) {
      const entries = eligibleByKind.get(kind) || [];
      if (!entries.length) {
        errors.push(`required_verification_missing:${kind}`);
        continue;
      }
      const coversAllOutputs = entries.some((entry) => {
        const hashes = new Set(entry.outputHashes || []);
        return [...finalHashes].every((hash) => hashes.has(hash));
      });
      if (!coversAllOutputs) errors.push(`verification_does_not_bind_all_outputs:${kind}`);
    }
  } else {
    const missingKinds = requiredVerificationKinds(recipe).filter((kind) => !(eligibleByKind.get(kind) || []).length);
    if (missingKinds.length) warnings.push(`candidate_verification_incomplete:${missingKinds.join(",")}`);
  }

  const promotion = recipe.promotion || {};
  if (["approved", "promoted"].includes(recipe.status)) {
    if (!present(promotion.approvedBy) || !present(promotion.approvedAt)) errors.push("asset_recipe_approval_missing");
    if (!present(promotion.destination) || unsafePath(promotion.destination)) errors.push("asset_recipe_destination_missing_or_unsafe");
    if (promotion.conflictChecked !== true) errors.push("asset_recipe_conflict_check_required");
  }

  return {
    schemaVersion: "loreweaver.asset-recipe-validation.v1",
    status: errors.length ? "failed" : "passed",
    valid: errors.length === 0,
    recipeId: recipe.id || null,
    recipeStatus: recipe.status || null,
    promotable: errors.length === 0 && ["approved", "promoted"].includes(recipe.status),
    operationCount: operations.length,
    finalAssetCount: finalAssets.length,
    manifestKeyCount: manifestKeys.length,
    requiredVerificationKinds: requiredVerificationKinds(recipe),
    eligibleVerificationKinds: [...eligibleByKind.keys()].sort(),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)]
  };
}

export function assertAssetRecipeValid(recipe) {
  const validation = validateAssetRecipe(recipe);
  if (!validation.valid) throw new Error(`Invalid AssetRecipe: ${validation.errors.join(", ")}`);
  return validation;
}
