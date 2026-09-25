import assert from 'node:assert/strict';
import test from 'node:test';
import { mapIframeRewards } from '../../src/utils/iframeRewards.ts';
import { RewardApplier } from '../../src/utils/RewardApplier.ts';
import type { NodeSpec, PlayerState } from '../../src/types';
const node = { id: 1, resourceMultiplier: 12, planning: { rewardUnlocks: ['fallback'] } } as NodeSpec;
function apply(raw: Record<string, unknown>) {
  const state: PlayerState = {currentRealmIndex:0,mainCurrencyCount:0,secondaryResources:{qi:4},unlockedNodeIds:[1],completedNodeIds:[],unlockedAbilities:[],activeMultiplier:2,clickPower:1,storyFlags:['existing']};
  const result=RewardApplier.apply(state,node,{success:true,rewards:mapIframeRewards(raw,node,'qi')});
  assert.equal(state.activeMultiplier,2);assert.deepEqual(state.storyFlags,['existing']);
  return result;
}
test('explicit zero XP and resources preserve balances, with next-node unlock disabled',()=>{
  const s=apply({xp:0,qi:0,unlockNextNode:false});assert.equal(s.activeMultiplier,2);assert.equal(s.secondaryResources.qi,4);assert.deepEqual(s.unlockedNodeIds,[1]);assert.deepEqual(s.completedNodeIds,[1]);
});
test('relic and flags survive together, including the normalized empty flags array',()=>{
  assert.deepEqual(apply({relic:'jade',storyFlags:[]}).storyFlags,['existing','jade']);
  assert.deepEqual(apply({relic:'jade',storyFlags:['clear','jade']}).storyFlags,['existing','clear','jade']);
});
test('legacy nonzero XP and ability rewards retain their conversion',()=>{
  const s=apply({xp:30,qi:3,skill:'focus',unlockedAbilities:['focus']});assert.equal(s.activeMultiplier,2.1);assert.equal(s.secondaryResources.qi,7);assert.deepEqual(s.unlockedAbilities,['focus']);
});
test('omitted rewards retain legacy defaults while explicit multiplier zero wins',()=>{
  const s=apply({});assert.equal(s.activeMultiplier,3);assert.equal(s.secondaryResources.qi,5);assert.deepEqual(s.unlockedAbilities,['fallback']);assert.equal(apply({xp:30,multiplierGain:0}).activeMultiplier,2);
});
