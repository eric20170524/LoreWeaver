import { PlayerState, NodeSpec, NodeResult } from "../types";

export class RewardApplier {
  static apply(pState: PlayerState, node: NodeSpec, result: NodeResult): PlayerState {
    const nextState = { ...pState };
    if (!result.success) return nextState;

    // 1. Mark completed node
    if (!nextState.completedNodeIds.includes(node.id)) {
      nextState.completedNodeIds = [...nextState.completedNodeIds, node.id];
    }

    // 2. Unlock next node (if unlockNextNode is not false)
    if (result.rewards?.unlockNextNode !== false) {
      const nextId = node.id + 1;
      // Assume 12 is max nodes
      if (nextId <= 12 && !nextState.unlockedNodeIds.includes(nextId)) {
        nextState.unlockedNodeIds = [...nextState.unlockedNodeIds, nextId];
      }
    }

    // 3. Apply active multiplier
    const multiplierGain = result.rewards?.multiplierGain ?? (node.resourceMultiplier / 12.0);
    nextState.activeMultiplier = (nextState.activeMultiplier || 1.0) + multiplierGain;

    // 4. Apply secondary resources
    if (result.rewards?.secondaryResources) {
      nextState.secondaryResources = { ...nextState.secondaryResources };
      for (const [key, amount] of Object.entries(result.rewards.secondaryResources)) {
        nextState.secondaryResources[key] = (nextState.secondaryResources[key] || 0) + amount;
      }
    }

    // 5. Apply unlocked abilities
    if (result.rewards?.unlockedAbilities) {
      const currentAbilities = nextState.unlockedAbilities || [];
      const newAbilities = result.rewards.unlockedAbilities.filter(id => !currentAbilities.includes(id));
      nextState.unlockedAbilities = [...currentAbilities, ...newAbilities];
    } else if (node.planning?.rewardUnlocks) {
      const currentAbilities = nextState.unlockedAbilities || [];
      const newAbilities = node.planning.rewardUnlocks.filter(id => !currentAbilities.includes(id));
      nextState.unlockedAbilities = [...currentAbilities, ...newAbilities];
    }

    // 6. Apply unlocked passives
    if (result.rewards?.unlockedPassives) {
      const currentPassives = nextState.unlockedPassives || [];
      const newPassives = result.rewards.unlockedPassives.filter(id => !currentPassives.includes(id));
      nextState.unlockedPassives = [...currentPassives, ...newPassives];
    }

    // 7. Apply story flags
    if (result.rewards?.storyFlags) {
      const currentFlags = nextState.storyFlags || [];
      const newFlags = result.rewards.storyFlags.filter(f => !currentFlags.includes(f));
      nextState.storyFlags = [...currentFlags, ...newFlags];
    }

    return nextState;
  }
}
