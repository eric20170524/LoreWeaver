// Shared browser-test plumbing only. Gameplay remains in RuntimeKernel/core.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildCardLab, ROOT, OUT } from './build-card-lab.mjs';

export async function createLabSuite(cardId) {
  const directory = path.join(ROOT, 'workflow/reports/card-lab', cardId);
  fs.mkdirSync(directory, {recursive:true});
  const report = {schemaVersion:'loreweaver.card-lab-browser.v1', cardId,
    status:'failed', synthetic:true, releaseEligible:false,
    scope:'real input, shared RuntimeKernel, no state edits or accelerated time', cases:[]};
  let server, browser;
  const read = page => page.evaluate(() => window.__CARD_LAB__.snapshot());
  try {
    report.build = await buildCardLab();
    server = http.createServer((req,res)=>{
      const pathname = new URL(req.url,'http://localhost').pathname;
      const name = pathname.startsWith('/preview/') ? pathname.slice(9) || 'index.html' : '';
      const file = path.resolve(OUT,name);
      if(!name || !file.startsWith(OUT+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);res.end();return;
      }
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'text/html; charset=utf-8');
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    report.browser = browser.version();
  } catch(error) { if(server) server.close(); throw error; }
  const url = `http://127.0.0.1:${server.address().port}/preview/?card=${cardId}`;
  const boxes = new WeakMap();
  const point = (page,x,y)=>{const box=boxes.get(page);assert.ok(box);return {x:box.x+x/720*box.width,y:box.y+y/1280*box.height};};
  async function begin(page) {
    const before=await read(page);
    await page.locator('#start').click();
    await page.waitForFunction(g=>{const s=window.__CARD_LAB__.snapshot();return s.generation===g+1&&!s.starting&&s.state?.status==='running';},before.generation,{timeout:20000});
    await page.locator('canvas').scrollIntoViewIfNeeded();boxes.set(page,await page.locator('canvas').boundingBox());
    const s=await read(page);assert.equal(s.cardId,cardId);assert.equal(s.state.score,0);
    assert.deepEqual(s.sceneKeys,['LevelActiveScene']); return s;
  }
  async function run(id,action,{mobile=false,offline=false}={}) {
    const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1050}});
    const page=await context.newPage(); const row={id,passed:false,errors:[],assertions:[],actions:[]};report.cases.push(row);
    page.on('pageerror',e=>row.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')row.errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)row.errors.push(`HTTP ${r.status()}: ${r.url()}`);});
    page.on('requestfailed',r=>row.errors.push(`request: ${r.url()} ${r.failure()?.errorText}`));
    // Avoid continuous screenshot encoding in a timing-sensitive input loop.
    // Explicit final/failure PNGs and trace action/DOM snapshots are retained.
    await context.tracing.start({screenshots:false,snapshots:true,sources:false});
    try {
      await page.goto(offline?pathToFileURL(path.join(OUT,'index.html')).href+`?card=${cardId}`:url);
      await page.waitForFunction(()=>!!window.__CARD_LAB__);
      await action(page,row);
      await page.waitForTimeout(200); row.final=await read(page);
      assert.deepEqual(row.errors,[],'no console, request or runtime errors');
      await page.screenshot({path:path.join(directory,`${id}.png`),fullPage:true}); row.passed=true;
    } catch(error) {
      row.errors.push(error.stack||String(error));row.final=await read(page).catch(()=>null);
      await page.screenshot({path:path.join(directory,`${id}-failed.png`),fullPage:true}).catch(()=>{});
    } finally {
      await context.tracing.stop(row.passed?{}:{path:path.join(directory,`${id}-trace.zip`)});
      await context.close();console.log(`${row.passed?'PASS':'FAIL'} ${cardId}/${id}`);
    }
  }
  async function close(expectedCases) {
    await browser.close();await new Promise(resolve=>server.close(resolve));
    report.status=report.cases.length===expectedCases&&report.cases.every(c=>c.passed)?'passed':'failed';
    report.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(directory,'browser-latest.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,cases:report.cases.map(({id,passed,errors})=>({id,passed,errors}))},null,2));
    process.exitCode=report.status==='passed'?0:1;
  }
  return {read,point,begin,run,close,report};
}
