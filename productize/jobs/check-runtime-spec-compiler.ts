import assert from "node:assert/strict";
import {
  compileRuntimeSpec,
  getResolvedValue,
  sha256Hex,
  stableStringify
} from "../../src/runtime/compileRuntimeSpec";
import { GameSpec, ManifestPatch } from "../../src/types";

const checks: Array<{ id: string; passed: boolean }> = [];
function check(id: string, fn: () => void) {
  fn();
  checks.push({ id, passed: true });
}

const patch = (input: Partial<ManifestPatch> & Pick<ManifestPatch, "id" | "target" | "operation" | "after">): ManifestPatch => ({
  before: undefined,
  reason: "compiler contract test",
  invalidates: ["gate:runtime-parity"],
  patchLevel: "L1",
  status: "applied",
  createdAt: "2026-07-18T00:00:00.000Z",
  ...input
});

function sourceSpec(): GameSpec {
  return {
    title: "Runtime compiler fixture",
    themeColor: "#22c55e",
    economy: { currencyName: "Essence", resources: ["ore"], realms: ["one", "two"] },
    nodes: [{
      id: 1,
      title: "Node One",
      intro: "Start",
      taunts: [],
      mechanics: "survivor_horde",
      rewards: "ore",
      goalValue: 10,
      resourceMultiplier: 1,
      difficulty: 1,
      durationLimit: 30,
      gameplay: {
        adapter: "phaser",
        cardId: "survivor_horde",
        modifiers: [],
        knobs: { durationSec: 30, enemyAttackDamage: 4, bossPhaseThreshold: 0.5 },
        patchLevel: "L1"
      }
    }],
    workbench: {
      patches: [
        patch({
          id: "patch_duration",
          target: "nodes.1.gameplay.knobs.durationSec",
          operation: "replace",
          before: 30,
          after: 45
        }),
        patch({
          id: "patch_spawn",
          target: "nodes.1.gameplay.knobs.enemySpawnRateSec",
          operation: "add",
          after: 0.75,
          createdAt: "2026-07-18T00:00:01.000Z"
        })
      ],
      revisions: [],
      artifactStatus: {}
    }
  };
}

check("portable_sha256_known_vector", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

check("stable_object_key_order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
});

const first = compileRuntimeSpec(sourceSpec());
const second = compileRuntimeSpec(sourceSpec());

check("stable_spec_hash", () => assert.equal(first.specHash, second.specHash));
check("stable_source_revision", () => assert.equal(first.sourceRevision, second.sourceRevision));
check("deterministic_patch_order", () => assert.deepEqual(first.appliedPatchIds, ["patch_duration", "patch_spawn"]));
check("duration_patch_materialized", () => assert.equal(getResolvedValue(first, "nodes.1.gameplay.knobs.durationSec"), 45));
check("duration_compatibility_field_synced", () => assert.equal(getResolvedValue(first, "nodes.1.durationLimit"), 45));
check("spawn_patch_materialized", () => assert.equal(getResolvedValue(first, "nodes.1.gameplay.knobs.enemySpawnRateSec"), 0.75));
check("runtime_spec_is_deeply_frozen", () => {
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.gameSpec.nodes[0].gameplay?.knobs), true);
});
check("workbench_not_shipped_to_runtime", () => assert.equal(first.gameSpec.workbench, undefined));
check("catalog_hashes_present", () => assert.equal(Object.keys(first.catalogHashes).length, 6));

check("patch_conflict_blocks_compile_strict", () => {
  const source = sourceSpec();
  source.workbench!.patches[0].before = 999;
  const prev = process.env.LOREWEAVER_STRICT_PATCHES;
  process.env.LOREWEAVER_STRICT_PATCHES = "1";
  try {
    assert.throws(() => compileRuntimeSpec(source), /Applied patch conflict/);
  } finally {
    if (prev === undefined) delete process.env.LOREWEAVER_STRICT_PATCHES;
    else process.env.LOREWEAVER_STRICT_PATCHES = prev;
  }
});

check("patch_conflict_soft_skips_by_default", () => {
  const source = sourceSpec();
  source.workbench!.patches[0].before = 999;
  const prev = process.env.LOREWEAVER_STRICT_PATCHES;
  delete process.env.LOREWEAVER_STRICT_PATCHES;
  try {
    const resolved = compileRuntimeSpec(source);
    // duration patch skipped; base stays 30
    assert.equal(getResolvedValue(resolved, "nodes.1.gameplay.knobs.durationSec"), 30);
    assert.ok(
      resolved.migrationWarnings.some((w) => w.includes("stale_applied_patch_skipped:patch_duration"))
    );
  } finally {
    if (prev !== undefined) process.env.LOREWEAVER_STRICT_PATCHES = prev;
  }
});

check("missing_replace_target_blocks_compile", () => {
  const source = sourceSpec();
  source.workbench!.patches = [patch({
    id: "patch_missing",
    target: "nodes.1.gameplay.knobs.doesNotExist",
    operation: "replace",
    after: 1
  })];
  assert.throws(() => compileRuntimeSpec(source), /target is missing/);
});

check("prototype_pollution_target_blocks_compile", () => {
  const source = sourceSpec();
  source.workbench!.patches = [patch({
    id: "patch_prototype",
    target: "nodes.1.__proto__.polluted",
    operation: "add",
    after: true
  })];
  assert.throws(() => compileRuntimeSpec(source), /Invalid patch target/);
});

console.log(JSON.stringify({
  schemaVersion: "loreweaver.runtime-spec-compiler-check.v1",
  status: "passed",
  assertionCount: checks.length,
  specHash: first.specHash,
  sourceRevision: first.sourceRevision,
  checks
}, null, 2));
