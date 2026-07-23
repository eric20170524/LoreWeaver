#!/usr/bin/env node
/**
 * C7 readiness aggregator for survivor_horde.
 *
 * Classifies:
 *   - gate_verified_eligible: automated gates green
 *   - production_ready_eligible: full DoD including human sign-off + releaseEligible
 *
 * Does NOT mutate card JSON. Prints report and writes:
 *   minigame_master/capabilities/reports/survivor_c7_readiness_latest.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const REPORTS = path.join(LORE_ROOT, "minigame_master/capabilities/reports");
const CARD_PATH = path.join(LORE_ROOT, "minigame_master/gameplay/cards/survivor_horde.json");
const PLAYTEST_PATH = path.join(
  LORE_ROOT,
  "docs/reports/step_C7_human_playtest_signoff.md"
);

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function check(id, ok, detail = "") {
  return { id, ok: Boolean(ok), detail };
}

function main() {
  const card = readJson(CARD_PATH);
  if (!card || card.id !== "survivor_horde") {
    console.error("[FAIL] survivor_horde card missing");
    process.exit(1);
  }

  const smoke = readJson(path.join(REPORTS, "node_smoke_latest.json"));
  const demoE2e = readJson(path.join(REPORTS, "runtime_e2e_survivor_horde_latest.json"));
  const standaloneE2e = readJson(path.join(REPORTS, "runtime_e2e_standalone_survivor_latest.json"));
  const browserSummary = readJson(path.join(REPORTS, "standalone_browser_report.json"));
  const visual = readJson(path.join(REPORTS, "visual_audit_latest.json"));
  const perf = readJson(path.join(REPORTS, "performance_report_latest.json"));
  const goldenExists = fs.existsSync(
    path.join(LORE_ROOT, "minigame_master/gameplay/cards/fixtures/survivor_horde/golden_asset_fixture.json")
  );
  const themeSkin = readJson(path.join(REPORTS, "survivor_theme_skin_latest.json"));

  const playtestText = fs.existsSync(PLAYTEST_PATH)
    ? fs.readFileSync(PLAYTEST_PATH, "utf8")
    : "";
  // Only honor metadata in the first ~40 lines so instructional text cannot fake approval.
  const playtestMeta = playtestText.split("\n").slice(0, 40).join("\n");
  const humanSigned =
    (/\|\s*signoff_status\s*\|\s*approved\s*\|/i.test(playtestMeta) ||
      /^signoff_status:\s*approved\b/im.test(playtestMeta)) &&
    !/\|\s*signoff_status\s*\|\s*pending\s*\|/i.test(playtestMeta) &&
    !/^signoff_status:\s*pending\b/im.test(playtestMeta);

  const gateChecks = [
    check(
      "node_smoke_passed",
      smoke?.status === "passed" && (smoke?.summary?.failed ?? smoke?.failed ?? 0) === 0,
      smoke ? `passed=${smoke.summary?.passed ?? smoke.passed}` : "missing"
    ),
    check(
      "demo_e2e_passed",
      demoE2e?.status === "passed" && demoE2e?.cardId === "survivor_horde",
      demoE2e ? `specHash=${demoE2e.specHash}` : "missing"
    ),
    check(
      "standalone_e2e_passed",
      standaloneE2e?.status === "passed" && standaloneE2e?.cardId === "survivor_horde",
      standaloneE2e ? `artAtlas=${standaloneE2e.assertions?.artAtlasLoaded}` : "missing"
    ),
    check(
      "browser_summary_passed",
      browserSummary?.status === "passed",
      browserSummary ? `releaseEligible=${browserSummary.releaseEligible}` : "missing"
    ),
    check(
      "visual_passed",
      visual?.status === "passed" && visual?.cardId === "survivor_horde",
      visual ? `screens=${(visual.screenshots || []).length}` : "missing"
    ),
    check(
      "performance_soak_passed",
      perf?.status === "passed" &&
        perf?.cardId === "survivor_horde" &&
        (perf?.isFullDodDuration === true || (perf?.soakSeconds || 0) >= 600),
      perf
        ? `soak=${perf.soakSeconds}s full=${perf.isFullDodDuration} avgFps=${perf.summary?.avgFps}`
        : "missing"
    ),
    check("golden_fixture_present", goldenExists, goldenExists ? "ok" : "missing golden_asset_fixture"),
    check(
      "theme_skin_swap_passed",
      !themeSkin || themeSkin.status === "passed",
      themeSkin
        ? `status=${themeSkin.status}`
        : "optional: run npm run check:survivor-theme-skin"
    )
  ];

  const productionBlockers = [
    check(
      "human_playtest_approved",
      humanSigned,
      humanSigned ? "signoff found" : "docs/reports/step_C7_human_playtest_signoff.md not approved"
    ),
    check(
      "release_eligible_true",
      browserSummary?.releaseEligible === true && standaloneE2e?.releaseEligible === true,
      "browser/standalone reports still releaseEligible=false by policy"
    ),
    check(
      "device_class_fps_evidence",
      false,
      "headless soak is not device-class P95>=55 evidence"
    ),
    check(
      "vlm_visual_overflow",
      false,
      "VLM text overflow / HUD occlusion audit not run"
    ),
    check(
      "export_policy_and_status_aligned",
      card.status === "production_ready" && card.exportPolicy?.productionReady === true,
      `status=${card.status} productionReady=${card.exportPolicy?.productionReady}`
    )
  ];

  const gateVerifiedEligible = gateChecks.every((c) => c.ok);
  const productionReadyEligible =
    gateVerifiedEligible && productionBlockers.every((c) => c.ok);

  const recommendedStatus = productionReadyEligible
    ? "production_ready"
    : gateVerifiedEligible
      ? "gate_verified"
      : card.status === "runtime_ready" || card.status === "gate_verified"
        ? card.status
        : "runtime_ready";

  const report = {
    schemaVersion: "loreweaver.survivor-c7-readiness.v1",
    cardId: "survivor_horde",
    createdAt: new Date().toISOString(),
    currentStatus: card.status,
    recommendedStatus,
    gateVerifiedEligible,
    productionReadyEligible,
    releaseEligible: false,
    gateChecks,
    productionBlockers,
    notes: [
      "gate_verified = automated browser/smoke/visual/soak evidence green.",
      "production_ready requires human playtest + releaseEligible + device FPS + no open blockers.",
      "This script does not mutate the card; apply status changes deliberately."
    ]
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, "survivor_c7_readiness_latest.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        currentStatus: report.currentStatus,
        recommendedStatus: report.recommendedStatus,
        gateVerifiedEligible: report.gateVerifiedEligible,
        productionReadyEligible: report.productionReadyEligible,
        releaseEligible: false,
        failedGateChecks: gateChecks.filter((c) => !c.ok).map((c) => c.id),
        openProductionBlockers: productionBlockers.filter((c) => !c.ok).map((c) => c.id),
        report: out
      },
      null,
      2
    )
  );

  // Exit 0 if gate_verified eligible (C7 partial success); exit 2 if not even gate-ready
  if (!gateVerifiedEligible) process.exit(2);
  process.exit(0);
}

main();
