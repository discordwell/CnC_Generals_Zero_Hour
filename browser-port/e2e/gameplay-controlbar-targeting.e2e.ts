import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('control-bar object target validity rejects enemy target for ally-only command', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const result = await page.evaluate(() => {
    const hook = (window as Record<string, any>)['__GENERALS_E2E__'];

    hook.gameLogic.setPlayerSide(0, 'America');

    const teamAmerica = 'E2E_CONTROLBAR_AMERICA';
    const teamChina = 'E2E_CONTROLBAR_CHINA';
    hook.setScriptTeamMembers(teamAmerica, []);
    hook.setScriptTeamControllingSide(teamAmerica, 'America');
    hook.setScriptTeamMembers(teamChina, []);
    hook.setScriptTeamControllingSide(teamChina, 'China');

    const nextIdBefore = hook.gameLogic.nextId as number;
    const sourceCreated = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeTank', teamAmerica, { x: 10, y: 10, z: 0 }, 0],
    });
    const allyCreated = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeTank', teamAmerica, { x: 14, y: 10, z: 0 }, 0],
    });
    const enemyCreated = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeTank', teamChina, { x: 18, y: 10, z: 0 }, 0],
    });
    if (!sourceCreated || !allyCreated || !enemyCreated) {
      return { supported: false as const };
    }

    const sourceId = nextIdBefore;
    const allyId = nextIdBefore + 1;
    const enemyId = nextIdBefore + 2;

    hook.uiRuntime.setSelectionState({
      selectedObjectIds: [sourceId],
      selectedObjectName: 'RuntimeTank',
    });
    hook.uiRuntime.setControlBarButtons([
      {
        id: 'E2E_GuardAlly',
        slot: 1,
        label: 'Guard Ally',
        commandType: 9, // GUI_COMMAND_GUARD
        commandOption: 0x4, // NEED_TARGET_ALLY_OBJECT
        enabled: true,
      },
    ]);

    const activation = hook.uiRuntime.activateControlBarButton('E2E_GuardAlly');
    const enemyCommit = hook.uiRuntime.commitPendingControlBarTarget({
      kind: 'object',
      objectId: enemyId,
    });
    const pendingAfterEnemy = hook.uiRuntime.getPendingControlBarCommand();
    const allyCommit = hook.uiRuntime.commitPendingControlBarTarget({
      kind: 'object',
      objectId: allyId,
    });

    return {
      supported: true as const,
      activationStatus: activation.status as string,
      enemyCommit,
      pendingAfterEnemy,
      allyCommit,
    };
  });

  test.skip(!result.supported, 'Failed to create control-bar targeting entities in map fixture.');
  expect(result.activationStatus).toBe('needs-target');
  expect(result.enemyCommit).toBeNull();
  expect(result.pendingAfterEnemy?.sourceButtonId).toBe('E2E_GuardAlly');
  expect(result.allyCommit?.targetObjectId).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
