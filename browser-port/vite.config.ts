import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'packages/app'),
  resolve: {
    alias: {
      '@generals/core': resolve(__dirname, 'packages/core/src'),
      '@generals/engine': resolve(__dirname, 'packages/engine/src'),
      '@generals/assets': resolve(__dirname, 'packages/assets/src'),
      '@generals/renderer': resolve(__dirname, 'packages/renderer/src'),
      '@generals/audio': resolve(__dirname, 'packages/audio/src'),
      '@generals/ui': resolve(__dirname, 'packages/ui/src'),
      '@generals/input': resolve(__dirname, 'packages/input/src'),
      '@generals/game-logic': resolve(__dirname, 'packages/game-logic/src'),
      '@generals/terrain': resolve(__dirname, 'packages/terrain/src'),
      '@generals/network': resolve(__dirname, 'packages/network/src'),
      '@generals/ini-data': resolve(__dirname, 'packages/ini-data/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
