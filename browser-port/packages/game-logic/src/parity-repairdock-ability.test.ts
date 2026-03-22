/**
 * RepairDock & SpecialAbilityUpdate Parity Tests
 *
 * Source parity references:
 *   - RepairDockUpdate.h — heals docked vehicles at per-frame rate derived from TimeForFullHeal
 *   - SpecialAbilityUpdate.h — manages special ability execution with approach, pack/unpack,
 *     preparation countdown, effect trigger, and cooldown state machine
 */

import { describe, expect, it } from 'vitest';

import {
  createParityAgent,
  makeBlock,
  makeObjectDef,
  makeWeaponDef,
  makeWeaponBlock,
  makeSpecialPowerDef,
  place,
} from './parity-agent.js';

// ── Test 1: RepairDock Vehicle Healing ───────────────────────────────────────

describe('parity RepairDock: vehicle healing on dock', () => {
  /**
   * C++ source: RepairDockUpdate.h
   *
   * RepairDockUpdateModuleData has:
   *   Real m_framesForFullHeal — time (in frames) for full repair
   *
   * RepairDockUpdate::action() computes:
   *   m_healthToAddPerFrame = (maxHealth - currentHealth) / m_framesForFullHeal
   * and adds that each frame until full.
   *
   * The TS implementation lives in index.ts:updatePendingRepairDockActions().
   * The vehicle must be moved within interaction distance of a REPAIR_PAD structure
   * that has a RepairDockUpdate behavior module.
   *
   * The dock action is triggered via an 'enterObject' command with action='repairVehicle'.
   */

  it('RepairDock profile is extracted from RepairDockUpdate behavior', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('RepairPad', 'America', ['STRUCTURE', 'REPAIR_PAD'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
            makeBlock('Behavior', 'RepairDockUpdate ModuleTag_RepairDock', {
              TimeForFullHeal: 5000, // 5 seconds = ~150 frames at 30fps
            }),
          ]),
          makeObjectDef('Tank', 'America', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          ]),
        ],
      },
      mapObjects: [
        place('RepairPad', 20, 20),
        place('Tank', 20, 21), // Adjacent to dock (within interaction distance)
      ],
      mapSize: 64,
      sides: { America: {} },
    });

    // Verify RepairDock profile was extracted on the dock structure (entity 1).
    const dockInternal = (agent.gameLogic as any).spawnedEntities.get(1);
    expect(dockInternal).toBeDefined();
    expect(dockInternal.repairDockProfile).not.toBeNull();
    expect(dockInternal.repairDockProfile.timeForFullHealFrames).toBeGreaterThan(0);
  });

  it('damaged vehicle is healed while docked at a RepairDock', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('RepairPad', 'America', ['STRUCTURE', 'REPAIR_PAD'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
            makeBlock('Behavior', 'RepairDockUpdate ModuleTag_RepairDock', {
              TimeForFullHeal: 3000, // 3 seconds = ~90 frames
            }),
          ]),
          makeObjectDef('Tank', 'America', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          ]),
        ],
      },
      mapObjects: [
        place('RepairPad', 20, 20),
        place('Tank', 20, 21), // Adjacent to dock
      ],
      mapSize: 64,
      sides: { America: {} },
    });

    // Damage the tank to 50% HP.
    const tankInternal = (agent.gameLogic as any).spawnedEntities.get(2);
    expect(tankInternal).toBeDefined();
    tankInternal.health = 100; // 50% of 200 maxHealth

    const healthBefore = agent.entity(2)!.health;
    expect(healthBefore).toBe(100);

    // Issue repairVehicle enterObject command to send tank to dock.
    agent.gameLogic.submitCommand({
      type: 'enterObject',
      entityId: 2,         // Tank
      targetObjectId: 1,   // RepairPad
      action: 'repairVehicle',
      commandSource: 'PLAYER',
    });

    // Step enough frames for healing to occur.
    agent.step(120);

    // Source parity: RepairDockUpdate::action heals per-frame.
    // After 120 frames, the tank should have gained significant health.
    const tankAfter = agent.entity(2)!;
    expect(tankAfter.health).toBeGreaterThan(healthBefore);
  });

  it('vehicle reaches full health after sufficient frames on dock', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('RepairPad', 'America', ['STRUCTURE', 'REPAIR_PAD'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
            makeBlock('Behavior', 'RepairDockUpdate ModuleTag_RepairDock', {
              TimeForFullHeal: 1000, // 1 second = ~30 frames
            }),
          ]),
          makeObjectDef('Tank', 'America', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          ]),
        ],
      },
      mapObjects: [
        place('RepairPad', 20, 20),
        place('Tank', 20, 21),
      ],
      mapSize: 64,
      sides: { America: {} },
    });

    // Damage the tank to 1 HP.
    const tankInternal = (agent.gameLogic as any).spawnedEntities.get(2);
    tankInternal.health = 1;

    // Issue repair command.
    agent.gameLogic.submitCommand({
      type: 'enterObject',
      entityId: 2,
      targetObjectId: 1,
      action: 'repairVehicle',
      commandSource: 'PLAYER',
    });

    // Step enough frames for a full heal plus margin. TimeForFullHeal=1000ms ≈ 30 frames.
    // Give extra frames for movement approach.
    agent.step(120);

    // Source parity: once healed to full, the pending repair action is removed.
    const tankAfter = agent.entity(2)!;
    expect(tankAfter.health).toBe(100);
  });

  it('fully healthy vehicle is not accepted by dock (already at full HP)', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('RepairPad', 'America', ['STRUCTURE', 'REPAIR_PAD'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
            makeBlock('Behavior', 'RepairDockUpdate ModuleTag_RepairDock', {
              TimeForFullHeal: 3000,
            }),
          ]),
          makeObjectDef('Tank', 'America', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          ]),
        ],
      },
      mapObjects: [
        place('RepairPad', 20, 20),
        place('Tank', 20, 21),
      ],
      mapSize: 64,
      sides: { America: {} },
    });

    // Tank is at full HP — dock action should be rejected or immediately completed.
    agent.gameLogic.submitCommand({
      type: 'enterObject',
      entityId: 2,
      targetObjectId: 1,
      action: 'repairVehicle',
      commandSource: 'PLAYER',
    });

    agent.step(10);

    // Source parity: updatePendingRepairDockActions removes entry when
    // docker.health >= docker.maxHealth. No pending action should remain.
    const pendingActions = (agent.gameLogic as any).pendingRepairDockActions;
    const hasPending = pendingActions.has(2);
    expect(hasPending).toBe(false);
  });
});

