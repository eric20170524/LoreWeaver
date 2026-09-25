#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reports = path.join(root, 'data/workspaces/xuanjie-shimu-local/reports');
const anchor = JSON.parse(fs.readFileSync(path.join(reports, 'standalone_browser_report.json'), 'utf8'));
const artifact = path.join(root, anchor.artifact);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (anchor.status !== 'passed' || sha256(artifact) !== anchor.artifactSha256) {
  throw new Error('verified candidate identity missing');
}
const stage = artifact.slice(0, -4);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(stage, `.${url === '/' ? '/index.html' : url}`);
  if (!file.startsWith(`${stage}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const ids = [1, 3, 6, 8, 9, 11];
const report = { status: 'failed', artifact: anchor.artifact, artifactSha256: anchor.artifactSha256,
  assertions: {}, observations: [], screenshots: [], errors: [] };
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__LOREWEAVER_GAME__?.scene?.isActive?.('MainScene'), null, { timeout: 20000 });

  for (const nodeId of ids) {
    await page.evaluate(id => {
      const game = window.__LOREWEAVER_GAME__;
      const node = window.__LOREWEAVER_EMBEDDED_SPEC__.nodes.find(item => Number(item.id) === id);
      const level = game.scene.keys.LevelActiveScene;
      const host = level?.scene?.isActive?.() ? level : game.scene.keys.MainScene;
      host.scene.start('LevelActiveScene', { node });
    }, nodeId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ready = await page.evaluate(id => {
        const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
        return scene?.adapter?.status === 'running' && Number(scene.node?.id) === id;
      }, nodeId);
      if (ready) break;
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(id => {
      const scene = window.__LOREWEAVER_GAME__?.scene?.keys?.LevelActiveScene;
      return scene?.adapter?.status === 'running' && Number(scene.node?.id) === id;
    }, nodeId, { timeout: 8000 });
    const observed = await page.evaluate(id => {
      const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
      const adapter = scene.adapter;
      const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
      const before = { artRole: adapter.playerArtRole || 'player', stance: stance.resolveStance(0),
        configuredRole: stance.config.rangedPlayerArtRole, cardId: scene.node.gameplay.cardId,
        meleeDurationSec: stance.config.meleeDurationSec,
        rangedDurationSec: stance.config.rangedDurationSec,
        envKey: scene.node.gameplay.knobs.envKey };
      const toggle = adapter.handleSemanticInput({ action: 'toggle_stance' });
      const held = { artRole: adapter.playerArtRole, artAnim: adapter.player.getData?.('artAnim') };
      stance.performRangedBurst(adapter.createRuntimeContext());
      const release = { artRole: adapter.playerArtRole, artAnim: adapter.player.getData?.('artAnim') };
      const zone = adapter.modifiers.find(item => item.id === 'debuff_zone')?.zone;
      const poison = zone ? { alpha: zone.alpha, depth: zone.depth,
        playerDepth: adapter.player.depth, artSource: zone.getData?.('artSource') } : null;
      return { nodeId: id, before, toggle, held, release, poison };
    }, nodeId);
    if (nodeId === 1 || nodeId === 6) {
      const file = path.join(reports, `candidate_node${nodeId}_ranged_bow_390x844.png`);
      await page.screenshot({ path: file });
      report.screenshots.push({ path: path.relative(root, file), sha256: sha256(file) });
    }
    const back = await page.evaluate(() => {
      const adapter = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene.adapter;
      const result = adapter.handleSemanticInput({ action: 'toggle_stance' });
      return { result, artRole: adapter.playerArtRole, artAnim: adapter.player.getData?.('artAnim') };
    });
    observed.back = back;
    report.observations.push(observed);
    report.assertions[`node${nodeId}BowRole`] = observed.before.cardId === 'survivor_horde'
      && observed.before.configuredRole === 'player_bow'
      && observed.before.artRole === 'player'
      && observed.toggle?.accepted === true && observed.toggle.stance === 'ranged'
      && observed.held.artRole === 'player_bow'
      && String(observed.held.artAnim).startsWith('lw_player_bow_idle')
      && observed.release.artRole === 'player_bow'
      && String(observed.release.artAnim).startsWith('lw_player_bow_')
      && back.result?.accepted === true && back.result.stance === 'melee'
      && back.artRole === 'player' && String(back.artAnim).startsWith('lw_player_idle');
    if (nodeId === 1) {
      report.assertions.node1AuthoredStanceWindows = observed.before.meleeDurationSec === 4
        && observed.before.rangedDurationSec === 5
        && observed.before.envKey === 'env_bg_desert';
    }
    if (nodeId === 6) {
      report.assertions.node6PoisonKeepsBowReadable = observed.poison?.artSource === 'atlas'
        && observed.poison.depth < observed.poison.playerDepth
        && observed.poison.alpha >= 0.3 && observed.poison.alpha <= 0.45;
      const sweep = await page.evaluate(() => {
        const scene = window.__LOREWEAVER_GAME__.scene.keys.LevelActiveScene;
        const adapter = scene.adapter;
        const stance = adapter.modifiers.find(item => item.id === 'weapon_stance_cycle');
        const before = new Set(scene.children.list);
        stance.performMeleeSweep(adapter.createRuntimeContext());
        const slash = scene.children.list.find(item => !before.has(item)
          && item.getData?.('artRole') === 'vfx_black_blade');
        return slash ? { artSource: slash.getData?.('artSource'), tint: slash.tintTopLeft,
          tintMode: slash.tintMode, alpha: slash.alpha, depth: slash.depth } : null;
      });
      const file = path.join(reports, 'candidate_node6_cold_sweep_390x844.png');
      await page.screenshot({ path: file });
      report.screenshots.push({ path: path.relative(root, file), sha256: sha256(file) });
      observed.sweep = sweep;
      report.assertions.node6ColdSweep = sweep?.artSource === 'atlas'
        && sweep.tint === 0x596c7b && sweep.tintMode === 1
        && Math.abs(sweep.alpha - 0.55) < 0.01
        && sweep.depth < observed.poison?.playerDepth;
    }
  }
  if (report.errors.length || Object.values(report.assertions).some(value => value !== true)) {
    throw new Error(JSON.stringify({ assertions: report.assertions, errors: report.errors }));
  }
  report.status = 'passed';
} catch (error) {
  report.errors.push(error?.stack || String(error));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(reports, 'standalone_survivor_bow_roles_latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, artifactSha256: report.artifactSha256,
  assertions: report.assertions, errors: report.errors }));
if (report.status !== 'passed') process.exit(2);
