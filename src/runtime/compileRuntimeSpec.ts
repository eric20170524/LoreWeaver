import { GameSpec, ManifestPatch } from "../types";
import { ensureGameplayManifest, getSpecValueByPath } from "../utils/gameplayManifest";

export const LOREWEAVER_RUNTIME_VERSION = "2.0.0";
export const LOREWEAVER_RUNTIME_SCHEMA = "loreweaver.runtime-spec.v2";

const CATALOG_KEYS = [
  "abilityCatalog",
  "passiveSkillCatalog",
  "characterDesignCatalog",
  "enemyDesignCatalog",
  "skillEffectCatalog",
  "audioCueCatalog"
] as const;

const BLOCKED_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export interface ResolvedRuntimeSpec {
  schemaVersion: typeof LOREWEAVER_RUNTIME_SCHEMA;
  runtimeVersion: typeof LOREWEAVER_RUNTIME_VERSION;
  sourceRevision: string;
  specHash: string;
  appliedPatchIds: string[];
  catalogHashes: Record<string, string>;
  migrationWarnings: string[];
  gameSpec: GameSpec;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((out, key) => {
        if (value[key] !== undefined) out[key] = canonicalize(value[key]);
        return out;
      }, {});
  }
  return value;
}

export function stableStringify(value: any): string {
  return JSON.stringify(canonicalize(value));
}

/** Portable synchronous SHA-256 so browser and productize use identical bytes. */
export function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const w = new Uint32Array(64);
  const rotr = (n: number, bits: number) => (n >>> bits) | (n << (32 - bits));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  return Array.from(h, (word) => word.toString(16).padStart(8, "0")).join("");
}

function valuesEqual(a: any, b: any): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** True when a later artifact revision preserves every value authored by an older patch. */
function valueContains(current: any, expected: any): boolean {
  if (valuesEqual(current, expected)) return true;
  if (!current || !expected || typeof current !== "object" || typeof expected !== "object") return false;
  if (Array.isArray(current) && Array.isArray(expected)) {
    return expected.every((expItem) =>
      current.some((currItem) => valueContains(currItem, expItem))
    );
  }
  if (Array.isArray(current) || Array.isArray(expected)) return false;
  return Object.keys(expected).every((key) =>
    Object.prototype.hasOwnProperty.call(current, key) && valueContains(current[key], expected[key])
  );
}

function isPathOverlappingOrCovered(parts1: string[], parts2: string[]): boolean {
  return parts1.every((seg, idx) => parts2[idx] === undefined || parts2[idx] === seg) ||
         parts2.every((seg, idx) => parts1[idx] === undefined || parts1[idx] === seg);
}

function targetParts(spec: GameSpec, target: string): string[] {
  const parts = target.split(".").filter(Boolean);
  if (!parts.length || parts.some((part) => BLOCKED_PATH_SEGMENTS.has(part))) {
    throw new Error(`Invalid patch target: ${target}`);
  }
  if (parts[0] === "workbench" || parts[0] === "runtimeVersion" || parts[0] === "specHash") {
    throw new Error(`Patch target is outside runtime data authority: ${target}`);
  }
  if (parts[0] === "nodes" && parts.length > 1) {
    const nodeId = Number(parts[1]);
    const byId = spec.nodes.findIndex((node) => node.id === nodeId);
    const index = byId >= 0
      ? byId
      : Number.isInteger(nodeId) && nodeId >= 0 && nodeId < spec.nodes.length
        ? nodeId
        : -1;
    if (index < 0) throw new Error(`Patch target node does not exist: ${target}`);
    parts[1] = String(index);
  }
  return parts;
}

function readPath(root: any, parts: string[]): { exists: boolean; value: any } {
  let value = root;
  for (const part of parts) {
    if (value == null || !Object.prototype.hasOwnProperty.call(value, part)) {
      return { exists: false, value: undefined };
    }
    value = value[part];
  }
  return { exists: true, value };
}

function writePath(root: any, parts: string[], patch: ManifestPatch): void {
  let parent = root;
  for (let i = 0; i < parts.length - 1; i += 1) parent = parent[parts[i]];
  const key = parts[parts.length - 1];
  const current = parent[key];
  if (patch.operation === "remove") {
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return;
  }
  if (patch.operation === "merge") {
    if (!current || typeof current !== "object" || Array.isArray(current)
      || !patch.after || typeof patch.after !== "object" || Array.isArray(patch.after)) {
      throw new Error(`Merge patch requires object values: ${patch.id}`);
    }
    parent[key] = { ...current, ...cloneJson(patch.after) };
    return;
  }
  parent[key] = cloneJson(patch.after);
}

/**
 * Whether to hard-fail when an applied patch's `before` snapshot no longer matches base.
 * Default soft-skip: persisted manifests often bake `after` into nodes then later mutate
 * knobs/cardId via L1 autosave or recipe apply, leaving stale applied patch history.
 * Set LOREWEAVER_STRICT_PATCHES=1 for unit/CI strict re-apply checks.
 */
