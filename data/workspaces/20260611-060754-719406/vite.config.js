import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'esnext'
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../../../minigame_master/core/lib')
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
