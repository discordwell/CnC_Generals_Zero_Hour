/**
 * Extracts blend tile / texture class data from the BlendTileData chunk.
 *
 * This extractor focuses on reading the texture class names which are
 * needed for the JSON output, plus the cliff-state bitset used by
 * pathfinding parity.
 *
 * BlendTileData chunk versions 1-8:
 *   int32    size           (width * height tiles)
 *   int16[]  tileIndices    (size entries)
 *   int16[]  blendTileIndices (size entries)
 *   int16[]  extraBlendTileIndices (v6+ only, size entries)
 *   int16[]  cliffInfoIndices (v5+ only, size entries)
 *   uint8[]  cliffStateBits  (v7+ only, packed bitset, row-major)
 *   int32    numBitmapTiles
 *   int32    numBlendedTiles
 *   int32    numCliffInfo   (v5+)
 *   int32    numTextureClasses
 *   for each texture class:
 *     int32    firstTile
 *     int32    numTiles
 *     int32    width
 *     int32    legacy
 *     string   name          (uint16 length + chars)
 *   blended tile definitions...
 *   cliff info definitions (v5+)...
 */

import type { DataChunkReader } from './DataChunkReader.js';

/** A texture class referenced by the blend tile system. */
export interface TextureClass {
  firstTile: number;
  numTiles: number;
  width: number;
  name: string;
}

/** Summary data extracted from the BlendTileData chunk. */
export interface BlendTileInfo {
  /** Total number of tiles (width * height). */
  tileCount: number;
  /** Number of bitmap (non-blended) tiles. */
  numBitmapTiles: number;
  /** Number of blended edge tiles. */
  numBlendedTiles: number;
  /** Texture classes used by the terrain. */
  textureClasses: TextureClass[];
  /** Optional packed cliff-state bitset (v7+). */
  cliffStateData: Uint8Array | null;
  /** Bytes per row in `cliffStateData`. */
  cliffStateStride: number;
}

export class BlendTileExtractor {
  /**
   * Extract blend tile info from a BlendTileData chunk.
   * The reader must be positioned at the start of the chunk's data payload.
   */
  static extract(
    reader: DataChunkReader,
    version: number,
    mapWidth?: number,
    mapHeight?: number,
  ): BlendTileInfo {
    const size = reader.readInt32();

    // Skip tile index arrays (each entry is int16 = 2 bytes)
    // tileIndices
    reader.skip(size * 2);
    // blendTileIndices
    reader.skip(size * 2);

    // v6+ extra blend tile indices
    if (version >= 6) {
      reader.skip(size * 2);
    }

    // v5+ cliff info indices
    if (version >= 5) {
      reader.skip(size * 2);
    }

    let cliffStateData: Uint8Array | null = null;
    let cliffStateStride = 0;
    if (version >= 7) {
      if (typeof mapWidth !== 'number' || typeof mapHeight !== 'number') {
        throw new Error('BlendTileData v7+ requires map width/height to decode cliff-state bitset');
      }
      const decoded = BlendTileExtractor.readCliffStateBits(reader, version, mapWidth, mapHeight);
      cliffStateData = decoded.data;
      cliffStateStride = decoded.stride;
    }

    const numBitmapTiles = reader.readInt32();
    const numBlendedTiles = reader.readInt32();

    let numCliffInfo = 0;
    if (version >= 5) {
      numCliffInfo = reader.readInt32();
    }

    const numTextureClasses = reader.readInt32();
    const textureClasses: TextureClass[] = [];

    for (let i = 0; i < numTextureClasses; i++) {
      const firstTile = reader.readInt32();
      const numTiles = reader.readInt32();
      const width = reader.readInt32();
      // legacy field
      reader.readInt32();
      const name = reader.readAsciiString();

      textureClasses.push({
        firstTile,
        numTiles,
        width,
        name,
      });
    }

    // Skip blended tile definitions (numBlendedTiles entries)
    // Each blended tile: int32 flags + (varies by version)
    // We skip the remainder since we only need texture class names.
    // The caller should use skipChunkData to advance past the full chunk.

    // Skip remaining data: blended tile defs and cliff info defs.
    // Rather than parsing the variable-length blended tile and cliff info
    // structures, we leave the reader at its current position and let the
    // caller handle chunk boundary advancement.

    void numCliffInfo;

    return {
      tileCount: size,
      numBitmapTiles,
      numBlendedTiles,
      textureClasses,
      cliffStateData,
      cliffStateStride,
    };
  }

  private static readCliffStateBits(
    reader: DataChunkReader,
    version: number,
    mapWidth: number,
    mapHeight: number,
  ): { data: Uint8Array; stride: number } {
    const stride = Math.floor((mapWidth + 7) / 8);
    if (version === 7) {
      // Legacy v7 saved with an incorrect row stride ((width + 1) / 8).
      const legacyStride = Math.floor((mapWidth + 1) / 8);
      const legacy = reader.readBytes(mapHeight * legacyStride);
      const normalized = new Uint8Array(mapHeight * stride);
      for (let row = 0; row < mapHeight; row++) {
        const src = row * legacyStride;
        const dst = row * stride;
        const copy = Math.min(legacyStride, stride);
        normalized.set(legacy.subarray(src, src + copy), dst);
      }
      return { data: normalized, stride };
    }

    const bits = reader.readBytes(mapHeight * stride);
    return { data: bits, stride };
  }
}
