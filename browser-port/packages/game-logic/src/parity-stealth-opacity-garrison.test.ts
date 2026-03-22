/**
 * Parity tests for stealth friendly opacity rendering and detector-in-garrison behavior.
 *
 * These tests document behavioral differences between the C++ original and the
 * TypeScript browser port for two specific subsystems:
 *
 * 1. Stealth Friendly Opacity Range (StealthUpdate.h:76-88, Drawable.cpp:2567-2588)
 * 2. Detector Cannot Detect While Garrisoned Unless Configured (StealthDetectorUpdate.h:57-58)
 *
 * Source references:
 *   StealthUpdate.h:86-87          — m_friendlyOpacityMin / m_friendlyOpacityMax module data
 *   StealthUpdate.cpp:452-455      — getFriendlyOpacity() returns m_friendlyOpacityMin
 *   Drawable.cpp:2567-2588         — render path uses friendlyOpacity for STEALTHLOOK_VISIBLE_FRIENDLY
 *   StealthDetectorUpdate.h:57-58  — m_canDetectWhileGarrisoned defaults to false
 *   stealth-detection.ts:416-422   — TS garrison/contained detection check
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { GameLogicSubsystem } from './index.js';
import {
  makeBlock,
  makeObjectDef,
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

// ── Test 1: Stealth Friendly Opacity Range ──────────────────────────────────

describe('Parity: stealth friendly opacity range (StealthUpdate.h:86-87)', () => {
  /**
   * C++ StealthUpdate.h:86-87 — StealthUpdateModuleData has m_friendlyOpacityMin and
   * m_friendlyOpacityMax fields. When a stealthed unit is viewed by an allied player,
   * Drawable.cpp:2567-2588 sets the render opacity:
   *   1. Starts with TheGlobalData->m_stealthFriendlyOpacity (global default)
   *   2. Calls stealth->getFriendlyOpacity() to check for per-module override
   *   3. getFriendlyOpacity() returns m_friendlyOpacityMin (StealthUpdate.cpp:452-455)
   *   4. If result != INVALID_OPACITY (-1.0f), uses it as the render opacity
   *
   * Note: Despite having both Min and Max fields, C++ getFriendlyOpacity() only
   * returns m_friendlyOpacityMin. The Max field appears unused in the shipped code
   * (no interpolation between min/max is implemented in the retail source).
   *
   * TS render-state-bridge.ts makeRenderableEntityState — exposes isStealthed and
   * isDetected as booleans in RenderableEntityState. There is no opacity field,
   * friendlyOpacityMin, or friendlyOpacityMax in the renderable state. The
   * extractStealthProfile function in stealth-detection.ts also does not parse
   * FriendlyOpacityMin or FriendlyOpacityMax from INI data.
   *
   * Parity gap: The TS port has no concept of stealth opacity. All stealthed allies
   * render as binary stealthed/not-stealthed. The C++ game renders them at a
   * configurable partial opacity (default: global value, overridable per-module).
   */

  it('stealthFriendlyOpacity appears in renderable state for stealthed local-player units', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StealthUnit', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            StealthForbiddenConditions: '',
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

    // Wait for stealth to activate (100ms = ~3 frames at 30fps).
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Verify stealth is active via getEntityState.
    const entityState = logic.getEntityState(1);
    expect(entityState).not.toBeNull();
    expect(entityState!.statusFlags).toContain('STEALTHED');

    // Verify the renderable state has boolean stealth flags and opacity.
    const renderableStates = logic.getRenderableEntityStates();
    const renderState = renderableStates.find(s => s.id === 1);
    expect(renderState).toBeDefined();
    expect(renderState!.isStealthed).toBe(true);
    expect(renderState!.isDetected).toBe(false);

    // Source parity: stealthFriendlyOpacity should be present.
    // Default m_friendlyOpacityMin is 0.5 (StealthUpdate.cpp:79).
    expect(renderState!).toHaveProperty('stealthFriendlyOpacity');
    expect(renderState!.stealthFriendlyOpacity).toBe(0.5);
  });

  it('extractStealthProfile parses FriendlyOpacityMin from INI', () => {
    // Source parity: StealthUpdate.h:86 — m_friendlyOpacityMin is parsed from INI.
    // C++ getFriendlyOpacity() returns m_friendlyOpacityMin (Max is unused in retail).
    const bundle = makeBundle({
      objects: [
        makeObjectDef('OpacityStealthUnit', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            FriendlyOpacityMin: 0.3,
            FriendlyOpacityMax: 0.6,
          }),
        ]),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([makeMapObject('OpacityStealthUnit', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Access the internal stealth profile to verify FriendlyOpacityMin is parsed.
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        stealthProfile: {
          stealthDelayFrames: number;
          innateStealth: boolean;
          forbiddenConditions: number;
          moveThresholdSpeed: number;
          revealDistanceFromTarget: number;
          friendlyOpacityMin: number;
        } | null;
      }>;
    };

    const entity = priv.spawnedEntities.get(1)!;
    const profile = entity.stealthProfile;
    expect(profile).not.toBeNull();

    // Source parity: FriendlyOpacityMin is now parsed from INI into the stealth profile.
    expect(profile!.friendlyOpacityMin).toBe(0.3);

    // Verify the renderable state uses the per-module opacity.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');

    const renderables = logic.getRenderableEntityStates();
    const renderState = renderables.find(s => s.id === 1);
    expect(renderState).toBeDefined();
    expect(renderState!.stealthFriendlyOpacity).toBe(0.3);
  });

  it('stealthed allies get per-module friendlyOpacity, stealthed enemies get 1.0', () => {
    // Source parity: C++ Drawable.cpp:2567-2588 — when the local player views:
    //   - Allied stealthed: STEALTHLOOK_VISIBLE_FRIENDLY — rendered at friendlyOpacityMin
    //   - Enemy stealthed+detected: STEALTHLOOK_VISIBLE_DETECTED — rendered with shimmer
    //   - Enemy stealthed+undetected: STEALTHLOOK_NOT_VISIBLE — not rendered at all
    const bundle = makeBundle({
      objects: [
        // Local player's stealthed unit.
        makeObjectDef('AllyStealthUnit', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
          }),
        ]),
        // Enemy stealthed unit.
        makeObjectDef('EnemyStealthUnit', 'China', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
          }),
        ]),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('AllyStealthUnit', 50, 50),
        makeMapObject('EnemyStealthUnit', 80, 80),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    // Configure local player as America (player index 0).
    logic.setPlayerSide(0, 'America');
    setupEnemyRelationships(logic, 'America', 'China');

    // Wait for both units to stealth.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const allyState = logic.getEntityState(1);
    const enemyState = logic.getEntityState(2);
    expect(allyState!.statusFlags).toContain('STEALTHED');
    expect(enemyState!.statusFlags).toContain('STEALTHED');

    // Both have isStealthed = true in renderable state.
    const renderables = logic.getRenderableEntityStates();
    const allyRenderable = renderables.find(s => s.id === 1);
    const enemyRenderable = renderables.find(s => s.id === 2);
    expect(allyRenderable!.isStealthed).toBe(true);
    expect(enemyRenderable!.isStealthed).toBe(true);

    // Source parity: ally stealthed units now have stealthFriendlyOpacity from the
    // per-module FriendlyOpacityMin (default 0.5). Enemy stealthed units get 1.0
    // (not owned by local player).
    expect(allyRenderable!.stealthFriendlyOpacity).toBe(0.5);
    expect(enemyRenderable!.stealthFriendlyOpacity).toBe(1.0);
  });
});

