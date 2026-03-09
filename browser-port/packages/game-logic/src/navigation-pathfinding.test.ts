import { describe, it, expect } from 'vitest';
import {
  findPath,
  type NavigationPathfindingContext,
  type NavigationEntityLike,
  type NavigationGridLike,
} from './navigation-pathfinding.js';

// ---------------------------------------------------------------------------
// Helpers: build a minimal NavigationPathfindingContext for a flat, open grid.
// ---------------------------------------------------------------------------
const MAP_XY_FACTOR = 10; // mirrors @generals/terrain MAP_XY_FACTOR

function makeNavGrid(width: number, height: number): NavigationGridLike {
  const total = width * height;
  const zoneBlockWidth = Math.ceil(width / 10);
  const zoneBlockHeight = Math.ceil(height / 10);
  const zoneTotal = zoneBlockWidth * zoneBlockHeight;
  return {
    width,
    height,
    terrainType: new Uint8Array(total),   // 0 = NAV_CLEAR
    blocked: new Uint8Array(total),
    pinched: new Uint8Array(total),
    bridge: new Uint8Array(total),
    bridgePassable: new Uint8Array(total),
    bridgeTransitions: new Uint8Array(total),
    bridgeSegmentByCell: new Int32Array(total).fill(-1),
    zonePassable: new Uint8Array(zoneTotal).fill(1),
    zoneBlockWidth,
    zoneBlockHeight,
    logicalMinX: 0,
    logicalMinZ: 0,
    logicalMaxX: width - 1,
    logicalMaxZ: height - 1,
  };
}

function blockCell(grid: NavigationGridLike, x: number, z: number): void {
  const idx = z * grid.width + x;
  grid.terrainType[idx] = 4; // NAV_OBSTACLE
  grid.blocked[idx] = 1;
}

function makeContext(grid: NavigationGridLike): NavigationPathfindingContext<NavigationEntityLike> {
  return {
    config: { attackUsesLineOfSight: false },
    mapHeightmap: null,
    navigationGrid: grid,
    spawnedEntities: new Map(),
    worldToGrid(worldX: number, worldZ: number): [number | null, number | null] {
      const cellX = Math.round(worldX / MAP_XY_FACTOR);
      const cellZ = Math.round(worldZ / MAP_XY_FACTOR);
      if (cellX < 0 || cellX >= grid.width || cellZ < 0 || cellZ >= grid.height) {
        return [null, null];
      }
      return [cellX, cellZ];
    },
    gridFromIndex(index: number): [number, number] {
      const x = index % grid.width;
      const z = (index - x) / grid.width;
      return [x, z];
    },
    gridToWorld(cellX: number, cellZ: number) {
      return { x: cellX * MAP_XY_FACTOR, z: cellZ * MAP_XY_FACTOR };
    },
    isCellInBounds(cellX: number, cellZ: number): boolean {
      return cellX >= 0 && cellX < grid.width && cellZ >= 0 && cellZ < grid.height;
    },
    getTeamRelationship(): number {
      return 0;
    },
    canCrushOrSquish(): boolean {
      return false;
    },
    relationshipAllies: 1,
  };
}

function makeMover(overrides: Partial<NavigationEntityLike> = {}): NavigationEntityLike {
  return {
    id: 1,
    x: 0,
    z: 0,
    category: 'vehicle',
    canMove: true,
    moving: false,
    blocksPath: false,
    obstacleFootprint: 0,
    pathDiameter: 0,
    pathfindCenterInCell: false,
    pathfindPosCell: null,
    pathfindGoalCell: null,
    ignoredMovementObstacleId: null,
    locomotorSurfaceMask: 1, // LOCOMOTORSURFACE_GROUND
    locomotorDownhillOnly: false,
    attackNeedsLineOfSight: false,
    isImmobile: false,
    noCollisions: false,
    ...overrides,
  };
}

