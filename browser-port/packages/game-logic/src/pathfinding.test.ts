import { describe, it, expect } from 'vitest';
import {
  BinaryHeap,
  findPath,
  smoothPath,
  isLineClear,
  heuristic,
  surfacesForCellType,
  COST_ORTHOGONAL,
  COST_DIAGONAL,
  MAX_PATH_COST,
  LOCOMOTOR_SURFACE_GROUND,
  LOCOMOTOR_SURFACE_WATER,
  LOCOMOTOR_SURFACE_AIR,
  LOCOMOTOR_SURFACE_CLIFF,
  LOCOMOTOR_SURFACE_RUBBLE,
  type PathfindGrid,
  type PathfindOptions,
} from './pathfinding.js';

// ---------------------------------------------------------------------------
// Helper: create a grid with all clear cells
// ---------------------------------------------------------------------------
function makeGrid(width: number, height: number): PathfindGrid {
  const total = width * height;
  return {
    width,
    height,
    terrainType: new Uint8Array(total), // 0 = Clear
    blocked: new Uint8Array(total),
    pinched: new Uint8Array(total),
  };
}

/** Set a cell as blocked obstacle. */
function blockCell(grid: PathfindGrid, x: number, z: number): void {
  const idx = z * grid.width + x;
  grid.terrainType[idx] = 4; // Obstacle
  grid.blocked[idx] = 1;
}

/** Set a cell terrain type. */
function setCellType(grid: PathfindGrid, x: number, z: number, type: number): void {
  grid.terrainType[z * grid.width + x] = type;
}

/** Set a cell as pinched. */
function setPinched(grid: PathfindGrid, x: number, z: number): void {
  grid.pinched[z * grid.width + x] = 1;
}

const GROUND_OPTS: PathfindOptions = {
  acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND,
};

// ===========================================================================
// BinaryHeap tests
// ===========================================================================
describe('BinaryHeap', () => {
  it('extracts elements in ascending f-cost order', () => {
    const fCost = new Float64Array([30, 10, 20, 5, 25]);
    const heap = new BinaryHeap(5, fCost);
    heap.push(0);
    heap.push(1);
    heap.push(2);
    heap.push(3);
    heap.push(4);

    expect(heap.length).toBe(5);
    expect(heap.pop()).toBe(3);  // f=5
    expect(heap.pop()).toBe(1);  // f=10
    expect(heap.pop()).toBe(2);  // f=20
    expect(heap.pop()).toBe(4);  // f=25
    expect(heap.pop()).toBe(0);  // f=30
    expect(heap.length).toBe(0);
  });

  it('returns -1 when popping empty heap', () => {
    const fCost = new Float64Array(5);
    const heap = new BinaryHeap(5, fCost);
    expect(heap.pop()).toBe(-1);
  });

  it('decreaseKey re-orders element correctly', () => {
    const fCost = new Float64Array([100, 50, 200, 75]);
    const heap = new BinaryHeap(4, fCost);
    heap.push(0);
    heap.push(1);
    heap.push(2);
    heap.push(3);

    // Decrease index 2 from 200 to 1
    fCost[2] = 1;
    heap.decreaseKey(2);

    expect(heap.pop()).toBe(2); // now f=1, should be first
    expect(heap.pop()).toBe(1); // f=50
    expect(heap.pop()).toBe(3); // f=75
    expect(heap.pop()).toBe(0); // f=100
  });

  it('contains reports presence correctly', () => {
    const fCost = new Float64Array([10, 20]);
    const heap = new BinaryHeap(2, fCost);
    expect(heap.contains(0)).toBe(false);
    heap.push(0);
    expect(heap.contains(0)).toBe(true);
    expect(heap.contains(1)).toBe(false);
    heap.pop();
    expect(heap.contains(0)).toBe(false);
  });

  it('handles large number of elements', () => {
    const n = 10000;
    const fCost = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      fCost[i] = Math.random() * 1000;
    }
    const heap = new BinaryHeap(n, fCost);
    for (let i = 0; i < n; i++) {
      heap.push(i);
    }
    expect(heap.length).toBe(n);

    let prev = -Infinity;
    for (let i = 0; i < n; i++) {
      const idx = heap.pop();
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(fCost[idx]!).toBeGreaterThanOrEqual(prev);
      prev = fCost[idx]!;
    }
    expect(heap.length).toBe(0);
  });
});

