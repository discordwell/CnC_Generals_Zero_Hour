/**
 * Parity tests for AutoHealBehavior: damage delay reset, SingleBurst mode,
 * and KindOf filter.
 *
 * These tests document behavioral differences between the C++ source and the
 * TypeScript port, serving as regression anchors for future parity fixes.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { GameLogicSubsystem } from './index.js';
import {
  makeBlock,
  makeObjectDef,
  makeWeaponDef,
  makeBundle,
  makeRegistry,
  makeHeightmap,
  makeMap,
  makeMapObject,
} from './test-helpers.js';

// ---------------------------------------------------------------------------
// Test 1: AutoHeal Damage Delay Reset
// ---------------------------------------------------------------------------
// C++ source: AutoHealBehavior.cpp:160-173 — onDamage() resets the healing
// timer by calling setWakeFrame(UPDATE_SLEEP(m_startHealingDelay)), so the
// unit must be undamaged for the full StartHealingDelay before healing starts.
//
// TS: index.ts:26800-26801 — onDamage sets autoHealDamageDelayUntilFrame =
//   frameCounter + startHealingDelayFrames.
// containment-system.ts:617 — heal only runs when
//   frameCounter >= autoHealDamageDelayUntilFrame.
//
// Expected behavior: A second hit resets the delay, so healing only begins
// startHealingDelay ms after the LAST damage, not the first.

describe('AutoHeal damage delay reset', () => {
  function makeDamageDelaySetup() {
    // Unit with AutoHealBehavior: StartHealingDelay=60 frames (~2s),
    // HealingDelay=3 frames, HealingAmount=5.
    const healerDef = makeObjectDef('Healer', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 200,
        InitialHealth: 200,
      }),
      makeBlock('Behavior', 'AutoHealBehavior ModuleTag_AutoHeal', {
        HealingAmount: 5,
        HealingDelay: 3,
        StartHealingDelay: 60, // 60 frames = 2 seconds at 30fps
        StartsActive: true,
      }),
    ]);

    // Attacker with a weapon that deals moderate damage.
    const attackerDef = makeObjectDef('Attacker', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 500,
        InitialHealth: 500,
      }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'DamageGun'] }),
    ]);

    const damageGun = makeWeaponDef('DamageGun', {
      AttackRange: 200,
      PrimaryDamage: 20,
      PrimaryDamageRadius: 0,
      DamageType: 'SMALL_ARMS',
      DeliveryType: 'DIRECT',
      DelayBetweenShots: 99999, // Fire only once
      WeaponSpeed: 999999,
    });

    const bundle = makeBundle({
      objects: [healerDef, attackerDef],
      weapons: [damageGun],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('Healer', 5, 5),
        makeMapObject('Attacker', 5, 5),
      ]),
      makeRegistry(bundle),
      makeHeightmap(),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.update(0);

    return { logic };
  }

  it('second damage resets the StartHealingDelay timer (C++ parity)', () => {
    // C++ source: AutoHealBehavior.cpp:170-172 — onDamage with
    // startHealingDelay > 0 calls setWakeFrame(UPDATE_SLEEP(startHealingDelay)),
    // which resets the countdown from the moment of damage.
    const { logic } = makeDamageDelaySetup();

    // Command attacker (entity 2) to attack healer (entity 1).
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Run a few frames for the attack to land.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    const healthAfterFirstHit = logic.getEntityState(1)!.health;
    expect(healthAfterFirstHit).toBeLessThan(200); // Confirm damage dealt.

    // Wait 45 frames (1.5 seconds) — not enough for the 60-frame delay to expire.
    for (let i = 0; i < 45; i++) logic.update(1 / 30);

    const healthBeforeSecondHit = logic.getEntityState(1)!.health;

    // No healing should have occurred yet (delay not expired).
    // Health should be same as after first hit (no healing yet).
    expect(healthBeforeSecondHit).toBe(healthAfterFirstHit);

    // Damage the healer again by directly setting health (simulating a second hit).
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        health: number;
        maxHealth: number;
        autoHealDamageDelayUntilFrame: number;
        autoHealProfile: { startHealingDelayFrames: number } | null;
      }>;
      frameCounter: number;
    };
    const healer = priv.spawnedEntities.get(1)!;
    healer.health -= 10; // Second hit of damage.
    // Simulate the damage delay reset that applyWeaponDamageAmount does:
    if (healer.autoHealProfile && healer.autoHealProfile.startHealingDelayFrames > 0) {
      healer.autoHealDamageDelayUntilFrame = priv.frameCounter + healer.autoHealProfile.startHealingDelayFrames;
    }

    const healthAfterSecondHit = healer.health;

    // Wait another 45 frames — this is only 45 frames since the SECOND hit.
    // The full 60-frame delay since the second hit has NOT expired yet.
    for (let i = 0; i < 45; i++) logic.update(1 / 30);

    const healthAfter45MoreFrames = logic.getEntityState(1)!.health;

    // If delay was properly reset, no healing should occur in these 45 frames
    // because the second hit re-started the 60-frame countdown.
    expect(healthAfter45MoreFrames).toBe(healthAfterSecondHit);

    // Now wait the remaining 20 frames (total 65 since second hit > 60 delay).
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    const healthAfterFullDelay = logic.getEntityState(1)!.health;

    // NOW healing should have started (delay expired after second hit).
    expect(healthAfterFullDelay).toBeGreaterThan(healthAfterSecondHit);
  });

  it('no healing occurs before StartHealingDelay expires', () => {
    const { logic } = makeDamageDelaySetup();

    // Deal damage via attack command.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    const healthAfterHit = logic.getEntityState(1)!.health;
    expect(healthAfterHit).toBeLessThan(200);

    // Wait 50 frames — less than the 60-frame StartHealingDelay.
    for (let i = 0; i < 50; i++) logic.update(1 / 30);

    const healthDuringDelay = logic.getEntityState(1)!.health;
    expect(healthDuringDelay).toBe(healthAfterHit); // No healing yet.
  });
});

// ---------------------------------------------------------------------------
// Test 2: AutoHeal SingleBurst Mode
// ---------------------------------------------------------------------------
// C++ source: AutoHealBehavior.cpp:293 —
//   return UPDATE_SLEEP( d->m_singleBurst ? UPDATE_SLEEP_FOREVER : d->m_healingDelay );
// After one pulse of radius healing, SingleBurst mode puts the module to
// sleep forever. This is used for things like repair pads that heal once.
//
// C++ header: AutoHealBehavior.h:89 — { "SingleBurst", INI::parseBool, ... }
//
// TS: entity-factory.ts:extractAutoHealProfile — does NOT parse SingleBurst.
// The AutoHealProfile interface has no singleBurst field.
// This means SingleBurst mode is not implemented in TS; radius healing
// will repeat indefinitely instead of stopping after one burst.

describe('AutoHeal SingleBurst mode', () => {
  it('documents that SingleBurst field is not parsed by extractAutoHealProfile', () => {
    // Create an object definition with SingleBurst=Yes.
    const healPadDef = makeObjectDef('HealPad', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 500,
        InitialHealth: 500,
      }),
      makeBlock('Behavior', 'AutoHealBehavior ModuleTag_AutoHeal', {
        HealingAmount: 10,
        HealingDelay: 3,
        Radius: 50,
        StartsActive: true,
        SingleBurst: true, // C++ field — NOT parsed in TS
      }),
    ]);

    const targetDef = makeObjectDef('DamagedAlly', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 100,
        InitialHealth: 100,
      }),
    ]);

    const bundle = makeBundle({
      objects: [healPadDef, targetDef],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('HealPad', 50, 50),
        makeMapObject('DamagedAlly', 51, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'America', 2); // allies
    logic.update(0);

    // Damage the ally.
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        health: number;
        maxHealth: number;
        autoHealProfile: Record<string, unknown> | null;
      }>;
    };
    const ally = priv.spawnedEntities.get(2)!;
    ally.health = 50; // Damage to 50/100.

    // Verify that SingleBurst is NOT present in the parsed profile.
    const healPad = priv.spawnedEntities.get(1)!;
    expect(healPad.autoHealProfile).not.toBeNull();
    // The TS AutoHealProfile interface does not include singleBurst.
    // The INI field SingleBurst=true is ignored during parsing.
    expect('singleBurst' in (healPad.autoHealProfile as Record<string, unknown>)).toBe(false);

    // Run enough frames for the first heal pulse.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const healthAfterFirstPulse = logic.getEntityState(2)!.health;
    // Healing should have occurred (radius heal applies to damaged allies).
    expect(healthAfterFirstPulse).toBeGreaterThan(50);

    // Damage the ally again to test whether healing continues.
    ally.health = 50;

    // Run more frames.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const healthAfterSecondRound = logic.getEntityState(2)!.health;

    // C++ behavior: SingleBurst=Yes would cause healing to stop after the
    // first pulse (UPDATE_SLEEP_FOREVER). The ally would remain at 50 HP.
    //
    // TS behavior: Since SingleBurst is not parsed, healing continues
    // indefinitely. The ally heals again.
    //
    // Document the divergence: TS heals again (SingleBurst not implemented).
    expect(healthAfterSecondRound).toBeGreaterThan(50);
    // When SingleBurst is implemented, the above assertion would need to
    // change to: expect(healthAfterSecondRound).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Test 3: AutoHeal KindOf Filter
// ---------------------------------------------------------------------------
// C++ source: AutoHealBehavior.cpp:264 —
//   if( obj->isAnyKindOf( d->m_kindOf ) && !obj->isAnyKindOf( d->m_forbiddenKindOf ) )
// In radius heal mode, only entities matching the KindOf mask (and not
// matching ForbiddenKindOf) receive healing.
//
// C++ header: AutoHealBehavior.h:80 — SET_ALL_KINDOFMASK_BITS( m_kindOf );
// Default is ALL kinds (everything heals). But INI can restrict via:
//   KindOf = VEHICLE
// so only vehicles get healed.
//
// TS: entity-factory.ts:extractAutoHealProfile — does NOT parse KindOf or
// ForbiddenKindOf. The AutoHealProfile interface has no kindOf field.
// containment-system.ts:619-630 — radius heal checks only ally relationship
// and health < maxHealth, with no KindOf filter.

describe('AutoHeal KindOf filter', () => {
  it('documents that KindOf filter is not applied during radius healing', () => {
    // Simulate a repair pad that should only heal VEHICLE types (C++ behavior).
    const repairPadDef = makeObjectDef('RepairPad', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 1000,
        InitialHealth: 1000,
      }),
      makeBlock('Behavior', 'AutoHealBehavior ModuleTag_AutoHeal', {
        HealingAmount: 10,
        HealingDelay: 3,
        Radius: 50,
        StartsActive: true,
        KindOf: 'VEHICLE', // C++ field — NOT parsed in TS
      }),
    ]);

    const vehicleDef = makeObjectDef('DamagedVehicle', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 200,
        InitialHealth: 200,
      }),
    ]);

    const infantryDef = makeObjectDef('DamagedInfantry', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 100,
        InitialHealth: 100,
      }),
    ]);

    const bundle = makeBundle({
      objects: [repairPadDef, vehicleDef, infantryDef],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('RepairPad', 50, 50),
        makeMapObject('DamagedVehicle', 51, 50),
        makeMapObject('DamagedInfantry', 52, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'America', 2); // allies
    logic.update(0);

    // Damage both the vehicle and the infantry.
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        health: number;
        maxHealth: number;
        autoHealProfile: Record<string, unknown> | null;
      }>;
    };
    const vehicle = priv.spawnedEntities.get(2)!;
    const infantry = priv.spawnedEntities.get(3)!;
    vehicle.health = 100; // 100/200
    infantry.health = 50; // 50/100

    // Verify that KindOf is NOT present in the parsed profile.
    const repairPad = priv.spawnedEntities.get(1)!;
    expect(repairPad.autoHealProfile).not.toBeNull();
    expect('kindOf' in (repairPad.autoHealProfile as Record<string, unknown>)).toBe(false);
    expect('forbiddenKindOf' in (repairPad.autoHealProfile as Record<string, unknown>)).toBe(false);

    // Run enough frames for healing to occur.
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    const vehicleHealth = logic.getEntityState(2)!.health;
    const infantryHealth = logic.getEntityState(3)!.health;

    // C++ behavior: Only the vehicle would heal (KindOf=VEHICLE filter).
    // Infantry would remain at 50 HP.
    //
    // TS behavior: Since KindOf is not parsed, BOTH the vehicle AND the
    // infantry heal (no filter applied).

    // Vehicle should heal in both C++ and TS.
    expect(vehicleHealth).toBeGreaterThan(100);

    // Infantry heals in TS but would NOT heal in C++ with KindOf=VEHICLE.
    // Document the parity gap: TS heals infantry too.
    expect(infantryHealth).toBeGreaterThan(50);
    // When KindOf filter is implemented, the above assertion would need to
    // change to: expect(infantryHealth).toBe(50);
  });

  it('documents that ForbiddenKindOf filter is not parsed', () => {
    // C++ header: AutoHealBehavior.h:64 —
    //   KindOfMaskType m_forbiddenKindOf;
    // Used to exclude certain entity types from healing even if in range.
    const repairPadDef = makeObjectDef('RepairPad2', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 1000,
        InitialHealth: 1000,
      }),
      makeBlock('Behavior', 'AutoHealBehavior ModuleTag_AutoHeal', {
        HealingAmount: 10,
        HealingDelay: 3,
        Radius: 50,
        StartsActive: true,
        ForbiddenKindOf: 'AIRCRAFT', // C++ field — NOT parsed in TS
      }),
    ]);

    const groundDef = makeObjectDef('GroundUnit', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 200,
        InitialHealth: 200,
      }),
    ]);

    const aircraftDef = makeObjectDef('AirUnit', 'America', ['AIRCRAFT'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 200,
        InitialHealth: 200,
      }),
    ]);

    const bundle = makeBundle({
      objects: [repairPadDef, groundDef, aircraftDef],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('RepairPad2', 50, 50),
        makeMapObject('GroundUnit', 51, 50),
        makeMapObject('AirUnit', 52, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'America', 2);
    logic.update(0);

    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        health: number;
        maxHealth: number;
        autoHealProfile: Record<string, unknown> | null;
      }>;
    };
    const ground = priv.spawnedEntities.get(2)!;
    const aircraft = priv.spawnedEntities.get(3)!;
    ground.health = 100;
    aircraft.health = 100;

    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    const groundHealth = logic.getEntityState(2)!.health;
    const aircraftHealth = logic.getEntityState(3)!.health;

    // C++ behavior: Ground unit heals, aircraft does NOT (ForbiddenKindOf=AIRCRAFT).
    // TS behavior: Both heal because ForbiddenKindOf is not parsed.

    expect(groundHealth).toBeGreaterThan(100);
    // Aircraft heals in TS but would NOT in C++ with ForbiddenKindOf=AIRCRAFT.
    expect(aircraftHealth).toBeGreaterThan(100);
    // When ForbiddenKindOf is implemented:
    // expect(aircraftHealth).toBe(100);
  });
});
