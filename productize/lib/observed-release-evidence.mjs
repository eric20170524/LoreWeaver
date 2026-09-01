export const HUMAN_EVIDENCE_SCHEMA = "loreweaver.human-playtest-evidence.v1";
export const DEVICE_EVIDENCE_SCHEMA = "loreweaver.device-verification-evidence.v1";

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isFiniteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isRating(value) {
  return value == null || (Number.isInteger(value) && value >= 1 && value <= 5);
}
function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function ratio(count, total) {
  return total > 0 ? count / total : 0;
}
function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

export function validateHumanObservationInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") return ["input_must_be_object"];
  if (input.kind !== "human_playtest") errors.push("kind_must_be_human_playtest");
  if (input.humanObserved !== true) errors.push("humanObserved_must_be_true");
  if (input.fixture === true) errors.push("fixture_evidence_forbidden");
  if (input.synthetic === true) errors.push("synthetic_evidence_forbidden");
  const sessions = input.sessions;
  if (!Array.isArray(sessions) || sessions.length < 1) {
    errors.push("sessions_must_contain_at_least_one_real_session");
    return errors;
  }
  const ids = new Set();
  sessions.forEach((session, index) => {
    const p = `sessions[${index}]`;
    if (!session || typeof session !== "object") {
      errors.push(`${p}_must_be_object`);
      return;
    }
    if (!isString(session.sessionId)) errors.push(`${p}.sessionId_required`);
    else if (ids.has(session.sessionId)) errors.push(`${p}.sessionId_duplicate`);
    else ids.add(session.sessionId);
    for (const field of ["completed", "understoodCoreLoop", "wouldReplay"]) {
      if (typeof session[field] !== "boolean") errors.push(`${p}.${field}_must_be_boolean`);
    }
    if (session.completionSeconds != null && !isFiniteNonNegative(session.completionSeconds)) {
      errors.push(`${p}.completionSeconds_invalid`);
    }
    if (!isFiniteNonNegative(session.understandingSeconds)) {
      errors.push(`${p}.understandingSeconds_required_non_negative`);
    }
    for (const field of ["difficulty", "fun", "clarity"]) {
      if (!isRating(session[field])) errors.push(`${p}.${field}_must_be_1_to_5_or_null`);
    }
    if (!stringArray(session.blockingIssues)) errors.push(`${p}.blockingIssues_must_be_string_array`);
    if (!stringArray(session.failureReasons)) errors.push(`${p}.failureReasons_must_be_string_array`);
    if (!stringArray(session.suggestions)) errors.push(`${p}.suggestions_must_be_string_array`);
  });
  return uniqueStrings(errors);
}

export function validateDeviceObservationInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") return ["input_must_be_object"];
  if (input.kind !== "device_verification") errors.push("kind_must_be_device_verification");
  if (input.deviceObserved !== true) errors.push("deviceObserved_must_be_true");
  if (input.fixture === true) errors.push("fixture_evidence_forbidden");
  if (input.synthetic === true) errors.push("synthetic_evidence_forbidden");
  if (input.headless === true) errors.push("headless_evidence_forbidden");
  if (input.emulated === true) errors.push("emulated_evidence_forbidden");
  const budget = input.performanceBudget;
  if (!budget || typeof budget !== "object") {
    errors.push("performanceBudget_required");
  } else {
    if (!isFiniteNonNegative(budget.minP50Fps) || budget.minP50Fps <= 0) errors.push("performanceBudget.minP50Fps_required_positive");
    if (!isFiniteNonNegative(budget.minMinFps) || budget.minMinFps <= 0) errors.push("performanceBudget.minMinFps_required_positive");
  }
  const runs = input.runs;
  if (!Array.isArray(runs) || runs.length < 1) {
    errors.push("runs_must_contain_at_least_one_physical_device_run");
    return uniqueStrings(errors);
  }
  runs.forEach((run, index) => {
    const p = `runs[${index}]`;
    if (!run || typeof run !== "object") {
      errors.push(`${p}_must_be_object`);
      return;
    }
    if (run.physicalDevice !== true) errors.push(`${p}.physicalDevice_must_be_true`);
    if (run.headless === true) errors.push(`${p}.headless_forbidden`);
    if (run.emulated === true) errors.push(`${p}.emulated_forbidden`);
    if (!isString(run.deviceClass)) errors.push(`${p}.deviceClass_required`);
    if (!isString(run.deviceModel)) errors.push(`${p}.deviceModel_required`);
    if (!isString(run.os)) errors.push(`${p}.os_required`);
    if (!isString(run.browser)) errors.push(`${p}.browser_required`);
    if (!run.viewport || !Number.isInteger(run.viewport.width) || run.viewport.width < 1 || !Number.isInteger(run.viewport.height) || run.viewport.height < 1) {
      errors.push(`${p}.viewport_invalid`);
    }
    for (const field of ["completed", "interactionOk"]) {
      if (typeof run[field] !== "boolean") errors.push(`${p}.${field}_must_be_boolean`);
    }
    if (!Number.isInteger(run.consoleErrors) || run.consoleErrors < 0) errors.push(`${p}.consoleErrors_invalid`);
    if (!run.fps || !["p50", "p95", "min"].every((field) => isFiniteNonNegative(run.fps[field]))) {
      errors.push(`${p}.fps_requires_non_negative_p50_p95_min`);
    }
  });
  return uniqueStrings(errors);
}

