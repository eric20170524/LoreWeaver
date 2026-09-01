#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRealAssetVlmOperationHandlers,
  probeRealAssetVlmProvider
} from "../lib/real-asset-vlm-operation.mjs";
import { assetOperationCapabilitySnapshot } from "../lib/asset-operation-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function assert(value, message) {
  if (!value) throw new Error(message);
}

// Deliberately remove PATH so this branch proves fail-closed behavior even if a
// future CI runner happens to ship Codex globally.
const emptyEnv = { PATH: "" };
const unavailable = probeRealAssetVlmProvider({ env: emptyEnv });
assert(unavailable.available === false && unavailable.provider === null, JSON.stringify(unavailable));
const unavailableHandlers = createRealAssetVlmOperationHandlers({ env: emptyEnv });
assert(unavailableHandlers.size === 0 && !unavailableHandlers.has("asset.vlm"), "no provider must mean no VLM port registration");

const fakeKeyEnv = { ...emptyEnv, XAI_API_KEY: "test-only-registration-key" };
const conditional = probeRealAssetVlmProvider({ env: fakeKeyEnv });
assert(conditional.available === true && conditional.provider === "grok", "real provider detection is environment-gated");
const conditionalHandlers = createRealAssetVlmOperationHandlers({ env: fakeKeyEnv });
assert(conditionalHandlers.has("asset.vlm") && typeof conditionalHandlers.get("asset.vlm") === "function", "provider-ready registry must expose asset.vlm handler");

const snapshot = assetOperationCapabilitySnapshot({ env: emptyEnv });
assert(!snapshot.ports.includes("asset.vlm"), "canonical registry must not advertise VLM without a provider");
assert(snapshot.realProviderPorts.length === 0, "real-provider port list must be empty without provider");
assert(snapshot.deterministicPorts.includes("asset.build_atlas"), "PNG deterministic ports remain registered");
assert(snapshot.deterministicPorts.includes("asset.normalize_audio"), "WAV deterministic ports remain registered");

const helper = fs.readFileSync(path.join(ROOT, "productize/jobs/run-asset-vlm-operation.py"), "utf8");
assert(helper.includes("run_visual_critic"), "Asset VLM helper must reuse the canonical real visual critic");
assert(helper.includes('REAL_PROVIDERS = {"grok", "codex"}'), "Asset VLM helper must restrict completion to real providers");
assert(!helper.includes("synthetic = True") && !helper.includes('"synthetic": True'), "Asset VLM helper must never create synthetic evidence");

console.log(JSON.stringify({
  schemaVersion: "loreweaver.real-asset-vlm-operation-check.v1",
  status: "passed",
  checks: [
    "no_provider_means_no_asset_vlm_port",
    "no_provider_check_isolated_from_ci_runner_path",
    "provider_presence_enables_real_handler_registration_only",
    "canonical_registry_keeps_deterministic_png_and_wav_ports",
    "asset_vlm_reuses_existing_real_visual_critic",
    "no_synthetic_vlm_fallback_exists"
  ],
  unavailableProbe: unavailable,
  registeredWithProvider: [...conditionalHandlers.keys()]
}, null, 2));
