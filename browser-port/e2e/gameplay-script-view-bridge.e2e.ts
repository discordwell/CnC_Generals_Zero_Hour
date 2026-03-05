import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('script guardband + terrain oversize actions propagate through runtime bridge state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const result = await page.evaluate(() => {
    const hook = (window as Record<string, any>)['__GENERALS_E2E__'];
    const initialGuardband = hook.gameLogic.getScriptViewGuardbandBias();
    const initialOversize = hook.gameLogic.getScriptTerrainOversizeAmount();

    const guardbandApplied = hook.executeScriptAction({
      actionType: 'RESIZE_VIEW_GUARDBAND',
      params: [12, 8],
    });
    const oversizeApplied = hook.executeScriptAction({
      actionType: 'OVERSIZE_TERRAIN',
      params: [4],
    });

    return {
      guardbandApplied,
      oversizeApplied,
      initialGuardband,
      initialOversize,
      updatedGuardband: hook.gameLogic.getScriptViewGuardbandBias(),
      updatedOversize: hook.gameLogic.getScriptTerrainOversizeAmount(),
    };
  });

  expect(result.guardbandApplied).toBe(true);
  expect(result.oversizeApplied).toBe(true);
  expect(result.initialGuardband).toBeNull();
  expect(result.initialOversize).toBe(0);
  expect(result.updatedGuardband).toEqual({ x: 12, y: 8 });
  expect(result.updatedOversize).toBe(4);
  expect(errors).toEqual([]);
});
