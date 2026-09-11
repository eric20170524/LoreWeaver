#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'dist/card-lab');
export async function buildCardLab() {
  let revision = process.env.CARD_LAB_REVISION || process.env.GITHUB_SHA;
  if (!revision) {
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
    catch { revision = 'local-unversioned'; }
  }
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    absWorkingDir: ROOT, entryPoints: ['productize/card-lab/app.ts'],
    bundle: true, platform: 'browser', format: 'iife', minify: true,
    outfile: path.join(OUT, 'game.js'), legalComments: 'external',
    define: { LAB_REVISION: JSON.stringify(revision), 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning'
  });
  fs.copyFileSync(path.join(ROOT, 'productize/card-lab/index.html'), path.join(OUT, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(OUT, 'LICENSE'));
  const phaserLicense = fs.readFileSync(path.join(ROOT, 'node_modules/phaser/LICENSE.md'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'THIRD_PARTY_NOTICES.txt'), `Phaser\n${phaserLicense}\nAdditional notices: game.js.LEGAL.txt\n`);
  const files = ['index.html', 'game.js', 'game.js.LEGAL.txt', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'].filter(name => fs.existsSync(path.join(OUT, name)));
  const manifest = { revision, cards: ['dodge_counter_boss'], releaseEligible: false,
    runtime: 'compileRuntimeSpec -> LoreWeaverRuntimeKernel -> core adapter',
    files: files.map(name => ({ name, sha256: createHash('sha256').update(fs.readFileSync(path.join(OUT, name))).digest('hex') })) };
  fs.writeFileSync(path.join(OUT, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildCardLab(), null, 2));
}
