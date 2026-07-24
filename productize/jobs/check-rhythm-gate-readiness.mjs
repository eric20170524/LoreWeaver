#!/usr/bin/env node
/**
 * Gate / production readiness for rhythm_timing.
 *
 * gate_verified: demo E2E + fixtures
 * production_ready: full evidence package via evaluateProductionExportGate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateProductionExportGate } from "../lib/production-export-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const CARD_PATH = path.join(LORE_ROOT, "minigame_master/gameplay/cards/rhythm_timing.json");

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function check(name, cond, detail) {
  return { name, ok: Boolean(cond), detail: detail || (cond ? "ok" : "failed") };
}

function main() {
  const card = readJson(CARD_PATH);
  const e2e = readJson(path.join(REPORTS, "runtime_e2e_rhythm_timing_latest.json"));
  const browser = readJson(path.join(REPORTS, "standalone_browser_report_rhythm_timing.json"));
  const visual = readJson(path.join(REPORTS, "visual_audit_rhythm_timing_latest.json"));
  const perf = readJson(path.join(REPORTS, "performance_report_rhythm_timing_latest.json"));
  const recipe = readJson(path.join(REPORTS, "level_recipe_compile_rhythm_latest.json"));

  const checks = [
    check("card_present", Boolean(card?.id === "rhythm_timing"), card?.id),
    check(
      "card_status_gate_or_prod",
      ["gate_verified", "production_ready"].includes(card?.status),
      card?.status
    ),
    check("e2e_present", Boolean(e2e), e2e ? "found" : "missing"),
    check("e2e_passed", e2e?.status === "passed", e2e?.status),
    check("e2e_cardId", e2e?.cardId === "rhythm_timing", e2e?.cardId),
    check(
      "theme_fixtures",
      fs.existsSync(
        path.join(
          LORE_ROOT,
          "minigame_master/gameplay/cards/fixtures/rhythm_timing/theme_content_pack.fixture.json"
        )
      ),
      "temple"
    ),
    check(
      "demo_present",
      fs.existsSync(path.join(LORE_ROOT, "minigame_master/core/demo/rhythm_timing/main.js")),
      "demo/main.js"
    )
  ];

  if (recipe) checks.push(check("recipe_compile", recipe.status === "passed", recipe.status));

  const gateFailed = checks.filter((c) => !c.ok);
  const gateVerifiedEligible = gateFailed.length === 0;

  const prodChecks = [
    check("export_policy_true", card?.exportPolicy?.productionReady === true, String(card?.exportPolicy?.productionReady)),
    check("status_production_ready", card?.status === "production_ready", card?.status),
    check("e2e_releaseEligible", e2e?.releaseEligible === true, String(e2e?.releaseEligible)),
    check("browser_summary", browser?.status === "passed" && browser?.releaseEligible === true, browser?.status),
    check("visual_passed", visual?.status === "passed", visual?.status),
    check("perf_passed", perf?.status === "passed", perf?.status)
  ];

  // Full hard-gate evaluation (uses live card JSON)
  const exportGate = evaluateProductionExportGate({ card, reportsDir: REPORTS });
  prodChecks.push(
    check(
      "production_export_gate",
      exportGate.productionExportAllowed === true,
      exportGate.reasons.slice(0, 3).join(" | ") || "allowed"
    )
  );

  const prodFailed = prodChecks.filter((c) => !c.ok);
  const productionReadyEligible =
    gateVerifiedEligible &&
    prodFailed.length === 0 &&
    exportGate.productionExportAllowed === true;

  const report = {
    schemaVersion: "loreweaver.rhythm-gate-readiness.v1",
    status: productionReadyEligible
      ? "passed"
      : gateVerifiedEligible
        ? "gate_only"
        : "failed",
    createdAt: new Date().toISOString(),
    cardId: "rhythm_timing",
    gateVerifiedEligible,
    productionReadyEligible,
    productionExportAllowed: exportGate.productionExportAllowed,
    exportGateReasons: exportGate.reasons,
    checks: [...checks, ...prodChecks],
    residuals: productionReadyEligible
      ? [
          "device_class_fps: headless soak proxy only",
          "vlm_visual_overflow: deferred",
          "standalone zip host E2E optional residual for lightweight card"
        ]
      : [
          "awaiting production evidence and/or card exportPolicy",
          ...exportGate.reasons.slice(0, 5)
        ]
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS, "rhythm_gate_readiness_latest.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
  if (!gateVerifiedEligible) process.exit(1);
}

main();