function exactIdentityFields(identity) {
  return {
    cardId: identity.cardId,
    specHash: identity.specHash,
    runtimeVersion: identity.runtimeVersion ?? null,
    recipeHash: identity.recipeHash ?? null,
    contentHash: identity.contentHash ?? null,
    atlasHash: identity.atlasHash ?? null,
    payloadHash: identity.payloadHash,
    artifact: identity.artifact,
    artifactSha256: identity.artifactSha256,
    browserReport: identity.browserReport ?? null
  };
}

export function buildHumanPlaytestEvidence({ input, identity, createdAt = new Date().toISOString() }) {
  const errors = validateHumanObservationInput(input);
  if (errors.length) return { ok: false, errors, report: null };
  const sessions = input.sessions.map((session) => ({
    ...session,
    blockingIssues: [...session.blockingIssues],
    failureReasons: [...session.failureReasons],
    suggestions: [...session.suggestions]
  }));
  const sessionCount = sessions.length;
  const completedCount = sessions.filter((session) => session.completed).length;
  const understoodCount = sessions.filter((session) => session.understoodCoreLoop).length;
  const replayCount = sessions.filter((session) => session.wouldReplay).length;
  const blockingIssues = sessions.flatMap((session) => session.blockingIssues).filter(Boolean);
  const failureReasons = uniqueStrings(sessions.flatMap((session) => session.failureReasons));
  const suggestions = uniqueStrings(sessions.flatMap((session) => session.suggestions));
  const completionRate = ratio(completedCount, sessionCount);
  const coreLoopUnderstandingRate = ratio(understoodCount, sessionCount);
  const passCriteria = {
    atLeastOneSessionCompleted: completedCount > 0,
    allSessionsUnderstoodCoreLoop: understoodCount === sessionCount,
    noBlockingIssues: blockingIssues.length === 0
  };
  const passed = Object.values(passCriteria).every(Boolean);
  return {
    ok: true,
    errors: [],
    report: {
      schemaVersion: HUMAN_EVIDENCE_SCHEMA,
      status: passed ? "passed" : "failed",
      releaseEligible: passed,
      createdAt,
      identityMatches: true,
      freshness: "fresh",
      fixture: false,
      synthetic: false,
      humanObserved: true,
      observationSource: "recorded_real_human_sessions",
      ...exactIdentityFields(identity),
      sessions,
      summary: {
        sessionCount,
        completionRate,
        coreLoopUnderstandingRate,
        replayIntentRate: ratio(replayCount, sessionCount),
        blockingIssueCount: blockingIssues.length,
        failureReasons,
        suggestions,
        passCriteria,
        notes: typeof input.notes === "string" ? input.notes : ""
      }
    }
  };
}

