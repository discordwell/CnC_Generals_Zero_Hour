/**
 * Extracts blend tile / texture class data from the BlendTileData chunk.
 *
 * This extractor focuses on reading the texture class names which are
 * needed for the JSON output. The full blend tile index arrays are read
 * and skipped since the converter primarily needs the texture class list.
 *
 * BlendTileData chunk versions 1-7:
 *   int32    size           (width * height tiles)
 *   int16[]  tileIndices    (size entries)
 *   int16[]  blendTileIndices (size entries)
 *   int16[]  extraBlendTileIndices (v6+ only, size entries)
 *   int16[]  cliffInfoIndices (v5+ only, size entries)
 *   int32    numPassability  (v4+ cell flip/cliff state bitfields)
 *   uint8[]  passabilityData
 *   int32    numBitmapTiles
 *   int32    numBlendedTiles
 *   int32    numCliffInfo   (v5+)
 *   int32    numTextureClasses
 *   for each texture class:
 *     int32    globalTextureClass
 *     int32    firstTile
 *     int32    numTiles
 *     int32    width
 *     int32    legacy
 *     string   name          (uint16 length + chars)
 *     float32  posX, posY    (v7+ only? — always present in practice)
 *   blended tile definitions...
 *   cliff info definitions (v5+)...
 */

import type { DataChunkReader } from './DataChunkReader.js';

/** A texture class referenced by the blend tile system. */
export interface TextureClass {
  globalTextureClass: number;
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
}

export class BlendTileExtractor {
  /**
   * Extract blend tile info from a BlendTileData chunk.
   * The reader must be positioned at the start of the chunk's data payload.
   */
  static extract(reader: DataChunkReader, version: number): BlendTileInfo {
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

    // v4+ passability data
    if (version >= 4) {
      const numPassability = reader.readInt32();
      reader.skip(numPassability);
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
      const globalTextureClass = reader.readInt32();
      const firstTile = reader.readInt32();
      const numTiles = reader.readInt32();
      const width = reader.readInt32();
      // legacy field
      reader.readInt32();
      const name = reader.readAsciiString();
      // position (always present in the files we target)
      reader.readFloat32(); // posX
      reader.readFloat32(); // posY

      textureClasses.push({
        globalTextureClass,
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
    };
  }
}
