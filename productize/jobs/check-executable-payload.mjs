#!/usr/bin/env node
import {
  hashExecutablePayloadManifest,
  isExecutablePayloadPath,
  selectExecutablePayloadFiles
} from "../lib/executable-payload.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const executable = [
  { path: "index.html", bytes: 100, sha256: "a" },
  { path: "runtime-spec.json", bytes: 200, sha256: "b" },
  { path: "assets/app.js", bytes: 300, sha256: "c" },
  { path: "assets/imagegen/atlas.png", bytes: 400, sha256: "d" },
  { path: "nodes/node1.html", bytes: 500, sha256: "e" }
];
const metadataA = [
  { path: "RELEASE_STATUS.json", bytes: 10, sha256: "candidate" },
  { path: "release-manifest.json", bytes: 20, sha256: "manifest-a" },
  { path: "README.md", bytes: 30, sha256: "readme-a" },
  { path: "CREDITS.json", bytes: 40, sha256: "credits-a" }
];
const metadataB = [
  { path: "RELEASE_STATUS.json", bytes: 999, sha256: "certified" },
  { path: "release-manifest.json", bytes: 888, sha256: "manifest-b" },
  { path: "README.md", bytes: 777, sha256: "readme-b" },
  { path: "CREDITS.json", bytes: 666, sha256: "credits-b" }
];

assert(isExecutablePayloadPath("index.html"), "index is executable payload");
assert(isExecutablePayloadPath("assets/app.js"), "asset is executable payload");
assert(isExecutablePayloadPath("nodes/node1.html"), "iframe node is executable payload");
assert(!isExecutablePayloadPath("RELEASE_STATUS.json"), "certification metadata excluded");

const a = hashExecutablePayloadManifest([...executable, ...metadataA]);
const b = hashExecutablePayloadManifest([...metadataB, ...executable].reverse());
assert(a.payloadHash === b.payloadHash, "metadata changes/order must not alter executable payload identity");
assert(a.fileCount === executable.length, "only executable payload files should be selected");
assert(selectExecutablePayloadFiles([...executable, ...metadataA]).every((f) => !f.path.startsWith("RELEASE_")), "release metadata excluded");

const changed = executable.map((file) => ({ ...file }));
changed[2].sha256 = "changed-runtime-js";
const c = hashExecutablePayloadManifest([...changed, ...metadataA]);
assert(c.payloadHash !== a.payloadHash, "executable byte change must alter payload identity");

console.log("PASSED executable payload identity checks");
console.log(JSON.stringify({ payloadHash: a.payloadHash, fileCount: a.fileCount }, null, 2));
