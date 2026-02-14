import { test, expect } from '@playwright/test';

test('app loads and renders terrain', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Loading screen should appear then fade
  const loadingScreen = page.locator('#loading-screen');
  await expect(loadingScreen).toBeHidden({ timeout: 15_000 });

  // Canvas should exist
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible();

  // Debug info should show FPS after ~1s
  const debugInfo = page.locator('#debug-info');
  await expect(debugInfo).toContainText('FPS', { timeout: 5_000 });

  // No uncaught JS errors
  expect(errors).toEqual([]);
});
