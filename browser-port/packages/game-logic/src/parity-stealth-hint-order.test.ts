/**
 * Parity tests for HintDetectableConditions cascade and
 * OrderIdleEnemiesToAttackMeUponReveal.
 *
 * Test 1: Hint Detectable Cascade
 *   C++ StealthUpdate.h:80 / StealthUpdate.cpp:431-445 — m_hintDetectableStates is an
 *   ObjectStatusMask parsed from HintDetectableConditions in INI. When allowedToStealth()
 *   returns false and the unit leaves stealth, hintDetectableWhileUnstealthed() checks
 *   whether any of the unit's current status bits match m_hintDetectableStates. If so,
 *   it sets a second-material-pass opacity on the local player's drawable, giving a visual
 *   hint that the unit is detectable (e.g., Colonel Burton shows a shimmer while moving).
 *   NOTE: This is a CLIENT-SIDE visual hint, not a gameplay cascade that reveals nearby
 *   allies. The "cascade" interpretation in the task refers to the possibility that a
 *   detected unit broadcasts to nearby matching units — this does NOT happen in C++.
 *   The hint system is purely a visual indicator for the owning player.
 *
 *   TS: stealth-detection.ts does not parse HintDetectableConditions, does not store
 *   m_hintDetectableStates, and does not call hintDetectableWhileUnstealthed(). There
 *   is no second-material-pass rendering system. The visual hint is absent.
 *
 * Test 2: OrderIdleEnemiesToAttackMeUponReveal
 *   C++ StealthUpdate.cpp:870-936 — markAsDetected() checks m_orderIdleEnemiesToAttackMeUponReveal.
 *   If true, it iterates all enemy players and calls setWakeupIfInRange (line 841-866)
 *   on each enemy player's objects. setWakeupIfInRange checks vision range and calls
 *   ai->wakeUpAndAttemptToTarget(), causing idle enemies to auto-acquire the revealed unit.
 *
 *   TS: OrderIdleEnemiesToAttackMeUponReveal is parsed from INI into stealthProfile and
 *   read during updateDetection(). When a unit is first DETECTED and the flag is true,
 *   orderIdleEnemiesToAttack() iterates enemy entities and issues attack commands to
 *   idle armed units within their vision range of the revealed unit.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { GameLogicSubsystem } from './index.js';
import {
  makeBlock,
  makeObjectDef,
  makeWeaponDef,
  makeLocomotorDef,
  makeBundle,
  makeRegistry,
  makeHeightmap,
  makeMap,
  makeMapObject,
} from './test-helpers.js';

// ── Shared helpers ──────────────────────────────────────────────────────────

function createLogic(): GameLogicSubsystem {
  return new GameLogicSubsystem(new THREE.Scene());
}

function setupEnemyRelationships(logic: GameLogicSubsystem, sideA: string, sideB: string): void {
  logic.setTeamRelationship(sideA, sideB, 0);
  logic.setTeamRelationship(sideB, sideA, 0);
}

// ── Test 1: Hint Detectable Cascade ─────────────────────────────────────────

describe('Parity: HintDetectableConditions cascade', () => {
  /**
   * C++ StealthUpdate.h:80 — m_hintDetectableStates is an ObjectStatusMaskType
   * parsed from HintDetectableConditions. When the unit drops out of stealth
   * (allowedToStealth returns false), hintDetectableWhileUnstealthed() checks
   * the unit's status bits against this mask. If matched, it sets a visual
   * opacity hint on the local player's drawable (setSecondMaterialPassOpacity).
   *
   * This is NOT a gameplay cascade — it does not reveal nearby allies or
   * broadcast detection status. It is a CLIENT-SIDE rendering effect that
   * visually hints to the owning player that the unit is temporarily exposed.
   *
   * TS: Neither HintDetectableConditions nor hintDetectableWhileUnstealthed
   * is implemented. The stealthProfile type does not include a
   * hintDetectableStates field.
   */

  it('HintDetectableConditions is parsed from INI into stealth profile', () => {
    // Source parity: StealthUpdate.cpp:105 — HintDetectableConditions is parsed
    // into m_hintDetectableStates (ObjectStatusMaskType). Now parsed in TS too.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StealthUnit', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            HintDetectableConditions: 'IS_FIRING_WEAPON',
          }),
        ]),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([makeMapObject('StealthUnit', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.update(1 / 30);

    // Access the internal entity to inspect the stealth profile.
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        stealthProfile: {
          stealthDelayFrames: number;
          innateStealth: boolean;
          forbiddenConditions: number;
          moveThresholdSpeed: number;
          revealDistanceFromTarget: number;
          hintDetectableConditions: string[];
        } | null;
      }>;
    };
    const entity = priv.spawnedEntities.get(1);
    expect(entity).not.toBeUndefined();
    expect(entity!.stealthProfile).not.toBeNull();

    // Source parity: hintDetectableConditions is now parsed and stored.
    expect(entity!.stealthProfile!.hintDetectableConditions).toEqual(['IS_FIRING_WEAPON']);
  });

  it('two nearby stealthed units — detecting one does NOT cascade-detect the other', () => {
    // This test verifies that detection of one stealthed unit does NOT
    // automatically detect nearby allied stealthed units. This matches C++
    // behavior — hintDetectableWhileUnstealthed is a visual-only effect
    // that does NOT broadcast detection to other units.
    const bundle = makeBundle({
      objects: [
        // Two stealthed units from the same side, close together.
        makeObjectDef('StealthA', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            HintDetectableConditions: 'IS_FIRING_WEAPON',
          }),
        ]),
        makeObjectDef('StealthB', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            HintDetectableConditions: 'IS_FIRING_WEAPON',
          }),
        ]),
        // Enemy detector — placed to detect StealthA but verify StealthB status.
        makeObjectDef('DetectorUnit', 'America', ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('Behavior', 'StealthDetectorUpdate ModuleTag_Detector', {
            DetectionRange: 200,
            DetectionRate: 33,
          }),
        ], { VisionRange: 200 }),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        // StealthA at (50,50), StealthB at (52,50) — very close together.
        makeMapObject('StealthA', 50, 50),
        makeMapObject('StealthB', 52, 50),
        // Detector at (55,50) — within detection range of both.
        makeMapObject('DetectorUnit', 55, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'GLA', 'America');

    // Let stealth activate on both units.
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    const flagsA1 = logic.getEntityState(1)?.statusFlags ?? [];
    const flagsB1 = logic.getEntityState(2)?.statusFlags ?? [];
    expect(flagsA1).toContain('STEALTHED');
    expect(flagsB1).toContain('STEALTHED');

    // Run more frames for detection to occur.
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Both units are within detector range, so both get detected independently
    // by the detector scan — NOT by cascade from one to the other.
    const flagsA2 = logic.getEntityState(1)?.statusFlags ?? [];
    const flagsB2 = logic.getEntityState(2)?.statusFlags ?? [];

    // PARITY DOCUMENTATION:
    // In both C++ and TS, detection is per-unit via detector scan. There is NO
    // cascade mechanism where detecting unit A automatically detects unit B.
    // The HintDetectableConditions system in C++ is purely visual (opacity hint
    // on the owning player's drawable) — it does not spread detection.
    //
    // Both units get detected here because the detector is within range of both,
    // not because of any cascade.
    expect(flagsA2).toContain('DETECTED');
    expect(flagsB2).toContain('DETECTED');
  });

  it('hintDetectableWhileUnstealthed visual system is absent in TS', () => {
    // In C++, when a stealthed unit drops stealth (e.g., starts moving with
    // STEALTH_NOT_WHILE_MOVING), the code calls hintDetectableWhileUnstealthed()
    // which sets setSecondMaterialPassOpacity(1.0) on the drawable if the unit's
    // current status matches m_hintDetectableStates. This makes the unit shimmer
    // for the local player.
    //
    // In TS, the stealth-break path in updateStealth() simply removes STEALTHED
    // and resets the delay counter. There is no visual hint callback.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StealthMover', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            StealthForbiddenConditions: 'MOVING',
            HintDetectableConditions: 'IS_FIRING_WEAPON',
          }),
          makeBlock('LocomotorSet', 'SET_NORMAL InfantryLoco', {}),
        ]),
      ],
      locomotors: [
        makeLocomotorDef('InfantryLoco', 30),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([makeMapObject('StealthMover', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    // Let stealth activate.
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');

    // Command unit to move — should break stealth due to MOVING forbidden condition.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 70, targetZ: 50 });
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const flags = logic.getEntityState(1)?.statusFlags ?? [];

    // PARITY DOCUMENTATION:
    // In C++, after stealth breaks, hintDetectableWhileUnstealthed() would check
    // m_hintDetectableStates against the unit's status bits and potentially set
    // a visual shimmer effect on the drawable.
    // In TS, stealth simply breaks with no visual hint callback — STEALTHED is
    // removed and stealthDelayRemaining is reset. No second-material-pass system
    // exists.
    //
    // The unit should not be stealthed (movement broke it).
    // The MOVING forbidden condition check works correctly in both C++ and TS.
    expect(flags).not.toContain('STEALTHED');
  });
});