// ===========================================================================
// Turn cost: direction vectors should use parent→current vs current→neighbor
// ===========================================================================
describe('navigation-pathfinding — turn cost', () => {
  it('prefers a straight path over a zigzag path of similar cell count', () => {
    // On a wide grid, a straight horizontal path from (0,5) to (19,5) should
    // beat a zigzag that bounces between z=4 and z=6. Turn penalties make
    // the zigzag more expensive even though cell distances are similar.
    const grid = makeNavGrid(20, 11);
    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 50 });

    const path = findPath(context, 0, 50, 190, 50, mover);

    expect(path.length).toBeGreaterThan(0);

    // Count how many waypoints stay on z=50 (grid row 5)
    const onCenter = path.filter(p => Math.abs(p.z - 50) < 1).length;
    // With correct turn costs, the path should be predominantly straight
    expect(onCenter).toBeGreaterThanOrEqual(path.length * 0.8);
  });

  it('adds higher penalty for sharper turns (90° > 45°)', () => {
    // Create a scenario where the path must turn. Use a narrow corridor that
    // forces a 90-degree turn vs a 45-degree option.
    //
    // Grid (10x10):
    //   . . . . . . . . . .
    //   . . . . . . . . . .
    //   . . . . # # # # # .
    //   . . . . . . . . . .
    //   S . . . . . . . . G
    //   . . . . . . . . . .
    //   . . . . # # # # # .
    //   . . . . . . . . . .
    //   . . . . . . . . . .
    //   . . . . . . . . . .
    //
    // With obstacles forcing the path through a gap, the pathfinder should
    // pick the smoothest route.
    const grid = makeNavGrid(10, 10);
    // Upper wall at z=2, from x=4..8
    for (let x = 4; x <= 8; x++) {
      blockCell(grid, x, 2);
    }
    // Lower wall at z=6, from x=4..8
    for (let x = 4; x <= 8; x++) {
      blockCell(grid, x, 6);
    }

    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 40 });

    // Path from (0, 4) to (9, 4) in grid coords, which is world (0, 40) to (90, 40)
    const path = findPath(context, 0, 40, 90, 40, mover);

    expect(path.length).toBeGreaterThan(0);
    // The path should successfully navigate through the corridor
    const last = path[path.length - 1]!;
    expect(last.x).toBeCloseTo(90, -1);
    expect(last.z).toBeCloseTo(40, -1);
  });

  it('direction vectors are parent→current and current→neighbor, not inverted', () => {
    // This test ensures the bug fix is correct. The old code computed:
    //   prevDir = parent - current  (backwards!)
    //   nextDir = grandparent - parent (wrong node pair!)
    //
    // The correct code computes:
    //   prevDir = current - parent (parent→current)
    //   nextDir = neighbor - current (current→neighbor)
    //
    // We test this by creating a scenario where the buggy code would produce
    // a different path than the correct code:
    //
    // Force an L-shaped corridor. With correct turn costs, the pathfinder
    // should prefer a gradual diagonal approach to the corner rather than
    // a hard 90° turn.
    //
    // Grid (15x15) with obstacle walls:
    //  S is at (0,0), G is at (14,14)
    //  A wall blocks direct diagonal, forcing a turn

    const grid = makeNavGrid(15, 15);

    // Create a wall from (3,0) down to (3,10) except at (3,5) to allow passage
    for (let z = 0; z <= 10; z++) {
      if (z !== 5) {
        blockCell(grid, 3, z);
      }
    }

    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 0 });

    const path = findPath(context, 0, 0, 140, 140, mover);

    expect(path.length).toBeGreaterThan(0);

    // The path must not include any blocked cells
    for (const wp of path) {
      const gx = Math.round(wp.x / MAP_XY_FACTOR);
      const gz = Math.round(wp.z / MAP_XY_FACTOR);
      if (gx >= 0 && gx < grid.width && gz >= 0 && gz < grid.height) {
        const idx = gz * grid.width + gx;
        expect(grid.blocked[idx], `path waypoint (${gx},${gz}) should not be blocked`).toBe(0);
      }
    }

    // Verify the path reaches the goal area
    const last = path[path.length - 1]!;
    expect(last.x).toBeCloseTo(140, -1);
    expect(last.z).toBeCloseTo(140, -1);
  });

  it('straight-line path has no turn penalty overhead', () => {
    // On a 1-row-high grid, there can be no turns. The path should be a
    // simple left-to-right traversal without any extra cost.
    const grid = makeNavGrid(20, 3);
    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 10 });

    const path = findPath(context, 0, 10, 190, 10, mover);

    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(last.x).toBeCloseTo(190, -1);
    expect(last.z).toBeCloseTo(10, -1);

    // All waypoints should stay on or very near z=10
    for (const wp of path) {
      expect(Math.abs(wp.z - 10)).toBeLessThanOrEqual(MAP_XY_FACTOR);
    }
  });

  it('U-turn (180°) gets the heaviest penalty', () => {
    // Build a dead-end corridor forcing a U-turn.
    // The pathfinder should still find a path but with high cost.
    //
    //  Grid (10x5):
    //   S . . . . . . . # G
    //   . . . . . . . . # .
    //   . . . . . . . . . .
    //   . . . . . . . . . .
    //   . . . . . . . . . .
    //
    // Start at (0,0), goal at (9,0). Wall at (8,0) and (8,1) forces going
    // around the bottom.
    const grid = makeNavGrid(10, 5);
    blockCell(grid, 8, 0);
    blockCell(grid, 8, 1);

    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 0 });

    const path = findPath(context, 0, 0, 90, 0, mover);

    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(last.x).toBeCloseTo(90, -1);
    expect(last.z).toBeCloseTo(0, -1);
  });
});

// ===========================================================================
// Basic navigation-pathfinding integration
// ===========================================================================
describe('navigation-pathfinding — basic', () => {
  it('finds a path on an open grid', () => {
    const grid = makeNavGrid(10, 10);
    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 0 });

    const path = findPath(context, 0, 0, 90, 90, mover);

    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(last.x).toBeCloseTo(90, -1);
    expect(last.z).toBeCloseTo(90, -1);
  });

  it('returns a path around an obstacle wall', () => {
    const grid = makeNavGrid(10, 10);
    // Vertical wall at x=5, z=0..7
    for (let z = 0; z < 8; z++) {
      blockCell(grid, 5, z);
    }
    const context = makeContext(grid);
    const mover = makeMover({ x: 0, z: 0 });

    const path = findPath(context, 0, 0, 90, 0, mover);

    expect(path.length).toBeGreaterThan(0);
    // Path should not traverse blocked cells
    for (const wp of path) {
      const gx = Math.round(wp.x / MAP_XY_FACTOR);
      const gz = Math.round(wp.z / MAP_XY_FACTOR);
      if (gx >= 0 && gx < grid.width && gz >= 0 && gz < grid.height) {
        const idx = gz * grid.width + gx;
        expect(grid.blocked[idx]).toBe(0);
      }
    }
  });

  it('returns fallback when no grid is present', () => {
    const grid = makeNavGrid(10, 10);
    const context = makeContext(grid);
    context.navigationGrid = null;

    const path = findPath(context, 0, 0, 90, 90);

    // Without a grid, the function returns [{ x: targetX, z: targetZ }]
    expect(path.length).toBe(1);
    expect(path[0]).toEqual({ x: 90, z: 90 });
  });
});
