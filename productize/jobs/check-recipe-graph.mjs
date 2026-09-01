#!/usr/bin/env node

import { strict as assert } from "node:assert";
import {
  legacyNodesToRecipeGraph,
  recipeGraphToLegacyLinearNodes,
  validateRecipeGraph
} from "../lib/recipe-graph.mjs";

function main() {
  const legacyNodes = [
    {
      id: 1,
      title: "Intro",
      mechanics: "tap_reaction",
      durationLimit: 30,
      gameplay: { cardId: "rhythm_timing", knobs: { recipeId: "intro_recipe" } }
    },
    {
      id: 2,
      title: "Pressure",
      mechanics: "collect_dodge",
      durationLimit: 45,
      gameplay: { cardId: "drag_collect_grid", knobs: {} }
    },
    {
      id: 3,
      title: "Boss",
      mechanics: "survivor_horde",
      durationLimit: 60,
      gameplay: { cardId: "survivor_horde", knobs: { boss: { enabled: true } } }
    }
  ];

  const graph = legacyNodesToRecipeGraph(legacyNodes, { sessionTargetMinutes: 8 });
  assert.equal(graph.schemaVersion, "loreweaver.recipe-graph.v1");
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.entryNodeId, "node:1");
  assert.equal(graph.nodes[0].recipeRef, "intro_recipe");
  assert.equal(graph.nodes[1].recipeRef, "drag_collect_grid");
  assert.deepEqual(graph.completionRules.nodeIds, ["node:3"]);

  const validation = validateRecipeGraph(graph);
  assert.equal(validation.valid, true, validation.errors.join(", "));
  assert.equal(validation.warnings.length, 0);

  const roundTrip = recipeGraphToLegacyLinearNodes(graph);
  assert.deepEqual(roundTrip, legacyNodes, "legacy -> graph -> legacy must be lossless");

  const missingRef = structuredClone(graph);
  missingRef.edges[0].to = "node:404";
  const missingValidation = validateRecipeGraph(missingRef);
  assert.equal(missingValidation.valid, false);
  assert(missingValidation.errors.includes("edge_to_missing:node:404"));

  const cycle = structuredClone(graph);
  cycle.edges.push({ from: "node:3", to: "node:1", when: "success" });
  const cycleValidation = validateRecipeGraph(cycle);
  assert.equal(cycleValidation.valid, false);
  assert(cycleValidation.errors.some((item) => item.startsWith("cycle_forbidden:")));

  cycle.cyclePolicy = "allow";
  const allowedCycle = validateRecipeGraph(cycle);
  assert.equal(allowedCycle.valid, true, allowedCycle.errors.join(", "));
  assert(allowedCycle.warnings.some((item) => item.startsWith("cycle_allowed:")));
  assert.throws(() => recipeGraphToLegacyLinearNodes(cycle), /branching|cycle/i);

  const branch = structuredClone(graph);
  branch.nodes.push({
    id: "node:alt",
    kind: "gameplay",
    title: "Alt",
    sourceNodeId: "alt",
    payload: { id: "alt", title: "Alt" }
  });
  branch.edges.push({ from: "node:1", to: "node:alt", when: "failure" });
  const branchValidation = validateRecipeGraph(branch);
  assert.equal(branchValidation.valid, true, branchValidation.errors.join(", "));
  assert.throws(() => recipeGraphToLegacyLinearNodes(branch), /branching/i);

  console.log("PASSED recipe graph compatibility checks");
}

main();
