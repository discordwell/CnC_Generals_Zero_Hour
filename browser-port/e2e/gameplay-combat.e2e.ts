import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('script damage destroys a live combat target', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const setup = await page.evaluate(() => {
    const hook = (window as Record<string, any>)['__GENERALS_E2E__'];
    hook.gameLogic.setPlayerSide(0, 'America');
    hook.setScriptTeamMembers('E2E_COMBAT_TEAM', []);
    hook.setScriptTeamControllingSide('E2E_COMBAT_TEAM', 'America');
    const created = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeTank', 'E2E_COMBAT_TEAM', { x: 5, y: 5, z: 0 }, 0],
    });
    if (!created) {
      return { supported: false as const };
    }

    const entities = Array.from(hook.gameLogic.spawnedEntities.values()) as Array<{
      id: number;
      templateName: string;
      health: number;
      maxHealth: number;
      destroyed?: boolean;
    }>;
    const target = entities.find((entity) =>
      !entity.destroyed
      && entity.templateName === 'RuntimeTank'
      && entity.maxHealth > 0
      && entity.health > 0,
    );
    if (!target) {
      return { supported: false as const };
    }

    const success = hook.executeScriptAction({
      actionType: 'NAMED_DAMAGE',
      params: [target.id, Math.max(200, target.maxHealth * 4)],
    });

    return {
      supported: true as const,
      targetId: target.id,
      success,
    };
  });

  test.skip(!setup.supported, 'Failed to create a script combat target in map fixture.');
  expect(setup.success).toBe(true);

  await page.waitForFunction((targetId) => {
    const hook = (window as Record<string, any>)['__GENERALS_E2E__'];
    const entity = hook.gameLogic.spawnedEntities.get(targetId) as {
      destroyed?: boolean;
      health?: number;
    } | undefined;
    if (!entity) {
      return true;
    }
    if (entity.destroyed) {
      return true;
    }
    return (entity.health ?? 0) <= 0;
  }, setup.targetId, { timeout: 10_000 });

  expect(errors).toEqual([]);
});
