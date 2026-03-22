/**
 * Parity tests for guard behavior pursuit distance and entity capture
 * ownership transfer.
 *
 * Source references:
 *   AIGuardMachine (AIGuard.cpp)    — guarding units pursue enemies within
 *     vision range but return to guard position when the enemy moves beyond
 *     the outer guard range or the chase timer expires.
 *   Player.cpp captureObject        — when a building is captured, side/player
 *     ownership changes, energy is re-registered under the new owner, and the
 *     old owner loses the building's power contribution.
 *
 * TS implementation:
 *   update-behaviors.ts  — updateGuardBehavior / updateGuardIdle / updateGuardPursuing
 *   index.ts             — captureEntity, registerEntityEnergy, unregisterEntityEnergy
 */

import { describe, expect, it } from 'vitest';

import {
  createParityAgent,
  makeBlock,
  makeObjectDef,
  makeWeaponDef,
  makeWeaponBlock,
  place,
} from './parity-agent.js';

// ── Test 1: Guard Behavior Pursuit Distance ─────────────────────────────────
//
// C++ AIGuardMachine states (AIGuard.cpp):
//   IDLE     — scan for enemies within inner guard range (visionRange * innerMod)
//   PURSUING — chase the enemy; if it escapes beyond outer range or chase timer
//              expires, transition to RETURNING
//   RETURNING — walk back to guard anchor; periodically re-scan for enemies
//
// Default AI config (DEFAULT_AI_CONFIG in registry.ts):
//   guardInnerModifierHuman: 1.8   → innerRange = VisionRange * 1.8
//   guardOuterModifierHuman: 2.2   → outerRange = VisionRange * 2.2
//   guardChaseUnitFrames: 300      → 10 seconds chase timer
//   guardEnemyScanRateFrames: 15   → 0.5s scan interval
//
// TS update-behaviors.ts:821 — updateGuardPursuing checks:
//   1. Target dead/invalid → RETURNING
//   2. Target beyond outerRange from anchor → RETURNING
//   3. Chase timer expired → RETURNING
//   4. GUARD_WITHOUT_PURSUIT mode → return if target leaves inner range

