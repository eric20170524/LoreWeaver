#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = path.join(root, "data/workspaces/xuanjie-shimu-local");
const reports = path.join(workspace, "reports");
const browserReport = JSON.parse(fs.readFileSync(path.join(reports, "standalone_browser_report.json"), "utf8"));
if (browserReport.status !== "passed") throw new Error("candidate browser anchor missing");
const artifact = path.join(root, browserReport.artifact);
const sha = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
if (sha !== browserReport.artifactSha256) throw new Error("candidate artifact SHA mismatch");
const stage = artifact.slice(0, -4);

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.resolve(stage, `.${url === "/" ? "/index.html" : url}`);
  if (!file.startsWith(`${stage}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader("content-type", mime[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

const report = { status: "failed", artifact: browserReport.artifact, artifactSha256: sha, assertions: {}, screenshots: {}, errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.("MainScene"), null, { timeout: 20000 });
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 4);
    game.scene.start("LevelActiveScene", { node });
  });
  await page.waitForFunction(() => !document.querySelector("#rotate-prompt")?.hidden
    && window.__LOREWEAVER_GAME__?.scene?.isPaused?.("LevelActiveScene"), null, { timeout: 10000 });
  report.assertions.portraitShowsRotationPromptAndPauses = true;

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector("#rotate-prompt")?.hidden
    && window.__LOREWEAVER_GAME__?.scene?.isActive?.("LevelActiveScene"), null, { timeout: 10000 });
  for (let i = 0; i < 8; i += 1) {
    const running = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === "running");
    if (running) break;
    const canvas = await page.locator("canvas").boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene?.adapter?.status === "running", null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const audio = window.__LOREWEAVER_GAME__?.registry?.get("audioResolver")?.getReport?.();
    return audio?.bgmSource === "asset" && audio?.bgmPlaying === true && audio?.isPaused === false;
  }, null, { timeout: 8000 });
  report.assertions.landscapeBgmPlays = true;
  const landscape = await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const adapter = game.scene.keys.LevelActiveScene.adapter;
    return {
      width: game.scale.width,
      height: game.scale.height,
      touchControls: Boolean(adapter.ui.touchLeft && adapter.ui.touchRight && adapter.ui.touchUp && adapter.ui.touchDown && adapter.ui.touchAttack && adapter.ui.touchHeavy)
    };
  });
  report.assertions.landscapeStageAndTouchControls = landscape.width > landscape.height && landscape.touchControls;
  if (!report.assertions.landscapeStageAndTouchControls) throw new Error(JSON.stringify(landscape));

  const touchProbe = await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const scene = game.scene.keys.LevelActiveScene;
    const rect = game.canvas.getBoundingClientRect();
    const point = control => ({
      x: rect.left + control.x * rect.width / scene.scale.width,
      y: rect.top + control.y * rect.height / scene.scale.height
    });
    return {
      up: point(scene.adapter.ui.touchUp),
      down: point(scene.adapter.ui.touchDown),
      attack: point(scene.adapter.ui.touchAttack),
      heavy: point(scene.adapter.ui.touchHeavy),
      playerY: scene.adapter.player.y,
      cooldownMs: scene.adapter.config.player.attackCooldownMs
    };
  });
  await page.mouse.move(touchProbe.up.x, touchProbe.up.y);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  const afterUp = await page.evaluate(() => window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.player.y);
  report.assertions.touchUpMovesPlayer = afterUp < touchProbe.playerY - 5;
  if (!report.assertions.touchUpMovesPlayer) throw new Error(`touch up did not move: ${touchProbe.playerY} -> ${afterUp}`);
  await page.mouse.move(touchProbe.down.x, touchProbe.down.y);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  const afterDown = await page.evaluate(() => window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.player.y);
  report.assertions.touchDownMovesPlayer = afterDown > afterUp + 5;
  if (!report.assertions.touchDownMovesPlayer) throw new Error(`touch down did not move: ${afterUp} -> ${afterDown}`);
  const blackBladeAudioRequest = page.waitForRequest(request => request.url().endsWith('/assets/audio/procedural/sfx/sfx_black_blade.mp3'), { timeout: 5000 });
  const fireAudioRequest = page.waitForRequest(request => request.url().endsWith('/assets/audio/procedural/sfx/sfx_fire_slash.mp3'), { timeout: 5000 });
  await page.mouse.click(touchProbe.heavy.x, touchProbe.heavy.y);
  await Promise.all([blackBladeAudioRequest, fireAudioRequest]);
  report.assertions.blackBladeBaseLoadsAudioAsset = true;
  report.assertions.fireComboLoadsAudioAsset = true;
  const afterHeavy = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    return {
      remainingCooldownMs: scene.adapter.state.attackReadyAt - scene.time.now,
      atlasEffects: scene.children.list.filter(item => item.active && item.getData?.('artSource') === 'atlas' && String(item.getData?.('artRole') || '').startsWith('vfx_')).map(item => item.getData('artRole'))
    };
  });
  report.assertions.touchHeavyUsesHeavyCooldown = afterHeavy.remainingCooldownMs > touchProbe.cooldownMs * 1.2;
  if (!report.assertions.touchHeavyUsesHeavyCooldown) throw new Error(JSON.stringify(afterHeavy));
  report.assertions.fireComboUsesAtlasVfx = afterHeavy.atlasEffects.includes('vfx_fire_slash');
  if (!report.assertions.fireComboUsesAtlasVfx) throw new Error(JSON.stringify(afterHeavy));
  const fireScreenshot = path.join(reports, 'node4_fire_combo_844x390.png');
  await page.screenshot({ path: fireScreenshot, fullPage: true });
  report.screenshots.fire = { path: path.relative(root, fireScreenshot), sha256: crypto.createHash('sha256').update(fs.readFileSync(fireScreenshot)).digest('hex') };
  await page.waitForTimeout(Math.ceil(touchProbe.cooldownMs * 1.5) + 100);
  const windAudioRequest = page.waitForRequest(request => request.url().endsWith('/assets/audio/procedural/sfx/sfx_wind_slash.mp3'), { timeout: 5000 });
  await page.mouse.click(touchProbe.attack.x, touchProbe.attack.y);
  await windAudioRequest;
  report.assertions.windComboLoadsAudioAsset = true;
  const windEffects = await page.evaluate(() => {
    const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
    return scene.children.list.filter(item => item.active && item.getData?.('artSource') === 'atlas' && String(item.getData?.('artRole') || '').startsWith('vfx_')).map(item => item.getData('artRole'));
  });
  report.assertions.windComboUsesAtlasVfx = windEffects.includes('vfx_wind_slash');
  if (!report.assertions.windComboUsesAtlasVfx) throw new Error(JSON.stringify(windEffects));
  const windScreenshot = path.join(reports, 'node4_wind_combo_844x390.png');
  await page.screenshot({ path: windScreenshot, fullPage: true });
  report.screenshots.wind = { path: path.relative(root, windScreenshot), sha256: crypto.createHash('sha256').update(fs.readFileSync(windScreenshot)).digest('hex') };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector("#rotate-prompt")?.hidden
    && window.__LOREWEAVER_GAME__?.scene?.isPaused?.("LevelActiveScene"), null, { timeout: 10000 });
  const before = await page.evaluate(() => window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.state.elapsedSec);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.state.elapsedSec);
  report.assertions.portraitReturnPausesTimer = before === after;
  if (!report.assertions.portraitReturnPausesTimer) throw new Error(`timer advanced during rotation prompt: ${before} -> ${after}`);
  const portraitAudio = await page.evaluate(() => window.__LOREWEAVER_GAME__?.registry?.get("audioResolver")?.getReport?.());
  report.assertions.portraitPausesBgm = portraitAudio?.isPaused === true && portraitAudio?.bgmPlaying === false;
  if (!report.assertions.portraitPausesBgm) throw new Error(`BGM playing during rotation prompt: ${JSON.stringify(portraitAudio)}`);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector("#rotate-prompt")?.hidden
    && window.__LOREWEAVER_GAME__?.scene?.isActive?.("LevelActiveScene"), null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const audio = window.__LOREWEAVER_GAME__?.registry?.get("audioResolver")?.getReport?.();
    return audio?.isPaused === false && audio?.bgmPlaying === true;
  }, null, { timeout: 8000 });
  report.assertions.landscapeResumesBgm = true;
  await page.evaluate(() => window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter.retreat());
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.("MainScene")
    && document.querySelector("#rotate-prompt")?.hidden, null, { timeout: 10000 });
  report.assertions.retreatReturnsToMain = true;
  report.status = "passed";
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, "standalone_brawler_orientation_latest.json"), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (report.status !== "passed") process.exit(2);
