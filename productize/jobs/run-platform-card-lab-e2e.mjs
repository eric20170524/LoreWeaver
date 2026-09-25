#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {createLabSuite} from './card-lab-browser-utils.mjs';
const lab=await createLabSuite('platform_escape');const {read,run}=lab;
// Automatic progress can advance during browser polling and canvas scrolling.
const begin=page=>lab.begin(page,{initialScoreMax:3});
async function result(page){await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result),null,{timeout:40000});return read(page);}
async function win(page,row,mode='pointer'){
 await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();const p={x:b.x+b.width/2,y:b.y+b.height*.6};const until=Date.now()+40000;
 while(Date.now()<until){const s=(await read(page)).state;if(s.status!=='running')break;
  const approaching=s.hazards.some(h=>h.x>=s.player.x-10&&(h.x-s.player.x)/-h.vx<.30);
  if(s.player.onGround&&approaching){if(mode==='keyboard')await page.keyboard.press('Space');else if(mode==='touch')await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);row.actions.push({kind:mode,progress:s.progress,hp:s.hp,hazards:s.hazards,player:s.player});}
  await page.waitForTimeout(35);
 }
 const f=await result(page);assert.equal(f.result.success,true);assert.equal(f.result.reason,'objective_met');assert.equal(f.state.progress,100);assert.ok(f.state.jumps>0);return f;
}
try{
 await run('default-keyboard-escape',async(page,row)=>{await begin(page);await page.keyboard.down('d');await page.waitForTimeout(180);await page.keyboard.up('d');assert.ok((await read(page)).state.player.x>100);await win(page,row,'keyboard');});
 await run('default-unattended-death',async(page,row)=>{await begin(page);const f=await result(page);assert.equal(f.result.success,false);assert.equal(f.result.reason,'hp_zero');assert.equal(f.state.hits,4);row.assertions.push('four real obstacle hits kill the idle player before the default finish');});
 await run('pause-resume-three-restarts',async(page,row)=>{await page.locator('#knob-levelLen').fill('400');await begin(page);await page.locator('#pause').click();const frozen=(await read(page)).state;await page.keyboard.press('Space');await page.keyboard.down('d');await page.waitForTimeout(1200);await page.keyboard.up('d');assert.deepEqual((await read(page)).state,frozen);await page.locator('#pause').click();await win(page,row);for(let i=0;i<3;i++){await begin(page);await page.locator('#quit').click();assert.equal((await result(page)).result.reason,'retreated');}});
 await run('custom-route-and-repeated-short-jumps',async(page,row)=>{await page.locator('#knob-levelLen').fill('400');await begin(page);await page.keyboard.press('Space');await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state.jumps===1&&!window.__CARD_LAB__.snapshot().state.player.onGround);await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state.player.onGround);await page.keyboard.press('Space');await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state.jumps>=2);await win(page,row,'keyboard');});
 await run('mobile-touch-default-escape',async(page,row)=>{await begin(page);await page.screenshot({path:path.resolve('workflow/reports/card-lab/platform_escape/mobile-active.png'),fullPage:true});await win(page,row,'touch');},{mobile:true});
 await run('offline-pointer-default-escape',async(page,row)=>{await begin(page);await win(page,row);},{offline:true});
}finally{await lab.close(6);}