export function buildDeviceVerificationEvidence({ input, identity, createdAt = new Date().toISOString() }) {
  const errors = validateDeviceObservationInput(input);
  if (errors.length) return { ok: false, errors, report: null };
  const budget = {
    minP50Fps: Number(input.performanceBudget.minP50Fps),
    minMinFps: Number(input.performanceBudget.minMinFps)
  };
  const runs = input.runs.map((run) => ({
    ...run,
    physicalDevice: true,
    headless: false,
    emulated: false,
    fps: { ...run.fps },
    viewport: { ...run.viewport },
    performanceBudgetMet:
      run.fps.p50 >= budget.minP50Fps && run.fps.min >= budget.minMinFps
  }));
  const completedRunCount = runs.filter((run) => run.completed).length;
  const interactionFailureCount = runs.filter((run) => !run.interactionOk).length;
  const consoleErrorCount = runs.reduce((sum, run) => sum + run.consoleErrors, 0);
  const meetsPerformanceBudget = runs.every((run) => run.performanceBudgetMet);
  const passCriteria = {
    allRunsPhysicalDevices: runs.every((run) => run.physicalDevice && !run.headless && !run.emulated),
    allRunsCompleted: completedRunCount === runs.length,
    zeroInteractionFailures: interactionFailureCount === 0,
    zeroConsoleErrors: consoleErrorCount === 0,
    meetsPerformanceBudget
  };
  const passed = Object.values(passCriteria).every(Boolean);
  return {
    ok: true,
    errors: [],
    report: {
      schemaVersion: DEVICE_EVIDENCE_SCHEMA,
      status: passed ? "passed" : "failed",
      releaseEligible: passed,
      createdAt,
      identityMatches: true,
      freshness: "fresh",
      fixture: false,
      synthetic: false,
      deviceObserved: true,
      headless: false,
      emulated: false,
      observationSource: "recorded_physical_device_runs",
      performanceBudget: budget,
      ...exactIdentityFields(identity),
      runs,
      summary: {
        runCount: runs.length,
        completedRunCount,
        interactionFailureCount,
        consoleErrorCount,
        meetsPerformanceBudget,
        passCriteria,
        notes: typeof input.notes === "string" ? input.notes : ""
      }
    }
  };
}

export function isTrustedObservedReleaseEvidence(report, kind) {
  if (!report || typeof report !== "object") return false;
  const common =
    report.status === "passed" &&
    report.releaseEligible === true &&
    report.identityMatches === true &&
    report.freshness === "fresh" &&
    report.stale !== true &&
    report.artifactStatus !== "stale" &&
    report.fixture !== true &&
    report.synthetic !== true &&
    isString(report.specHash) &&
    isString(report.payloadHash) &&
    isString(report.artifact) &&
    isString(report.artifactSha256);
  if (!common) return false;
  if (kind === "human") {
    return report.schemaVersion === HUMAN_EVIDENCE_SCHEMA &&
      report.humanObserved === true &&
      Array.isArray(report.sessions) && report.sessions.length > 0 &&
      report.summary?.passCriteria?.atLeastOneSessionCompleted === true &&
      report.summary?.passCriteria?.allSessionsUnderstoodCoreLoop === true &&
      report.summary?.passCriteria?.noBlockingIssues === true;
  }
  if (kind === "device") {
    return report.schemaVersion === DEVICE_EVIDENCE_SCHEMA &&
      report.deviceObserved === true &&
      report.headless === false &&
      report.emulated === false &&
      Array.isArray(report.runs) && report.runs.length > 0 &&
      report.runs.every((run) => run.physicalDevice === true && run.headless === false && run.emulated === false) &&
      report.summary?.passCriteria?.allRunsPhysicalDevices === true &&
      report.summary?.passCriteria?.allRunsCompleted === true &&
      report.summary?.passCriteria?.zeroInteractionFailures === true &&
      report.summary?.passCriteria?.zeroConsoleErrors === true &&
      report.summary?.passCriteria?.meetsPerformanceBudget === true;
  }
  return false;
}