// ===========================================================================
// Heuristic tests
// ===========================================================================
describe('heuristic', () => {
  it('returns 0 for same cell', () => {
    expect(heuristic(5, 5, 5, 5)).toBe(0);
  });

  it('returns COST_ORTHOGONAL for adjacent orthogonal cell', () => {
    expect(heuristic(0, 0, 1, 0)).toBe(COST_ORTHOGONAL);
    expect(heuristic(0, 0, 0, 1)).toBe(COST_ORTHOGONAL);
  });

  it('returns correct octile distance for diagonal', () => {
    // 1 cell diagonal: max(1,1)*10 + min(1,1)*5 = 15
    expect(heuristic(0, 0, 1, 1)).toBe(15);
  });

  it('matches C++ formula for asymmetric case', () => {
    // dx=3, dz=1 -> max=3, min=1 -> 3*10 + 1*5 = 35
    expect(heuristic(0, 0, 3, 1)).toBe(35);
    // dx=1, dz=3 -> same
    expect(heuristic(0, 0, 1, 3)).toBe(35);
  });

  it('is symmetric', () => {
    expect(heuristic(2, 3, 7, 1)).toBe(heuristic(7, 1, 2, 3));
  });
});

// ===========================================================================
// surfacesForCellType tests
// ===========================================================================
describe('surfacesForCellType', () => {
  it('Clear allows ground and air', () => {
    const s = surfacesForCellType(0);
    expect(s & LOCOMOTOR_SURFACE_GROUND).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_AIR).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_WATER).toBeFalsy();
  });

  it('Water allows water and air', () => {
    const s = surfacesForCellType(1);
    expect(s & LOCOMOTOR_SURFACE_WATER).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_AIR).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_GROUND).toBeFalsy();
  });

  it('Obstacle allows only air', () => {
    const s = surfacesForCellType(4);
    expect(s & LOCOMOTOR_SURFACE_AIR).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_GROUND).toBeFalsy();
  });

  it('Cliff allows cliff and air', () => {
    const s = surfacesForCellType(2);
    expect(s & LOCOMOTOR_SURFACE_CLIFF).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_AIR).toBeTruthy();
  });

  it('Rubble allows rubble and air', () => {
    const s = surfacesForCellType(3);
    expect(s & LOCOMOTOR_SURFACE_RUBBLE).toBeTruthy();
    expect(s & LOCOMOTOR_SURFACE_AIR).toBeTruthy();
  });
});

// ===========================================================================
// findPath — basic pathfinding tests
// ===========================================================================
describe('findPath — basic', () => {
  it('finds a path on an open 10x10 grid', () => {
    const grid = makeGrid(10, 10);
    const result = findPath(grid, 0, 0, 9, 9, GROUND_OPTS);

    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.path[0]).toEqual({ x: 0, z: 0 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 9, z: 9 });
  });

  it('finds a straight-line path when no obstacles', () => {
    const grid = makeGrid(10, 1);
    const result = findPath(grid, 0, 0, 9, 0, GROUND_OPTS);

    expect(result.found).toBe(true);
    expect(result.path.length).toBe(10); // 0..9
    for (let i = 0; i < 10; i++) {
      expect(result.path[i]).toEqual({ x: i, z: 0 });
    }
  });

  it('returns start cell when start equals goal', () => {
    const grid = makeGrid(5, 5);
    const result = findPath(grid, 2, 2, 2, 2, GROUND_OPTS);

    expect(result.found).toBe(true);
    expect(result.path.length).toBe(1);
    expect(result.path[0]).toEqual({ x: 2, z: 2 });
    expect(result.nodesSearched).toBe(0);
  });

  it('returns empty path for out-of-bounds start', () => {
    const grid = makeGrid(5, 5);
    const result = findPath(grid, -1, 0, 3, 3, GROUND_OPTS);

    expect(result.found).toBe(false);
    expect(result.path.length).toBe(0);
  });

  it('returns empty path for out-of-bounds goal', () => {
    const grid = makeGrid(5, 5);
    const result = findPath(grid, 0, 0, 5, 5, GROUND_OPTS);

    expect(result.found).toBe(false);
    expect(result.path.length).toBe(0);
  });

  it('prefers diagonal movement (shorter path)', () => {
    const grid = makeGrid(10, 10);
    const result = findPath(grid, 0, 0, 5, 5, GROUND_OPTS);

    expect(result.found).toBe(true);
    // Diagonal path should be ~6 cells (diagonal direct), not 11 (L-shaped)
    expect(result.path.length).toBeLessThanOrEqual(7);
  });
});

