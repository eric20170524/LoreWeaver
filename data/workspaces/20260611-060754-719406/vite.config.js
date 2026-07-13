import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const possiblePaths = [
  path.resolve(__dirname, '../../../minigame_master/core/lib'),
  path.resolve(__dirname, '../../minigame_master/core/lib'),
  path.resolve(__dirname, '../../../../../minigame_master/core/lib')
];

let coreLibPath = possiblePaths[0];
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    coreLibPath = p;
    break;
  }
}

export default defineConfig({
  build: {
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@core': coreLibPath
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