describe('Parity: guard behavior pursuit distance', () => {
  /**
   * Create a guard test setup with:
   * - A guarding unit (VEHICLE) with a weapon and locomotor at guardPosition
   * - An enemy unit nearby
   *
   * VisionRange=100 → innerRange = 100 * 1.8 = 180, outerRange = 100 * 2.2 = 220
   */
  function makeGuardAgent() {
    return createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Guardian', 'America', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', {
              MaxHealth: 500,
              InitialHealth: 500,
            }),
            makeWeaponBlock('GuardGun'),
            makeBlock('LocomotorSet', 'SET_NORMAL GuardLoco', {}),
          ], { VisionRange: 100, ShroudClearingRange: 100 }),
          makeObjectDef('Enemy', 'China', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', {
              MaxHealth: 5000,
              InitialHealth: 5000,
            }),
          ]),
        ],
        weapons: [
          makeWeaponDef('GuardGun', {
            PrimaryDamage: 10,
            AttackRange: 150,
            DelayBetweenShots: 200,
          }),
        ],
        locomotors: [
          {
            name: 'GuardLoco',
            fields: { Speed: 30 },
            surfaces: ['GROUND'],
            surfaceMask: 1,
            downhillOnly: false,
            speed: 30,
          },
        ],
      },
      // Guardian at (100,100), enemy at (110,100) — within inner range of 180.
      mapObjects: [
        place('Guardian', 100, 100),    // id 1
        place('Enemy', 110, 100),       // id 2
      ],
      mapSize: 512,
      sides: { America: {}, China: {} },
      enemies: [['America', 'China']],
    });
  }

  it('guarding unit attacks enemy within guard range', () => {
    const agent = makeGuardAgent();

    // Issue guard command at the guardian's own position (100, 100).
    agent.guard(1, 100, 100);

    // Step enough frames for the guard scan to detect the enemy (scan rate = 15 frames).
    agent.step(30);

    // Access internal state to verify guard behavior.
    const priv = agent.gameLogic as unknown as {
      spawnedEntities: Map<number, {
        id: number;
        guardState: string;
        attackTargetEntityId: number | null;
        x: number;
        z: number;
      }>;
    };

    const guardian = priv.spawnedEntities.get(1)!;
    expect(guardian).toBeDefined();

    // The guardian should have transitioned to PURSUING and started attacking.
    // The enemy at (110, 100) is only 10 units from the guard point,
    // well within the inner range of 180 (VisionRange 100 * 1.8).
    expect(guardian.guardState).toBe('PURSUING');
    expect(guardian.attackTargetEntityId).toBe(2);

    // Verify the enemy has taken damage (confirming attack happened).
    const enemy = agent.entity(2);
    expect(enemy).not.toBeNull();
    expect(enemy!.health).toBeLessThan(5000);
  });

  it('guarding unit returns to guard position when enemy moves beyond outer range', () => {
    const agent = makeGuardAgent();

    // Issue guard command at (100, 100).
    agent.guard(1, 100, 100);

    // Let the guardian detect and start pursuing the nearby enemy.
    agent.step(30);

    const priv = agent.gameLogic as unknown as {
      spawnedEntities: Map<number, {
        id: number;
        guardState: string;
        guardPositionX: number;
        guardPositionZ: number;
        guardOuterRange: number;
        attackTargetEntityId: number | null;
        x: number;
        z: number;
      }>;
    };

    const guardian = priv.spawnedEntities.get(1)!;
    expect(guardian.guardState).toBe('PURSUING');

    // Now move the enemy far away — beyond the outer guard range.
    // outerRange = VisionRange(100) * guardOuterModifierHuman(2.2) = 220
    // Place the enemy at (400, 100), which is 300 units from guard point (100, 100),
    // well beyond the 220-unit outer range.
    const enemy = priv.spawnedEntities.get(2)!;
    enemy.x = 400;
    enemy.z = 100;

    // Step frames to let the guard state machine detect the enemy is out of range
    // and transition to RETURNING.
    agent.step(30);

    // The guardian should have given up pursuit and be returning to guard position.
    // Source parity: updateGuardPursuing checks targetDistSqr > outerRangeSqr → RETURNING.
    expect(guardian.guardState).not.toBe('PURSUING');

    // The guardian should be either RETURNING or already back at IDLE.
    expect(['RETURNING', 'IDLE']).toContain(guardian.guardState);

    // Step more frames to let the guardian walk back.
    agent.step(120);

    // The guardian should now be close to the original guard position (100, 100).
    const distFromGuard = Math.sqrt(
      (guardian.x - 100) ** 2 + (guardian.z - 100) ** 2,
    );

    // It should be reasonably close to the guard point (within a few cells).
    // The exact arrival threshold in the code is PATHFIND_CELL_SIZE * 2.
    expect(distFromGuard).toBeLessThan(50);

    // The guardian should have transitioned back to IDLE (or still be RETURNING
    // if it hasn't fully arrived yet).
    expect(['RETURNING', 'IDLE']).toContain(guardian.guardState);
  });

  it('guarding unit does not pursue infinitely — chase timer causes return', () => {
    const agent = makeGuardAgent();

    // Guard at (100, 100).
    agent.guard(1, 100, 100);

    // Let the guardian detect the enemy and start pursuing.
    agent.step(30);

    const priv = agent.gameLogic as unknown as {
      spawnedEntities: Map<number, {
        id: number;
        guardState: string;
        guardChaseExpireFrame: number;
        guardOuterRange: number;
        x: number;
        z: number;
      }>;
    };

    const guardian = priv.spawnedEntities.get(1)!;
    expect(guardian.guardState).toBe('PURSUING');

    // Move the enemy to just inside the outer range but outside inner range.
    // innerRange = 180, outerRange = 220
    // Place enemy at (310, 100) — 210 units from guard point (100, 100).
    // This is inside outer range (220) but outside inner range (180).
    const enemy = priv.spawnedEntities.get(2)!;
    enemy.x = 310;
    enemy.z = 100;

    // The chase timer is guardChaseUnitFrames = 300 frames (10 seconds).
    // Step past the chase timer expiration.
    agent.step(350);

    // After the chase timer expires, the guardian should transition to RETURNING.
    // Source parity: updateGuardPursuing line 863 — if chase timer expired → RETURNING.
    expect(guardian.guardState).not.toBe('PURSUING');
    expect(['RETURNING', 'IDLE']).toContain(guardian.guardState);
  });

  it('GUARD_WITHOUT_PURSUIT mode returns immediately when enemy leaves inner range', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Guardian', 'America', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', {
              MaxHealth: 500,
              InitialHealth: 500,
            }),
            makeWeaponBlock('GuardGun'),
            makeBlock('LocomotorSet', 'SET_NORMAL GuardLoco', {}),
          ], { VisionRange: 100, ShroudClearingRange: 100 }),
          makeObjectDef('Enemy', 'China', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', {
              MaxHealth: 5000,
              InitialHealth: 5000,
            }),
          ]),
        ],
        weapons: [
          makeWeaponDef('GuardGun', {
            PrimaryDamage: 10,
            AttackRange: 150,
            DelayBetweenShots: 200,
          }),
        ],
        locomotors: [
          {
            name: 'GuardLoco',
            fields: { Speed: 30 },
            surfaces: ['GROUND'],
            surfaceMask: 1,
            downhillOnly: false,
            speed: 30,
          },
        ],
      },
      mapObjects: [
        place('Guardian', 100, 100),
        place('Enemy', 110, 100),
      ],
      mapSize: 512,
      sides: { America: {}, China: {} },
      enemies: [['America', 'China']],
    });

    // Issue guard with GUARD_WITHOUT_PURSUIT mode (guardMode = 1).
    // The parity agent's guard() uses guardMode 0 by default,
    // so we submit the command directly.
    agent.gameLogic.submitCommand({
      type: 'guardPosition',
      entityId: 1,
      targetX: 100,
      targetZ: 100,
      guardMode: 1,
      commandSource: 'PLAYER',
    } as any);

    // Let the guardian detect and start pursuing the nearby enemy.
    agent.step(30);

    const priv = agent.gameLogic as unknown as {
      spawnedEntities: Map<number, {
        id: number;
        guardState: string;
        guardMode: number;
        x: number;
        z: number;
      }>;
    };

    const guardian = priv.spawnedEntities.get(1)!;
    // Verify guardMode was set to 1 (GUARD_WITHOUT_PURSUIT).
    expect(guardian.guardMode).toBe(1);

    // Move enemy outside inner range but still inside outer range.
    // innerRange = 180, outerRange = 220.
    const enemy = priv.spawnedEntities.get(2)!;
    enemy.x = 290;
    enemy.z = 100;

    // In GUARD_WITHOUT_PURSUIT mode, the guardian should return immediately
    // when the target leaves inner range — no chase timer, no outer range extension.
    // Source parity: updateGuardPursuing line 832-841 — guardMode === 1 path.
    agent.step(15);

    // The guardian should have stopped pursuing.
    expect(guardian.guardState).not.toBe('PURSUING');
    expect(['RETURNING', 'IDLE']).toContain(guardian.guardState);
  });
});