function strictAppliedPatches(): boolean {
  try {
    return (
      (typeof process !== "undefined" && process.env?.LOREWEAVER_STRICT_PATCHES === "1") ||
      (typeof globalThis !== "undefined" &&
        (globalThis as any).__LOREWEAVER_STRICT_PATCHES__ === true)
    );
  } catch {
    return false;
  }
}

function materializeAppliedPatches(spec: GameSpec): {
  gameSpec: GameSpec;
  appliedPatchIds: string[];
  patchWarnings: string[];
} {
  const result = cloneJson(spec);
  const patches = [...(spec.workbench?.patches || [])]
    .filter((patch) => patch.status === "applied")
    .sort((a, b) => `${a.createdAt}\u0000${a.id}`.localeCompare(`${b.createdAt}\u0000${b.id}`));
  const ids = new Set<string>();
  const patchWarnings: string[] = [];

  for (let i = 0; i < patches.length; i += 1) {
    const patch = patches[i];
    if (!patch.id || ids.has(patch.id)) throw new Error(`Duplicate or empty applied patch id: ${patch.id || "<empty>"}`);
    ids.add(patch.id);
    const parts = targetParts(result, patch.target);
    const current = readPath(result, parts);

    const isSuperseded = patches.slice(i + 1).some((laterPatch) => {
      try {
        const parts1 = targetParts(result, patch.target);
        const parts2 = targetParts(result, laterPatch.target);
        return isPathOverlappingOrCovered(parts1, parts2);
      } catch {
        return false;
      }
    });

    const alreadyApplied = isSuperseded || (patch.operation === "remove"
      ? !current.exists
      : current.exists && valueContains(current.value, patch.after));
    if (!alreadyApplied) {
      if (patch.operation !== "add" && !current.exists) {
        throw new Error(`Applied patch target is missing: ${patch.id} -> ${patch.target}`);
      }
      if (patch.before !== undefined && !valuesEqual(current.value, patch.before)) {
        // Base already diverged from patch lineage (recipe apply / L1 knobs / multi-session).
        // Prefer current base over hard-crashing the workbench emulator.
        const msg =
          `Applied patch conflict: ${patch.id} expected ${patch.target} to match before` +
          ` (base diverged; ${strictAppliedPatches() ? "strict" : "soft-skip"})`;
        if (strictAppliedPatches()) {
          throw new Error(msg);
        }
        patchWarnings.push(
          `stale_applied_patch_skipped:${patch.id}:${patch.target}` +
            ` — base no longer matches patch.before; keeping current node data`
        );
        continue;
      }
      writePath(result, parts, patch);
    }
  }
  return { gameSpec: result, appliedPatchIds: [...ids], patchWarnings };
}

function stripWorkbench(spec: GameSpec): GameSpec {
  const copy = cloneJson(spec) as GameSpec;
  delete copy.workbench;
  return copy;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, any>)) deepFreeze(item);
  }
  return value;
}

export function compileRuntimeSpec(source: GameSpec): ResolvedRuntimeSpec {
  if (!source || typeof source !== "object") throw new Error("Runtime spec source must be an object");
  if (!Array.isArray(source.nodes) || source.nodes.length === 0) throw new Error("Runtime spec requires nodes[]");

  const normalized = ensureGameplayManifest(cloneJson(source));
  const duplicateNodeIds = normalized.nodes
    .map((node) => node.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateNodeIds.length) throw new Error(`Duplicate node ids: ${[...new Set(duplicateNodeIds)].join(", ")}`);

  const {
    gameSpec: patched,
    appliedPatchIds,
    patchWarnings
  } = materializeAppliedPatches(normalized);
  const gameSpec = stripWorkbench(ensureGameplayManifest(patched));
  const migrationWarnings: string[] = [...patchWarnings];
  for (const node of gameSpec.nodes) {
    if (!node.gameplay?.cardId) migrationWarnings.push(`node:${node.id}: gameplay card inferred from legacy mechanics`);
  }

  const sourceRevisionInput = stripWorkbench(normalized);
  const sourceRevision = `sha256:${sha256Hex(stableStringify(sourceRevisionInput))}`;
  const catalogHashes = Object.fromEntries(CATALOG_KEYS.map((key) => [
    key,
    `sha256:${sha256Hex(stableStringify(gameSpec[key] || []))}`
  ]));
  const specHash = `sha256:${sha256Hex(stableStringify({
    runtimeVersion: LOREWEAVER_RUNTIME_VERSION,
    gameSpec,
    appliedPatchIds,
    catalogHashes
  }))}`;

  return deepFreeze({
    schemaVersion: LOREWEAVER_RUNTIME_SCHEMA,
    runtimeVersion: LOREWEAVER_RUNTIME_VERSION,
    sourceRevision,
    specHash,
    appliedPatchIds,
    catalogHashes,
    migrationWarnings,
    gameSpec
  });
}

export function getResolvedValue(resolved: ResolvedRuntimeSpec, path: string): any {
  return getSpecValueByPath(resolved.gameSpec, path);
}
