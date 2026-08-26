import crypto from "node:crypto";

const EXECUTABLE_PREFIXES = ["assets/", "nodes/"];
const EXECUTABLE_FILES = new Set(["index.html", "runtime-spec.json"]);

export function isExecutablePayloadPath(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (EXECUTABLE_FILES.has(normalized)) return true;
  return EXECUTABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function selectExecutablePayloadFiles(files) {
  return (files || [])
    .filter((file) => isExecutablePayloadPath(file?.path))
    .map((file) => ({
      path: String(file.path).replaceAll("\\", "/"),
      bytes: Number(file.bytes || 0),
      sha256: String(file.sha256 || "")
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function hashExecutablePayloadManifest(files) {
  const selected = selectExecutablePayloadFiles(files);
  const canonical = selected.map((file) => `${file.path}\t${file.bytes}\t${file.sha256}`).join("\n");
  return {
    schemaVersion: "loreweaver.executable-payload-identity.v1",
    payloadHash: crypto.createHash("sha256").update(canonical).digest("hex"),
    fileCount: selected.length,
    totalBytes: selected.reduce((sum, file) => sum + file.bytes, 0),
    files: selected
  };
}
