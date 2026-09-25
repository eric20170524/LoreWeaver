import { PlayerState } from "../types";

export const PLAYER_STATE_SCHEMA = "loreweaver.player-state.v1";
export const PLAYER_STATE_STORAGE_PREFIX = "loreweaver_player_state";

export function playerStateStorageKey(workspaceId?: string | null): string {
  const id = typeof workspaceId === "string" ? workspaceId.trim() : "";
  return id ? `${PLAYER_STATE_STORAGE_PREFIX}_${id}` : PLAYER_STATE_STORAGE_PREFIX;
}

export function readStoredPlayerState(
  storage: Pick<Storage, "getItem"> | null | undefined,
  workspaceId?: string | null
): PlayerState {
  if (!storage) return { ...INITIAL_PLAYER_STATE };
  const raw = storage.getItem(playerStateStorageKey(workspaceId));
  if (!raw) return { ...INITIAL_PLAYER_STATE };
  try {
    return normalizePlayerState(JSON.parse(raw));
  } catch {
    return { ...INITIAL_PLAYER_STATE };
  }
}

export function writeStoredPlayerState(
  storage: Pick<Storage, "setItem"> | null | undefined,
  state: PlayerState,
  workspaceId?: string | null
): PlayerState {
  const normalized = normalizePlayerState(state);
  storage?.setItem(playerStateStorageKey(workspaceId), JSON.stringify(normalized));
  return normalized;
}

export function clearStoredPlayerState(
  storage: Pick<Storage, "removeItem"> | null | undefined,
  workspaceId?: string | null
): void {
  storage?.removeItem(playerStateStorageKey(workspaceId));
}

export const INITIAL_PLAYER_STATE: PlayerState = Object.freeze({
  currentRealmIndex: 0,
  mainCurrencyCount: 0,
  secondaryResources: {},
  unlockedNodeIds: [1],
  completedNodeIds: [],
  unlockedAbilities: [],
  activeMultiplier: 1.0,
  clickPower: 1.5,
  storyFlags: [],
  unlockedPassives: []
});

export function normalizePlayerState(state: Partial<PlayerState> | null | undefined): PlayerState {
  return {
    ...INITIAL_PLAYER_STATE,
    ...(state || {}),
    secondaryResources: state?.secondaryResources || {},
    unlockedNodeIds: Array.isArray(state?.unlockedNodeIds) ? state.unlockedNodeIds : [1],
    completedNodeIds: Array.isArray(state?.completedNodeIds) ? state.completedNodeIds : [],
    unlockedAbilities: Array.isArray(state?.unlockedAbilities) ? state.unlockedAbilities : [],
    storyFlags: Array.isArray(state?.storyFlags) ? state.storyFlags : [],
    unlockedPassives: Array.isArray(state?.unlockedPassives) ? state.unlockedPassives : []
  };
}