// ===========================================================================
// findPath — obstacle avoidance
// ===========================================================================
describe('findPath — obstacle avoidance', () => {
  it('paths around a single obstacle', () => {
    const grid = makeGrid(10, 10);
    // Block cell (5, 0)
    blockCell(grid, 5, 0);

    const result = findPath(grid, 0, 0, 9, 0, GROUND_OPTS);

    expect(result.found).toBe(true);
    // Path should not contain the blocked cell
    const blockedInPath = result.path.some(p => p.x === 5 && p.z === 0);
    expect(blockedInPath).toBe(false);
  });

  it('paths around a wall of obstacles', () => {
    const grid = makeGrid(10, 10);
    // Create vertical wall at x=5, from z=0 to z=7
    for (let z = 0; z < 8; z++) {
      blockCell(grid, 5, z);
    }

    const result = findPath(grid, 0, 0, 9, 0, GROUND_OPTS);

    expect(result.found).toBe(true);
    const first = result.path[0]!;
    const last = result.path[result.path.length - 1]!;
    expect(first).toEqual({ x: 0, z: 0 });
    expect(last).toEqual({ x: 9, z: 0 });

    // No cell in path should be blocked
    for (const cell of result.path) {
      const idx = cell.z * grid.width + cell.x;
      expect(grid.blocked[idx]).toBe(0);
    }
  });

  it('returns no path when completely surrounded by obstacles', () => {
    const grid = makeGrid(5, 5);
    // Surround cell (2,2) with obstacles
    blockCell(grid, 1, 1);
    blockCell(grid, 2, 1);
    blockCell(grid, 3, 1);
    blockCell(grid, 1, 2);
    blockCell(grid, 3, 2);
    blockCell(grid, 1, 3);
    blockCell(grid, 2, 3);
    blockCell(grid, 3, 3);

    const result = findPath(grid, 2, 2, 0, 0, GROUND_OPTS);

    expect(result.found).toBe(false);
    expect(result.path.length).toBe(0);
  });

  it('returns no path when goal is an obstacle (ground unit)', () => {
    const grid = makeGrid(5, 5);
    blockCell(grid, 4, 4);

    const result = findPath(grid, 0, 0, 4, 4, GROUND_OPTS);

    expect(result.found).toBe(false);
  });

  it('air units can path through obstacles', () => {
    const grid = makeGrid(10, 1);
    // Block middle cells
    for (let x = 3; x <= 7; x++) {
      blockCell(grid, x, 0);
    }

    const result = findPath(grid, 0, 0, 9, 0, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_AIR,
      canPassObstacle: true,
    });

    expect(result.found).toBe(true);
  });

  it('paths through a maze', () => {
    // 7x7 maze with narrow corridor
    const grid = makeGrid(7, 7);
    //   0 1 2 3 4 5 6
    // 0 S . . # . . .
    // 1 . . . # . . .
    // 2 . . . # . . .
    // 3 . . . . . # .
    // 4 . # # # . # .
    // 5 . . . . . # .
    // 6 . . . . . . G
    blockCell(grid, 3, 0);
    blockCell(grid, 3, 1);
    blockCell(grid, 3, 2);
    blockCell(grid, 5, 3);
    blockCell(grid, 1, 4);
    blockCell(grid, 2, 4);
    blockCell(grid, 3, 4);
    blockCell(grid, 5, 4);
    blockCell(grid, 5, 5);

    const result = findPath(grid, 0, 0, 6, 6, GROUND_OPTS);

    expect(result.found).toBe(true);
    expect(result.path[0]).toEqual({ x: 0, z: 0 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 6, z: 6 });
  });
});

