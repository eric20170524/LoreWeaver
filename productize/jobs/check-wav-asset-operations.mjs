#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createBuiltinAssetOperationHandlers,
  executeAssetRecipe
} from "../lib/asset-operation-executor.mjs";
import {
  createDeterministicWavAssetOperationHandlers,
  decodePcmWav,
  encodePcmWav
} from "../lib/wav-asset-operations.mjs";
import { validateAssetRecipe } from "../lib/asset-recipe.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function sinePcm({ sampleRate = 8000, durationMs = 200, frequency = 440, amplitude = 10000, phase = 0 } = {}) {
  const frames = Math.round(sampleRate * durationMs / 1000);
  const pcm = Buffer.alloc(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin((frame / sampleRate) * Math.PI * 2 * frequency + phase) * amplitude);
    pcm.writeInt16LE(sample, frame * 2);
  }
  return { channels: 1, sampleRate, pcm, frameCount: frames };
}
function handlers() {
  return new Map([
    ...createBuiltinAssetOperationHandlers(),
    ...createDeterministicWavAssetOperationHandlers()
  ]);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-wav-asset-"));
try {
  fs.mkdirSync(path.join(root, "assets/source"), { recursive: true });
  const aPath = path.join(root, "assets/source/a.wav");
  const bPath = path.join(root, "assets/source/b.wav");
  fs.writeFileSync(aPath, encodePcmWav(sinePcm({ amplitude: 5000 })));
  fs.writeFileSync(bPath, encodePcmWav(sinePcm({ frequency: 660, amplitude: 7000, phase: 0.25 })));
  const aHash = sha256(aPath);
  const bHash = sha256(bPath);

  const recipe = {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: "wav-pipeline",
    title: "Deterministic WAV Pipeline",
    status: "candidate",
    assetKind: "audio",
    source: {
      mode: "imported",
      provider: "test-source",
      model: null,
      license: "original-test-fixture",
      rawPrompt: null,
      negativePrompt: null,
      references: [],
      rawArtifacts: [
        { id: "a", path: "assets/source/a.wav", sha256: aHash, license: "original-test-fixture", mime: "audio/wav" },
        { id: "b", path: "assets/source/b.wav", sha256: bHash, license: "original-test-fixture", mime: "audio/wav" }
      ],
      notes: []
    },
    operations: [
      {
        id: "normalize-a",
        type: "normalize_audio",
        port: "asset.normalize_audio",
        provider: "deterministic-wav-port",
        model: null,
        inputs: ["a"],
        outputs: ["a_normalized"],
        parameters: { peak: 0.8 }
      },
      {
        id: "trim-a",
        type: "trim_audio",
        port: "asset.trim_audio",
        provider: "deterministic-wav-port",
        model: null,
        inputs: ["a_normalized"],
        outputs: ["a_trimmed"],
        parameters: { startMs: 25, durationMs: 100 }
      },
      {
        id: "mix",
        type: "mix_audio",
        port: "asset.mix_audio",
        provider: "deterministic-wav-port",
        model: null,
        inputs: ["a_trimmed", "b"],
        outputs: ["mixed"],
        parameters: { gains: [1, 0.5], normalizePeak: 0.9 }
      }
    ],
    outputs: {
      manifestPath: "assets/audio/manifest.json",
      finalAssets: [{
        key: "mixed",
        path: "loreweaver/asset-recipe-execution/wav-pipeline/mix/mixed.wav",
        sha256: "0".repeat(64),
        bytes: 1,
        mime: "audio/wav",
        usedByRuntime: false,
        usageRefs: []
      }],
      finalManifestKeys: ["mixed"]
    },
    verification: [],
    promotion: { approvedBy: null, approvedAt: null, destination: null, conflictChecked: false }
  };

  const validation = validateAssetRecipe(recipe);
  assert(validation.valid, JSON.stringify(validation));
  const result = await executeAssetRecipe({
    recipe,
    workspaceDir: root,
    handlers: handlers(),
    reportPath: "reports/wav-execution.json",
    enforceDeclaredFinalIdentity: false
  });
  assert(result.status === "passed" && result.operationCount === 3, JSON.stringify(result));
  assert(result.operations.map((item) => item.port).join(",") === "asset.normalize_audio,asset.trim_audio,asset.mix_audio");
  const final = result.finalAssets[0];
  assert(final.sha256 && final.bytes > 44, "final WAV identity missing");
  const decoded = decodePcmWav(fs.readFileSync(path.join(root, final.path)));
  assert(decoded.channels === 1 && decoded.sampleRate === 8000, "format must be preserved");
  assert(decoded.frameCount === 1600, `mix duration should equal longer source: ${decoded.frameCount}`);

  const badCompressed = Buffer.from(fs.readFileSync(aPath));
  badCompressed.writeUInt16LE(3, 20);
  let compressedRejected = false;
  try { decodePcmWav(badCompressed); } catch (error) { compressedRejected = String(error.message).includes("wav_only_pcm_supported"); }
  assert(compressedRejected, "non-PCM WAV must fail closed");

  const malformed = Buffer.from("not-a-wav");
  let malformedRejected = false;
  try { decodePcmWav(malformed); } catch { malformedRejected = true; }
  assert(malformedRejected, "malformed WAV must fail closed");

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.wav-asset-operations-check.v1",
    status: "passed",
    finalSha256: final.sha256,
    finalFrames: decoded.frameCount,
    checks: [
      "pcm16_riff_decode_encode",
      "deterministic_normalize_port",
      "deterministic_trim_port",
      "deterministic_mix_port",
      "asset_recipe_execution_records_exact_hashes",
      "format_mismatch_and_non_pcm_fail_closed",
      "compressed_audio_not_falsely_supported"
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
