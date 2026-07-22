import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demoRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(demoRoot, '../../../..');

export default {
    root: demoRoot,
    cacheDir: path.join('/private/tmp', 'lw_survivor_horde_vite_cache'),
    resolve: {
        alias: {
            phaser: path.resolve(repoRoot, 'LoreWeaver/node_modules/phaser/dist/phaser.esm.js')
        }
    },
    server: {
        fs: {
            allow: [repoRoot]
        }
    },
    build: {
        emptyOutDir: true
    }
};