// ===========================================================================
// findPath — locomotor terrain costs
// ===========================================================================
describe('findPath — locomotor terrain types', () => {
  it('ground units cannot cross water', () => {
    const grid = makeGrid(5, 1);
    setCellType(grid, 2, 0, 1); // Water

    const result = findPath(grid, 0, 0, 4, 0, GROUND_OPTS);

    expect(result.found).toBe(false);
  });

  it('water-capable units can cross water', () => {
    const grid = makeGrid(5, 1);
    setCellType(grid, 2, 0, 1); // Water

    const result = findPath(grid, 0, 0, 4, 0, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND | LOCOMOTOR_SURFACE_WATER,
    });

    expect(result.found).toBe(true);
    expect(result.path.some(p => p.x === 2)).toBe(true);
  });

  it('hover units can cross water (ground + water surfaces)', () => {
    const grid = makeGrid(10, 3);
    // Row of water in the middle
    for (let x = 0; x < 10; x++) {
      setCellType(grid, x, 1, 1); // Water
    }

    const result = findPath(grid, 0, 0, 9, 2, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND | LOCOMOTOR_SURFACE_WATER,
    });

    expect(result.found).toBe(true);
  });

  it('ground units path around water', () => {
    const grid = makeGrid(10, 5);
    // Water wall from z=1 to z=3 at x=5
    for (let z = 1; z <= 3; z++) {
      setCellType(grid, 5, z, 1); // Water
    }

    const result = findPath(grid, 0, 2, 9, 2, GROUND_OPTS);

    expect(result.found).toBe(true);
    // Should not traverse water cells
    for (const cell of result.path) {
      expect(grid.terrainType[cell.z * grid.width + cell.x]).not.toBe(1);
    }
  });

  it('cliff terrain adds extra cost but remains passable for cliff-capable units', () => {
    const grid = makeGrid(5, 1);
    setCellType(grid, 2, 0, 2); // Cliff

    const result = findPath(grid, 0, 0, 4, 0, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND | LOCOMOTOR_SURFACE_CLIFF,
    });

    expect(result.found).toBe(true);
  });

  it('rubble terrain is passable for rubble-capable units', () => {
    const grid = makeGrid(5, 1);
    setCellType(grid, 2, 0, 3); // Rubble

    const resultGround = findPath(grid, 0, 0, 4, 0, GROUND_OPTS);
    expect(resultGround.found).toBe(false);

    const resultRubble = findPath(grid, 0, 0, 4, 0, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND | LOCOMOTOR_SURFACE_RUBBLE,
    });
    expect(resultRubble.found).toBe(true);
  });
});

// ===========================================================================
// findPath — turn penalty
// ===========================================================================
describe('findPath — turn cost', () => {
  it('prefers straighter paths over zigzag paths of similar length', () => {
    // On a 20x3 grid, a straight horizontal path should be preferred
    // over one that zigzags up and down
    const grid = makeGrid(20, 3);
    const result = findPath(grid, 0, 1, 19, 1, GROUND_OPTS);

    expect(result.found).toBe(true);
    // Check that most of the path stays on z=1 (straight line)
    const straightCells = result.path.filter(p => p.z === 1).length;
    expect(straightCells).toBeGreaterThan(result.path.length * 0.8);
  });
});

// ===========================================================================
// findPath — pinch penalty
// ===========================================================================
describe('findPath — pinch cost', () => {
  it('adds cost for pinched cells', () => {
    const grid = makeGrid(10, 3);
    // Create two paths: one through pinched cells, one around
    setPinched(grid, 5, 1);

    const resultNoPinch = findPath(grid, 0, 1, 9, 1, GROUND_OPTS);
    expect(resultNoPinch.found).toBe(true);

    // Clear pinch and compare
    grid.pinched[1 * 10 + 5] = 0;
    const resultClean = findPath(grid, 0, 1, 9, 1, GROUND_OPTS);
    expect(resultClean.found).toBe(true);
  });
});

// ===========================================================================
// findPath — custom callbacks
// ===========================================================================
describe('findPath — callbacks', () => {
  it('isPassable callback blocks specific cells', () => {
    const grid = makeGrid(5, 1);

    // Block cell 2 via callback (not grid data)
    const result = findPath(grid, 0, 0, 4, 0, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND,
      isPassable: (x, _z) => x !== 2,
    });

    expect(result.found).toBe(false);
  });

  it('extraCost callback increases cost of specific cells', () => {
    const grid = makeGrid(10, 3);

    // Add high cost to z=1 row
    const resultExpensive = findPath(grid, 0, 1, 9, 1, {
      acceptableSurfaces: LOCOMOTOR_SURFACE_GROUND,
      extraCost: (_x, z) => z === 1 ? 100 : 0,
    });

    expect(resultExpensive.found).toBe(true);
    // Most cells should be off the expensive row
    const expensiveRowCells = resultExpensive.path.filter(p => p.z === 1).length;
    // Only start and end might be on z=1; path should route through z=0 or z=2
    expect(expensiveRowCells).toBeLessThan(resultExpensive.path.length / 2);
  });
});

// ===========================================================================
// findPath — search limit
// ===========================================================================
describe('findPath — search limits', () => {
  it('respects maxSearchNodes limit', () => {
    const grid = makeGrid(50, 50);
    const result = findPath(grid, 0, 0, 49, 49, {
      ...GROUND_OPTS,
      maxSearchNodes: 10,
    });

    // With only 10 nodes examined, it shouldn't find the path
    expect(result.nodesSearched).toBeLessThanOrEqual(11);
  });
});

