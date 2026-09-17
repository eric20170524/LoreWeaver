import path from "node:path";
import { fileURLToPath } from "node:url";

const demoRoot = path.dirname(fileURLToPath(import.meta.url));
const loreRoot = path.resolve(demoRoot, "../../../..");
const phaserEsm = path.resolve(loreRoot, "node_modules/phaser/dist/phaser.esm.js");

export default {
  root: demoRoot,
  cacheDir: path.join("/private/tmp", "lw_side_scrolling_brawler_vite_cache"),
  resolve: { alias: { phaser: phaserEsm } },
  server: {
    host: "127.0.0.1",
    port: 4186,
    strictPort: true,
    fs: { allow: [loreRoot] }
  },
  build: { emptyOutDir: true }
};
