import Phaser from "phaser";
import { GameSpec, PlayerState } from "../types";
import { initializePhaserGame } from "../game/GameRunner";
import {
  compileRuntimeSpec,
  ResolvedRuntimeSpec
} from "./compileRuntimeSpec";
import { PLAYER_STATE_SCHEMA, normalizePlayerState } from "./playerState";

export type LoreWeaverHostKind = "ide" | "standalone" | "test";

export interface RuntimeDiagnostics {
  runtimeVersion: string;
  specHash: string;
  sourceRevision: string;
  appliedPatchIds: readonly string[];
  adapterRegistryVersion: string;
  saveSchema: string;
  hostKind: LoreWeaverHostKind;
  lifecycle: "booting" | "running" | "destroyed" | "error";
  assetStatus: string;
  lastError: string | null;
}

export interface LoreWeaverRuntimeHost {
  container: HTMLElement;
  hostKind: LoreWeaverHostKind;
  workspaceId?: string | null;
  initialPlayerState: PlayerState;
  saveState: (state: PlayerState) => void;
  logger?: (message: string) => void;
  onState?: (diagnostics: RuntimeDiagnostics) => void;
}

export interface LoreWeaverRuntimeHandle {
  game: Phaser.Game;
  resolvedSpec: ResolvedRuntimeSpec;
  getDiagnostics: () => RuntimeDiagnostics;
  destroy: () => void;
}

function publishDiagnostics(
  current: RuntimeDiagnostics,
  listener?: (diagnostics: RuntimeDiagnostics) => void
): RuntimeDiagnostics {
  const next = Object.freeze({ ...current });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "__LOREWEAVER_RUNTIME__", {
      configurable: true,
      enumerable: false,
      get: () => next
    });
  }
  listener?.(next);
  return next;
}

export function startLoreWeaverRuntime(
  source: GameSpec | ResolvedRuntimeSpec,
  host: LoreWeaverRuntimeHost
): LoreWeaverRuntimeHandle {
  const resolvedSpec = "specHash" in source ? source : compileRuntimeSpec(source);
  let diagnostics = publishDiagnostics({
    runtimeVersion: resolvedSpec.runtimeVersion,
    specHash: resolvedSpec.specHash,
    sourceRevision: resolvedSpec.sourceRevision,
    appliedPatchIds: Object.freeze([...resolvedSpec.appliedPatchIds]),
    adapterRegistryVersion: "loreweaver.adapter-registry.v2",
    saveSchema: PLAYER_STATE_SCHEMA,
    hostKind: host.hostKind,
    lifecycle: "booting",
    assetStatus: "pending",
    lastError: null
  }, host.onState);

  const mirrorHostDiagnostics = () => {
    host.container.dataset.loreweaverRuntimeVersion = diagnostics.runtimeVersion;
    host.container.dataset.loreweaverSpecHash = diagnostics.specHash;
    host.container.dataset.loreweaverLifecycle = diagnostics.lifecycle;
    host.container.dataset.loreweaverAssetStatus = diagnostics.assetStatus;
    host.container.dataset.loreweaverHostKind = diagnostics.hostKind;
  };
  mirrorHostDiagnostics();

  const update = (patch: Partial<RuntimeDiagnostics>) => {
    diagnostics = publishDiagnostics({ ...diagnostics, ...patch }, host.onState);
    mirrorHostDiagnostics();
  };

  try {
    const game = initializePhaserGame(
      host.container,
      resolvedSpec.gameSpec,
      normalizePlayerState(host.initialPlayerState),
      (state) => host.saveState(normalizePlayerState(state)),
      host.logger || (() => undefined),
      { workspaceId: host.workspaceId || null }
    );
    update({ lifecycle: "running", assetStatus: "loading" });
    const assetStatusTimer = typeof window !== "undefined"
      ? window.setInterval(() => {
          const nextStatus = (window as any).__LOREWEAVER_ART_PIPELINE__?.status;
          if (nextStatus && nextStatus !== diagnostics.assetStatus) update({ assetStatus: nextStatus });
          if (["loaded", "error", "skipped_no_workspace_assets"].includes(nextStatus)) {
            window.clearInterval(assetStatusTimer);
          }
        }, 250)
      : null;
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      if (assetStatusTimer !== null) window.clearInterval(assetStatusTimer);
      update({ lifecycle: "destroyed" });
    });

    const handle: LoreWeaverRuntimeHandle = {
      game,
      resolvedSpec,
      getDiagnostics: () => diagnostics,
      destroy: () => {
        if (assetStatusTimer !== null) window.clearInterval(assetStatusTimer);
        if (diagnostics.lifecycle !== "destroyed") game.destroy(true);
      }
    };
    return handle;
  } catch (error) {
    update({ lifecycle: "error", lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

declare global {
  interface Window {
    __LOREWEAVER_RUNTIME__?: RuntimeDiagnostics;
  }
}
