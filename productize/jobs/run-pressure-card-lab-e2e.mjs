#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {createLabSuite} from './card-lab-browser-utils.mjs';
const lab=await createLabSuite('pressure_survival');const {read,begin,run}=lab;
async function tap(page,p={x:120,y:500},touch=false){await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();const x=b.x+p.x/720*b.width,y=b.y+p.y/1280*b.height;if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);}
async function result(page){await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result));return read(page);}
async function survive(page,row,touch=false){
 const deadline=Date.now()+140000;
 while((await read(page)).state.status==='running'&&Date.now()<deadline){
  const s=(await read(page)).state;
  if(s.skillCd===0&&s.pressure>20){await tap(page,s.skill,touch);row.actions.push({kind:'skill',elapsed:s.elapsed});}
  else if(s.targets.length){await tap(page,s.targets[0],touch);row.actions.push({kind:touch?'touch-target':'pointer-target',elapsed:s.elapsed});}
  else if(s.pressure>12){await tap(page,undefined,touch);row.actions.push({kind:touch?'touch':'pointer',elapsed:s.elapsed});}
  await page.waitForTimeout(250);
 }
 const f=await result(page);assert.equal(f.result.success,true);assert.equal(f.result.reason,'timer_expired');assert.equal(f.state.elapsed,f.config.durationSec);return f;
}
try{
 await run('default-thirty-second-victory',async(page,row)=>{await begin(page);const f=await survive(page,row);assert.equal(f.state.elapsed,30);assert.ok(f.state.targetsHit>0);});
 await run('default-unattended-pressure-failure',async(page,row)=>{await begin(page);const f=await result(page);assert.equal(f.result.success,false);assert.equal(f.result.reason,'condition_failed');assert.equal(f.state.pressure,100);assert.equal(f.state.clicks,0);assert.ok(f.state.elapsed<30);row.assertions.push('natural default pressure growth ends the run without input');});
 await run('skill-cooldown-and-click-spam-no-early-win',async(page,row)=>{
  await begin(page);await page.waitForTimeout(4000);let s=(await read(page)).state;await tap(page,s.skill);await tap(page,s.skill);s=(await read(page)).state;assert.equal(s.skillsUsed,1);assert.ok(s.skillCd>0);
  for(let i=0;i<40;i++)await tap(page);s=(await read(page)).state;assert.equal(s.status,'running');assert.ok(s.clicks>=40);assert.ok(s.elapsed<30);row.assertions.push('40 physical clicks cannot satisfy the 30-second goal');await page.locator('#quit').click();const f=await result(page);assert.equal(f.result.reason,'retreated');assert.ok(f.result.telemetry.pressurePeak>f.state.pressure);
 });
 await run('pause-target-resume-three-restarts',async(page,row)=>{
  await page.locator('#knob-durationSec').fill('5');await begin(page);await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state.targets.length>0);await page.locator('#pause').click();const frozen=(await read(page)).state;
  await tap(page,frozen.targets[0]);await tap(page,frozen.skill);await page.waitForTimeout(3000);assert.deepEqual((await read(page)).state,frozen);await page.locator('#pause').click();await survive(page,row);
  for(let i=0;i<3;i++){await begin(page);await page.locator('#quit').click();assert.equal((await result(page)).result.reason,'retreated');}
 });
 await run('mobile-touch-default-victory',async(page,row)=>{await begin(page);await page.screenshot({path:path.resolve('workflow/reports/card-lab/pressure_survival/mobile-active.png'),fullPage:true});await survive(page,row,true);},{mobile:true});
 await run('offline-default-victory',async(page,row)=>{await begin(page);await survive(page,row);},{offline:true});
}finally{await lab.close(6);}