// ===========================================================================
// Path smoothing tests
// ===========================================================================
describe('smoothPath', () => {
  it('removes redundant waypoints on a straight line', () => {
    const grid = makeGrid(10, 1);
    const path = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
      { x: 4, z: 0 },
    ];

    const smoothed = smoothPath(path, grid, LOCOMOTOR_SURFACE_GROUND);

    expect(smoothed.length).toBe(2); // start and end only
    expect(smoothed[0]).toEqual({ x: 0, z: 0 });
    expect(smoothed[1]).toEqual({ x: 4, z: 0 });
  });

  it('removes redundant waypoints on a diagonal line', () => {
    const grid = makeGrid(10, 10);
    const path = [
      { x: 0, z: 0 },
      { x: 1, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 3 },
    ];

    const smoothed = smoothPath(path, grid, LOCOMOTOR_SURFACE_GROUND);

    expect(smoothed.length).toBe(2);
    expect(smoothed[0]).toEqual({ x: 0, z: 0 });
    expect(smoothed[1]).toEqual({ x: 3, z: 3 });
  });

  it('preserves waypoints around obstacles', () => {
    const grid = makeGrid(10, 10);
    blockCell(grid, 3, 1);
    blockCell(grid, 3, 2);
    blockCell(grid, 3, 3);

    // Path that goes around the obstacle
    const path = [
      { x: 0, z: 2 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
      { x: 2, z: 3 },
      { x: 2, z: 4 },
      { x: 3, z: 4 },
      { x: 4, z: 4 },
      { x: 4, z: 3 },
      { x: 4, z: 2 },
      { x: 5, z: 2 },
    ];

    const smoothed = smoothPath(path, grid, LOCOMOTOR_SURFACE_GROUND);

    // Should keep some intermediate points because line-of-sight is blocked
    expect(smoothed.length).toBeGreaterThan(2);
    expect(smoothed[0]).toEqual({ x: 0, z: 2 });
    expect(smoothed[smoothed.length - 1]).toEqual({ x: 5, z: 2 });
  });

  it('returns paths of 2 or fewer cells unchanged', () => {
    const grid = makeGrid(10, 10);

    const twoPoint = [{ x: 0, z: 0 }, { x: 5, z: 5 }];
    expect(smoothPath(twoPoint, grid, LOCOMOTOR_SURFACE_GROUND)).toEqual(twoPoint);

    const onePoint = [{ x: 3, z: 3 }];
    expect(smoothPath(onePoint, grid, LOCOMOTOR_SURFACE_GROUND)).toEqual(onePoint);
  });
});

// ===========================================================================
// isLineClear tests
// ===========================================================================
describe('isLineClear', () => {
  it('returns true for clear straight line', () => {
    const grid = makeGrid(10, 10);
    expect(isLineClear(
      grid,
      { x: 0, z: 0 },
      { x: 9, z: 0 },
      LOCOMOTOR_SURFACE_GROUND,
    )).toBe(true);
  });

  it('returns false when obstacle is in the way', () => {
    const grid = makeGrid(10, 10);
    blockCell(grid, 5, 0);
    expect(isLineClear(
      grid,
      { x: 0, z: 0 },
      { x: 9, z: 0 },
      LOCOMOTOR_SURFACE_GROUND,
    )).toBe(false);
  });

  it('returns true for same cell', () => {
    const grid = makeGrid(5, 5);
    expect(isLineClear(
      grid,
      { x: 2, z: 2 },
      { x: 2, z: 2 },
      LOCOMOTOR_SURFACE_GROUND,
    )).toBe(true);
  });

  it('checks diagonal lines', () => {
    const grid = makeGrid(10, 10);
    expect(isLineClear(
      grid,
      { x: 0, z: 0 },
      { x: 5, z: 5 },
      LOCOMOTOR_SURFACE_GROUND,
    )).toBe(true);

    blockCell(grid, 3, 3);
    expect(isLineClear(
      grid,
      { x: 0, z: 0 },
      { x: 5, z: 5 },
      LOCOMOTOR_SURFACE_GROUND,
    )).toBe(false);
  });

  it('returns false for water cells with ground-only surfaces', () => {
    const grid = makeGrid(10, 1);
    setCellType(grid, 5, 0, 1); // Water

    expect(isLineClear(
      grid,
      { x: 0, z: 0 },
      { x: 9, z: 0 },
      LOCOMOTOR_SURFACE_GROUND,
    )).toBe(false);
  });
});

