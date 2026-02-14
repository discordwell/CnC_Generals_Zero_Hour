/**
 * Parses W3D HLOD chunks (type 0x00000700).
 *
 * An HLOD (Hierarchical Level of Detail) chunk contains:
 *   HLOD_HEADER              (0x701) – version, lodCount, name, hierarchyName
 *   HLOD_LOD_ARRAY           (0x702) – one per LOD level, each containing:
 *     HLOD_SUB_OBJECT_ARRAY_HEADER (0x703) – modelCount, maxScreenSize
 *     HLOD_SUB_OBJECT              (0x704) – boneIndex, name  (repeated)
 */

import { W3dChunkReader } from './W3dChunkReader.js';
import { W3dChunkType } from './W3dChunkTypes.js';

export interface W3dHlodSubObject {
  boneIndex: number;
  name: string;
}

export interface W3dHlodLod {
  maxScreenSize: number;
  subObjects: W3dHlodSubObject[];
}

export interface W3dHlod {
  name: string;
  hierarchyName: string;
  lods: W3dHlodLod[];
}

export function parseHlodChunk(
  reader: W3dChunkReader,
  dataOffset: number,
  chunkSize: number,
): W3dHlod {
  const endOffset = dataOffset + chunkSize;

  let name = '';
  let hierarchyName = '';
  const lods: W3dHlodLod[] = [];

  for (const sub of reader.iterateChunks(dataOffset, endOffset)) {
    switch (sub.type) {
      case W3dChunkType.HLOD_HEADER: {
        // uint32 Version       offset +0
        // uint32 LodCount      offset +4
        // char Name[32]        offset +8
        // char HierarchyName[32] offset +40
        name = reader.readString(sub.dataOffset + 8, 32);
        hierarchyName = reader.readString(sub.dataOffset + 40, 32);
        break;
      }

      case W3dChunkType.HLOD_LOD_ARRAY: {
        const lod = parseLodArray(reader, sub.dataOffset, sub.dataOffset + sub.size);
        lods.push(lod);
        break;
      }

      default:
        break;
    }
  }

  return { name, hierarchyName, lods };
}

function parseLodArray(
  reader: W3dChunkReader,
  offset: number,
  endOffset: number,
): W3dHlodLod {
  let maxScreenSize = 0;
  const subObjects: W3dHlodSubObject[] = [];

  for (const sub of reader.iterateChunks(offset, endOffset)) {
    switch (sub.type) {
      case W3dChunkType.HLOD_SUB_OBJECT_ARRAY_HEADER: {
        // uint32 ModelCount     offset +0  (not strictly needed)
        // float32 MaxScreenSize offset +4
        maxScreenSize = reader.readFloat32(sub.dataOffset + 4);
        break;
      }

      case W3dChunkType.HLOD_SUB_OBJECT: {
        // uint32 BoneIndex      offset +0
        // char Name[64]         offset +4
        // But some exporters write Name as 32 bytes. We read up to 64 to be safe,
        // since readString stops at the first null byte anyway.
        const boneIndex = reader.readUint32(sub.dataOffset);
        const subName = reader.readString(sub.dataOffset + 4, Math.min(sub.size - 4, 64));
        subObjects.push({ boneIndex, name: subName });
        break;
      }

      default:
        break;
    }
  }

  return { maxScreenSize, subObjects };
}
