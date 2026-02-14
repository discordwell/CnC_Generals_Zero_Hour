import { describe, it, expect } from 'vitest';
import { HeightmapGrid, base64ToUint8Array } from './heightmap.js';
import { MAP_XY_FACTOR, MAP_HEIGHT_SCALE } from './types.js';

// Helper: create a simple 4×4 heightmap with known values
function make4x4(): HeightmapGrid {
  // Row-major 4×4 grid:
  //   0  10  20  30
  //  40  50  60  70
  //  80  90 100 110
  // 120 130 140 150
  const data = new Uint8Array([
    0, 10, 20, 30,
    40, 50, 60, 70,
    80, 90, 100, 110,
    120, 130, 140, 150,
  ]);
  return new HeightmapGrid(4, 4, 0, data);
}

describe('base64ToUint8Array', () => {
  it('decodes simple base64 data', () => {
    // "AAEK" encodes bytes [0, 1, 10]
    const bytes = base64ToUint8Array('AAEK');
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(1);
    expect(bytes[2]).toBe(10);
  });

  it('handles padding', () => {
    // "AQ==" encodes [1]
    const bytes = base64ToUint8Array('AQ==');
    expect(bytes.length).toBe(1);
    expect(bytes[0]).toBe(1);
  });

  it('round-trips with standard encoding', () => {
    // Test that the decode of known base64 values works
    const decoded = base64ToUint8Array('AH//KmQ=');
    expect(decoded[0]).toBe(0);
    expect(decoded[1]).toBe(127);
    expect(decoded[2]).toBe(255);
    expect(decoded[3]).toBe(42);
    expect(decoded[4]).toBe(100);
  });
});

describe('HeightmapGrid', () => {
  describe('constructor', () => {
    it('stores dimensions correctly', () => {
      const hm = make4x4();
      expect(hm.width).toBe(4);
      expect(hm.height).toBe(4);
      expect(hm.borderSize).toBe(0);
    });

    it('computes world extents', () => {
      const hm = make4x4();
      expect(hm.worldWidth).toBe(3 * MAP_XY_FACTOR); // (4-1) * 10 = 30
      expect(hm.worldDepth).toBe(3 * MAP_XY_FACTOR);
    });

    it('pre-computes world heights', () => {
      const hm = make4x4();
      expect(hm.worldHeights[0]).toBeCloseTo(0);
      expect(hm.worldHeights[5]).toBeCloseTo(50 * MAP_HEIGHT_SCALE);
      expect(hm.worldHeights[15]).toBeCloseTo(150 * MAP_HEIGHT_SCALE);
    });
  });

  describe('fromJSON', () => {
    it('decodes base64 heightmap data', () => {
      // Create a 2×2 grid: [10, 20, 30, 40]
      // base64 of [10, 20, 30, 40] = "ChQeKA=="
      const hm = HeightmapGrid.fromJSON({
        width: 2,
        height: 2,
        borderSize: 1,
        data: 'ChQeKA==',
      });
      expect(hm.width).toBe(2);
      expect(hm.height).toBe(2);
      expect(hm.borderSize).toBe(1);
      expect(hm.getRawHeight(0, 0)).toBe(10);
      expect(hm.getRawHeight(1, 0)).toBe(20);
      expect(hm.getRawHeight(0, 1)).toBe(30);
      expect(hm.getRawHeight(1, 1)).toBe(40);
    });

    it('throws on data length mismatch', () => {
      expect(() =>
        HeightmapGrid.fromJSON({ width: 3, height: 3, borderSize: 0, data: 'AQ==' }),
      ).toThrow('mismatch');
    });
  });

  describe('getRawHeight', () => {
    it('returns correct values at valid coordinates', () => {
      const hm = make4x4();
      expect(hm.getRawHeight(0, 0)).toBe(0);
      expect(hm.getRawHeight(2, 1)).toBe(60);
      expect(hm.getRawHeight(3, 3)).toBe(150);
    });

    it('returns 0 for out-of-bounds coordinates', () => {
      const hm = make4x4();
      expect(hm.getRawHeight(-1, 0)).toBe(0);
      expect(hm.getRawHeight(4, 0)).toBe(0);
      expect(hm.getRawHeight(0, -1)).toBe(0);
      expect(hm.getRawHeight(0, 4)).toBe(0);
    });
  });

  describe('getWorldHeight', () => {
    it('applies MAP_HEIGHT_SCALE correctly', () => {
      const hm = make4x4();
      expect(hm.getWorldHeight(1, 0)).toBeCloseTo(10 * MAP_HEIGHT_SCALE);
      expect(hm.getWorldHeight(2, 2)).toBeCloseTo(100 * MAP_HEIGHT_SCALE);
    });
  });

  describe('getInterpolatedHeight', () => {
    it('returns exact height at grid vertices', () => {
      const hm = make4x4();
      // At grid position (1,1), world position (10, 10)
      expect(hm.getInterpolatedHeight(10, 10)).toBeCloseTo(50 * MAP_HEIGHT_SCALE);
    });

    it('interpolates between grid vertices', () => {
      const hm = make4x4();
      // Midpoint between (0,0)=0 and (1,0)=10, world X=5, Z=0
      const h = hm.getInterpolatedHeight(5, 0);
      expect(h).toBeCloseTo(5 * MAP_HEIGHT_SCALE);
    });

    it('interpolates in both axes', () => {
      const hm = make4x4();
      // Center of cell (0,0)-(1,1): world (5, 5)
      // h00=0, h10=10, h01=40, h11=50
      // h = lerp(lerp(0,10,0.5), lerp(40,50,0.5), 0.5) = lerp(5, 45, 0.5) = 25
      const h = hm.getInterpolatedHeight(5, 5);
      expect(h).toBeCloseTo(25 * MAP_HEIGHT_SCALE);
    });
  });

  describe('getNormal', () => {
    it('returns upward normal for flat terrain', () => {
      // All heights = 100
      const data = new Uint8Array(16).fill(100);
      const hm = new HeightmapGrid(4, 4, 0, data);
      const [nx, ny, nz] = hm.getNormal(1, 1);
      expect(nx).toBeCloseTo(0);
      expect(ny).toBeCloseTo(1);
      expect(nz).toBeCloseTo(0);
    });

    it('produces non-zero X component for X-slope', () => {
      // Height increases left-to-right
      const data = new Uint8Array(16);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          data[row * 4 + col] = col * 50;
        }
      }
      const hm = new HeightmapGrid(4, 4, 0, data);
      const [nx, ny, _nz] = hm.getNormal(1, 1);
      // Slope goes uphill in +X, so normal should tilt in -X
      expect(nx).toBeLessThan(0);
      expect(ny).toBeGreaterThan(0);
    });
  });

  describe('coordinate conversion', () => {
    it('worldToGrid converts correctly', () => {
      const hm = make4x4();
      const [col, row] = hm.worldToGrid(15, 25);
      expect(col).toBeCloseTo(1.5);
      expect(row).toBeCloseTo(2.5);
    });

    it('gridToWorld converts correctly', () => {
      const hm = make4x4();
      const [wx, wy, wz] = hm.gridToWorld(2, 1);
      expect(wx).toBeCloseTo(20);
      expect(wy).toBeCloseTo(60 * MAP_HEIGHT_SCALE);
      expect(wz).toBeCloseTo(10);
    });
  });
});
