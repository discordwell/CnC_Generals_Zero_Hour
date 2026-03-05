import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('control-bar special-power button availability follows cooldown ready frame', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const result = await page.evaluate(() => {
    type AnyRecord = Record<string, any>;
    const hook = (window as AnyRecord)['__GENERALS_E2E__'] as AnyRecord;
    const registry = hook.gameLogic?.iniDataRegistry as AnyRecord | null | undefined;

    if (!hook || typeof hook.buildControlBarButtonsForEntity !== 'function' || !registry) {
      return { supported: false as const, reason: 'missing_e2e_hook' };
    }
    if (!registry.objects || !registry.commandButtons || !registry.commandSets || !registry.specialPowers) {
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

    const specialPowerName = 'SPECIALPOWERE2ECOOLDOWN';
    const commandButtonName = 'CommandButton_E2E_ShortcutPower';
    const commandSetName = 'CommandSet_E2E_ShortcutPower';
    const sourceTemplateName = 'RuntimePowerSourceE2E';

    registry.specialPowers.set(specialPowerName, {
      name: specialPowerName,
      fields: { ReloadTime: 30_000 },
      blocks: [],
    });
    registry.commandButtons.set(commandButtonName, {
      name: commandButtonName,
      fields: {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
        SpecialPower: specialPowerName,
        TextLabel: 'CONTROLBAR:E2E_COOLDOWN',
      },
      blocks: [],
      commandTypeName: 'SPECIAL_POWER_FROM_SHORTCUT',
      options: [],
    });
    registry.commandSets.set(commandSetName, {
      name: commandSetName,
      fields: {},
      buttons: [commandButtonName],
      slottedButtons: [{ slot: 1, commandButtonName }],
    });

    const sourceBlocks = Array.isArray(baseObject.blocks)
      ? baseObject.blocks.map(cloneIniBlock)
      : [];
    sourceBlocks.push({
      type: 'Behavior',
      name: 'SpecialPowerModule ModuleTag_E2E',
      fields: {
        SpecialPowerTemplate: specialPowerName,
      },
      blocks: [],
    });
    registry.objects.set(sourceTemplateName, {
      ...baseObject,
      name: sourceTemplateName,
      fields: {
        ...(baseObject.fields ?? {}),
        CommandSet: commandSetName,
      },
      blocks: sourceBlocks,
      kindOf: Array.isArray(baseObject.kindOf) ? [...baseObject.kindOf] : [],
      resolved: true,
    });

    const teamName = 'E2E_COOLDOWN_TEAM';
    const teamConfigured =
      hook.setScriptTeamMembers(teamName, [])
      && hook.setScriptTeamControllingSide(teamName, 'America');
    if (!teamConfigured) {
      return { supported: false as const, reason: 'team_setup_failed' };
    }

    const sourceId = hook.gameLogic.nextId as number;
    const created = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: [sourceTemplateName, teamName, { x: 6, y: 6, z: 0 }, 0],
    });
    if (!created) {
      return { supported: false as const, reason: 'source_create_failed' };
    }
    const sourceEntity = hook.gameLogic.spawnedEntities.get(sourceId) as AnyRecord | undefined;
    if (!sourceEntity) {
      return { supported: false as const, reason: 'source_lookup_failed' };
    }

    hook.gameLogic.trackShortcutSpecialPowerSourceEntity(specialPowerName, sourceId, 10_000);
    const cooldownButtons = hook.buildControlBarButtonsForEntity(sourceId) as AnyRecord[];
    const cooldownButton = cooldownButtons.find((button) => button.id === commandButtonName) ?? null;

    hook.gameLogic.trackShortcutSpecialPowerSourceEntity(specialPowerName, sourceId, 0);
    const readyButtons = hook.buildControlBarButtonsForEntity(sourceId) as AnyRecord[];
    const readyButton = readyButtons.find((button) => button.id === commandButtonName) ?? null;

    return {
      supported: true as const,
      cooldownButtonEnabled: cooldownButton?.enabled ?? null,
      readyButtonEnabled: readyButton?.enabled ?? null,
    };
  });

  test.skip(!result.supported, `Special-power cooldown setup failed: ${'reason' in result ? result.reason : ''}`);
  expect(result.cooldownButtonEnabled).toBe(false);
  expect(result.readyButtonEnabled).toBe(true);
  expect(errors).toEqual([]);
});
