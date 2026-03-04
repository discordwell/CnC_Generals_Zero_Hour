import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:42173',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  webServer: {
    command: 'npx vite --port 42173 packages/app',
    port: 42173,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
