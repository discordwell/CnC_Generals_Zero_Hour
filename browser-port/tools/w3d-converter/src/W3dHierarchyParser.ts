/**
 * Parses W3D HIERARCHY chunks (type 0x00000100).
 *
 * A HIERARCHY chunk is a container holding:
 *   HIERARCHY_HEADER (0x101) – version, name, numPivots, center
 *   PIVOTS           (0x102) – array of pivot records
 *   PIVOT_FIXUPS     (0x103) – optional fixup table (ignored here)
 *
 * Each pivot record is 60 bytes:
 *   char     Name[16]         (W3D_NAME_LEN = 16)
 *   uint32   ParentIdx        (0xFFFFFFFF = root → stored as -1)
 *   float32  Translation[3]
 *   float32  EulerAngles[3]   (unused – we use the quaternion instead)
 *   float32  Rotation[4]      (XYZW quaternion)
 */

import { W3dChunkReader } from './W3dChunkReader.js';
import { W3dChunkType } from './W3dChunkTypes.js';

export interface W3dPivot {
  name: string;
  parentIndex: number; // -1 for root
  translation: [number, number, number];
  rotation: [number, number, number, number]; // XYZW quaternion
}

export interface W3dHierarchy {
  name: string;
  pivots: W3dPivot[];
}

/**
 * Size of a single pivot record in bytes:
 *   16 (name) + 4 (parent) + 12 (translation) + 12 (euler) + 16 (quat) = 60
 */
const PIVOT_RECORD_SIZE = 60;

export function parseHierarchyChunk(
  reader: W3dChunkReader,
  dataOffset: number,
  chunkSize: number,
): W3dHierarchy {
  const endOffset = dataOffset + chunkSize;

  let name = '';
  let numPivots = 0;
  const pivots: W3dPivot[] = [];

  for (const sub of reader.iterateChunks(dataOffset, endOffset)) {
    switch (sub.type) {
      case W3dChunkType.HIERARCHY_HEADER: {
        // uint32 Version  (4)
        // char Name[32]   (32)  offset +4
        // uint32 NumPivots(4)   offset +36
        // float32 Center[3](12) offset +40 (unused)
        const availableNameBytes = Math.max(0, Math.min(32, sub.size - 4));
        if (availableNameBytes > 0) {
          name = reader.readString(sub.dataOffset + 4, availableNameBytes);
        }
        if (sub.size >= 40) {
          numPivots = reader.readUint32(sub.dataOffset + 36);
        }
        break;
      }

      case W3dChunkType.PIVOTS: {
        const availablePivots = Math.floor(sub.size / PIVOT_RECORD_SIZE);
        const expectedPivots = numPivots > 0 ? numPivots : availablePivots;
        const pivotsToRead = Math.min(expectedPivots, availablePivots);

        for (let i = 0; i < pivotsToRead; i++) {
          const base = sub.dataOffset + i * PIVOT_RECORD_SIZE;
          const pivotName = reader.readString(base, 16);
          const rawParent = reader.readUint32(base + 16);
          const parentIndex = rawParent === 0xffffffff ? -1 : rawParent;

          const tx = reader.readFloat32(base + 20);
          const ty = reader.readFloat32(base + 24);
          const tz = reader.readFloat32(base + 28);

          // Skip Euler angles (12 bytes at base + 32).
          const qx = reader.readFloat32(base + 44);
          const qy = reader.readFloat32(base + 48);
          const qz = reader.readFloat32(base + 52);
          const qw = reader.readFloat32(base + 56);

          pivots.push({
            name: pivotName,
            parentIndex,
            translation: [tx, ty, tz],
            rotation: [qx, qy, qz, qw],
          });
        }
        break;
      }

      case W3dChunkType.PIVOT_FIXUPS:
        // Optional; not needed for the converter.
        break;

      default:
        break;
    }
  }

  return { name, pivots };
}
