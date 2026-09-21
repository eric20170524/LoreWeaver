#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {createLabSuite} from './card-lab-browser-utils.mjs';
const lab=await createLabSuite('shooter_duel');const {read,begin,run}=lab;
async function result(page){await page.waitForFunction(()=>Boolean(window.__CARD_LAB__.snapshot().result),null,{timeout:70000});return read(page);}
async function win(page,row,mode='pointer'){
 await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();const point=(x,y)=>({x:b.x+x/720*b.width,y:b.y+y/1280*b.height});
 const cdp=mode==='touch'?await page.context().newCDPSession(page):null;let started=false,left=false,right=false;const until=Date.now()+70000;
 if(mode==='keyboard')await page.keyboard.down('j');
 try{while(Date.now()<until){const s=(await read(page)).state;if(s.status!=='running')break;
  const flight=(s.player.y-18-s.boss.y)/s.bulletSpeed;let aim=s.boss.x+s.boss.vx*flight;while(aim<50||aim>670)aim=aim<50?100-aim:1340-aim;
  const p=point(aim,s.player.y);
  if(mode==='keyboard'){const l=aim<s.player.x-8,r=aim>s.player.x+8;if(l!==left){await page.keyboard[l?'down':'up']('a');left=l;}if(r!==right){await page.keyboard[r?'down':'up']('d');right=r;}}
  else if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:started?'touchMove':'touchStart',touchPoints:[p]});started=true;}
  else{await page.mouse.move(p.x,p.y);if(!started){await page.mouse.down();started=true;}}
  if(!row.actions.length||s.bossHp!==row.actions.at(-1).bossHp)row.actions.push({kind:mode,elapsed:s.elapsed,bossHp:s.bossHp,playerHp:s.hp});
  await page.waitForTimeout(80);
 }}finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else if(mode==='keyboard'){await page.keyboard.up('j');await page.keyboard.up('a');await page.keyboard.up('d');}else await page.mouse.up();}
 const f=await result(page);assert.equal(f.result.success,true);assert.equal(f.result.reason,'boss_defeated');assert.equal(f.state.bossHp,0);return f;
}
try{
 await run('default-keyboard-boss-victory',async(page,row)=>{await begin(page);await win(page,row,'keyboard');});
 await run('default-unattended-projectile-death',async(page,row)=>{await begin(page);const f=await result(page);assert.equal(f.result.success,false);assert.equal(f.result.reason,'hp_zero');assert.equal(f.state.hp,0);row.assertions.push('default enemy projectiles kill a stationary player without input');});
 await run('natural-timeout',async(page,row)=>{await page.locator('#knob-timeLimitSec').fill('3');await begin(page);const f=await result(page);assert.equal(f.result.success,false);assert.equal(f.result.reason,'timer_expired');assert.ok(f.state.hp>0);});
 await run('pause-resume-three-restarts',async(page,row)=>{await page.locator('#knob-bossHp').fill('24');await begin(page);await page.locator('#pause').click();const frozen=(await read(page)).state;await page.keyboard.down('j');await page.keyboard.down('d');await page.waitForTimeout(1300);await page.keyboard.up('j');await page.keyboard.up('d');assert.deepEqual((await read(page)).state,frozen);await page.locator('#pause').click();await win(page,row);for(let i=0;i<3;i++){await begin(page);await page.locator('#quit').click();assert.equal((await result(page)).result.reason,'retreated');}});
 await run('mobile-touch-default-victory',async(page,row)=>{await begin(page);await page.screenshot({path:path.resolve('workflow/reports/card-lab/shooter_duel/mobile-active.png'),fullPage:true});await win(page,row,'touch');},{mobile:true});
 await run('offline-pointer-default-victory',async(page,row)=>{await begin(page);await win(page,row);},{offline:true});
}finally{await lab.close(6);}
