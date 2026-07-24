#!/usr/bin/env node
/**
 * Gate readiness for rhythm_timing (gate_verified slice, not production_ready).
 *
 * Requires:
 *  - runtime_e2e_rhythm_timing_latest.json status=passed, cardId match
 *  - level recipe experimental compile pass (optional soft if missing)
 *  - card status may be runtime_ready or gate_verified
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const recipe = readJson(path.join(REPORTS, "level_recipe_compile_rhythm_latest.json"));

  const checks = [
    check("card_present", Boolean(card?.id === "rhythm_timing"), card?.id),
    check(
      "card_runtime_or_gate",
      card?.status === "runtime_ready" || card?.status === "gate_verified",
      card?.status
    ),
    check("export_not_production", card?.exportPolicy?.productionReady !== true, String(card?.exportPolicy?.productionReady)),
    check("e2e_present", Boolean(e2e), e2e ? "found" : "missing"),
    check("e2e_passed", e2e?.status === "passed", e2e?.status),
    check("e2e_cardId", e2e?.cardId === "rhythm_timing", e2e?.cardId),
    check("e2e_releaseEligible_false", e2e?.releaseEligible === false, String(e2e?.releaseEligible)),
    check(
      "e2e_flows",
      Array.isArray(e2e?.flows) && e2e.flows.some((f) => f.id === "desktop_retreat"),
      (e2e?.flows || []).map((f) => f.id).join(",")
    ),
    check(
      "theme_fixtures",
      fs.existsSync(
        path.join(
          LORE_ROOT,
          "minigame_master/gameplay/cards/fixtures/rhythm_timing/theme_content_pack.fixture.json"
        )
      ) &&
        fs.existsSync(
          path.join(
            LORE_ROOT,
            "minigame_master/gameplay/cards/fixtures/rhythm_timing/theme_content_pack.neon.json"
          )
        ),
      "temple+neon"
    ),
    check(
      "demo_present",
      fs.existsSync(path.join(LORE_ROOT, "minigame_master/core/demo/rhythm_timing/main.js")),
      "demo/main.js"
    )
  ];

  if (recipe) {
    checks.push(check("recipe_compile", recipe.status === "passed", recipe.status));
  }

  const failed = checks.filter((c) => !c.ok);
  const gateVerifiedEligible = failed.length === 0;
  const productionReadyEligible = false; // hard residual for this card

  const report = {
    schemaVersion: "loreweaver.rhythm-gate-readiness.v1",
    status: gateVerifiedEligible ? "passed" : "failed",
    createdAt: new Date().toISOString(),
    cardId: "rhythm_timing",
    gateVerifiedEligible,
    productionReadyEligible,
    checks,
    residuals: [
      "no production_ready certification",
      "no standalone export E2E for rhythm_timing",
      "no 10min soak / device FPS",
      "no VLM visual audit",
      "no human playtest signoff",
      "boss phase skipped in demo (skipBoss)"
    ],
    notes: [
      "gate_verified requires demo E2E + fixtures only for this lightweight card.",
      "production_ready still blocked by full DoD residuals."
    ]
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, "rhythm_gate_readiness_latest.json");
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!gateVerifiedEligible) process.exit(1);
}

main();
