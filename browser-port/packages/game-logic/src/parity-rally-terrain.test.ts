/**
 * Parity tests for rally point pathfinding and entity terrain height snapping.
 *
 * Test 1 — DefaultProductionExitUpdate (DefaultProductionExitUpdate.cpp:74-120):
 *   When a factory produces a unit, the unit spawns at UnitCreatePoint and receives
 *   a moveTo command targeting the natural rally point, then the player rally point.
 *   After stepping enough frames, the unit should arrive near the player rally point.
 *
 * Test 2 — Object::update ground snap (Object.cpp, PhysicsBehavior.cpp):
 *   Ground units snap their Y position to the terrain height at their XZ location
 *   every frame. When a unit moves across varying terrain, its Y must track the
 *   heightmap surface continuously.
 *
 * TS implementation:
 *   - production-spawn.ts resolveQueueProductionExitPath
 *   - entity-movement.ts updateEntityMovement -> updateEntityVerticalPosition
 *   - index.ts updateEntityVerticalPosition (ground snap via resolveGroundHeight)
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
  makeLocomotorDef,
  makeCommandButtonDef,
  makeCommandSetDef,
} from './test-helpers.js';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';

// ── Test 1: Spawned Units Pathfind to Rally Point ────────────────────────────

describe('parity: spawned units pathfind to rally point', () => {
  /**
   * C++ source: DefaultProductionExitUpdate.cpp:74-120
   *   exitObjectViaDoor builds a waypoint path:
   *     1. Natural rally point (from NaturalRallyPoint INI field, rotated to world space)
   *     2. Player rally point (if set, for ground-moving units)
   *   The produced unit receives issueMoveTo to the first waypoint, then subsequent
   *   waypoints are appended to the move path.
   *
   * TS source: index.ts:24255-24271
   *   resolveQueueProductionExitPath computes the exit path.
   *   issueMoveTo sends the unit toward the first waypoint.
   *   Additional waypoints (player rally point) are appended to movePath.
   */

  function makeRallyBundle() {
    return makeBundle({
      objects: [
        makeObjectDef('TestFactory', 'America', ['STRUCTURE', 'FS_FACTORY'], [
          makeBlock('Body', 'StructureBody ModuleTag_Body', { MaxHealth: 2000, InitialHealth: 2000 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Prod', { MaxQueueEntries: 9 }),
          makeBlock('Behavior', 'DefaultProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [20, 0, 0],
            NaturalRallyPoint: [40, 0, 0],
          }),
        ], {
          CommandSet: 'TestFactoryCommandSet',
        }),
        makeObjectDef('TestUnit', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('LocomotorSet', 'SET_NORMAL InfantryLoco', {}),
        ], { BuildCost: 100, BuildTime: 1 }),
      ],
      locomotors: [
        makeLocomotorDef('InfantryLoco', 30),
      ],
      commandSets: [
        makeCommandSetDef('TestFactoryCommandSet', { '1': 'Cmd_TrainUnit' }),
      ],
      commandButtons: [
        makeCommandButtonDef('Cmd_TrainUnit', { Command: 'UNIT_BUILD', Object: 'TestUnit' }),
      ],
    });
  }

  it('unit spawns at exit point and moves toward rally point', () => {
    const bundle = makeRallyBundle();
    const logic = new GameLogicSubsystem(new THREE.Scene());

    // Place factory at (100, 100) on a large enough map.
    const map = makeMap([makeMapObject('TestFactory', 100, 100)], 128, 128);
    logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(128, 128));
    logic.setPlayerSide(0, 'America');
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 10000 });
    logic.update(1 / 30);

    // Set a player rally point at (200, 200).
    const factoryId = logic.getRenderableEntityStates().find(e => e.templateName === 'TestFactory')!.id;
    logic.submitCommand({ type: 'setRallyPoint', entityId: factoryId, targetX: 200, targetZ: 200 });
    logic.update(1 / 30);

    // Verify rally point was set.
    const factoryState = logic.getEntityState(factoryId);
    expect(factoryState).toBeDefined();
    expect(factoryState!.rallyPoint).not.toBeNull();
    expect(factoryState!.rallyPoint!.x).toBe(200);
    expect(factoryState!.rallyPoint!.z).toBe(200);

    // Queue a unit for production.
    logic.submitCommand({
      type: 'queueUnitProduction',
      entityId: factoryId,
      unitTemplateName: 'TestUnit',
    });

    // Advance frames for production to complete (BuildTime=1s = 30 frames + buffer).
    for (let i = 0; i < 45; i++) logic.update(1 / 30);

    // Find the spawned unit.
    const entities = logic.getRenderableEntityStates();
    const unit = entities.find(e => e.templateName === 'TestUnit');
    expect(unit).toBeDefined();

    // Unit should have spawned at UnitCreatePoint offset from factory.
    // Factory at (100,100), UnitCreatePoint=[20,0,0], angle=0:
    //   spawnX = 100 + 20*cos(0) = 120, spawnZ = 100 + 0 = 100
    // By now the unit has started moving toward the rally point.
    // Verify it is offset from the factory center (not stuck at 100,100).
    const unitState = logic.getEntityState(unit!.id);
    expect(unitState).toBeDefined();
    expect(unitState!.x).toBeGreaterThan(105); // Offset from factory center

    // The unit should be moving (has a path toward the rally point).
    expect(unitState!.moving).toBe(true);

    // Step 100+ more frames so the unit can reach near the rally point.
    for (let i = 0; i < 150; i++) logic.update(1 / 30);

    // Verify the unit reached near the rally point position (200, 200).
    const finalState = logic.getEntityState(unit!.id);
    expect(finalState).toBeDefined();

    const distToRally = Math.hypot(finalState!.x - 200, finalState!.z - 200);
    // The unit should be within a reasonable distance of the rally point.
    // With speed=30 over ~5 seconds of movement, it can travel ~150 units.
    // Factory exit is at ~(120,100), rally at (200,200), distance ~128 units.
    // Allow some tolerance for pathfinding cell alignment.
    expect(distToRally).toBeLessThan(30);

    // Unit should have stopped moving (reached destination).
    expect(finalState!.moving).toBe(false);
  });

  it('unit without rally point still moves to natural rally point', () => {
    const bundle = makeRallyBundle();
    const logic = new GameLogicSubsystem(new THREE.Scene());

    const map = makeMap([makeMapObject('TestFactory', 100, 100)], 128, 128);
    logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(128, 128));
    logic.setPlayerSide(0, 'America');
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 10000 });
    logic.update(1 / 30);

    // Do NOT set a player rally point.
    const factoryId = logic.getRenderableEntityStates().find(e => e.templateName === 'TestFactory')!.id;

    // Queue a unit for production.
    logic.submitCommand({
      type: 'queueUnitProduction',
      entityId: factoryId,
      unitTemplateName: 'TestUnit',
    });

    // Advance frames for production + movement.
    for (let i = 0; i < 90; i++) logic.update(1 / 30);

    // Find the spawned unit.
    const unit = logic.getRenderableEntityStates().find(e => e.templateName === 'TestUnit');
    expect(unit).toBeDefined();

    const unitState = logic.getEntityState(unit!.id);
    expect(unitState).toBeDefined();

    // Without a player rally point, the QUEUE module type doubles the natural
    // rally point (production-spawn.ts lines 154-158) to prevent stacking.
    // Natural rally point at (40,0,0) relative, with QUEUE offset:
    //   magnitude = 40, offsetScale = (2*10)/40 = 0.5
    //   adjusted = 40 + 40*0.5 = 60
    //   worldX = 100 + 60*cos(0) = 160, worldZ = 100
    // The unit should have moved toward approximately (160, 100).
    expect(unitState!.x).toBeGreaterThan(120); // Moved away from factory
  });
});

