/**
 * RecipeGraph compatibility helpers.
 *
 * Phase 1 is intentionally non-invasive: the runtime still consumes resolved
 * linear nodes. These helpers let authoring move away from a hard-coded
 * 12-node model without forcing a runtime rewrite in the same change.
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function graphNodeId(sourceId, index) {
  const raw = sourceId == null ? String(index + 1) : String(sourceId);
  return `node:${raw}`;
}

function inferRecipeRef(node) {
  const gameplay = node?.gameplay || {};
  const knobs = gameplay?.knobs || {};
  return knobs.recipeId || gameplay.recipeId || gameplay.cardId || null;
}

/** Convert legacy manifest nodes[] into a lossless linear RecipeGraph. */
export function legacyNodesToRecipeGraph(nodes, options = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("legacyNodesToRecipeGraph requires at least one node");
  }

  const graphNodes = nodes.map((node, index) => ({
    id: graphNodeId(node?.id, index),
    kind: "gameplay",
    title: String(node?.title || `Node ${index + 1}`),
    recipeRef: inferRecipeRef(node),
    sourceNodeId: node?.id ?? index + 1,
    payload: clone(node),
    metadata: {
      legacyLinearIndex: index,
      migratedFrom: "manifest.nodes"
    }
  }));

  const edges = [];
  for (let index = 0; index < graphNodes.length - 1; index += 1) {
    edges.push({
      from: graphNodes[index].id,
      to: graphNodes[index + 1].id,
      when: "success",
      priority: 0
    });
  }

  const sessionTargetMinutes = Number(options.sessionTargetMinutes);
  return {
    schemaVersion: "loreweaver.recipe-graph.v1",
    entryNodeId: graphNodes[0].id,
    nodes: graphNodes,
    edges,
    completionRules: {
      type: "reach_any",
      nodeIds: [graphNodes[graphNodes.length - 1].id]
    },
    cyclePolicy: "forbid",
    ...(Number.isFinite(sessionTargetMinutes) && sessionTargetMinutes > 0
      ? { sessionTargetMinutes }
      : {}),
    metadata: {
      compatibilityMode: "legacy_linear_nodes_v1",
      sourceNodeCount: nodes.length
    }
  };
}

function buildAdjacency(graph) {
  const adjacency = new Map();
  for (const node of graph?.nodes || []) adjacency.set(node.id, []);
  for (const edge of graph?.edges || []) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  return adjacency;
}

function reachableFromEntry(graph) {
  const adjacency = buildAdjacency(graph);
  const seen = new Set();
  const stack = graph?.entryNodeId ? [graph.entryNodeId] : [];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

function findCycle(graph) {
  const adjacency = buildAdjacency(graph);
  const visiting = new Set();
  const visited = new Set();

  function walk(nodeId, path) {
    if (visiting.has(nodeId)) {
      const start = path.indexOf(nodeId);
      return start >= 0 ? [...path.slice(start), nodeId] : [nodeId, nodeId];
    }
    if (visited.has(nodeId)) return null;

    visiting.add(nodeId);
    path.push(nodeId);
    for (const next of adjacency.get(nodeId) || []) {
      const cycle = walk(next, path);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const nodeId of adjacency.keys()) {
    const cycle = walk(nodeId, []);
    if (cycle) return cycle;
  }
  return null;
}

/** Structural validator used before schema/tooling integration. */
export function validateRecipeGraph(graph) {
  const errors = [];
  const warnings = [];
  if (!graph || typeof graph !== "object") {
    return { valid: false, errors: ["graph_missing"], warnings, reachableNodeIds: [] };
  }
  if (graph.schemaVersion !== "loreweaver.recipe-graph.v1") {
    errors.push(`schemaVersion_invalid:${graph.schemaVersion || "missing"}`);
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    errors.push("nodes_missing");
    return { valid: false, errors, warnings, reachableNodeIds: [] };
  }

  const ids = new Set();
  for (const node of graph.nodes) {
    const id = String(node?.id || "");
    if (!id) {
      errors.push("node_id_missing");
      continue;
    }
    if (ids.has(id)) errors.push(`node_id_duplicate:${id}`);
    ids.add(id);
  }

  if (!ids.has(graph.entryNodeId)) {
    errors.push(`entry_node_missing:${graph.entryNodeId || "missing"}`);
  }

  for (const edge of graph.edges || []) {
    if (!ids.has(edge?.from)) errors.push(`edge_from_missing:${edge?.from}`);
    if (!ids.has(edge?.to)) errors.push(`edge_to_missing:${edge?.to}`);
    if (!String(edge?.when || "").trim()) errors.push(`edge_when_missing:${edge?.from}->${edge?.to}`);
  }

  const completionNodeIds = graph?.completionRules?.nodeIds;
  if (!Array.isArray(completionNodeIds) || completionNodeIds.length === 0) {
    errors.push("completion_nodes_missing");
  } else {
    for (const nodeId of completionNodeIds) {
      if (!ids.has(nodeId)) errors.push(`completion_node_missing:${nodeId}`);
    }
  }

  const reachable = reachableFromEntry(graph);
  for (const id of ids) {
    if (!reachable.has(id)) warnings.push(`node_unreachable:${id}`);
  }
  for (const nodeId of completionNodeIds || []) {
    if (ids.has(nodeId) && !reachable.has(nodeId)) {
      errors.push(`completion_node_unreachable:${nodeId}`);
    }
  }

  const cycle = findCycle(graph);
  if (cycle && graph.cyclePolicy !== "allow") {
    errors.push(`cycle_forbidden:${cycle.join("->")}`);
  } else if (cycle) {
    warnings.push(`cycle_allowed:${cycle.join("->")}`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    reachableNodeIds: [...reachable]
  };
}

/**
 * Convert only a legacy-compatible linear graph back to runtime nodes.
 * Branching graphs deliberately fail closed until a graph-aware compiler owns
 * branch resolution.
 */
export function recipeGraphToLegacyLinearNodes(graph) {
  const validation = validateRecipeGraph(graph);
  if (!validation.valid) {
    throw new Error(`Invalid RecipeGraph: ${validation.errors.join(", ")}`);
  }

  const outgoing = new Map();
  const incoming = new Map();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, 0);
  }
  for (const edge of graph.edges || []) {
    outgoing.get(edge.from).push(edge);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  }

  for (const node of graph.nodes) {
    const out = outgoing.get(node.id) || [];
    if (out.length > 1) throw new Error(`RecipeGraph is branching at ${node.id}`);
    if ((incoming.get(node.id) || 0) > 1) throw new Error(`RecipeGraph merges at ${node.id}`);
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const result = [];
  const seen = new Set();
  let current = graph.entryNodeId;
  while (current) {
    if (seen.has(current)) throw new Error("RecipeGraph linearization encountered a cycle");
    seen.add(current);
    const node = byId.get(current);
    if (!node) throw new Error(`RecipeGraph node not found: ${current}`);
    if (!node.payload || typeof node.payload !== "object") {
      throw new Error(`RecipeGraph node ${current} has no legacy payload`);
    }
    result.push(clone(node.payload));
    const nextEdge = (outgoing.get(current) || [])[0];
    current = nextEdge?.to || null;
  }

  if (result.length !== graph.nodes.length) {
    throw new Error("RecipeGraph is not a single connected linear chain");
  }
  return result;
}