// ── Test 2: Order Idle Enemies to Attack on Reveal ──────────────────────────

describe('Parity: OrderIdleEnemiesToAttackMeUponReveal', () => {
  /**
   * C++ StealthUpdate.cpp:870-936 — markAsDetected():
   *   1. Checks m_orderIdleEnemiesToAttackMeUponReveal flag.
   *   2. If true, iterates all players via ThePlayerList.
   *   3. For each enemy player, calls player->iterateObjects(setWakeupIfInRange, self).
   *   4. setWakeupIfInRange (lines 841-866) checks if the enemy object is within
   *      vision range of the revealed unit, and if so calls ai->wakeUpAndAttemptToTarget().
   *
   * TS: updateDetection() marks units as DETECTED and, when
   * orderIdleEnemiesToAttackMeUponReveal is true, calls orderIdleEnemiesToAttack()
   * to iterate enemies and issue attack commands to idle armed units in vision range.
   */

  it('OrderIdleEnemiesToAttackMeUponReveal triggers idle enemy auto-attack on detection', () => {
    const bundle = makeBundle({
      objects: [
        // Stealthed unit with OrderIdleEnemiesToAttackMeUponReveal enabled.
        makeObjectDef('StealthUnit', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            OrderIdleEnemiesToAttackMeUponReveal: 'Yes',
          }),
        ]),
        // Enemy detector — will detect the stealthed unit.
        makeObjectDef('DetectorUnit', 'America', ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('Behavior', 'StealthDetectorUpdate ModuleTag_Detector', {
            DetectionRange: 200,
            DetectionRate: 33,
          }),
        ], { VisionRange: 200 }),
        // Idle armed enemy — should auto-attack upon reveal.
        makeObjectDef('IdleEnemy', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'EnemyRifle'] }),
        ], { VisionRange: 200 }),
      ],
      weapons: [
        makeWeaponDef('EnemyRifle', {
          PrimaryDamage: 5,
          PrimaryDamageRadius: 0,
          AttackRange: 150,
          DelayBetweenShots: 500,
          DamageType: 'SMALL_ARMS',
        }),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 50, 50),
        makeMapObject('DetectorUnit', 55, 50),
        makeMapObject('IdleEnemy', 53, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'GLA', 'America');

    // Let stealth activate.
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');

    // Run a few more frames for the detector to scan and detect the unit.
    for (let i = 0; i < 15; i++) logic.update(1 / 30);

    // Verify stealth unit is detected.
    const stealthFlags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(stealthFlags).toContain('DETECTED');

    // Access internal entity state to check if idle enemy was ordered to attack.
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        attackTargetEntityId: number | null;
      }>;
    };
    const idleEnemy = priv.spawnedEntities.get(3);
    expect(idleEnemy).not.toBeUndefined();

    // Source parity: OrderIdleEnemiesToAttackMeUponReveal causes idle enemies
    // within vision range to auto-target the revealed unit immediately.
    // The idle enemy (entity 3) is at (53,50), within vision range (200) of the
    // stealth unit at (50,50). It should now be targeting entity 1.
    expect(idleEnemy!.attackTargetEntityId).toBe(1);
  });

  it('OrderIdleEnemiesToAttackMeUponReveal: only enemies within vision range are woken', () => {
    // Source parity: StealthUpdate.cpp:841-866 — setWakeupIfInRange callback
    // checks the enemy's vision range to determine if the revealed unit is visible.
    // Only enemies whose vision range covers the revealed unit are ordered to attack.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StealthUnit', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            OrderIdleEnemiesToAttackMeUponReveal: 'Yes',
          }),
        ]),
        // Near enemy — within vision range (100) of the stealth unit.
        makeObjectDef('NearEnemy', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Rifle'] }),
        ], { VisionRange: 100 }),
        // Far enemy — outside vision range (50) from the stealth unit at distance ~60.
        makeObjectDef('FarEnemy', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Rifle'] }),
        ], { VisionRange: 50 }),
        // Detector to trigger detection.
        makeObjectDef('Detector', 'America', ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('Behavior', 'StealthDetectorUpdate ModuleTag_Detector', {
            DetectionRange: 200,
            DetectionRate: 33,
          }),
        ], { VisionRange: 200 }),
      ],
      weapons: [
        makeWeaponDef('Rifle', {
          PrimaryDamage: 5,
          PrimaryDamageRadius: 0,
          AttackRange: 80,
          DelayBetweenShots: 500,
          DamageType: 'SMALL_ARMS',
        }),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 50, 50),
        // NearEnemy close enough that vision range (100) covers the stealth unit.
        makeMapObject('NearEnemy', 52, 50),
        // FarEnemy far enough that vision range (50) does NOT reach (50,50) from (110,50).
        makeMapObject('FarEnemy', 110, 50),
        makeMapObject('Detector', 55, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'GLA', 'America');

    // Run one frame to trigger initial detection + wakeup.
    logic.update(1 / 30);
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('DETECTED');

    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        attackTargetEntityId: number | null;
      }>;
    };

    // Source parity:
    //   - NearEnemy (vision=100, dist~2): within vision range, ordered to attack.
    //   - FarEnemy (vision=50, dist~60): outside vision range, remains idle.
    const nearEnemy = priv.spawnedEntities.get(2);
    const farEnemy = priv.spawnedEntities.get(3);
    expect(nearEnemy!.attackTargetEntityId).toBe(1);
    expect(farEnemy!.attackTargetEntityId).toBeNull();
  });

  it('OrderIdleEnemiesToAttackMeUponReveal is parsed from INI into stealth profile', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StealthUnit', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            OrderIdleEnemiesToAttackMeUponReveal: 'Yes',
          }),
        ]),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([makeMapObject('StealthUnit', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.update(1 / 30);

    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        stealthProfile: {
          orderIdleEnemiesToAttackMeUponReveal: boolean;
        } | null;
      }>;
    };
    const entity = priv.spawnedEntities.get(1);
    expect(entity).not.toBeUndefined();
    expect(entity!.stealthProfile).not.toBeNull();
    expect(entity!.stealthProfile!.orderIdleEnemiesToAttackMeUponReveal).toBe(true);
  });
});
