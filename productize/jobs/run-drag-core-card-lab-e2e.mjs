#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {createLabSuite} from './card-lab-browser-utils.mjs';
const lab=await createLabSuite('drag_to_core');const {read,begin,run}=lab;
async function drag(page,from,to,touch=false){
 await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();
 const point=p=>({x:b.x+p.x/720*b.width,y:b.y+p.y/1280*b.height});const a=point(from),z=point(to);
 if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(z.x-a.x)*i/8,y:a.y+(z.y-a.y)*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(z.x,z.y,{steps:8});await page.mouse.up();}
}
async function deposit(page,row,touch=false){
 await page.waitForFunction(()=>{const s=window.__CARD_LAB__.snapshot().state;return s.core&&s.hazards.every(h=>Math.hypot(h.x-s.core.x,h.y-s.core.y)>h.radius+45);},null,{timeout:20000});
 const before=(await read(page)).state;const frag=before.frags[0];assert.ok(frag);await drag(page,frag,before.core,touch);
 const after=(await read(page)).state;assert.equal(after.deposited,before.deposited+1);
 row.actions.push({kind:touch?'touch-drag':'mouse-drag',from:frag,to:before.core,progress:after.progress});
}
async function complete(page,row,touch=false){
 for(let i=0;i<25&&(await read(page)).state.status==='running';i++)await deposit(page,row,touch);
 await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result));const final=await read(page);assert.equal(final.result.success,true);assert.equal(final.state.progress,100);return final;
}
try{
 await run('default-hazards-victory',async(page,row)=>{const initial=await begin(page);assert.equal(initial.state.frags.length,14);assert.equal(initial.state.hazards.length,3);const f=await complete(page,row);assert.equal(f.state.deposited,13);});
 await run('hazard-penalty-retry',async(page,row)=>{
  await page.locator('#knob-hazardSpeed').fill('0');await begin(page);
  // Read the visible hazard; dropping there is a real intentional error.
  let s=(await read(page)).state;await drag(page,s.frags[0],s.hazards[0]);s=(await read(page)).state;assert.equal(s.fails,1);assert.equal(s.deposited,0);assert.equal(s.frags.length,14);
  row.actions.push({kind:'hazard-drop',fails:s.fails});await page.locator('#quit').click();await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result));assert.equal((await read(page)).result.reason,'retreated');
 });
 await run('pause-resume-and-three-restarts',async(page,row)=>{
  await page.locator('#knob-fragCount').fill('3');await page.locator('#knob-hazardCount').fill('0');await begin(page);await deposit(page,row);
  await page.locator('#pause').click();const before=(await read(page)).state;await drag(page,before.frags[0],before.core);await page.waitForTimeout(1000);assert.deepEqual((await read(page)).state,before);
  await page.locator('#pause').click();await complete(page,row);
  for(let i=0;i<3;i++){await begin(page);await page.locator('#quit').click();await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result));assert.equal((await read(page)).result.reason,'retreated');}
 });
 await run('drop-outside-core-remains-retryable',async(page,row)=>{
  await page.locator('#knob-hazardCount').fill('0');await page.locator('#knob-fragCount').fill('1');await begin(page);let s=(await read(page)).state;
  await drag(page,s.frags[0],{x:90,y:400});s=(await read(page)).state;assert.equal(s.deposited,0);assert.equal(s.frags.length,1);await complete(page,row);
 });
 await run('mobile-touch-default-victory',async(page,row)=>{await begin(page);await page.screenshot({path:path.resolve('workflow/reports/card-lab/drag_to_core/mobile-active.png'),fullPage:true});await complete(page,row,true);},{mobile:true});
 await run('offline-default-victory',async(page,row)=>{await begin(page);await complete(page,row);},{offline:true});
}finally{await lab.close(6);}
