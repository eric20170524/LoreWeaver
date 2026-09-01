#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { encodePcmWav } from "../lib/wav-asset-operations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACE_ID = "__audio_asset_job_ci";
const WORKSPACE_REL = `data/workspaces/${WORKSPACE_ID}`;
const WORKSPACE = path.join(ROOT, WORKSPACE_REL);

function assert(value, message) {
  if (!value) throw new Error(message);
}
function snapshot(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
function restore(file, content) {
  if (content === null) fs.rmSync(file, { force: true });
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}
function tone({ sampleRate = 8000, durationMs = 120, amplitude = 6000 } = {}) {
  const frames = Math.round(sampleRate * durationMs / 1000);
  const pcm = Buffer.alloc(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    pcm.writeInt16LE(Math.round(Math.sin(frame / sampleRate * Math.PI * 2 * 440) * amplitude), frame * 2);
  }
  return { channels: 1, sampleRate, frameCount: frames, pcm };
}

const sharedFiles = [
  path.join(ROOT, "productize/jobs/audio_verify_latest.json"),
  path.join(ROOT, "minigame_master/capabilities/reports/asset_job_latest.json")
];
const before = new Map(sharedFiles.map((file) => [file, snapshot(file)]));

try {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORKSPACE, "assets/audio/sfx"), { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE, "assets/audio/sfx/tone.wav"), encodePcmWav(tone()));
  fs.writeFileSync(path.join(WORKSPACE, "assets/audio/sfx/unsupported.mp3"), Buffer.from("placeholder-compressed-audio"));

  const run = spawnSync(process.execPath, [
    path.join(ROOT, "productize/run-asset-job.mjs"),
    `--workspace=${WORKSPACE_REL}`,
    "--job=audio_verify"
  ], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  assert(run.status === 0, `audio asset job failed:\n${run.stdout}\n${run.stderr}`);
  const result = JSON.parse(String(run.stdout || "{}"));
  assert(result.status === "passed", JSON.stringify(result));
  assert(result.assets === 2, "legacy scan should still report both audio assets");
  assert(result.assetRecipeMigration?.status === "candidate_executed_partial", JSON.stringify(result.assetRecipeMigration));
  assert(result.assetRecipeMigration?.operationPorts?.includes("asset.normalize_audio"), "PCM WAV must execute normalize port");
  assert(result.assetRecipeMigration?.unsupportedAssets?.includes("assets/audio/sfx/unsupported.mp3"), "MP3 must remain explicit unsupported codec");
  assert(result.assetRecipeMigration?.promotable === false, "migration must not silently promote");

  const recipePath = path.join(WORKSPACE, result.assetRecipeMigration.recipe);
  const reportPath = path.join(WORKSPACE, result.assetRecipeMigration.executionReport);
  assert(fs.existsSync(recipePath), "audio migration candidate missing");
  assert(fs.existsSync(reportPath), "audio execution report missing");
  const recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert(recipe.status === "candidate", "audio migration must remain candidate");
  assert(recipe.operations?.length === 1 && recipe.operations[0].port === "asset.normalize_audio", "unexpected audio operation graph");
  assert(report.status === "passed" && report.operationCount === 1, "real audio operation execution not recorded");
  assert(report.finalAssets?.[0]?.sha256 === recipe.outputs?.finalAssets?.[0]?.sha256, "recipe must bind exact normalized hash");

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.legacy-audio-job-operation-migration-check.v1",
    status: "passed",
    checks: [
      "legacy_audio_scan_preserved",
      "pcm16_wav_normalize_port_executes",
      "exact_normalized_hash_recorded",
      "compressed_mp3_remains_explicit_unsupported",
      "mixed_format_migration_remains_candidate",
      "no_silent_promotion"
    ]
  }, null, 2));
} finally {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  for (const [file, content] of before) restore(file, content);
}