// ── Test 2: Ground Units Snap to Terrain Height Every Frame ──────────────────

describe('parity: ground units snap to terrain height', () => {
  /**
   * C++ source: Object.cpp — ground units have their Z position (vertical in C++)
   *   snapped to terrain height each frame. In the TS port, Y is vertical.
   *
   * TS source: index.ts:30820-30889 — updateEntityVerticalPosition()
   *   groundY = resolveGroundHeight(entity.x, entity.z) + entity.baseHeight;
   *   For non-aircraft: entity.y += (targetY - entity.y) * snapAlpha;
   *   where snapAlpha = 1 - exp(-terrainSnapSpeed * dt), with terrainSnapSpeed=6.
   *
   * The heightmap converts raw 0-255 values to world heights via MAP_HEIGHT_SCALE (0.625).
   * MAP_XY_FACTOR = 10.0 controls world-space cell size.
   *
   * IMPORTANT: entity.y includes baseHeight offset (nominalHeight/2).
   * For VEHICLE category, nominalHeight=3, so baseHeight=1.5.
   * entity.y = terrainHeight + baseHeight.
   */

  // VEHICLE baseHeight = nominalHeight/2 = 3/2 = 1.5
  const VEHICLE_BASE_HEIGHT = 1.5;

  /**
   * Create a heightmap with varying elevation using gentle slopes.
   * Grid size 64x64, with a gradual ramp across columns.
   *
   * Navigation grid marks cells as cliffs when height delta > 25 world units
   * (CLIFF_HEIGHT_DELTA). MAP_HEIGHT_SCALE = 0.625, so max raw delta per cell
   * is 25/0.625 = 40. We use a delta of 32 raw units per cell (20 world units)
   * to stay safely under the cliff threshold.
   *
   * Layout (all rows identical):
   *   cols 0-9:   raw 0   (world height 0)
   *   col 10:     raw 32  (world height 20)
   *   col 11:     raw 64  (world height 40)
   *   col 12:     raw 96  (world height 60)
   *   cols 13-20: raw 128 (world height 80) — plateau
   *   col 21:     raw 96  (world height 60)
   *   col 22:     raw 64  (world height 40)
   *   col 23:     raw 32  (world height 20)
   *   cols 24+:   raw 0   (world height 0)
   */
  function buildHillyData(width: number, height: number): Uint8Array {
    const data = new Uint8Array(width * height);
    data.fill(0);

    for (let row = 0; row < height; row++) {
      // Rising ramp
      data[row * width + 10] = 32;
      data[row * width + 11] = 64;
      data[row * width + 12] = 96;
      // Plateau
      for (let col = 13; col <= 20; col++) {
        data[row * width + col] = 128;
      }
      // Descending ramp
      data[row * width + 21] = 96;
      data[row * width + 22] = 64;
      data[row * width + 23] = 32;
    }

    return data;
  }

  const HILLY_WIDTH = 64;
  const HILLY_HEIGHT = 64;

  function makeHillyHeightmap(): HeightmapGrid {
    const data = buildHillyData(HILLY_WIDTH, HILLY_HEIGHT);
    return HeightmapGrid.fromJSON({
      width: HILLY_WIDTH,
      height: HILLY_HEIGHT,
      borderSize: 0,
      data: uint8ArrayToBase64(data),
    });
  }

  function makeHillyMap(objects: ReturnType<typeof makeMapObject>[]): ReturnType<typeof makeMap> {
    const data = buildHillyData(HILLY_WIDTH, HILLY_HEIGHT);
    return {
      heightmap: {
        width: HILLY_WIDTH,
        height: HILLY_HEIGHT,
        borderSize: 0,
        data: uint8ArrayToBase64(data),
      },
      objects,
      triggers: [],
      textureClasses: [],
      blendTileCount: 0,
    };
  }

  function makeTerrainBundle() {
    return makeBundle({
      objects: [
        makeObjectDef('GroundUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('LocomotorSet', 'SET_NORMAL VehicleLoco', {}),
        ]),
      ],
      locomotors: [
        makeLocomotorDef('VehicleLoco', 30),
      ],
    });
  }

  it('unit on flat terrain has y position matching terrain height (0)', () => {
    const bundle = makeTerrainBundle();
    const logic = new GameLogicSubsystem(new THREE.Scene());

    // Place unit at (50, 200) — on flat terrain (col=5, row=20, raw height 0).
    const heightmap = makeHillyHeightmap();
    const map = makeHillyMap([makeMapObject('GroundUnit', 50, 200)]);
    logic.loadMapObjects(map, makeRegistry(bundle), heightmap);

    // Step a few frames so the entity snaps to terrain.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const state = logic.getEntityState(1);
    expect(state).toBeDefined();

    // Flat terrain at (50, 200) has raw height 0 => world height 0.
    // Entity y = terrainHeight + baseHeight = 0 + 1.5 = 1.5
    expect(state!.y).toBeCloseTo(VEHICLE_BASE_HEIGHT, 0);
  });

  it('unit on elevated terrain has y matching heightmap elevation', () => {
    const bundle = makeTerrainBundle();
    const logic = new GameLogicSubsystem(new THREE.Scene());

    // Place unit at (160, 200) — on the plateau (col=16, row=20, raw height 128).
    // World height = 128 * 0.625 = 80.0
    const heightmap = makeHillyHeightmap();
    const map = makeHillyMap([makeMapObject('GroundUnit', 160, 200)]);
    logic.loadMapObjects(map, makeRegistry(bundle), heightmap);

    // Step frames for terrain snap to converge.
    // terrainSnapSpeed=6, dt=1/30, snapAlpha = 1 - exp(-6/30) = ~0.181
    // After many frames the exponential smoothing converges.
    for (let i = 0; i < 60; i++) logic.update(1 / 30);

    const state = logic.getEntityState(1);
    expect(state).toBeDefined();

    // Terrain height at (160, 200) is 80.0.
    // Entity y = terrainHeight + baseHeight = 80.0 + 1.5 = 81.5
    // After 60 frames of exponential snap, entity.y should be very close to 81.5.
    expect(state!.y).toBeGreaterThan(70);
    expect(state!.y).toBeCloseTo(80 + VEHICLE_BASE_HEIGHT, 0);
  });

  it('unit y updates to match new terrain height after moving to higher ground', () => {
    const bundle = makeTerrainBundle();
    const logic = new GameLogicSubsystem(new THREE.Scene());

    // Place unit at (50, 200) — flat terrain (col=5, height 0).
    const heightmap = makeHillyHeightmap();
    const map = makeHillyMap([makeMapObject('GroundUnit', 50, 200)]);
    logic.loadMapObjects(map, makeRegistry(bundle), heightmap);
    logic.setPlayerSide(0, 'America');

    // Let unit settle on flat terrain.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const initialState = logic.getEntityState(1);
    expect(initialState).toBeDefined();
    // Entity y = terrainHeight + baseHeight = 0 + 1.5
    expect(initialState!.y).toBeCloseTo(VEHICLE_BASE_HEIGHT, 0);

    // Command unit to move to the plateau at (160, 200).
    // Col 16, raw height 128 => world height 80.
    // The ramp from col 10-12 transitions gradually, staying under cliff threshold.
    logic.submitCommand({
      type: 'moveTo',
      entityId: 1,
      targetX: 160,
      targetZ: 200,
    });

    // Step enough frames for the unit to reach the plateau.
    // Distance ~110 units, speed=30 => ~3.7 seconds => ~110 frames.
    // Allow extra frames for acceleration and terrain snap convergence.
    for (let i = 0; i < 200; i++) logic.update(1 / 30);

    const movedState = logic.getEntityState(1);
    expect(movedState).toBeDefined();

    // Verify unit reached approximately the target position.
    const distToTarget = Math.hypot(movedState!.x - 160, movedState!.z - 200);
    expect(distToTarget).toBeLessThan(30);

    // The unit's y should now reflect the elevated terrain height + baseHeight.
    // On the plateau (terrain height 80), y should be ~81.5.
    const terrainHeightAtUnit = heightmap.getInterpolatedHeight(movedState!.x, movedState!.z);
    const expectedY = terrainHeightAtUnit + VEHICLE_BASE_HEIGHT;
    // Entity y should be close to terrainHeight + baseHeight at its current XZ.
    expect(movedState!.y).toBeGreaterThan(expectedY * 0.7);
    expect(Math.abs(movedState!.y - expectedY)).toBeLessThan(15);
  });

  it('y tracks terrain continuously across flat-to-hill transition', () => {
    const bundle = makeTerrainBundle();
    const logic = new GameLogicSubsystem(new THREE.Scene());

    // Place unit at (50, 200) — flat terrain at col=5, row=20.
    // The unit will move in +X direction, crossing the ramp (cols 10-12)
    // onto the plateau (cols 13-20), then down the ramp (cols 21-23),
    // and back to flat terrain (cols 24+).
    const heightmap = makeHillyHeightmap();
    const map = makeHillyMap([makeMapObject('GroundUnit', 50, 200)]);
    logic.loadMapObjects(map, makeRegistry(bundle), heightmap);
    logic.setPlayerSide(0, 'America');

    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Command unit to move across the map through the hill region.
    // Moving from X=50 (flat, col=5) to X=300 (flat, col=30), crossing
    // through the plateau at cols 13-20 (worldX 130-200, terrain height 80).
    logic.submitCommand({
      type: 'moveTo',
      entityId: 1,
      targetX: 300,
      targetZ: 200,
    });

    // Sample the unit's y at intervals as it moves.
    // Track that y increases when crossing onto elevated terrain.
    let sawElevatedY = false;
    let sawFlatY = false;

    for (let i = 0; i < 500; i++) {
      logic.update(1 / 30);

      const state = logic.getEntityState(1);
      if (!state) continue;

      const terrainH = heightmap.getInterpolatedHeight(state.x, state.z);

      if (terrainH > 30) {
        // Unit is over elevated terrain — y should be elevated too.
        // Entity y = terrainHeight + baseHeight, so y > 30 is expected.
        if (state.y > 30) {
          sawElevatedY = true;
        }
      }
      if (terrainH < 5 && state.y < 10) {
        sawFlatY = true;
      }
    }

    // The unit must have been observed at both flat and elevated y positions
    // as it traversed the terrain, proving continuous height tracking.
    expect(sawFlatY).toBe(true);
    expect(sawElevatedY).toBe(true);
  });
});
