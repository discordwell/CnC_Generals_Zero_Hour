/**
 * Auto-attack and combat targeting tests.
 *
 * Verifies that:
 *   1. Units with explicit attackEntity command fire when in range
 *   2. Idle armed units auto-acquire nearby enemies (updateIdleAutoTargeting)
 *   3. Units walking toward attack targets fire when entering weapon range
 *
 * Source parity: C++ AIUpdate.cpp idle auto-targeting, Weapon.cpp fire logic.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameLogicSubsystem } from './index.js';
import {
  makeBlock,
  makeObjectDef,
  makeWeaponDef,
  makeArmorDef,
  makeLocomotorDef,
  makeBundle,
  makeRegistry,
  makeHeightmap,
  makeMap,
  makeMapObject,
} from './test-helpers.js';

function makeAutoAttackBundle() {
  return makeBundle({
    objects: [
      // Armed infantry with weapon
      makeObjectDef('Infantry', 'America', ['INFANTRY'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'InfantryGun'] }),
        makeBlock('LocomotorSet', 'SET_NORMAL InfantryLoco', {}),
      ], { VisionRange: 150 }),

      // Enemy structure (stationary target)
      makeObjectDef('EnemyCC', 'China', ['STRUCTURE', 'COMMANDCENTER'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 5000, InitialHealth: 5000 }),
      ]),

      // Enemy infantry (for mutual combat test)
      makeObjectDef('EnemyInfantry', 'China', ['INFANTRY'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'EnemyGun'] }),
        makeBlock('LocomotorSet', 'SET_NORMAL InfantryLoco', {}),
      ], { VisionRange: 150 }),
    ],

    weapons: [
      makeWeaponDef('InfantryGun', {
        AttackRange: 100,
        PrimaryDamage: 25,
        DelayBetweenShots: 500,
        DamageType: 'SMALL_ARMS',
      }),
      makeWeaponDef('EnemyGun', {
        AttackRange: 100,
        PrimaryDamage: 25,
        DelayBetweenShots: 500,
        DamageType: 'SMALL_ARMS',
      }),
    ],

    armors: [
      makeArmorDef('DefaultArmor', { Default: 1 }),
    ],

    locomotors: [
      makeLocomotorDef('InfantryLoco', 30),
    ],
  });
}

function setupGame(objects: ReturnType<typeof makeMapObject>[]) {
  const bundle = makeAutoAttackBundle();
  const logic = new GameLogicSubsystem(new THREE.Scene());
  const mapData = makeMap(objects, 256, 256);
  mapData.waypoints = {
    nodes: [
      { id: 1, name: 'Player_1_Start', position: { x: 50, y: 50, z: 0 } },
      { id: 2, name: 'Player_2_Start', position: { x: 200, y: 50, z: 0 } },
    ],
    links: [],
  };

  logic.loadMapObjects(mapData, makeRegistry(bundle), makeHeightmap(256, 256));
  logic.setPlayerSide(0, 'America');
  logic.setPlayerSide(1, 'China');
  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.update(0);

  return logic;
}

describe('auto-attack and combat targeting', () => {
  it('explicit attackEntity command causes damage when unit is in weapon range', () => {
    // Place infantry within weapon range (100) of enemy CC
    const logic = setupGame([
      makeMapObject('Infantry', 50, 50),       // (50, 50) America side
      makeMapObject('EnemyCC', 100, 50),        // (100, 50) China side, 50 units away
    ]);

    const entities = logic.getRenderableEntityStates();
    const infantryId = entities.find(e => e.templateName === 'Infantry')!.id;
    const ccId = entities.find(e => e.templateName === 'EnemyCC')!.id;

    // Issue explicit attack command
    logic.submitCommand({
      type: 'attackEntity',
      entityId: infantryId,
      targetEntityId: ccId,
    });

    // Step enough frames for at least one shot
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    const ccState = logic.getRenderableEntityStates().find(e => e.id === ccId)!;
    expect(ccState).toBeDefined();
    expect(ccState.health).toBeLessThan(ccState.maxHealth);
  });

  it('idle armed unit auto-acquires nearby enemy without explicit command', () => {
    // Place infantry within weapon range AND vision range of enemy CC
    // Infantry has VisionRange=150, AttackRange=100
    // Place them 80 units apart (within both vision and weapon range)
    const logic = setupGame([
      makeMapObject('Infantry', 50, 50),
      makeMapObject('EnemyCC', 130, 50),   // 80 units away, within range
    ]);

    const entities = logic.getRenderableEntityStates();
    const ccId = entities.find(e => e.templateName === 'EnemyCC')!.id;

    // NO explicit attack command — rely on updateIdleAutoTargeting
    // Step enough frames for auto-targeting scan + at least one shot
    for (let i = 0; i < 120; i++) logic.update(1 / 30);

    const ccState = logic.getRenderableEntityStates().find(e => e.id === ccId)!;
    expect(ccState).toBeDefined();
    expect(ccState.health).toBeLessThan(ccState.maxHealth);
  });

  it('infantry can move via explicit moveTo command', () => {
    const logic = setupGame([
      makeMapObject('Infantry', 20, 50),
      makeMapObject('EnemyCC', 200, 50),
    ]);

    const entities = logic.getRenderableEntityStates();
    const infantryId = entities.find(e => e.templateName === 'Infantry')!.id;

    // Issue simple moveTo command
    logic.submitCommand({
      type: 'moveTo',
      entityId: infantryId,
      targetX: 200,
      targetZ: 50,
    });

    logic.update(1 / 30);

    // Check entity state
    const entity = (logic as any).spawnedEntities?.get?.(infantryId);
    const movePathLen = entity?.movePath?.length ?? 0;
    const isMoving = entity?.moving;
    const speed = entity?.speed;
    const currentSpeed = entity?.currentSpeed;

    expect(isMoving).toBe(true);
    expect(movePathLen).toBeGreaterThan(0);
    expect(speed).toBeGreaterThan(0);

    // Step 100 more frames and check position changed
    const startX = entity?.x;
    for (let i = 0; i < 100; i++) logic.update(1 / 30);
    const endX = entity?.x;
    expect(endX).toBeGreaterThan(startX);
  });

  it('unit walks to target and fires when attackEntity issued from beyond range', () => {
    // Place infantry FAR from enemy CC (beyond weapon range)
    const logic = setupGame([
      makeMapObject('Infantry', 20, 50),
      makeMapObject('EnemyCC', 200, 50),   // 180 units away, beyond 100 range
    ]);

    const entities = logic.getRenderableEntityStates();
    const infantryId = entities.find(e => e.templateName === 'Infantry')!.id;
    const ccId = entities.find(e => e.templateName === 'EnemyCC')!.id;

    // Issue attack from beyond range — unit should walk then fire
    logic.submitCommand({
      type: 'attackEntity',
      entityId: infantryId,
      targetEntityId: ccId,
    });

    // Step one frame to process the command
    logic.update(1 / 30);

    // Verify entity state after command
    const entity = (logic as any).spawnedEntities?.get?.(infantryId);
    expect(entity?.attackTargetEntityId).toBe(ccId);
    expect(entity?.moving).toBe(true);
    expect(entity?.movePath?.length).toBeGreaterThan(0);

    // Step 10 frames and verify entity started moving
    const startX = entity?.x;
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    expect(entity?.x).toBeGreaterThan(startX);

    // Step enough frames to walk into range (180 units at speed 30 = ~6s = 180 frames) + fire
    for (let i = 0; i < 600; i++) logic.update(1 / 30);

    const ccFinal = logic.getRenderableEntityStates().find(e => e.id === ccId)!;
    expect(ccFinal).toBeDefined();
    expect(ccFinal.health).toBeLessThan(ccFinal.maxHealth);
  });

  it('mutual combat: both sides auto-attack each other when in range', () => {
    const logic = setupGame([
      makeMapObject('Infantry', 50, 50),
      makeMapObject('EnemyInfantry', 100, 50),   // 50 units apart, both within range
    ]);

    // NO explicit commands — both should auto-target each other
    for (let i = 0; i < 120; i++) logic.update(1 / 30);

    const entities = logic.getRenderableEntityStates();
    const friendly = entities.find(e => e.templateName === 'Infantry');
    const enemy = entities.find(e => e.templateName === 'EnemyInfantry');

    // At least one should have taken damage (or been killed)
    const friendlyDamaged = !friendly || friendly.health < friendly.maxHealth;
    const enemyDamaged = !enemy || enemy.health < enemy.maxHealth;
    expect(friendlyDamaged || enemyDamaged).toBe(true);
  });
});
