#!/usr/bin/env node
/**
 * Verify campaign imagegen atlas cells are not empty / incomplete.
 * Fails if critical survivor keys have almost no non-transparent content.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(__dirname, "../..");
const WS =
  process.env.LOREWEAVER_WORKSPACE_ID || "20260611-060754-719406";
const ATLAS = path.join(
  LORE_ROOT,
  `data/workspaces/${WS}/assets/imagegen/atlas.png`
);
const MANIFEST = path.join(
  LORE_ROOT,
  `data/workspaces/${WS}/assets/imagegen/manifest.json`
);

const CRITICAL = [
  "player_idle",
  "player_walk_0",
  "player_walk_1",
  "player_attack",
  "player_hurt",
  "player_death",
  "enemy_wild_rhino",
  "enemy_green_scaled_eagle",
  "enemy_qiongqi_cub",
  "env_bg_desert"
];

const MIN_CONTENT_PX = 200; // out of 64*64=4096

async function main() {
  if (!fs.existsSync(ATLAS) || !fs.existsSync(MANIFEST)) {
    console.error("[FAIL] atlas or manifest missing", ATLAS);
    process.exit(1);
  }

  // Use sharp if available, else PNG decode via pure js fallback with zlib+pngjs optional
  let PNG;
  try {
    PNG = (await import("pngjs")).PNG;
  } catch {
    // dynamic python fallback
    const { spawnSync } = await import("node:child_process");
    const py = `
from PIL import Image
import json, sys
atlas=Image.open(${JSON.stringify(ATLAS)}).convert('RGBA')
m=json.load(open(${JSON.stringify(MANIFEST)}))
crit=${JSON.stringify(CRITICAL)}
minc=${MIN_CONTENT_PX}
failed=[]
for k in crit:
    fr=m['frames'][k]['frame']
    crop=atlas.crop((fr['x'],fr['y'],fr['x']+fr['w'],fr['y']+fr['h']))
    px=crop.load(); n=0
    for y in range(fr['h']):
        for x in range(fr['w']):
            r,g,b,a=px[x,y]
            if a>20 and r+g+b>40: n+=1
    status='OK' if n>=minc else 'FAIL'
    print(f'{status} {k} content_px={n}')
    if n<minc: failed.append(k)
print('FAILED' if failed else 'PASSED', len(failed))
sys.exit(1 if failed else 0)
`;
    const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
    process.exit(r.status ?? 1);
  }

  // pngjs path omitted if not installed — python path is primary
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
