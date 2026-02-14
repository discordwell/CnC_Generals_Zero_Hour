/**
 * Extracts polygon trigger data from the PolygonTriggers chunk.
 *
 * PolygonTriggers chunk versions 1-3:
 *   int32  triggerCount
 *   for each trigger:
 *     string  name         (uint16 len + chars)
 *     int32   id
 *     uint8   isWaterArea  (v2+)
 *     uint8   isRiver      (v3+)
 *     int32   riverStart   (v3+, index into polygon points for river start)
 *     int32   pointCount
 *     for each point:
 *       int32 x, y, z
 */

import type { DataChunkReader } from './DataChunkReader.js';

/** A polygon trigger region from the map. */
export interface PolygonTrigger {
  /** Trigger name (e.g. "PlayerStart_0"). */
  name: string;
  /** Unique numeric identifier. */
  id: number;
  /** Whether this trigger defines a water area (v2+). */
  isWaterArea: boolean;
  /** Whether this trigger defines a river (v3+). */
  isRiver: boolean;
  /** Array of polygon vertices. */
  points: Array<{ x: number; y: number; z: number }>;
}

export class WaypointExtractor {
  /**
   * Extract all polygon triggers from a PolygonTriggers chunk.
   * The reader must be positioned at the start of the chunk's data payload.
   */
  static extractTriggers(reader: DataChunkReader, version: number): PolygonTrigger[] {
    const triggerCount = reader.readInt32();
    const triggers: PolygonTrigger[] = [];

    for (let i = 0; i < triggerCount; i++) {
      const name = reader.readAsciiString();
      const id = reader.readInt32();

      let isWaterArea = false;
      if (version >= 2) {
        isWaterArea = reader.readUint8() !== 0;
      }

      let isRiver = false;
      if (version >= 3) {
        isRiver = reader.readUint8() !== 0;
        // riverStart index — we read it but don't expose it in the interface
        reader.readInt32();
      }

      const pointCount = reader.readInt32();
      const points: Array<{ x: number; y: number; z: number }> = [];

      for (let p = 0; p < pointCount; p++) {
        const x = reader.readInt32();
        const y = reader.readInt32();
        const z = reader.readInt32();
        points.push({ x, y, z });
      }

      triggers.push({ name, id, isWaterArea, isRiver, points });
    }

    return triggers;
  }
}