// ── Test 2: Detector Cannot Detect While Garrisoned (Unless Configured) ─────

describe('Parity: detector cannot detect while garrisoned (StealthDetectorUpdate.h:57-58)', () => {
  /**
   * C++ StealthDetectorUpdate.h:57-58 — m_canDetectWhileGarrisoned defaults to false.
   * C++ StealthDetectorUpdate.h:58   — m_canDetectWhileTransported defaults to false.
   *
   * When a detector unit is garrisoned inside a building, it cannot detect stealthed
   * enemies unless CanDetectWhileGarrisoned = Yes is set in its module data.
   *
   * TS stealth-detection.ts:416-422 — same check:
   *   if (isGarrison && !profile.canDetectWhileGarrisoned) continue;
   *   if (!isGarrison && !profile.canDetectWhileContained) continue;
   */

  function makeGarrisonDetectorBundle(options: {
    canDetectWhileGarrisoned?: boolean;
  } = {}) {
    const canDetectWhileGarrisoned = options.canDetectWhileGarrisoned ?? false;
    return makeBundle({
      objects: [
        // A garrisonable building.
        makeObjectDef('CivBuilding', 'America', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'GarrisonContain ModuleTag_Contain', {
            ContainMax: 5,
          }),
        ]),
        // A detector infantry unit (same side as building for garrisoning).
        makeObjectDef('DetectorUnit', 'America', ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthDetectorUpdate ModuleTag_Detector', {
            DetectionRange: 200,
            DetectionRate: 33,
            CanDetectWhileGarrisoned: canDetectWhileGarrisoned ? 'Yes' : 'No',
          }),
        ], { VisionRange: 200, TransportSlotCount: 1 }),
        // A stealthed enemy unit.
        makeObjectDef('StealthEnemy', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            StealthForbiddenConditions: '',
          }),
        ]),
      ],
    });
  }

  it('garrisoned detector with canDetectWhileGarrisoned=false does NOT detect stealthed enemies', () => {
    const bundle = makeGarrisonDetectorBundle({ canDetectWhileGarrisoned: false });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CivBuilding', 50, 50),
        makeMapObject('DetectorUnit', 52, 50),
        makeMapObject('StealthEnemy', 55, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'America', 'GLA');

    // Let stealth activate on the enemy unit.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    expect(logic.getEntityState(3)?.statusFlags ?? []).toContain('STEALTHED');

    // Before garrisoning, detector should detect the stealthed enemy (free-standing baseline).
    const preGarrisonFlags = logic.getEntityState(3)?.statusFlags ?? [];
    expect(preGarrisonFlags).toContain('DETECTED');

    // Clear the detection by advancing past the detection timer.
    // First, garrison the detector inside the building.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Verify the detector is garrisoned.
    const detectorFlags = logic.getEntityState(2)?.statusFlags ?? [];
    expect(detectorFlags).toContain('DISABLED_HELD');

    // Run enough frames for the detection timer to expire and for new scans to occur.
    for (let i = 0; i < 60; i++) logic.update(1 / 30);

    // The stealthed enemy should NOT be detected because the garrisoned detector
    // has canDetectWhileGarrisoned=false (the default per C++ StealthDetectorUpdate.h:71).
    const enemyFlags = logic.getEntityState(3)?.statusFlags ?? [];
    expect(enemyFlags).toContain('STEALTHED');
    expect(enemyFlags).not.toContain('DETECTED');
  });

  it('garrisoned detector with canDetectWhileGarrisoned=true DOES detect stealthed enemies', () => {
    const bundle = makeGarrisonDetectorBundle({ canDetectWhileGarrisoned: true });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CivBuilding', 50, 50),
        makeMapObject('DetectorUnit', 52, 50),
        makeMapObject('StealthEnemy', 55, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'America', 'GLA');

    // Let stealth activate on the enemy unit.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    expect(logic.getEntityState(3)?.statusFlags ?? []).toContain('STEALTHED');

    // Garrison the detector inside the building.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Verify the detector is garrisoned.
    const detectorFlags = logic.getEntityState(2)?.statusFlags ?? [];
    expect(detectorFlags).toContain('DISABLED_HELD');

    // Run frames for the detector to scan while garrisoned.
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // The stealthed enemy SHOULD be detected because canDetectWhileGarrisoned=true.
    const enemyFlags = logic.getEntityState(3)?.statusFlags ?? [];
    expect(enemyFlags).toContain('STEALTHED');
    expect(enemyFlags).toContain('DETECTED');
  });

  it('free-standing detector (not garrisoned) detects regardless of canDetectWhileGarrisoned setting', () => {
    // Baseline: a free-standing detector should always detect, even if
    // canDetectWhileGarrisoned is false. The flag only matters when inside a garrison.
    const bundle = makeGarrisonDetectorBundle({ canDetectWhileGarrisoned: false });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CivBuilding', 50, 50),
        makeMapObject('DetectorUnit', 55, 50),
        makeMapObject('StealthEnemy', 60, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'America', 'GLA');

    // Let stealth activate and detection scan run.
    for (let i = 0; i < 15; i++) logic.update(1 / 30);

    const enemyFlags = logic.getEntityState(3)?.statusFlags ?? [];
    expect(enemyFlags).toContain('STEALTHED');
    expect(enemyFlags).toContain('DETECTED');
  });

  it('documents that canDetectWhileGarrisoned defaults to false matching C++ StealthDetectorUpdate.h:71', () => {
    // Create a detector without explicitly setting CanDetectWhileGarrisoned.
    // The default should be false, matching the C++ constructor default.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CivBuilding', 'America', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'GarrisonContain ModuleTag_Contain', { ContainMax: 5 }),
        ]),
        makeObjectDef('DefaultDetector', 'America', ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthDetectorUpdate ModuleTag_Detector', {
            DetectionRange: 200,
            DetectionRate: 33,
            // CanDetectWhileGarrisoned intentionally omitted — should default to false.
          }),
        ], { VisionRange: 200, TransportSlotCount: 1 }),
        makeObjectDef('StealthEnemy', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
          }),
        ]),
      ],
    });
    const logic = createLogic();
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CivBuilding', 50, 50),
        makeMapObject('DefaultDetector', 52, 50),
        makeMapObject('StealthEnemy', 55, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupEnemyRelationships(logic, 'America', 'GLA');

    // Verify detector profile has canDetectWhileGarrisoned = false by default.
    const priv = logic as unknown as {
      spawnedEntities: Map<number, {
        detectorProfile: {
          detectionRange: number;
          detectionRate: number;
          canDetectWhileGarrisoned: boolean;
          canDetectWhileContained: boolean;
        } | null;
      }>;
    };
    const detector = priv.spawnedEntities.get(2)!;
    expect(detector.detectorProfile).not.toBeNull();
    expect(detector.detectorProfile!.canDetectWhileGarrisoned).toBe(false);
    expect(detector.detectorProfile!.canDetectWhileContained).toBe(false);

    // Let stealth activate.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Garrison the detector.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Wait for detection expiry.
    for (let i = 0; i < 60; i++) logic.update(1 / 30);

    // Should NOT detect — default canDetectWhileGarrisoned=false.
    const enemyFlags = logic.getEntityState(3)?.statusFlags ?? [];
    expect(enemyFlags).toContain('STEALTHED');
    expect(enemyFlags).not.toContain('DETECTED');
  });
});
