import { describe, it, expect } from 'vitest';
import { resolveQueueProductionExitPath, resolveQueueSpawnLocation } from './production-spawn.js';

function makeProducer(overrides: Partial<{
  x: number;
  z: number;
  y: number;
  rotationY: number;
  baseHeight: number;
  rallyPoint: { x: number; z: number } | null;
  moduleType: 'QUEUE' | 'SUPPLY_CENTER' | 'SPAWN_POINT';
  unitCreatePoint: { x: number; y: number; z: number };
  naturalRallyPoint: { x: number; y: number; z: number } | null;
}> = {}) {
  return {
    x: overrides.x ?? 40,
    z: overrides.z ?? 40,
    y: overrides.y ?? 0,
    rotationY: overrides.rotationY ?? 0,
    baseHeight: overrides.baseHeight ?? 0,
    rallyPoint: overrides.rallyPoint ?? null,
    queueProductionExitProfile: {
      moduleType: overrides.moduleType ?? 'QUEUE',
      unitCreatePoint: overrides.unitCreatePoint ?? { x: 12, y: 0, z: 0 },
      naturalRallyPoint: 'naturalRallyPoint' in overrides ? overrides.naturalRallyPoint! : { x: 28, y: 0, z: 0 },
      allowAirborneCreation: false,
    },
  };
}

const MAP_XY_FACTOR = 10;

describe('resolveQueueProductionExitPath', () => {
  it('returns natural rally point when no player rally point is set', () => {
    const producer = makeProducer();
    const path = resolveQueueProductionExitPath(producer, true, MAP_XY_FACTOR);

    // Natural rally point at (28,0,0) relative to factory at (40,40):
    // With QUEUE doubling: offset = 28 + 28*(2*10/28) = 28 + 20 = 48
    // worldX = 40 + 48*cos(0) = 88, worldZ = 40 + 48*sin(0) = 40
    expect(path.length).toBe(2); // Natural + doubled natural for QUEUE
    expect(path[0]!.x).toBeCloseTo(88, 1);
    expect(path[0]!.z).toBeCloseTo(40, 1);
    // Second point is a copy (doubled natural to prevent stacking).
    expect(path[1]!.x).toBeCloseTo(88, 1);
    expect(path[1]!.z).toBeCloseTo(40, 1);
  });

  it('returns natural + player rally point when player rally point is set', () => {
    const producer = makeProducer({ rallyPoint: { x: 100, z: 80 } });
    const path = resolveQueueProductionExitPath(producer, true, MAP_XY_FACTOR);

    expect(path.length).toBe(2);
    // First waypoint: natural rally point.
    expect(path[0]!.x).toBeCloseTo(88, 1);
    expect(path[0]!.z).toBeCloseTo(40, 1);
    // Second waypoint: player rally point.
    expect(path[1]!.x).toBe(100);
    expect(path[1]!.z).toBe(80);
  });

  it('returns empty path for non-movable units', () => {
    const producer = makeProducer({ rallyPoint: { x: 100, z: 80 } });
    const path = resolveQueueProductionExitPath(producer, false, MAP_XY_FACTOR);
    expect(path).toEqual([]);
  });

  it('returns only player rally point when no exit profile natural point', () => {
    const producer = makeProducer({
      naturalRallyPoint: null,
      rallyPoint: { x: 100, z: 80 },
    });
    // When naturalRallyPoint is null, falls back to just player rally point.
    const path = resolveQueueProductionExitPath(producer, true, MAP_XY_FACTOR);
    expect(path.length).toBe(1);
    expect(path[0]!.x).toBe(100);
    expect(path[0]!.z).toBe(80);
  });

  it('applies rotation to natural rally point', () => {
    // Rotate factory 90 degrees (PI/2 radians).
    const producer = makeProducer({ rotationY: Math.PI / 2 });
    const path = resolveQueueProductionExitPath(producer, true, MAP_XY_FACTOR);

    // With 90° rotation: cos(PI/2)≈0, sin(PI/2)≈1
    // worldX = 40 + (48*0 - 0*1) = 40
    // worldZ = 40 + (48*1 + 0*0) = 88
    expect(path.length).toBe(2);
    expect(path[0]!.x).toBeCloseTo(40, 0);
    expect(path[0]!.z).toBeCloseTo(88, 0);
  });

  it('does not double natural point for SUPPLY_CENTER module type', () => {
    const producer = makeProducer({ moduleType: 'SUPPLY_CENTER' });
    const path = resolveQueueProductionExitPath(producer, true, MAP_XY_FACTOR);

    // SUPPLY_CENTER doesn't do the QUEUE doubling offset or doubling of the destination.
    expect(path.length).toBe(1);
    // No QUEUE doubling: worldX = 40 + 28*cos(0) = 68
    expect(path[0]!.x).toBeCloseTo(68, 1);
    expect(path[0]!.z).toBeCloseTo(40, 1);
  });

  it('SUPPLY_CENTER appends player rally point without doubling', () => {
    const producer = makeProducer({
      moduleType: 'SUPPLY_CENTER',
      rallyPoint: { x: 100, z: 80 },
    });
    const path = resolveQueueProductionExitPath(producer, true, MAP_XY_FACTOR);

    expect(path.length).toBe(2);
    expect(path[0]!.x).toBeCloseTo(68, 1);
    expect(path[0]!.z).toBeCloseTo(40, 1);
    expect(path[1]!.x).toBe(100);
    expect(path[1]!.z).toBe(80);
  });
});
