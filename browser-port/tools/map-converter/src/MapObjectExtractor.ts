/**
 * Extracts object data from Object chunks within the ObjectsList chunk.
 *
 * Per Object (versions 1-3):
 *   float32  posX, posY
 *   float32  posZ           (v3+ only)
 *   float32  angle          (degrees)
 *   int32    flags
 *   string   templateName   (uint16 length + chars)
 *   dict     properties     (v2+)
 *
 * Object flags:
 *   DRAWS_IN_MIRROR      = 0x001
 *   ROAD_POINT1          = 0x002
 *   ROAD_POINT2          = 0x004
 *   ROAD_CORNER_ANGLED   = 0x008
 *   BRIDGE_POINT1        = 0x010
 *   BRIDGE_POINT2        = 0x020
 *   ROAD_CORNER_TIGHT    = 0x040
 *   ROAD_JOIN            = 0x080
 *   DONT_RENDER          = 0x100
 */

import type { DataChunkReader } from './DataChunkReader.js';

/** Object flag bitmask constants. */
export const ObjectFlags = {
  DRAWS_IN_MIRROR: 0x001,
  ROAD_POINT1: 0x002,
  ROAD_POINT2: 0x004,
  ROAD_CORNER_ANGLED: 0x008,
  BRIDGE_POINT1: 0x010,
  BRIDGE_POINT2: 0x020,
  ROAD_CORNER_TIGHT: 0x040,
  ROAD_JOIN: 0x080,
  DONT_RENDER: 0x100,
} as const;

/** A single map object extracted from the ObjectsList chunk. */
export interface MapObject {
  /** World-space position. */
  position: { x: number; y: number; z: number };
  /** Facing angle in degrees. */
  angle: number;
  /** Object flag bitmask. */
  flags: number;
  /** INI template name (e.g. "AmericaCommandCenter"). */
  templateName: string;
  /** Key-value property dictionary (v2+). */
  properties: Map<number, unknown>;
}

export class MapObjectExtractor {
  /**
   * Extract a single object from an Object chunk.
   * The reader must be positioned at the start of the chunk's data payload.
   */
  static extract(reader: DataChunkReader, version: number): MapObject {
    const posX = reader.readFloat32();
    const posY = reader.readFloat32();

    let posZ = 0;
    if (version >= 3) {
      posZ = reader.readFloat32();
    }

    const angle = reader.readFloat32();
    const flags = reader.readInt32();
    const templateName = reader.readAsciiString();

    let properties = new Map<number, unknown>();
    if (version >= 2) {
      properties = reader.readDict();
    }

    return {
      position: { x: posX, y: posY, z: posZ },
      angle,
      flags,
      templateName,
      properties,
    };
  }
}
