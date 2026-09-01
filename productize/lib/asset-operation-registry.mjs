import { createBuiltinAssetOperationHandlers } from "./asset-operation-executor.mjs";
import { createDeterministicPngAssetOperationHandlers } from "./png-asset-operations.mjs";
import { createDeterministicWavAssetOperationHandlers } from "./wav-asset-operations.mjs";
import {
  createRealAssetVlmOperationHandlers,
  probeRealAssetVlmProvider
} from "./real-asset-vlm-operation.mjs";

function merge(target, source) {
  for (const [name, handler] of source) {
    if (target.has(name)) throw new Error(`asset_operation_port_duplicate:${name}`);
    target.set(name, handler);
  }
  return target;
}

/** Canonical LoreWeaver AssetRecipe operation registry. */
export function createLoreWeaverAssetOperationHandlers(options = {}) {
  const handlers = new Map();
  merge(handlers, createBuiltinAssetOperationHandlers());
  merge(handlers, createDeterministicPngAssetOperationHandlers());
  merge(handlers, createDeterministicWavAssetOperationHandlers());
  merge(handlers, createRealAssetVlmOperationHandlers(options));
  return handlers;
}

/**
 * Fail before any AssetRecipe operation executes when a declared port is not
 * available. This is especially important for provider-backed `asset.vlm`: a
 * missing real provider must not leave partially processed outputs behind.
 */
export function preflightAssetOperationRegistry(recipe, handlers) {
  const registry = handlers instanceof Map ? handlers : new Map(Object.entries(handlers || {}));
  const requiredPorts = [...new Set((recipe?.operations || [])
    .map((operation) => String(operation?.port || "").trim())
    .filter(Boolean))];
  const missingPorts = requiredPorts.filter((port) => typeof registry.get(port) !== "function");
  return {
    schemaVersion: "loreweaver.asset-operation-preflight.v1",
    status: missingPorts.length ? "blocked" : "passed",
    ready: missingPorts.length === 0,
    requiredPorts,
    registeredPorts: [...registry.keys()].sort(),
    missingPorts,
    blockers: missingPorts.map((port) => `asset_operation_port_unregistered:${port}`)
  };
}

export function assertAssetOperationRegistryReady(recipe, handlers) {
  const result = preflightAssetOperationRegistry(recipe, handlers);
  if (!result.ready) {
    const error = new Error(result.blockers.join(","));
    error.name = "AssetOperationRegistryPreflightError";
    error.preflight = result;
    throw error;
  }
  return result;
}

export function assetOperationCapabilitySnapshot(options = {}) {
  const handlers = createLoreWeaverAssetOperationHandlers(options);
  const vlm = probeRealAssetVlmProvider(options);
  return {
    schemaVersion: "loreweaver.asset-operation-capabilities.v1",
    ports: [...handlers.keys()].sort(),
    deterministicPorts: [...handlers.keys()].filter((name) => name !== "asset.vlm").sort(),
    realProviderPorts: vlm.available ? ["asset.vlm"] : [],
    vlm
  };
}
