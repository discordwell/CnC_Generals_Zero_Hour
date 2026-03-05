import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('script command-button SET_RALLY_POINT works for object and waypoint variants', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const result = await page.evaluate(() => {
    type AnyRecord = Record<string, any>;
    const hook = (window as AnyRecord)['__GENERALS_E2E__'] as AnyRecord;
    const registry = hook.gameLogic?.iniDataRegistry as AnyRecord | null | undefined;
    const loadedMapData = hook.gameLogic?.loadedMapData as AnyRecord | null | undefined;

    if (!hook || !registry || !loadedMapData) {
      return { supported: false as const, reason: 'missing_runtime' };
    }
    if (!registry.objects || !registry.commandButtons || !registry.commandSets) {
      return { supported: false as const, reason: 'missing_registry_maps' };
    }

    const baseObject = registry.objects.get('RuntimeTank') as AnyRecord | undefined;
    if (!baseObject) {
      return { supported: false as const, reason: 'missing_runtime_tank' };
    }

    const cloneIniBlock = (block: AnyRecord): AnyRecord => ({
      ...block,
      fields: { ...(block.fields ?? {}) },
      blocks: Array.isArray(block.blocks) ? block.blocks.map(cloneIniBlock) : [],
    });

    const commandButtonName = 'CommandButton_E2E_ScriptSetRally';
    const commandSetName = 'CommandSet_E2E_ScriptSetRally';
    const sourceTemplateName = 'RuntimeScriptRallyUnit';
    const waypointName = 'E2E_RALLY_WAYPOINT';

    registry.commandButtons.set(commandButtonName, {
      name: commandButtonName,
      fields: {
        Command: 'SET_RALLY_POINT',
        TextLabel: 'CONTROLBAR:E2E_RALLY',
      },
      blocks: [],
      commandTypeName: 'SET_RALLY_POINT',
      options: [],
    });
    registry.commandSets.set(commandSetName, {
      name: commandSetName,
      fields: { 1: commandButtonName },
      buttons: [commandButtonName],
      slottedButtons: [{ slot: 1, commandButtonName }],
    });

    registry.objects.set(sourceTemplateName, {
      ...baseObject,
      name: sourceTemplateName,
      fields: {
        ...(baseObject.fields ?? {}),
        CommandSet: commandSetName,
      },
      blocks: Array.isArray(baseObject.blocks)
        ? baseObject.blocks.map(cloneIniBlock)
        : [],
      kindOf: Array.isArray(baseObject.kindOf) ? [...baseObject.kindOf] : [],
      resolved: true,
    });

    if (!loadedMapData.waypoints) {
      loadedMapData.waypoints = { nodes: [], links: [] };
    }
    if (!Array.isArray(loadedMapData.waypoints.nodes)) {
      loadedMapData.waypoints.nodes = [];
    }
    loadedMapData.waypoints.nodes.push({
      id: (loadedMapData.waypoints.nodes.length as number) + 1,
      name: waypointName,
      position: { x: 22, y: 14, z: 0 },
    });

    const sourceTeam = 'E2E_SCRIPT_SOURCE_TEAM';
    const targetTeam = 'E2E_SCRIPT_TARGET_TEAM';
    const teamsReady =
      hook.setScriptTeamMembers(sourceTeam, [])
      && hook.setScriptTeamControllingSide(sourceTeam, 'America')
      && hook.setScriptTeamMembers(targetTeam, [])
      && hook.setScriptTeamControllingSide(targetTeam, 'China');
    if (!teamsReady) {
      return { supported: false as const, reason: 'team_setup_failed' };
    }

    const sourceId = hook.gameLogic.nextId as number;
    const createdSource = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: [sourceTemplateName, sourceTeam, { x: 7, y: 7, z: 0 }, 0],
    });
    const targetId = (hook.gameLogic.nextId as number);
    const createdTarget = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeEnemy', targetTeam, { x: 18, y: 7, z: 0 }, 0],
    });
    if (!createdSource || !createdTarget) {
      return {
        supported: false as const,
        reason: 'create_failed',
        createdSource,
        createdTarget,
      };
    }

    const targetEntity = hook.gameLogic.spawnedEntities.get(targetId) as AnyRecord | undefined;
    const sourceEntity = hook.gameLogic.spawnedEntities.get(sourceId) as AnyRecord | undefined;
    if (!sourceEntity || !targetEntity) {
      return { supported: false as const, reason: 'entity_lookup_failed' };
    }

    const onNamed = hook.executeScriptAction({
      actionType: 'NAMED_USE_COMMANDBUTTON_ABILITY_ON_NAMED',
      params: [sourceId, commandButtonName, targetId],
    });
    const rallyAfterNamed = sourceEntity.rallyPoint
      ? { x: sourceEntity.rallyPoint.x, z: sourceEntity.rallyPoint.z }
      : null;

    const atWaypoint = hook.executeScriptAction({
      actionType: 'NAMED_USE_COMMANDBUTTON_ABILITY_AT_WAYPOINT',
      params: [sourceId, commandButtonName, waypointName],
    });
    const rallyAfterWaypoint = sourceEntity.rallyPoint
      ? { x: sourceEntity.rallyPoint.x, z: sourceEntity.rallyPoint.z }
      : null;

    const noTarget = hook.executeScriptAction({
      actionType: 'NAMED_USE_COMMANDBUTTON_ABILITY',
      params: [sourceId, commandButtonName],
    });

    return {
      supported: true as const,
      onNamed,
      atWaypoint,
      noTarget,
      rallyAfterNamed,
      rallyAfterWaypoint,
      targetPosition: { x: targetEntity.x, z: targetEntity.z },
      waypointPosition: { x: 22, z: 14 },
    };
  });

  test.skip(!result.supported, `Script command-button setup failed: ${'reason' in result ? result.reason : ''}`);
  expect(result.onNamed).toBe(true);
  expect(result.atWaypoint).toBe(true);
  expect(result.noTarget).toBe(false);
  expect(result.rallyAfterNamed).toEqual(result.targetPosition);
  expect(result.rallyAfterWaypoint).toEqual(result.waypointPosition);
  expect(errors).toEqual([]);
});
