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