// ── Test 2: Entity Capture Ownership Transfer ───────────────────────────────
//
// C++ Player.cpp captureObject (line ~1020-1060):
//   - Old owner loses the building's energy contribution
//   - Building side changes to the new owner
//   - New owner gains the building's energy contribution
//   - OverchargeBehavior transfers between sides
//   - PowerPlantUpgrade transfers between sides
//
// TS captureEntity (index.ts:15759-15789):
//   - unregisterEntityEnergy(entity) — removes from old side's power tracking
//   - entity.side = normalizedNewSide
//   - registerEntityEnergy(entity) — adds to new side's power tracking
//   - Transfers cost modifiers, power plant upgrades, overcharge, radar upgrades

describe('Parity: entity capture ownership transfer', () => {
  function makeCaptureAgent() {
    return createParityAgent({
      bundles: {
        objects: [
          // A power-producing building owned by China.
          makeObjectDef('PowerPlant', 'China', ['STRUCTURE'], [
            makeBlock('Body', 'StructureBody ModuleTag_Body', {
              MaxHealth: 500,
              InitialHealth: 500,
            }),
          ], { EnergyProduction: 10 }),
          // A non-power building owned by China (to verify count tracking).
          makeObjectDef('Barracks', 'China', ['STRUCTURE'], [
            makeBlock('Body', 'StructureBody ModuleTag_Body', {
              MaxHealth: 400,
              InitialHealth: 400,
            }),
          ]),
        ],
      },
      mapObjects: [
        place('PowerPlant', 50, 50),   // id 1 — China's power plant (EnergyProduction: 10)
        place('Barracks', 70, 50),     // id 2 — China's barracks
      ],
      mapSize: 128,
      sides: { America: {}, China: {} },
      enemies: [['America', 'China']],
    });
  }

  it('captured building changes side from original owner to capturing player', () => {
    const agent = makeCaptureAgent();

    // Verify initial ownership.
    agent.step(1);
    const beforeCapture = agent.entity(1);
    expect(beforeCapture).not.toBeNull();
    expect(beforeCapture!.side.toLowerCase()).toBe('china');

    // Issue capture command — switch the power plant to America.
    agent.gameLogic.submitCommand({
      type: 'captureEntity',
      entityId: 1,
      newSide: 'America',
    });
    agent.step(1);

    // Verify the building now belongs to America.
    const afterCapture = agent.entity(1);
    expect(afterCapture).not.toBeNull();
    expect(afterCapture!.side.toLowerCase()).toBe('america');
  });

  it('capturing player gains the building power contribution', () => {
    const agent = makeCaptureAgent();
    agent.step(1);

    // Check power states before capture.
    const chinaPowerBefore = agent.gameLogic.getSidePowerState('China');
    const americaPowerBefore = agent.gameLogic.getSidePowerState('America');

    // China should have energy production from the power plant.
    expect(chinaPowerBefore.energyProduction).toBeGreaterThan(0);
    const chinaProductionBefore = chinaPowerBefore.energyProduction;

    // America should have 0 energy production (no buildings).
    expect(americaPowerBefore.energyProduction).toBe(0);

    // Capture the power plant for America.
    agent.gameLogic.submitCommand({
      type: 'captureEntity',
      entityId: 1,
      newSide: 'America',
    });
    agent.step(1);

    // Source parity: captureEntity calls unregisterEntityEnergy (old side)
    // then registerEntityEnergy (new side).
    const chinaPowerAfter = agent.gameLogic.getSidePowerState('China');
    const americaPowerAfter = agent.gameLogic.getSidePowerState('America');

    // China should have lost the power plant's energy production.
    expect(chinaPowerAfter.energyProduction).toBe(
      chinaProductionBefore - 10,
    );

    // America should have gained the power plant's energy production.
    expect(americaPowerAfter.energyProduction).toBe(10);
  });

  it('original owner loses the building from entity ownership', () => {
    const agent = makeCaptureAgent();
    agent.step(1);

    // Count China's entities before capture.
    const chinaEntitiesBefore = agent.entities('China');
    const americaEntitiesBefore = agent.entities('America');

    expect(chinaEntitiesBefore.length).toBe(2); // PowerPlant + Barracks
    expect(americaEntitiesBefore.length).toBe(0);

    // Capture the power plant for America.
    agent.gameLogic.submitCommand({
      type: 'captureEntity',
      entityId: 1,
      newSide: 'America',
    });
    agent.step(1);

    // Count entities after capture.
    const chinaEntitiesAfter = agent.entities('China');
    const americaEntitiesAfter = agent.entities('America');

    // China should have lost one building.
    expect(chinaEntitiesAfter.length).toBe(1);
    expect(chinaEntitiesAfter[0]!.template).toBe('Barracks');

    // America should have gained one building.
    expect(americaEntitiesAfter.length).toBe(1);
    expect(americaEntitiesAfter[0]!.template).toBe('PowerPlant');
  });

  it('capturing a power-consuming building transfers consumption to new owner', () => {
    // Test with a building that has negative EnergyProduction (power consumer).
    const agent = createParityAgent({
      bundles: {
        objects: [
          // A power plant for China so they have production.
          makeObjectDef('ChinaPowerPlant', 'China', ['STRUCTURE'], [
            makeBlock('Body', 'StructureBody ModuleTag_Body', {
              MaxHealth: 500,
              InitialHealth: 500,
            }),
          ], { EnergyProduction: 20 }),
          // A power-consuming building owned by China.
          makeObjectDef('Radar', 'China', ['STRUCTURE'], [
            makeBlock('Body', 'StructureBody ModuleTag_Body', {
              MaxHealth: 300,
              InitialHealth: 300,
            }),
          ], { EnergyProduction: -5 }),
        ],
      },
      mapObjects: [
        place('ChinaPowerPlant', 50, 50),  // id 1
        place('Radar', 70, 50),            // id 2 — consumes 5 energy
      ],
      mapSize: 128,
      sides: { America: {}, China: {} },
      enemies: [['America', 'China']],
    });

    agent.step(1);

    // Before capture: China should have consumption from the radar.
    const chinaBefore = agent.gameLogic.getSidePowerState('China');
    expect(chinaBefore.energyConsumption).toBe(5);
    expect(chinaBefore.energyProduction).toBe(20);

    const americaBefore = agent.gameLogic.getSidePowerState('America');
    expect(americaBefore.energyConsumption).toBe(0);

    // Capture the radar for America.
    agent.gameLogic.submitCommand({
      type: 'captureEntity',
      entityId: 2,
      newSide: 'America',
    });
    agent.step(1);

    // After capture: China loses the consumption, America gains it.
    const chinaAfter = agent.gameLogic.getSidePowerState('China');
    const americaAfter = agent.gameLogic.getSidePowerState('America');

    // China's consumption should be reduced by 5.
    expect(chinaAfter.energyConsumption).toBe(0);
    // China's production should remain unchanged (power plant still theirs).
    expect(chinaAfter.energyProduction).toBe(20);

    // America now has the radar's consumption.
    expect(americaAfter.energyConsumption).toBe(5);
  });

  it('double capture transfers ownership correctly through multiple sides', () => {
    const agent = makeCaptureAgent();
    agent.step(1);

    // First capture: China → America.
    agent.gameLogic.submitCommand({
      type: 'captureEntity',
      entityId: 1,
      newSide: 'America',
    });
    agent.step(1);

    expect(agent.entity(1)!.side.toLowerCase()).toBe('america');
    expect(agent.gameLogic.getSidePowerState('America').energyProduction).toBe(10);
    expect(agent.gameLogic.getSidePowerState('China').energyProduction).toBe(0);

    // Second capture: America → China (recapture).
    agent.gameLogic.submitCommand({
      type: 'captureEntity',
      entityId: 1,
      newSide: 'China',
    });
    agent.step(1);

    // Power plant should be back with China.
    expect(agent.entity(1)!.side.toLowerCase()).toBe('china');
    expect(agent.gameLogic.getSidePowerState('China').energyProduction).toBe(10);
    expect(agent.gameLogic.getSidePowerState('America').energyProduction).toBe(0);
  });
});
