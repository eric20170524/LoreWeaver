import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { evaluateProductionExportGate } from "./production-export-gate.mjs";
import {
  evaluateReleaseMaturity,
  isReleaseCertified,
  RELEASE_CERTIFICATION_TIERS
} from "./release-maturity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const CARDS_ROOT = path.join(LORE_ROOT, "minigame_master/gameplay/cards");

export const RELEASE_MODES = Object.freeze(["candidate", "certified"]);

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function sha256Json(value) {
  const normalized = JSON.stringify(value ?? null);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function weakestTier(tiers) {
  if (!tiers?.length) return "experimental";
  let weakest = RELEASE_CERTIFICATION_TIERS.length - 1;
  for (const tier of tiers) {
    const rank = RELEASE_CERTIFICATION_TIERS.indexOf(tier);
    weakest = Math.min(weakest, rank >= 0 ? rank : 0);
  }
  return RELEASE_CERTIFICATION_TIERS[weakest] || "experimental";
}

export function collectWorkspaceCardIds(gameSpec) {
  const ids = new Set();
  for (const node of gameSpec?.nodes || []) {
    const cardId = node?.gameplay?.cardId || node?.gameplay?.id || null;
    if (cardId) ids.add(String(cardId));
  }
  return [...ids].sort();
}

export function loadGameplayCard(cardId, cardsRoot = CARDS_ROOT) {
  const cardPath = path.join(cardsRoot, `${cardId}.json`);
  const card = readJsonSafe(cardPath);
  if (!card) {
    return {
      id: cardId,
      status: "experimental",
      exportPolicy: { productionReady: false },
      missingCardDefinition: true
    };
  }
  return card;
}

export function buildReleaseIdentity({ resolvedSpec = null, gameSpec = null } = {}) {
  const spec = resolvedSpec?.gameSpec || gameSpec || {};
  return {
    specHash: resolvedSpec?.specHash || sha256Json(spec),
    runtimeVersion: resolvedSpec?.runtimeVersion || null,
    recipeHash: spec?.recipeGraph ? sha256Json(spec.recipeGraph) : null,
    contentHash: spec?.themeContentPack ? sha256Json(spec.themeContentPack) : null,
    atlasHash: spec?.runtimeFeaturePack?.assetPipeline?.atlasHash || null
  };
}

function evidenceCandidates(kind, cardId) {
  if (kind === "human") {
    return [
      `human_playtest_${cardId}_latest.json`,
      `human_playtest_${cardId}.json`,
      "human_playtest_latest.json"
    ];
  }
  return [
    `device_verification_${cardId}_latest.json`,
    `device_verification_${cardId}.json`,
    "device_verification_latest.json"
  ];
}

function loadMatchingEvidence({ workspaceReportsDir, sharedReportsDir, kind, cardId, identity }) {
  const dirs = [workspaceReportsDir, sharedReportsDir].filter(Boolean);
  for (const dir of dirs) {
    for (const file of evidenceCandidates(kind, cardId)) {
      const report = readJsonSafe(path.join(dir, file));
      if (!report) continue;
      if (report.cardId && String(report.cardId) !== String(cardId)) continue;
      const mismatches = [];
      for (const field of ["runtimeVersion", "recipeHash", "contentHash"]) {
        const expected = identity?.[field];
        const actual = report?.[field];
        if (expected && actual && String(expected) !== String(actual)) {
          mismatches.push(`${field}: report=${actual} expected=${expected}`);
        }
      }
      return {
        ...report,
        identityMatches: report.identityMatches !== false && mismatches.length === 0,
        identityMismatches: mismatches
      };
    }
  }
  return null;
}

export function evaluateWorkspaceReleasePolicy({
  gameSpec,
  resolvedSpec = null,
  reportsDir,
  workspaceReportsDir = null,
  mode = "candidate",
  waivers = [],
  cardsRoot = CARDS_ROOT
} = {}) {
  if (!RELEASE_MODES.includes(mode)) {
    throw new Error(`Unknown release mode '${mode}'. Expected candidate or certified.`);
  }

  const cardIds = collectWorkspaceCardIds(gameSpec || resolvedSpec?.gameSpec);
  const identity = buildReleaseIdentity({ resolvedSpec, gameSpec });
  const cardDecisions = [];

  if (!cardIds.length) {
    return {
      schemaVersion: "loreweaver.workspace-release-decision.v1",
      mode,
      status: mode === "candidate" ? "candidate_allowed" : "blocked",
      exportAllowed: mode === "candidate",
      releaseCertified: false,
      certificationTier: "experimental",
      identity,
      cardDecisions: [],
      blockers: ["no_gameplay_cards_resolved"],
      missingEvidence: ["gameplayCard"],
      waivers: Array.isArray(waivers) ? waivers : [],
      nonReleaseMarker: mode === "candidate" ? "UNVERIFIED_CANDIDATE" : null
    };
  }

  for (const cardId of cardIds) {
    const card = loadGameplayCard(cardId, cardsRoot);
    const expectedIdentity = { ...identity, cardId };
    const productionGate = evaluateProductionExportGate({
      card,
      reportsDir,
      expectedIdentity
    });
    const humanPlaytest = loadMatchingEvidence({
      workspaceReportsDir,
      sharedReportsDir: reportsDir,
      kind: "human",
      cardId,
      identity
    });
    const deviceVerification = loadMatchingEvidence({
      workspaceReportsDir,
      sharedReportsDir: reportsDir,
      kind: "device",
      cardId,
      identity
    });
    const maturity = evaluateReleaseMaturity({
      card,
      productionGate,
      humanPlaytest,
      deviceVerification,
      waivers
    });
    cardDecisions.push({
      cardId,
      missingCardDefinition: card.missingCardDefinition === true,
      productionGate,
      maturity,
      evidenceFilesPresent: {
        humanPlaytest: Boolean(humanPlaytest),
        deviceVerification: Boolean(deviceVerification)
      }
    });
  }

  const allCertified = cardDecisions.every((item) => isReleaseCertified(item.maturity));
  const blockers = [...new Set(cardDecisions.flatMap((item) =>
    item.maturity.blockers.map((blocker) => `${item.cardId}:${blocker}`)
  ))];
  const missingEvidence = [...new Set(cardDecisions.flatMap((item) =>
    item.maturity.missingEvidence.map((missing) => `${item.cardId}:${missing}`)
  ))];
  const tiers = cardDecisions.map((item) => item.maturity.certificationTier);
  const certificationTier = allCertified ? "release_certified" : weakestTier(tiers);
  const exportAllowed = mode === "candidate" ? true : allCertified;

  return {
    schemaVersion: "loreweaver.workspace-release-decision.v1",
    mode,
    status: exportAllowed
      ? (allCertified ? "release_certified" : "candidate_allowed")
      : "blocked",
    exportAllowed,
    releaseCertified: allCertified,
    certificationTier,
    identity,
    cardDecisions,
    blockers,
    missingEvidence,
    waivers: Array.isArray(waivers) ? waivers.filter(Boolean) : [],
    nonReleaseMarker: allCertified ? null : "UNVERIFIED_CANDIDATE"
  };
}