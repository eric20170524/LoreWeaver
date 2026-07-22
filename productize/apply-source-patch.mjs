#!/usr/bin/env node
/**
 * LW-052: Source patch apply/reject/rollback workflow (declaration + snapshot).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const patchPath = args.find((a) => a.startsWith("--patch="))?.split("=")[1];
const action = args.find((a) => a.startsWith("--action="))?.split("=")[1] || "validate";

if (!patchPath) {
  console.error("Usage: node apply-source-patch.mjs --patch=productize/patches/example.json --action=validate|snapshot|reject");
  process.exit(1);
}

const abs = path.resolve(LORE_ROOT, patchPath);
const patch = JSON.parse(fs.readFileSync(abs, "utf8"));
const reasons = [];

if (patch.schemaVersion !== "loreweaver.source-patch.v1") reasons.push("bad schemaVersion");
if (!["L0", "L1", "L2", "L3", "L4"].includes(patch.patchLevel)) reasons.push("bad patchLevel");
if (!Array.isArray(patch.files) || patch.files.length === 0) reasons.push("files required");
if (!patch.rollback?.snapshotPath) reasons.push("rollback.snapshotPath required");
if (!patch.evidence?.commands?.length) reasons.push("evidence.commands required");
// Scan for credential-like values, not schema field names such as secretsPolicy.
const blob = JSON.stringify(patch);
if (/(["']?(?:api[_-]?key|password|access_token|private_key)["']?\s*:\s*["'][^"']+["'])/i.test(blob)) {
  reasons.push("possible secret material in patch declaration");
}

let snapshotWritten = null;
if (action === "snapshot" && reasons.length === 0) {
  const snapRoot = path.resolve(LORE_ROOT, patch.rollback.snapshotPath);
  fs.mkdirSync(snapRoot, { recursive: true });
  for (const file of patch.files) {
    const src = path.resolve(LORE_ROOT, file.path);
    if (!fs.existsSync(src) || file.action === "create") continue;
    const dest = path.join(snapRoot, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    file.beforeHash = crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex").slice(0, 16);
  }
  snapshotWritten = snapRoot;
}

const report = {
  schemaVersion: "loreweaver.source-patch-result.v1",
  action,
  patchId: patch.id,
  status: reasons.length === 0 ? "passed" : "failed",
  reasons,
  snapshotWritten,
  invalidates: patch.invalidates || [],
  createdAt: new Date().toISOString()
};

const out = path.join(LORE_ROOT, "capabilities/reports/source_patch_latest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exit(1);
