#!/usr/bin/env node
// Real pointer/touch input and readonly observations; never set HP/score or call finish.
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';
const lab=await createLabSuite('drag_collect_grid');
const {read,point,begin,run}=lab;
async function terminal(page,timeout=10000) {
  await page.waitForFunction(()=>!!window.__CARD_LAB__.snapshot().result,null,{timeout});return read(page);
}
async function dragTo(page,x) {
  const s=await read(page),from=point(page,s.state.playerPosition.x,s.state.playerPosition.y),to=point(page,x,s.state.playerPosition.y);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y);
  await page.waitForTimeout(80);await page.mouse.up();
}
async function play(page,row,seekHazard=false,budget=48000) {
  let s=await read(page);const origin=point(page,s.state.playerPosition.x,s.state.playerPosition.y);
  await page.mouse.move(origin.x,origin.y);await page.mouse.down();
  const deadline=Date.now()+budget;
  try {
    while(Date.now()<deadline) {
      s=await read(page);if(s.result||s.state?.lastResult)break;
      const p=s.state.playerPosition;if(!p)break;
      const incoming=s.state.items.filter(f=>f.y<p.y+40&&f.y>p.y-300).sort((a,b)=>b.y-a.y);
      const desired=incoming.find(f=>f.kind===(seekHazard?'hazard':'gem'));
      let x=desired?.x??p.x;
      if(!seekHazard) {
        const dangers=incoming.filter(f=>f.kind==='hazard'&&f.y>p.y-150);
        const candidates=[x,p.x,36,684,...incoming.filter(f=>f.kind==='gem').map(f=>f.x)];
        const risk=v=>dangers.filter(f=>Math.abs(v-f.x)<60).length*10000+(desired?Math.abs(v-desired.x):Math.abs(v-p.x));
        x=candidates.sort((a,b)=>risk(a)-risk(b))[0];
      }
      x=Math.max(36,Math.min(684,x));const to=point(page,x,p.y);
      await page.mouse.move(to.x,to.y);
      row.actions.push({timer:s.state.timer,x,target:desired?.id,score:s.state.score,hp:s.state.hp});
      await page.waitForTimeout(100);
    }
  } finally {await page.mouse.up();}
  return terminal(page,6000);
}
try {
  await run('default-victory',async(page,row)=>{
    const first=await begin(page);
    assert.equal(first.config.timeLimitSec,40);assert.equal(first.config.needAmount,16);
    assert.equal(first.config.hazardRate,0.35);assert.equal(first.config.skipBoss,true);
    const s=await play(page,row);
    assert.equal(s.result.success,true);assert.equal(s.result.reason,'objective_met');
    assert.equal(s.state.score,16);assert.equal(s.state.bossSpawned,false);
    assert.ok(s.saves.some(x=>x.completedNodeIds.includes(1)));
    row.assertions.push('unmodified default quota reached by real dragging; normal hazards retained','host completion callback, not user disk persistence');
  });
  await run('real-hazard-failure',async(page,row)=>{
    await page.locator('#hazard').fill('0.9');await page.locator('#damage').fill('100');await begin(page);
    const s=await play(page,row,true,20000);
    assert.equal(s.result.success,false);assert.equal(s.result.reason,'hp_zero');
    assert.equal(s.state.hp,0);assert.equal(s.state.hazardsHit,1);assert.deepEqual(s.result.rewards,{});
    row.assertions.push('public new-run hazard/damage settings; actual collision, no injected damage');
  });
  await run('configured-timeout',async(page,row)=>{
    await page.locator('#duration').fill('5');await page.locator('#target').fill('200');await page.locator('#hazard').fill('0');await begin(page);
    const s=await terminal(page,10000);
    assert.equal(s.result.success,false);assert.equal(s.result.reason,'timer_expired');
    assert.equal(s.state.timer,0);assert.equal(s.state.hp,100);assert.deepEqual(s.result.rewards,{});
    row.assertions.push('five-second real-time expiry, zero hazard honored, no success from mere elapsed time');
  });
  await run('target-one-and-settings',async(page,row)=>{
    await page.locator('#target').fill('1');await page.locator('#hazard').fill('0');await begin(page);
    await page.locator('#target').fill('200'); // Running config must not change mid-round.
    assert.equal((await read(page)).config.needAmount,1);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const s=await play(page,row,false,15000);
    assert.equal(s.result.success,true);assert.equal(s.state.score,1);
    row.assertions.push('edited quota applies only on next start; current one-item objective remains one');
  });
  await run('pause-hover-restart-switch',async(page,row)=>{
    await begin(page);const original=(await read(page)).state.playerPosition;
    const hover=point(page,36,original.y);await page.mouse.move(hover.x,hover.y);await page.waitForTimeout(150);
    assert.deepEqual((await read(page)).state.playerPosition,original);
    await dragTo(page,36);assert.ok((await read(page)).state.playerPosition.x<39);
    await page.locator('#pause').click();await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state?.status==='paused');
    const frozen=(await read(page)).state;await dragTo(page,684);await page.waitForTimeout(1200);
    assert.deepEqual((await read(page)).state,frozen);
    await page.locator('#pause').click();await page.waitForTimeout(1200);
    assert.ok((await read(page)).state.timer<frozen.timer);
    await page.locator('#quit').click();assert.equal((await terminal(page)).result.reason,'retreated');
    for(let i=0;i<3;i++){const s=await begin(page);assert.equal(s.state.score,0);assert.equal(s.state.hp,100);assert.equal(await page.locator('canvas').count(),1);}
    await page.locator('#card').selectOption('rhythm_timing');assert.equal((await read(page)).state,null);
    await page.locator('#card').selectOption('drag_collect_grid');await begin(page);
    row.assertions.push('hover inert; drag accepted; pause freezes objects/clock/input','three fresh restarts and round-trip card switch');
  });
  await run('mobile-touch',async(page,row)=>{
    await begin(page);const p=(await read(page)).state.playerPosition;
    const from=point(page,p.x,p.y),to=point(page,36,p.y);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[to]});
    await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state?.playerPosition?.x<40);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    row.assertions.push('390px Chromium touch drag; not physical phone certification');
  },{mobile:true});
  await run('offline-file-launch',async(page,row)=>{
    await begin(page);await page.locator('#quit').click();assert.equal((await terminal(page)).result.reason,'retreated');
    row.assertions.push('identical static bundle starts and retreats from file://');
  },{offline:true});
} finally {await lab.close(7);}
