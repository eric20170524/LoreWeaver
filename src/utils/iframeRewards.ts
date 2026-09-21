import type { NodeSpec, NodeResult } from '../types';

// Translate legacy H5 rewards into the progression fields supported by this host.
export function mapIframeRewards(reward: Record<string, any>, node: NodeSpec, resourceKey: string): NonNullable<NodeResult['rewards']> {
  const secondaryResources = typeof reward.qi === 'number'
    ? { [resourceKey]: reward.qi }
    : reward.secondaryResources ?? { [resourceKey]: 1 };
  const abilities = [
    ...(reward.skill ? [reward.skill] : []),
    ...(reward.unlockedAbilities || [])
  ];
  if (abilities.length === 0) abilities.push(...(node.planning?.rewardUnlocks || []));
  const flags = [...(reward.storyFlags || []), ...(reward.relic ? [reward.relic] : [])];
  return {
    multiplierGain: reward.multiplierGain ?? (typeof reward.xp === 'number' ? reward.xp / 300 : node.resourceMultiplier / 12),
    secondaryResources,
    unlockedAbilities: [...new Set(abilities)],
    storyFlags: [...new Set(flags)],
    unlockNextNode: reward.unlockNextNode !== false
  };
}
