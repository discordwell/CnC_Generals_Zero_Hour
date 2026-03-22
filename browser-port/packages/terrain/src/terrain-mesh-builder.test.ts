import { describe, it, expect } from 'vitest';
import { HeightmapGrid } from './heightmap.js';
import { TerrainMeshBuilder, getTextureClassColor } from './terrain-mesh-builder.js';
import type { BlendTileColorData } from './terrain-mesh-builder.js';
import { MAP_XY_FACTOR, CHUNK_SIZE } from './types.js';

// Helper: create a flat 10×10 heightmap (100 vertices, 9×9 cells)
function makeFlat10x10(height = 100): HeightmapGrid {
  const data = new Uint8Array(100).fill(height);
  return new HeightmapGrid(10, 10, 0, data);
}

// Helper: create a larger heightmap that requires multiple chunks
function makeLarge(): HeightmapGrid {
  // 65×65 = 64×64 cells → ceil(64/32) = 2 chunks per axis = 4 chunks total
  const w = 65;
  const h = 65;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  return new HeightmapGrid(w, h, 0, data);
}

describe('TerrainMeshBuilder', () => {
  describe('chunk count', () => {
    it('produces 1 chunk for a small map', () => {
      const hm = makeFlat10x10();
      const chunks = TerrainMeshBuilder.build(hm);
      // 9 cells < 32 chunk size → 1 chunk
      expect(chunks.length).toBe(1);
    });

    it('produces correct chunks for a larger map', () => {
      const hm = makeLarge();
      const chunks = TerrainMeshBuilder.build(hm);
      // 64 cells / 32 = 2 per axis → 4 chunks
      expect(chunks.length).toBe(4);
    });

    it('handles non-power-of-two sizes', () => {
      // 50×50 vertices = 49×49 cells → ceil(49/32) = 2 per axis → 4 chunks
      const data = new Uint8Array(50 * 50).fill(100);
      const hm = new HeightmapGrid(50, 50, 0, data);
      const chunks = TerrainMeshBuilder.build(hm);
      expect(chunks.length).toBe(4);
    });
  });

  describe('vertex and index counts', () => {
    it('has correct vertex count for single chunk', () => {
      const hm = makeFlat10x10();
      const chunks = TerrainMeshBuilder.build(hm);
      const chunk = chunks[0]!;
      // 9×9 cells → 10×10 vertices = 100
      const posAttr = chunk.geometry.getAttribute('position');
      expect(posAttr.count).toBe(100);
    });

    it('has correct index count for single chunk', () => {
      const hm = makeFlat10x10();
      const chunks = TerrainMeshBuilder.build(hm);
      const chunk = chunks[0]!;
      // 9×9 cells × 2 triangles × 3 indices = 486
      const indexAttr = chunk.geometry.getIndex();
      expect(indexAttr).not.toBeNull();
      expect(indexAttr!.count).toBe(9 * 9 * 6);
    });
  });

  describe('vertex positions', () => {
    it('places vertices at correct world positions', () => {
      const hm = makeFlat10x10(128);
      const chunks = TerrainMeshBuilder.build(hm);
      const posAttr = chunks[0]!.geometry.getAttribute('position');

      // First vertex (col=0, row=0)
      expect(posAttr.getX(0)).toBeCloseTo(0);
      expect(posAttr.getZ(0)).toBeCloseTo(0);

      // Vertex at col=1, row=0 (index=1)
      expect(posAttr.getX(1)).toBeCloseTo(MAP_XY_FACTOR);

      // Vertex at col=0, row=1 (index=10 for 10-wide chunk)
      expect(posAttr.getZ(10)).toBeCloseTo(MAP_XY_FACTOR);
    });

    it('sets Y from heightmap values', () => {
      const hm = makeFlat10x10(200);
      const chunks = TerrainMeshBuilder.build(hm);
      const posAttr = chunks[0]!.geometry.getAttribute('position');
      const expectedY = 200 * 0.625; // MAP_HEIGHT_SCALE
      expect(posAttr.getY(0)).toBeCloseTo(expectedY);
    });
  });

  describe('vertex colors', () => {
    it('assigns colors to all vertices', () => {
      const hm = makeFlat10x10();
      const chunks = TerrainMeshBuilder.build(hm);
      const colorAttr = chunks[0]!.geometry.getAttribute('color');
      expect(colorAttr).toBeDefined();
      expect(colorAttr.count).toBe(100);
    });

    it('colors vary with height', () => {
      // Create heightmap with varying heights
      const data = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        data[i] = Math.floor((i / 100) * 255);
      }
      const hm = new HeightmapGrid(10, 10, 0, data);
      const chunks = TerrainMeshBuilder.build(hm);
      const colorAttr = chunks[0]!.geometry.getAttribute('color');

      // Low vertex and high vertex should have different colors
      // Low vertices and high vertices should have different colors.
      // Compare all 3 channels across low vs high — at least one must differ.
      const lowR = colorAttr.getX(0);
      const lowG = colorAttr.getY(0);
      const lowB = colorAttr.getZ(0);
      const highR = colorAttr.getX(99);
      const highG = colorAttr.getY(99);
      const highB = colorAttr.getZ(99);
      const maxDiff = Math.max(
        Math.abs(lowR - highR),
        Math.abs(lowG - highG),
        Math.abs(lowB - highB),
      );
      expect(maxDiff).toBeGreaterThan(0.005);
    });
  });

  describe('bounding boxes', () => {
    it('computes bounding box', () => {
      const hm = makeFlat10x10(128);
      const chunks = TerrainMeshBuilder.build(hm);
      const bb = chunks[0]!.geometry.boundingBox!;
      expect(bb).not.toBeNull();
      expect(bb.min.x).toBeCloseTo(0);
      expect(bb.min.z).toBeCloseTo(0);
      expect(bb.max.x).toBeCloseTo(9 * MAP_XY_FACTOR);
      expect(bb.max.z).toBeCloseTo(9 * MAP_XY_FACTOR);
    });

    it('computes bounding sphere', () => {
      const hm = makeFlat10x10();
      const chunks = TerrainMeshBuilder.build(hm);
      const bs = chunks[0]!.geometry.boundingSphere;
      expect(bs).not.toBeNull();
      expect(bs!.radius).toBeGreaterThan(0);
    });
  });

  describe('chunk metadata', () => {
    it('stores chunk grid position', () => {
      const hm = makeLarge();
      const chunks = TerrainMeshBuilder.build(hm);
      // Should have chunks at (0,0), (32,0), (0,32), (32,32)
      const positions = chunks.map((c) => [c.chunkCol, c.chunkRow]);
      expect(positions).toContainEqual([0, 0]);
      expect(positions).toContainEqual([CHUNK_SIZE, 0]);
      expect(positions).toContainEqual([0, CHUNK_SIZE]);
      expect(positions).toContainEqual([CHUNK_SIZE, CHUNK_SIZE]);
    });
  });

  describe('getTextureClassColor', () => {
    it('returns sand color for SandType3', () => {
      const [r, g, b] = getTextureClassColor('SandType3');
      // Sand should be warm tan
      expect(r).toBeGreaterThan(0.6);
      expect(g).toBeGreaterThan(0.5);
      expect(b).toBeGreaterThan(0.3);
    });

    it('returns green for GrassMediumType35', () => {
      const [r, g, b] = getTextureClassColor('GrassMediumType35');
      // Grass should have more green than red
      expect(g).toBeGreaterThan(r);
    });

    it('returns gray for CliffLargeType10', () => {
      const [r, g, b] = getTextureClassColor('CliffLargeType10');
      // Cliff/rock — neutral gray-brown
      expect(r).toBeGreaterThan(0.4);
      expect(g).toBeGreaterThan(0.4);
      expect(b).toBeGreaterThan(0.3);
    });

    it('returns dark gray for ConcreteType3', () => {
      const [r, g, b] = getTextureClassColor('ConcreteType3');
      // Concrete — dark neutral
      expect(r).toBeLessThan(0.5);
      expect(g).toBeLessThan(0.5);
    });

    it('returns grassy color for SandLargeType4Grassy', () => {
      const [r, g, b] = getTextureClassColor('SandLargeType4Grassy');
      // Grassy variants should have noticeable green
      expect(g).toBeGreaterThan(0.5);
    });

    it('returns default for unknown texture name', () => {
      const [r, g, b] = getTextureClassColor('UnknownWeirdTexture');
      expect(r).toBeGreaterThan(0);
      expect(g).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(0);
    });
  });

  describe('blend tile coloring', () => {
    it('uses texture class colors when blend tile data is provided', () => {
      const hm = makeFlat10x10(128);
      // Create blend tile data: 10×10 grid, all cells mapped to tile index 0
      // Tile index 0 >> 2 = 0, which falls in the first texture class (firstTile=0, numTiles=1)
      const tileIndices = new Int16Array(100).fill(0); // all map to tile 0
      const blendTileData: BlendTileColorData = {
        tileIndices,
        textureClasses: [
          { name: 'GrassMediumType1', firstTile: 0, numTiles: 1 },
        ],
        mapWidth: 10,
      };

      const chunks = TerrainMeshBuilder.build(hm, blendTileData);
      const colorAttr = chunks[0]!.geometry.getAttribute('color');

      // All vertices should get the grass color (green-ish)
      // Check that green > red for a grass texture
      const r0 = colorAttr.getX(0);
      const g0 = colorAttr.getY(0);
      expect(g0).toBeGreaterThan(r0);
    });

    it('assigns different colors for different texture classes', () => {
      const hm = makeFlat10x10(128);
      // Create two texture classes: left half is sand, right half is grass
      // Tile indices: left cells get tile 0 (sand class), right cells get tile 4 (grass class)
      const tileIndices = new Int16Array(100);
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          // tile index 0 >> 2 = 0 -> sand (firstTile=0), tile index 4 >> 2 = 1 -> grass (firstTile=1)
          tileIndices[row * 10 + col] = col < 5 ? 0 : 4;
        }
      }
      const blendTileData: BlendTileColorData = {
        tileIndices,
        textureClasses: [
          { name: 'SandType3', firstTile: 0, numTiles: 1 },
          { name: 'GrassMediumType1', firstTile: 1, numTiles: 1 },
        ],
        mapWidth: 10,
      };

      const chunks = TerrainMeshBuilder.build(hm, blendTileData);
      const colorAttr = chunks[0]!.geometry.getAttribute('color');

      // Compare vertex at col=0 (sand) vs col=9 (grass)
      const sandR = colorAttr.getX(0);
      const sandG = colorAttr.getY(0);
      const grassR = colorAttr.getX(9);
      const grassG = colorAttr.getY(9);

      // Sand should have higher R relative to G than grass
      expect(sandR / sandG).toBeGreaterThan(grassR / grassG);
    });

    it('falls back to height gradient without blend tile data', () => {
      const hm = makeFlat10x10(128);
      const chunksWithout = TerrainMeshBuilder.build(hm);
      const chunksWithEmpty = TerrainMeshBuilder.build(hm, undefined);

      const colorWithout = chunksWithout[0]!.geometry.getAttribute('color');
      const colorEmpty = chunksWithEmpty[0]!.geometry.getAttribute('color');

      // Without blend data, both should produce identical colors
      expect(colorWithout.getX(0)).toBeCloseTo(colorEmpty.getX(0));
      expect(colorWithout.getY(0)).toBeCloseTo(colorEmpty.getY(0));
      expect(colorWithout.getZ(0)).toBeCloseTo(colorEmpty.getZ(0));
    });
  });
});
