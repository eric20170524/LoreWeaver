#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { createLabSuite } from './card-lab-browser-utils.mjs';
const lab=await createLabSuite('observe_capture');const {read,begin,run}=lab;
async function tap(page,x,y,touch=false){
  await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();
  const px=b.x+x/720*b.width,py=b.y+y/1280*b.height;
  if(touch)await page.touchscreen.tap(px,py);else await page.mouse.click(px,py);
}
async function capture(page,row,touch=false){
  await page.waitForFunction(()=>{const s=window.__CARD_LAB__.snapshot().state;return s.captureWindowOpen&&s.windowRemaining>0.3;},null,{timeout:6000});
  const before=(await read(page)).state;
  await tap(page,before.target.x,before.target.y,touch);
  const after=(await read(page)).state;
  assert.equal(after.captures,before.captures+1);assert.equal(after.misses,before.misses,'one pointer event must not count as miss');
  row.actions.push({kind:touch?'touch':'pointer',target:before.target,windowRemaining:before.windowRemaining,progress:after.progress});
}
async function complete(page,row,touch=false){
  for(let guard=0;guard<50&&(await read(page)).state.status==='running';guard++)await capture(page,row,touch);
  await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result),null,{timeout:4000});
  const final=await read(page);assert.equal(final.result?.success,true);assert.equal(final.result.reason,'objective_met');
  assert.equal(final.state.progress,final.config.targetProgress);return final;
}
try{
  await run('default-five-capture-victory',async(page,row)=>{
    await begin(page);const final=await complete(page,row);assert.equal(final.state.captures,5);assert.equal(final.state.misses,0);
  });
  await run('miss-penalty-and-missed-window',async(page,row)=>{
    await begin(page);await capture(page,row);await tap(page,60,500);
    let s=(await read(page)).state;assert.equal(s.progress,10);assert.equal(s.misses,1);
    await page.waitForTimeout(4000);s=(await read(page)).state;assert.equal(s.progress,10);assert.equal(s.captures,1);
    await page.locator('#quit').click();assert.equal((await read(page)).result.reason,'retreated');
    row.assertions.push('real elapsed windows do not award passive progress; one moving miss subtracts exactly 12');
  });
  await run('pause-resume-and-three-restarts',async(page,row)=>{
    await page.locator('#knob-targetProgress').fill('30');await page.locator('#knob-captureGain').fill('15');
    await begin(page);await capture(page,row);assert.equal((await read(page)).result,null);
    await page.locator('#pause').click();const before=(await read(page)).state;
    await tap(page,before.target.x,before.target.y);await page.waitForTimeout(3200);
    assert.deepEqual((await read(page)).state,before);await page.locator('#pause').click();await complete(page,row);
    for(let i=0;i<3;i++){const initial=await begin(page);assert.equal(initial.state.captures,0);await page.locator('#quit').click();assert.equal((await read(page)).result.success,false);}
  });
  await run('mobile-touch-default-victory',async(page,row)=>{
    await begin(page);
    await page.screenshot({path:path.resolve('workflow/reports/card-lab/observe_capture/mobile-active.png'),fullPage:true});
    await complete(page,row,true);
  },{mobile:true});
  await run('offline-default-victory',async(page,row)=>{await begin(page);await complete(page,row);},{offline:true});
  await run('custom-target-no-premature-host-victory',async(page,row)=>{
    await page.locator('#knob-targetProgress').fill('45');await page.locator('#knob-captureGain').fill('9');await page.locator('#knob-missPenalty').fill('0');await page.locator('#knob-pauseWindowSec').fill('1.2');
    await begin(page);const final=await complete(page,row);assert.equal(final.state.captures,5);
  });
}finally{await lab.close(6);}
