#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCapabilityModuleDescriptor,
  validateCapabilityModuleDescriptor
} from "../lib/capability-module.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = path.join(ROOT, "minigame_master/contracts/capability_module.schema.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function assert(value, message) {
  if (!value) throw new Error(message);
}

const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
assert(schema.$id, "CapabilityModule schema must declare $id");

const survivor = loadCapabilityModuleDescriptor({
  id: "survivor_horde",
  kind: "gameplay_card"
});
const survivorValidation = validateCapabilityModuleDescriptor(survivor);
assert(survivorValidation.valid, JSON.stringify(survivorValidation));
assert(survivor.kind === "gameplay_card", "survivor_horde maps to gameplay_card module");
assert(survivor.runtimeBinding.authority === "LoreWeaverRuntimeKernel", "runtime authority remains unique");
assert(survivor.runtimeBinding.adapter === "SurvivorHordeAdapter", "existing adapter is referenced, not copied");
assert(survivor.sourceRef.path.endsWith("survivor_horde.json"), "descriptor points to catalog data");
assert(Object.prototype.hasOwnProperty.call(survivor.config, "durationSec"), "card knobs become public config");
assert(survivor.patchAuthority.requiresReview.includes("L3"), "L3 requires review");
assert(survivor.patchAuthority.requiresReview.includes("L4"), "L4 requires review");
assert(survivor.checks.some((check) => check.kind === "browser"), "existing browser evidence contract is surfaced");
assert(survivor.provenance.length > 0, "existing provenance is surfaced");

const bossPhases = loadCapabilityModuleDescriptor({
  id: "boss_phases",
  kind: "modifier"
});
const bossValidation = validateCapabilityModuleDescriptor(bossPhases);
assert(bossValidation.valid, JSON.stringify(bossValidation));
assert(bossPhases.kind === "modifier", "boss phases maps to modifier module");
assert(bossPhases.runtimeBinding.adapter === null, "modifier does not invent a second adapter");
assert(bossPhases.publicInterface.compatibleWith.includes("survivor_horde"), "modifier compatibility is preserved");
assert(Object.prototype.hasOwnProperty.call(bossPhases.config, "phaseThresholds"), "modifier knobs become public config");
assert(bossPhases.checks.some((check) => check.id.includes("survivor_horde+boss_phases")), "verified composition is exposed");

const executable = clone(survivor);
executable.sourceRef.path = "scripts/copied-vibegame-module.js";
const executableValidation = validateCapabilityModuleDescriptor(executable);
assert(!executableValidation.valid, "arbitrary JS cannot become a CapabilityModule source");
assert(executableValidation.errors.some((error) => error.startsWith("executable_source_ref_forbidden")));

const secondRuntime = clone(survivor);
secondRuntime.runtimeBinding.authority = "VibeGameSceneTree";
const secondRuntimeValidation = validateCapabilityModuleDescriptor(secondRuntime);
assert(!secondRuntimeValidation.valid, "second runtime authority must be rejected");
assert(secondRuntimeValidation.errors.includes("runtime_authority_must_be_LoreWeaverRuntimeKernel"));

const elevated = clone(survivor);
elevated.patchAuthority.defaultAllowedLevels.push("L3");
const elevatedValidation = validateCapabilityModuleDescriptor(elevated);
assert(!elevatedValidation.valid, "automatic module authority cannot include L3");
assert(elevatedValidation.errors.includes("automatic_patch_authority_must_be_L0_L2"));

const incompatibleShape = clone(bossPhases);
incompatibleShape.publicInterface.compatibleWith = [];
const incompatibleValidation = validateCapabilityModuleDescriptor(incompatibleShape);
assert(!incompatibleValidation.valid, "modifier must retain declared base-card compatibility");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.capability-module-check.v1",
  status: "passed",
  descriptors: [
    {
      id: survivor.id,
      kind: survivor.kind,
      adapter: survivor.runtimeBinding.adapter,
      configKeys: Object.keys(survivor.config).length,
      checks: survivor.checks.length
    },
    {
      id: bossPhases.id,
      kind: bossPhases.kind,
      compatibleWith: bossPhases.publicInterface.compatibleWith,
      configKeys: Object.keys(bossPhases.config).length,
      checks: bossPhases.checks.length
    }
  ],
  checks: [
    "cards_and_modifiers_project_to_one_descriptor_contract",
    "existing_runtime_authority_is_preserved",
    "public_knobs_and_interfaces_are_exposed",
    "provenance_and_checks_are_preserved",
    "arbitrary_executable_source_is_rejected",
    "second_runtime_authority_is_rejected",
    "L3_L4_remain_review_only"
  ]
}, null, 2));
