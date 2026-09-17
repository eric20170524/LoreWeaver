import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  server: {
    host: '127.0.0.1',
    port: 4186,
    strictPort: true,
    fs: { allow: [path.resolve(here, '../../..')] }
  },
  build: {
    outDir: path.resolve(here, '../../../../dist/demo-side-scrolling-brawler'),
    emptyOutDir: true
  }
});
