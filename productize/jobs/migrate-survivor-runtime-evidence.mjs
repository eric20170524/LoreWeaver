#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const RUNTIME_SPEC_SOURCE = path.join(LORE_ROOT, "src/runtime/compileRuntimeSpec.ts");
const REPORTS_DIR = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const LEGACY_RUNTIME_TARGET = "minigame_master.core.demo.survivor_horde";
const EXPECTED_CARD_ID = "survivor_horde";
const EXPECTED_TARGET = "minigame_master/core/demo/survivor_horde";

const REPORT_FILES = [
  "runtime_e2e_survivor_horde_latest.json",
  "standalone_browser_report.json"
];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`cannot read JSON ${path.relative(LORE_ROOT, filePath)}: ${error?.message || error}`);
  }
}

function resolveRuntimeVersion() {
  const source = fs.readFileSync(RUNTIME_SPEC_SOURCE, "utf8");
  const match = source.match(/LOREWEAVER_RUNTIME_VERSION\s*=\s*["']([^"']+)["']/);
  if (!match?.[1]) fail("cannot resolve LOREWEAVER_RUNTIME_VERSION from compileRuntimeSpec.ts");
  return match[1];
}

function validateEvidence(report, fileName, runtimeVersion) {
  if (!report || typeof report !== "object") fail(`${fileName} is not an object`);
  if (report.cardId !== EXPECTED_CARD_ID) {
    fail(`${fileName} cardId mismatch: report=${report.cardId ?? "<missing>"} expected=${EXPECTED_CARD_ID}`);
  }
  if (report.status !== "passed") {
    fail(`${fileName} is not passed evidence: status=${report.status ?? "<missing>"}`);
  }
  if (fileName === "runtime_e2e_survivor_horde_latest.json" && report.target !== EXPECTED_TARGET) {
    fail(`${fileName} target mismatch: report=${report.target ?? "<missing>"} expected=${EXPECTED_TARGET}`);
  }
  if (report.runtimeVersion !== LEGACY_RUNTIME_TARGET && report.runtimeVersion !== runtimeVersion) {
    fail(
      `${fileName} runtimeVersion is neither the known legacy target nor current RuntimeKernel version: ` +
      `report=${report.runtimeVersion ?? "<missing>"} current=${runtimeVersion}`
    );
  }
}

function migrateFile(fileName, runtimeVersion) {
  const filePath = path.join(REPORTS_DIR, fileName);
  if (!fs.existsSync(filePath)) return { fileName, status: "missing" };

  const report = readJson(filePath);
  validateEvidence(report, fileName, runtimeVersion);

  const previousRuntimeVersion = report.runtimeVersion;
  if (previousRuntimeVersion === runtimeVersion && report.runtimeTarget === LEGACY_RUNTIME_TARGET) {
    return { fileName, status: "already_migrated", runtimeVersion, runtimeTarget: report.runtimeTarget };
  }

  const migrated = {
    ...report,
    runtimeVersion,
    runtimeTarget: report.runtimeTarget || LEGACY_RUNTIME_TARGET,
    evidenceIdentityMigration: {
      kind: "legacy_runtime_target_split",
      fromRuntimeVersion: previousRuntimeVersion,
      toRuntimeVersion: runtimeVersion,
      runtimeTarget: report.runtimeTarget || LEGACY_RUNTIME_TARGET,
      preservesObservedGameplayEvidence: true
    }
  };

  fs.writeFileSync(filePath, `${JSON.stringify(migrated, null, 2)}\n`);
  return {
    fileName,
    status: "migrated",
    previousRuntimeVersion,
    runtimeVersion,
    runtimeTarget: migrated.runtimeTarget
  };
}

const runtimeVersion = resolveRuntimeVersion();
const results = REPORT_FILES.map((fileName) => migrateFile(fileName, runtimeVersion));

if (!results.some((result) => result.status !== "missing")) {
  fail("no survivor runtime evidence files found to validate or migrate");
}

console.log(JSON.stringify({
  status: "passed",
  gate: "survivor_runtime_evidence_identity_migration",
  runtimeVersion,
  legacyRuntimeTarget: LEGACY_RUNTIME_TARGET,
  results
}, null, 2));
