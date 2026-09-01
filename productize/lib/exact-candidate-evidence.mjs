const REQUIRED_EXACT_FIELDS = Object.freeze([
  "specHash",
  "payloadHash",
  "artifact",
  "artifactSha256"
]);

const OPTIONAL_IDENTITY_FIELDS = Object.freeze([
  "runtimeVersion",
  "recipeHash",
  "contentHash",
  "atlasHash"
]);

function present(value) {
  return value !== null && value !== undefined && String(value).length > 0;
}

export function expectedCandidateIdentityReady(identity) {
  if (!identity || typeof identity !== "object") return false;
  return REQUIRED_EXACT_FIELDS.every((field) => present(identity[field]));
}

export function exactCandidateIdentityMismatches(report, expectedIdentity) {
  if (!report || typeof report !== "object") return ["report_missing"];
  if (!expectedCandidateIdentityReady(expectedIdentity)) {
    return ["expected_candidate_identity_missing"];
  }

  const mismatches = [];
  const fields = [...REQUIRED_EXACT_FIELDS, ...OPTIONAL_IDENTITY_FIELDS];
  if (present(expectedIdentity.cardId)) fields.unshift("cardId");

  for (const field of fields) {
    const expected = expectedIdentity[field];
    if (!present(expected)) continue;
    const actual = report[field];
    if (!present(actual)) {
      mismatches.push(`${field}: report_missing expected=${expected}`);
      continue;
    }
    if (String(actual) !== String(expected)) {
      mismatches.push(`${field}: report=${actual} expected=${expected}`);
    }
  }
  return mismatches;
}

export function isExactCandidateEvidence(report, expectedIdentity) {
  return exactCandidateIdentityMismatches(report, expectedIdentity).length === 0;
}

export function candidateIdentityFromBrowserReport(report) {
  if (!report || typeof report !== "object") return null;
  const identity = {
    specHash: report.specHash,
    runtimeVersion: report.runtimeVersion ?? null,
    payloadHash: report.payloadHash,
    artifact: report.artifact,
    artifactSha256: report.artifactSha256
  };
  return expectedCandidateIdentityReady(identity) ? identity : null;
}