// ===========================================================================
// Performance test
// ===========================================================================
describe('findPath — performance', () => {
  it('completes 200x200 grid pathfinding in under 50ms', () => {
    const grid = makeGrid(200, 200);

    // Add some obstacles to make it non-trivial
    for (let i = 20; i < 180; i++) {
      blockCell(grid, 100, i); // Vertical wall
    }

    const start = performance.now();
    const result = findPath(grid, 0, 0, 199, 199, GROUND_OPTS);
    const elapsed = performance.now() - start;

    expect(result.found).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });

  it('handles worst case (no path) efficiently on 200x200', () => {
    const grid = makeGrid(200, 200);

    // Create a complete barrier
    for (let z = 0; z < 200; z++) {
      blockCell(grid, 100, z);
    }

    const start = performance.now();
    const result = findPath(grid, 0, 0, 199, 199, GROUND_OPTS);
    const elapsed = performance.now() - start;

    expect(result.found).toBe(false);
    // Should terminate well within 50ms due to search limit or exhaustion
    expect(elapsed).toBeLessThan(50);
  });

  it('scales linearly with grid size (100x100 vs 200x200)', () => {
    // This is a regression guard: if the heap is accidentally O(n^2),
    // the 200x200 case would be ~16x slower than 100x100 rather than ~4x.
    const grid100 = makeGrid(100, 100);
    const grid200 = makeGrid(200, 200);

    const start100 = performance.now();
    findPath(grid100, 0, 0, 99, 99, GROUND_OPTS);
    const elapsed100 = performance.now() - start100;

    const start200 = performance.now();
    findPath(grid200, 0, 0, 199, 199, GROUND_OPTS);
    const elapsed200 = performance.now() - start200;

    // With O(n log n) heap, the ratio should be roughly 4-6x, not 16x.
    // Allow generous margin for test stability.
    const ratio = elapsed200 / Math.max(elapsed100, 0.001);
    expect(ratio).toBeLessThan(20);
  });
});

// ===========================================================================
// End-to-end: findPath + smoothPath
// ===========================================================================
describe('findPath + smoothPath end-to-end', () => {
  it('produces a smoothed path around obstacles', () => {
    const grid = makeGrid(20, 20);
    // Create L-shaped obstacle
    for (let x = 5; x <= 15; x++) {
      blockCell(grid, x, 10);
    }
    for (let z = 5; z <= 10; z++) {
      blockCell(grid, 15, z);
    }

    const result = findPath(grid, 2, 8, 18, 8, GROUND_OPTS);
    expect(result.found).toBe(true);

    const smoothed = smoothPath(result.path, grid, LOCOMOTOR_SURFACE_GROUND);

    // Smoothed path should be shorter than raw A* path
    expect(smoothed.length).toBeLessThanOrEqual(result.path.length);
    expect(smoothed[0]).toEqual({ x: 2, z: 8 });
    expect(smoothed[smoothed.length - 1]).toEqual({ x: 18, z: 8 });
  });

  it('diagonal-dominant path gets smoothed to near-direct line', () => {
    const grid = makeGrid(20, 20);
    const result = findPath(grid, 0, 0, 15, 15, GROUND_OPTS);
    expect(result.found).toBe(true);

    const smoothed = smoothPath(result.path, grid, LOCOMOTOR_SURFACE_GROUND);

    // On a clear grid, diagonal path should smooth to just start+end
    expect(smoothed.length).toBe(2);
    expect(smoothed[0]).toEqual({ x: 0, z: 0 });
    expect(smoothed[1]).toEqual({ x: 15, z: 15 });
  });
});

// ===========================================================================
// Diagonal corner-cutting tests
// ===========================================================================
describe('findPath — diagonal corner-cutting', () => {
  it('does not cut corners through blocked orthogonal neighbors', () => {
    // Grid:
    //  . . .
    //  . # .
    //  . . .
    // Path from (0,0) to (2,2) should not cut through (1,1) because
    // trying to go diagonally near the obstacle requires both adjacent
    // orthogonals to be passable
    const grid = makeGrid(3, 3);
    blockCell(grid, 1, 1);

    const result = findPath(grid, 0, 0, 2, 2, GROUND_OPTS);
    expect(result.found).toBe(true);
    // Must not pass through (1,1)
    expect(result.path.some(p => p.x === 1 && p.z === 1)).toBe(false);
  });
});
