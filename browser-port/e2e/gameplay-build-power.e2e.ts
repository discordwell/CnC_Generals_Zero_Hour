import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('script-spawned structure increases side power production', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const setup = await page.evaluate(() => {
    const hook = (window as Record<string, any>)['__GENERALS_E2E__'];
    const side = 'America';
    hook.gameLogic.setPlayerSide(0, side);
    const beforeProduction = hook.getSidePowerState(side).energyProduction as number;
    const teamName = 'E2E_POWER_TEAM';
    const teamSet = hook.setScriptTeamMembers(teamName, []);
    const teamSideSet = hook.setScriptTeamControllingSide(teamName, side);
    const nextIdBefore = hook.gameLogic.nextId as number;
    const created = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: [
        'RuntimeTank',
        'E2E_POWER_TEAM',
        { x: 12, y: 12, z: 0 },
        0,
      ],
    });
    if (!created) {
      return {
        side,
        beforeProduction,
        afterProduction: beforeProduction,
        created,
        teamSet,
        teamSideSet,
        createdEntitySide: null,
      };
    }

    const createPowerPlant = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: [
        'RuntimePowerPlant',
        teamName,
        { x: 18, y: 18, z: 0 },
        0,
      ],
    });
    const createdEntity = hook.gameLogic.spawnedEntities.get(nextIdBefore + 1) as {
      side?: string;
      energyBonus?: number;
    } | undefined;
    const afterProduction = hook.getSidePowerState(side).energyProduction as number;

    return {
      side,
      beforeProduction,
      afterProduction,
      created: created && createPowerPlant,
      teamSet,
      teamSideSet,
      createdEntitySide: createdEntity?.side ?? null,
      createdEntityEnergyBonus: createdEntity?.energyBonus ?? 0,
    };
  });

  expect(setup.created).toBe(true);
  expect(setup.teamSet).toBe(true);
  expect(setup.teamSideSet).toBe(true);
  expect((setup.createdEntitySide ?? '').toLowerCase()).toBe('america');
  expect(setup.afterProduction).toBeGreaterThan(setup.beforeProduction);

  expect(errors).toEqual([]);
});
