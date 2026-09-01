#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PANEL = path.join(ROOT, "src/components/CapabilityPromotionPanel.tsx");
const PIPELINE = path.join(ROOT, "src/components/PipelinePanel.tsx");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const source = fs.readFileSync(PANEL, "utf8");
const pipeline = fs.readFileSync(PIPELINE, "utf8");
const previewStart = source.indexOf("const runPreview = async () =>");
const commitStart = source.indexOf("const commitPromotion = async () =>");
assert(previewStart >= 0 && commitStart > previewStart, "preview and commit must remain separate user actions");
const previewBody = source.slice(previewStart, commitStart);
const commitBody = source.slice(commitStart, source.indexOf("return (", commitStart));

assert(source.includes('useState(false)'), "explicit approval must default to false");
assert(source.includes('/api/capability-promotions/preview'), "preview endpoint missing from Expert panel");
assert(source.includes('/api/capability-promotions/commit'), "commit endpoint missing from Expert panel");
assert(!previewBody.includes('/api/capability-promotions/commit'), "preview action must never call commit endpoint");
assert(commitBody.includes('approvalToken: preview.approvalToken'), "explicit second action must bind the preview approval token");
assert(source.includes('disabled={!approved || loading !== null}'), "write button must remain disabled without explicit approval");
assert(source.includes('setPreview(null)') && source.includes('setApproved(false)'), "path changes must invalidate preview and approval state");
assert(source.includes('preview.gateway?.tokenAutoSubmitted === false'), "UI must require Gateway proof that token was not auto-submitted");
assert(pipeline.includes('CapabilityPromotionPanel') && pipeline.includes('<CapabilityPromotionPanel locale={locale} />'), "Promotion panel must be visible in Expert Pipeline");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.capability-promotion-ui-check.v1",
  status: "passed",
  checks: [
    "preview_and_commit_are_separate_actions",
    "preview_never_calls_commit",
    "explicit_approval_defaults_false",
    "commit_button_requires_explicit_approval",
    "path_change_invalidates_token_state",
    "gateway_no_auto_submit_contract_required",
    "expert_pipeline_surfaces_promotion_panel"
  ]
}, null, 2));
