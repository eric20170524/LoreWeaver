import path from "node:path";
import { fileURLToPath } from "node:url";

const demoRoot = path.dirname(fileURLToPath(import.meta.url));
// rhythm_timing → demo → core → minigame_master → LoreWeaver root
const loreRoot = path.resolve(demoRoot, "../../../..");
const phaserEsm = path.resolve(loreRoot, "node_modules/phaser/dist/phaser.esm.js");

export default {
  root: demoRoot,
  cacheDir: path.join("/private/tmp", "lw_rhythm_timing_vite_cache"),
  resolve: {
    alias: {
      phaser: phaserEsm
    }
  },
  server: {
    fs: {
      allow: [loreRoot]
    }
  },
  build: {
    emptyOutDir: true
  }
};
