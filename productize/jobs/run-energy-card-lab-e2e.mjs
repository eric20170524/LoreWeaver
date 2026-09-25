#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';
const lab = await createLabSuite('energy_balance');
const { read, begin, run } = lab;
async function drag(page, row, orb, target, touch = false) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  const point = ({ x,y }) => ({ x: box.x+x/720*box.width,y:box.y+y/1280*box.height });
  const from=point(orb),to=point(target);
  if (touch) {
    const cdp=await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[to]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } finally { await cdp.detach(); }
  } else {
    await page.mouse.move(from.x,from.y); await page.mouse.down();
    await page.mouse.move(to.x,to.y,{steps:6}); await page.mouse.up();
  }
  row.actions.push({kind:touch?'touch-drag':'mouse-drag',orb:orb.id,label:orb.label,bias:orb.bias,to:target});
}
async function solve(page,row,touch=false) {
  const deadline=Date.now()+65000;
  while(Date.now()<deadline) {
    const snap=await read(page),s=snap.state;
    if(snap.result)break;
    if(Math.abs(s.balance-0.5)>0.055) {
      const candidates=s.orbs.filter(o=>Math.abs(s.balance+o.bias*0.08-0.5)<Math.abs(s.balance-0.5))
        .sort((a,b)=>Math.abs(s.balance+a.bias*0.08-0.5)-Math.abs(s.balance+b.bias*0.08-0.5));
      if(candidates.length)await drag(page,row,candidates[0],s.core,touch);
    }
    await page.waitForTimeout(120);
  }
  const final=await read(page);
  assert.equal(final.result?.success,true);
  assert.ok(final.result.telemetry.stableSec>=final.config.targetStableSec);
  assert.ok(final.state.deposits>0,'victory required real corrective drags');
  return final;
}
async function waitOrb(page) {
  await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state?.orbs?.length>0);
  return (await read(page)).state;
}
try {
  await run('default-stable-time-victory',async(page,row)=>{
    const initial=await begin(page);assert.equal(initial.config.targetStableSec,20);
    assert.equal(initial.config.safeZoneWidth,0.22);
    await solve(page,row);
  });
  await run('wrong-direction-failure',async(page,row)=>{
    await page.locator('#knob-targetStableSec').fill('120');
    await page.locator('#knob-failOverWarn').fill('1');
    await page.locator('#knob-failViolationLimit').fill('1');
    await begin(page);
    const deadline=Date.now()+25000;
    while(Date.now()<deadline) {
      const snap=await read(page),s=snap.state;if(snap.result)break;
      const orb=s.orbs.find(o=>(s.balance-0.5)*o.bias>0);
      if(orb)await drag(page,row,orb,s.core);
      await page.waitForTimeout(150);
    }
    const final=await read(page);
    assert.equal(final.result?.success,false);assert.equal(final.state.violations,1);
    assert.ok(final.state.deposits>0);
  });
  await run('no-input-does-not-win',async(page,row)=>{
    await page.locator('#knob-failOverWarn').fill('1');
    await page.locator('#knob-failViolationLimit').fill('1');
    await begin(page);
    await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result),null,{timeout:16000});
    const final=await read(page);assert.equal(final.result.success,false);assert.equal(final.state.deposits,0);
    row.assertions.push('unattended equilibrium naturally drifts past the warning boundary');
  });
  await run('outside-core-drop-and-pause-restart',async(page,row)=>{
    await begin(page);const s=await waitOrb(page),orb=s.orbs[0];
    await drag(page,row,orb,{x:250,y:900});
    let moved=(await read(page)).state;
    assert.equal(moved.deposits,0);assert.ok(moved.orbs.some(o=>o.id===orb.id));
    await page.locator('#pause').click();
    const frozen=(await read(page)).state;
    await page.waitForTimeout(1800);
    moved=(await read(page)).state;
    assert.equal(moved.balance,frozen.balance);assert.equal(moved.stableSec,frozen.stableSec);
    assert.deepEqual(moved.orbs,frozen.orbs);
    await page.locator('#pause').click();
    moved=(await read(page)).state;
    await drag(page,row,moved.orbs.find(o=>o.id===orb.id),moved.core);
    assert.equal((await read(page)).state.deposits,1);
    for(let i=0;i<3;i++) {
      const fresh=await begin(page);assert.equal(fresh.state.deposits,0);assert.equal(fresh.state.violations,0);
      await page.locator('#quit').click();
      await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().result?.reason==='retreated');
    }
  });
  await run('mobile-touch-default-victory',async(page,row)=>{
    await begin(page);await solve(page,row,true);
  },{mobile:true});
  await run('offline-drag-and-retreat',async(page,row)=>{
    await begin(page);const s=await waitOrb(page);
    await drag(page,row,s.orbs[0],s.core);
    assert.equal((await read(page)).state.deposits,1);
    await page.locator('#quit').click();
    await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().result?.reason==='retreated');
  },{offline:true});
} finally {await lab.close(6);}
