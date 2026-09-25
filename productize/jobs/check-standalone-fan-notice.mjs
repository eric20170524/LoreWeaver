#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reports = path.join(root, "data/workspaces/xuanjie-shimu-local/reports");
const anchor = JSON.parse(fs.readFileSync(path.join(reports, "standalone_browser_report.json"), "utf8"));
if (anchor.status !== "passed") throw new Error("verified candidate missing");
const artifact = path.join(root, anchor.artifact);
const artifactSha256 = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
if (artifactSha256 !== anchor.artifactSha256) throw new Error("candidate SHA mismatch");
const stage = artifact.slice(0, -4);
const report = { status: "failed", artifact: anchor.artifact, artifactSha256, assertions: {}, screenshots: {}, errors: [] };
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown", ".png": "image/png", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.resolve(stage, `.${url === "/" ? "/index.html" : url}`);
  if (!file.startsWith(`${stage}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader("content-type", mime[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.("MainScene"), null, { timeout: 20000 });
  const button = page.locator("#notice-button");
  report.assertions.portraitNoticeVisible = await button.isVisible();
  if (!report.assertions.portraitNoticeVisible) throw new Error("fan notice control hidden in portrait");
  await page.screenshot({ path: path.join(reports, "candidate_fan_notice_portrait_390x844.png") });
  await button.click();
  report.assertions.dialogOpened = await page.locator("#notice-dialog").evaluate(node => node.open);
  report.assertions.nonCommercialUnofficialFree = /非商业/.test(await page.locator("#notice-dialog").innerText())
    && /非官方/.test(await page.locator("#notice-dialog").innerText())
    && /免费/.test(await page.locator("#notice-dialog").innerText());
  const href = await page.locator("#notice-dialog a").getAttribute("href");
  const response = await page.request.get(new URL(href, baseUrl).href);
  report.assertions.fullNoticeServed = response.ok() && (await response.text()).includes("《玄界之门》石牧");
  await page.screenshot({ path: path.join(reports, "candidate_fan_notice_dialog_390x844.png") });
  await page.locator("#notice-close-button").click();
  report.assertions.dialogClosed = !(await page.locator("#notice-dialog").evaluate(node => node.open));
  await page.evaluate(() => {
    const game = window.__LOREWEAVER_GAME__;
    const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === 4);
    game.scene.start("LevelActiveScene", { node });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector("#standalone-shell")?.classList.contains("landscape-stage")
    && document.querySelector("#rotate-prompt")?.hidden, null, { timeout: 10000 });
  const layout = await page.evaluate(() => {
    const box = id => document.querySelector(id)?.getBoundingClientRect();
    const controls = [...document.querySelectorAll("#host-controls button:not([hidden])")].map(node => node.getBoundingClientRect());
    const host = box("#host-controls");
    const game = box("#game-container");
    return { host: { left: host.left, right: host.right, top: host.top, bottom: host.bottom }, game: { width: game.width, height: game.height }, controls: controls.map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })) };
  });
  report.assertions.landscapeControlsFit = layout.game.width > 500 && layout.game.height >= 380
    && layout.controls.length === 6 && layout.controls.every(r => r.left >= layout.host.left && r.right <= layout.host.right && r.top >= 0 && r.bottom <= 390);
  if (!report.assertions.landscapeControlsFit) throw new Error(`landscape controls overflow: ${JSON.stringify(layout)}`);
  await page.screenshot({ path: path.join(reports, "candidate_fan_notice_landscape_844x390.png") });
  await page.locator("#notice-button").click();
  report.assertions.landscapeDialogOpened = await page.locator("#notice-dialog").evaluate(node => node.open);
  report.assertions.levelPausedForNotice = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.isPaused?.("LevelActiveScene") === true);
  report.assertions.audioPausedForNotice = await page.evaluate(() => window.__LOREWEAVER_GAME__?.registry?.get("audioResolver")?.getReport?.()?.isPaused === true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector("#rotate-prompt")?.hidden, null, { timeout: 3000 });
  await page.locator("#notice-close-button").click();
  report.assertions.landscapeDialogClosed = !(await page.locator("#notice-dialog").evaluate(node => node.open));
  report.assertions.portraitStillPaused = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.isPaused?.("LevelActiveScene") === true);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.("LevelActiveScene") === true, null, { timeout: 3000 });
  report.assertions.levelResumedAfterNotice = await page.evaluate(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.("LevelActiveScene") === true);
  if (report.errors.length || Object.values(report.assertions).some(value => value !== true)) throw new Error("fan notice assertions failed");
  report.status = "passed";
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, "standalone_fan_notice_latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}