// ── Test 2: SpecialAbilityUpdate Execution ──────────────────────────────────

describe('parity SpecialAbilityUpdate: ability execution state machine', () => {
  /**
   * C++ source: SpecialAbilityUpdate.h
   *
   * SpecialAbilityUpdate manages a state machine for unit special abilities:
   *   1. Approach target (move within StartAbilityRange)
   *   2. Unpack animation (UnpackTime)
   *   3. Preparation countdown (PreparationTime)
   *   4. Trigger effect (triggerAbilityEffect)
   *   5. Pack animation (PackTime)
   *   6. Finish and enter cooldown
   *
   * The TS implementation lives in update-behaviors.ts:
   *   - extractSpecialAbilityProfile() extracts INI data
   *   - initiateSpecialAbility() starts the state machine
   *   - updateSpecialAbility() runs per-frame logic
   *   - triggerSpecialAbilityEffect() executes the effect
   *   - finishSpecialAbility() cleans up
   */

  it('SpecialAbilityProfile is extracted from SpecialAbilityUpdate behavior', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Hacker', 'China', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityCashHack',
              StartAbilityRange: 50,
              PreparationTime: 1000, // 1 second
              PackTime: 500,
              UnpackTime: 500,
            }),
          ]),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityCashHack', {
            ReloadTime: 10000,
          }),
        ],
      },
      mapObjects: [place('Hacker', 20, 20)],
      mapSize: 64,
      sides: { China: {} },
    });

    // Verify the specialAbilityProfile was extracted.
    const hackerInternal = (agent.gameLogic as any).spawnedEntities.get(1);
    expect(hackerInternal).toBeDefined();
    expect(hackerInternal.specialAbilityProfile).not.toBeNull();
    expect(hackerInternal.specialAbilityProfile.specialPowerTemplateName).toBe('SPECIALABILITYCASHHACK');
    expect(hackerInternal.specialAbilityProfile.startAbilityRange).toBe(50);
    expect(hackerInternal.specialAbilityProfile.preparationFrames).toBeGreaterThan(0);
    expect(hackerInternal.specialAbilityProfile.packTimeFrames).toBeGreaterThan(0);
    expect(hackerInternal.specialAbilityProfile.unpackTimeFrames).toBeGreaterThan(0);
  });

  it('SpecialAbilityState is initialized on entity creation', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Hacker', 'China', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityCashHack',
              StartAbilityRange: 50,
              PreparationTime: 500,
            }),
          ]),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityCashHack', {
            ReloadTime: 5000,
          }),
        ],
      },
      mapObjects: [place('Hacker', 20, 20)],
      mapSize: 64,
      sides: { China: {} },
    });

    // Source parity: SpecialAbilityUpdate::onObjectCreated initializes state machine.
    const hackerInternal = (agent.gameLogic as any).spawnedEntities.get(1);
    expect(hackerInternal.specialAbilityState).not.toBeNull();
    expect(hackerInternal.specialAbilityState.active).toBe(false);
    // Source parity: packingState starts as PACKED if unpackTime > 0, UNPACKED otherwise.
    // With no UnpackTime specified (default 0), expect UNPACKED.
    expect(hackerInternal.specialAbilityState.packingState).toBe('UNPACKED');
    expect(hackerInternal.specialAbilityState.targetEntityId).toBeNull();
    expect(hackerInternal.specialAbilityState.prepFrames).toBe(0);
  });

  it('initiateSpecialAbility activates the state machine via issueSpecialPower command', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Burton', 'America', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityTimedCharge',
              StartAbilityRange: 10,
              PreparationTime: 500,
              SkipPackingWithNoTarget: true,
            }),
          ]),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityTimedCharge', {
            ReloadTime: 5000,
          }),
        ],
      },
      mapObjects: [place('Burton', 20, 20)],
      mapSize: 64,
      sides: { America: {} },
    });

    const burtonInternal = (agent.gameLogic as any).spawnedEntities.get(1);
    expect(burtonInternal.specialAbilityState.active).toBe(false);

    // Issue the special power command (no target — self-targeted ability).
    agent.gameLogic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'TestButton',
      specialPowerName: 'SpecialAbilityTimedCharge',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    // Commands are queued and flushed during update — step 1 frame to process.
    agent.step(1);

    // Source parity: initiateSpecialAbility sets active=true.
    expect(burtonInternal.specialAbilityState.active).toBe(true);
  });

  it('special ability progresses through preparation and completes after sufficient frames', () => {
    // Use a simple no-target ability with short preparation time and no pack/unpack.
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Agent', 'America', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityQuick',
              PreparationTime: 300, // ~9 frames at 30fps
              SkipPackingWithNoTarget: true,
            }),
          ]),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityQuick', {
            ReloadTime: 5000,
          }),
        ],
      },
      mapObjects: [place('Agent', 20, 20)],
      mapSize: 64,
      sides: { America: {} },
    });

    const entityInternal = (agent.gameLogic as any).spawnedEntities.get(1);

    // Issue the special power command.
    agent.gameLogic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'TestButton',
      specialPowerName: 'SpecialAbilityQuick',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    // Commands are queued and flushed during update — step 1 frame to process.
    agent.step(1);
    expect(entityInternal.specialAbilityState.active).toBe(true);

    // Step through enough frames for preparation to complete.
    // PreparationTime=300ms ≈ 9 frames. Add margin for state transitions.
    agent.step(30);

    // Source parity: after preparation completes, triggerAbilityEffect fires,
    // then packing (skipped via SkipPackingWithNoTarget), then finishAbility
    // sets active=false.
    expect(entityInternal.specialAbilityState.active).toBe(false);
  });

  it('special ability with pack/unpack spends frames in those states', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Hacker', 'China', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityHack',
              PreparationTime: 100,   // ~3 frames
              UnpackTime: 200,        // ~6 frames
              PackTime: 200,          // ~6 frames
            }),
          ]),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityHack', {
            ReloadTime: 5000,
          }),
        ],
      },
      mapObjects: [place('Hacker', 20, 20)],
      mapSize: 64,
      sides: { China: {} },
    });

    const entityInternal = (agent.gameLogic as any).spawnedEntities.get(1);
    expect(entityInternal.specialAbilityState.packingState).toBe('PACKED');

    // Issue the no-target special power.
    agent.gameLogic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'TestButton',
      specialPowerName: 'SpecialAbilityHack',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    // Commands are queued and flushed during update — step 1 frame to process.
    agent.step(1);
    expect(entityInternal.specialAbilityState.active).toBe(true);

    // After 1 more frame, the entity should be in UNPACKING state (since UnpackTime > 0).
    agent.step(1);
    // Source parity: initiateSpecialAbility resets to PACKED, then
    // updateSpecialAbility advances to startUnpacking on the first frame
    // when withinStartAbilityRange is true (no-target is always in range).
    const packingAfter1 = entityInternal.specialAbilityState.packingState;
    expect(['PACKED', 'UNPACKING']).toContain(packingAfter1);

    // Step through total: unpack (~6) + prep (~3) + pack (~6) + margin
    agent.step(60);

    // Source parity: after the full cycle the ability should be inactive.
    expect(entityInternal.specialAbilityState.active).toBe(false);
    // Source parity: finishSpecialAbility resets packingState to PACKED.
    expect(entityInternal.specialAbilityState.packingState).toBe('PACKED');
  });

  it('IS_USING_ABILITY status flag is set during active ability', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Agent', 'America', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityLong',
              PreparationTime: 3000, // ~90 frames — long enough to observe
              SkipPackingWithNoTarget: true,
            }),
          ]),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityLong', {
            ReloadTime: 5000,
          }),
        ],
      },
      mapObjects: [place('Agent', 20, 20)],
      mapSize: 64,
      sides: { America: {} },
    });

    const entityInternal = (agent.gameLogic as any).spawnedEntities.get(1);

    // Issue the special power.
    agent.gameLogic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'TestButton',
      specialPowerName: 'SpecialAbilityLong',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    // Step a few frames — ability should be active and IS_USING_ABILITY set.
    agent.step(5);

    // Source parity: entity gains IS_USING_ABILITY during active ability.
    expect(entityInternal.specialAbilityState.active).toBe(true);
    const statusFlags: Set<string> = entityInternal.objectStatusFlags;
    expect(statusFlags.has('IS_USING_ABILITY')).toBe(true);

    // Complete the ability.
    agent.step(120);

    // Source parity: finishSpecialAbility removes IS_USING_ABILITY.
    expect(entityInternal.specialAbilityState.active).toBe(false);
    expect(entityInternal.objectStatusFlags.has('IS_USING_ABILITY')).toBe(false);
  });

  it('killing the entity during an active ability cleans up the state', () => {
    const agent = createParityAgent({
      bundles: {
        objects: [
          makeObjectDef('Agent', 'America', ['INFANTRY'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
            makeBlock('Behavior', 'SpecialAbilityUpdate ModuleTag_SA', {
              SpecialPowerTemplate: 'SpecialAbilityLong',
              PreparationTime: 5000, // ~150 frames — won't complete naturally
              SkipPackingWithNoTarget: true,
            }),
          ]),
          makeObjectDef('Killer', 'China', ['VEHICLE'], [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
            makeWeaponBlock('BigGun'),
          ]),
        ],
        weapons: [
          makeWeaponDef('BigGun', {
            PrimaryDamage: 500,
            AttackRange: 120,
            DelayBetweenShots: 100,
          }),
        ],
        specialPowers: [
          makeSpecialPowerDef('SpecialAbilityLong', {
            ReloadTime: 5000,
          }),
        ],
      },
      mapObjects: [
        place('Agent', 20, 20),
        place('Killer', 40, 20),
      ],
      mapSize: 64,
      sides: { America: {}, China: {} },
      enemies: [['America', 'China']],
    });

    const agentInternal = (agent.gameLogic as any).spawnedEntities.get(1);

    // Activate ability.
    agent.gameLogic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'TestButton',
      specialPowerName: 'SpecialAbilityLong',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    agent.step(3);
    expect(agentInternal.specialAbilityState.active).toBe(true);

    // Kill the agent by having the enemy attack.
    agent.attack(2, 1);
    agent.step(30);

    // Source parity: updateSpecialAbility checks isEffectivelyDead and calls
    // finishSpecialAbility on dying entities.
    const agentEntity = agent.entity(1);
    expect(agentEntity === null || !agentEntity.alive).toBe(true);

    // The ability state should be deactivated (finishSpecialAbility sets active=false).
    expect(agentInternal.specialAbilityState.active).toBe(false);
  });
});
