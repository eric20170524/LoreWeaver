#!/usr/bin/env node
// Read only the same recipe/buttons shown on screen. All progress comes from
// actual pointer/keyboard/touch input; no clocks/state/adapter actions are edited.
import assert from 'node:assert/strict';
import { createLabSuite } from './card-lab-browser-utils.mjs';
const lab = await createLabSuite('sequence_synthesis');
const {read, begin, run} = lab;
async function materialPoint(page,id) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const s=await read(page),b=s.state.buttons.find(b=>b.id===id);
  assert.ok(b,'visible material button exists');
  const box=await page.locator('canvas').boundingBox();assert.ok(box);
  return {x:box.x+b.x/720*box.width,y:box.y+b.y/1280*box.height};
}
async function input(page,id,kind='pointer') {
  if(kind==='keyboard') {
    const s=await read(page),index=s.state.materials.findIndex(m=>m.id===id);
    assert.ok(index>=0);await page.keyboard.press(String(index+1));
  } else {
    const point=await materialPoint(page,id);
    if(kind==='touch')await page.touchscreen.tap(point.x,point.y);
    else await page.mouse.click(point.x,point.y);
  }
}
async function correct(page,row,kind='pointer') {
  const before=await read(page),s=before.state,id=s.recipe[s.stepIndex];
  await input(page,id,kind);
  await page.waitForFunction(step=>window.__CARD_LAB__.snapshot().state?.stepIndex===step,s.stepIndex+1,{timeout:2000});
  row.actions.push({kind,id,stepBefore:s.stepIndex,stepAfter:(await read(page)).state.stepIndex});
}
async function wrong(page,row) {
  const s=(await read(page)).state,id=s.materials.find(m=>m.id!==s.recipe[s.stepIndex]).id;
  await input(page,id);
  await page.waitForFunction(n=>window.__CARD_LAB__.snapshot().state?.mistakes===n,s.mistakes+1,{timeout:2000});
  row.actions.push({kind:'wrong-pointer',id,stepBefore:s.stepIndex});
}
async function complete(page,row,kind='pointer') {
  for(let i=0;i<22;i++){
    const s=await read(page);if(s.state.stepIndex===s.state.recipeLength)break;
    await correct(page,row,kind==='alternating'?(i%2?'keyboard':'pointer'):kind);
  }
  await page.waitForFunction(()=>!!window.__CARD_LAB__.snapshot().result,null,{timeout:5000});
  return read(page);
}
try {
  await run('default-victory',async(page,row)=>{
    const s=await begin(page);assert.equal(s.config.durationSec,45);assert.equal(s.config.recipeLength,4);
    assert.equal(s.config.materialPoolSize,6);assert.equal(s.config.runSeed,0);
    const final=await complete(page,row,'alternating');
    assert.equal(final.result.success,true);assert.equal(final.result.reason,'objective_met');
    assert.equal(final.state.progress,100);assert.equal(final.state.mistakes,0);
    assert.equal(final.state.stepIndex,4);assert.ok(final.saves.some(s=>s.completedNodeIds.includes(1)));
    row.assertions.push('default four visible ingredients complete via real pointer and number keys','full recipe, not host score shortcut; completion recorded by host callback');
  });
  await run('rollback-reset-recovery',async(page,row)=>{
    await begin(page);for(let i=0;i<3;i++)await correct(page,row);
    await wrong(page,row);let s=await read(page);assert.equal(s.state.stepIndex,1);assert.equal(s.state.progress,25);
    assert.equal(s.result,null);await wrong(page,row);s=await read(page);
    assert.equal(s.state.stepIndex,0);assert.equal(s.state.progress,0);assert.equal(s.state.resets,1);
    assert.equal(s.state.mistakes,2);assert.equal(s.state.status,'running');
    const final=await complete(page,row);assert.equal(final.result.success,true);assert.equal(final.result.telemetry.resets,1);
    row.assertions.push('default 30% penalty rewinds two real ingredients','second consecutive mistake resets, replayed prefix can still win');
  });
  await run('overheat-failure',async(page,row)=>{
    await page.locator('#explode').selectOption('true');await begin(page);await wrong(page,row);await wrong(page,row);
    await page.waitForFunction(()=>!!window.__CARD_LAB__.snapshot().result);
    const s=await read(page);assert.equal(s.result.success,false);assert.equal(s.result.reason,'failed');
    assert.equal(s.state.mistakes,2);assert.deepEqual(s.result.rewards,{});
    row.assertions.push('public overheat mode + two real wrong inputs settle one failure, no rewards');
  });
  await run('configured-timeout',async(page,row)=>{
    await page.locator('#duration').fill('5');await begin(page);
    await page.waitForFunction(()=>!!window.__CARD_LAB__.snapshot().result,null,{timeout:10000});
    const s=await read(page);assert.equal(s.result.success,false);assert.equal(s.result.reason,'timer_expired');
    assert.equal(s.state.timer,0);assert.equal(s.state.progress,0);assert.deepEqual(s.result.rewards,{});
    row.assertions.push('idle cannot win; five seconds elapse in real time without accelerated clocks');
  });
  await run('pause-restart-seed-switch',async(page,row)=>{
    const initial=await begin(page);await correct(page,row);
    await page.locator('#pause').click();await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().state?.status==='paused');
    const frozen=(await read(page)).state;await input(page,frozen.recipe[frozen.stepIndex]);
    await page.keyboard.press('1');await page.waitForTimeout(1000);
    assert.deepEqual((await read(page)).state,frozen,'paused pointer/key input and countdown are inert');
    await page.locator('#pause').click();await page.waitForTimeout(200);assert.ok((await read(page)).state.timer<frozen.timer);
    await page.locator('#quit').click();await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().result?.reason==='retreated');
    for(let i=0;i<3;i++) {
      const s=await begin(page);assert.equal(s.state.stepIndex,0);assert.equal(s.state.mistakes,0);
      assert.deepEqual(s.state.recipe,initial.state.recipe);assert.deepEqual(s.state.materials,initial.state.materials);
      assert.equal(await page.locator('canvas').count(),1);
    }
    await page.locator('#card').selectOption('drag_collect_grid');assert.equal((await read(page)).state,null);
    await page.locator('#card').selectOption('sequence_synthesis');await begin(page);
    await correct(page,row);assert.equal((await read(page)).state.stepIndex,1);
    row.assertions.push('pause/resume/retreat, three restarts and card roundtrip','seed zero reproduces visible recipe and pool, single click advances exactly one step after remount');
  });
  await run('maximum-recipe',async(page,row)=>{
    await page.locator('#recipe').fill('20');await page.locator('#pool').fill('8');await page.locator('#seed').fill('123');
    const initial=await begin(page);assert.equal(initial.state.recipeLength,20);assert.equal(initial.state.materials.length,8);
    assert.equal(initial.state.runSeed,123);const final=await complete(page,row,'keyboard');
    assert.equal(final.result.success,true);assert.equal(final.state.stepIndex,20);
    assert.equal(final.state.mistakes,0);row.assertions.push('public maximum recipe/pool settings complete using visible number-key assignments');
  });
  await run('mobile-touch-victory',async(page,row)=>{
    await begin(page);const final=await complete(page,row,'touch');assert.equal(final.result.success,true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    row.assertions.push('390px Chromium touch completes the visible recipe; no horizontal overflow','emulation only, not physical iOS/Android acceptance');
  },{mobile:true});
  await run('offline-file-launch',async(page,row)=>{
    await begin(page);await page.locator('#quit').click();
    await page.waitForFunction(()=>window.__CARD_LAB__.snapshot().result?.reason==='retreated');
    row.assertions.push('identical static runtime bundle starts and retreats from file://');
  },{offline:true});
} finally {await lab.close(8);}
