import { test, expect } from '@playwright/test';

const TEST_MAP_URL = '/?map=assets/maps/ScenarioSkirmish.json';

test('skirmish AI interaction causes cross-side combat damage over time', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(TEST_MAP_URL);
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>)['__GENERALS_E2E__']));

  const setup = await page.evaluate(() => {
    const hook = (window as Record<string, any>)['__GENERALS_E2E__'];
    hook.gameLogic.setPlayerSide(0, 'America');
    hook.gameLogic.setPlayerSide(1, 'China');
    hook.gameLogic.setTeamRelationship('America', 'China', 0);
    hook.gameLogic.setTeamRelationship('China', 'America', 0);

    const friendlyTeam = 'E2E_AI_FRIENDLY_TEAM';
    const enemyTeam = 'E2E_AI_ENEMY_TEAM';
    const teamsReady =
      hook.setScriptTeamMembers(friendlyTeam, [])
      && hook.setScriptTeamControllingSide(friendlyTeam, 'America')
      && hook.setScriptTeamMembers(enemyTeam, [])
      && hook.setScriptTeamControllingSide(enemyTeam, 'China');

    const idsBefore = new Set(
      Array.from((hook.gameLogic.spawnedEntities as Map<number, unknown>).keys()),
    );
    const createdFriendly = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeTank', friendlyTeam, { x: 1.1, y: 1.1, z: 0 }, 0],
    });
    const createdEnemy = hook.executeScriptAction({
      actionType: 'CREATE_OBJECT',
      params: ['RuntimeEnemy', enemyTeam, { x: 1.6, y: 1.1, z: 0 }, 0],
    });
    if (!teamsReady || !createdFriendly || !createdEnemy) {
      return {
        supported: false as const,
        reason: 'create_failed',
        teamsReady,
        createdFriendly,
        createdEnemy,
      };
    }

    const entitiesById = hook.gameLogic.spawnedEntities as Map<number, {
      id: number;
      templateName: string;
      health: number;
      maxHealth: number;
      side?: string;
      destroyed?: boolean;
      attackWeapon?: { primaryDamage?: number };
      x: number;
      z: number;
    }>;
    const createdEntities = Array.from(entitiesById.values()).filter((entity) => !idsBefore.has(entity.id));
    const friendly = createdEntities.find((entity) =>
      entity.templateName === 'RuntimeTank' && (entity.side ?? '').toUpperCase() === 'AMERICA',
    ) ?? null;
    const enemy = createdEntities.find((entity) =>
      entity.templateName === 'RuntimeEnemy' && (entity.side ?? '').toUpperCase() === 'CHINA',
    ) ?? null;

    if (!friendly || !enemy) {
      return {
        supported: false as const,
        reason: 'entity_lookup_failed',
        createdEntityCount: createdEntities.length,
      };
    }
    if ((enemy.attackWeapon?.primaryDamage ?? 0) <= 0) {
      return {
        supported: false as const,
        reason: 'enemy_no_weapon',
        enemyWeaponDamage: enemy.attackWeapon?.primaryDamage ?? 0,
      };
    }

    const issuedAttack = hook.executeScriptAction({
      actionType: 'TEAM_ATTACK_TEAM',
      params: [enemyTeam, friendlyTeam],
    });
    if (!issuedAttack) {
      return {
        supported: false as const,
        reason: 'team_attack_failed',
      };
    }

    return {
      supported: true as const,
      friendlyId: friendly.id,
      friendlyHealth: friendly.health,
      enemyId: enemy.id,
      enemyHealth: enemy.health,
    };
  });
  expect(setup.supported, JSON.stringify(setup)).toBe(true);

  await page.waitForFunction(
    ({ friendlyId, friendlyHealth, enemyId, enemyHealth }) => {
      const hook = (window as Record<string, any>)['__GENERALS_E2E__'];
      const f = hook.gameLogic.spawnedEntities.get(friendlyId) as { health?: number; destroyed?: boolean } | undefined;
      const e = hook.gameLogic.spawnedEntities.get(enemyId) as { health?: number; destroyed?: boolean } | undefined;
      const friendlyTookDamage = !f || !!f.destroyed || (f.health ?? friendlyHealth) < friendlyHealth;
      const enemyTookDamage = !e || !!e.destroyed || (e.health ?? enemyHealth) < enemyHealth;
      return friendlyTookDamage || enemyTookDamage;
    },
    setup,
    { timeout: 15_000 },
  );

  expect(errors).toEqual([]);
});
