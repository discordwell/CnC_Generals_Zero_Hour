import { describe, it, expect } from 'vitest';
import { generateProceduralTerrain } from './procedural-terrain.js';
import { HeightmapGrid } from './heightmap.js';

describe('generateProceduralTerrain', () => {
  it('generates terrain with correct dimensions', () => {
    const map = generateProceduralTerrain({ width: 64, height: 48 });
    expect(map.heightmap.width).toBe(64);
    expect(map.heightmap.height).toBe(48);
  });

  it('uses default dimensions of 128x128', () => {
    const map = generateProceduralTerrain();
    expect(map.heightmap.width).toBe(128);
    expect(map.heightmap.height).toBe(128);
  });

  it('produces height values in 0-255 range', () => {
    const map = generateProceduralTerrain({ width: 64, height: 64 });
    const hm = HeightmapGrid.fromJSON(map.heightmap);

    let minH = 255;
    let maxH = 0;
    for (let i = 0; i < hm.rawData.length; i++) {
      const v = hm.rawData[i]!;
      if (v < minH) minH = v;
      if (v > maxH) maxH = v;
    }

    expect(minH).toBeGreaterThanOrEqual(0);
    expect(maxH).toBeLessThanOrEqual(255);
    // Should have some height variation (not all flat)
    expect(maxH - minH).toBeGreaterThan(20);
  });

  it('is deterministic with same seed', () => {
    const map1 = generateProceduralTerrain({ width: 32, height: 32, seed: 99 });
    const map2 = generateProceduralTerrain({ width: 32, height: 32, seed: 99 });
    expect(map1.heightmap.data).toBe(map2.heightmap.data);
  });

  it('produces different terrain with different seeds', () => {
    const map1 = generateProceduralTerrain({ width: 32, height: 32, seed: 1 });
    const map2 = generateProceduralTerrain({ width: 32, height: 32, seed: 2 });
    expect(map1.heightmap.data).not.toBe(map2.heightmap.data);
  });

  it('includes water trigger when enabled', () => {
    const map = generateProceduralTerrain({ includeWater: true });
    const waterTrigger = map.triggers.find((t) => t.isWaterArea);
    expect(waterTrigger).toBeDefined();
    expect(waterTrigger!.points.length).toBe(4);
    expect(waterTrigger!.name).toBe('WaterArea_Demo');
  });

  it('excludes water trigger when disabled', () => {
    const map = generateProceduralTerrain({ includeWater: false });
    const waterTrigger = map.triggers.find((t) => t.isWaterArea);
    expect(waterTrigger).toBeUndefined();
  });

  it('generates decodable base64 data', () => {
    const map = generateProceduralTerrain({ width: 16, height: 16 });
    const hm = HeightmapGrid.fromJSON(map.heightmap);
    expect(hm.rawData.length).toBe(16 * 16);
  });

  it('includes texture class names', () => {
    const map = generateProceduralTerrain();
    expect(map.textureClasses.length).toBeGreaterThan(0);
  });
});
