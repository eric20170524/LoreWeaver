import { PlayerState } from "../types";

export const PLAYER_STATE_SCHEMA = "loreweaver.player-state.v1";

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
