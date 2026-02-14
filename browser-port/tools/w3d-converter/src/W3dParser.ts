/**
 * Top-level W3D file parser.
 *
 * Iterates all root-level chunks in the binary buffer and delegates to the
 * appropriate sub-parser (mesh, hierarchy, animation, hlod).
 */

import { W3dChunkReader } from './W3dChunkReader.js';
import { W3dChunkType } from './W3dChunkTypes.js';
import { parseMeshChunk, type W3dMesh } from './W3dMeshParser.js';
import { parseHierarchyChunk, type W3dHierarchy } from './W3dHierarchyParser.js';
import {
  parseAnimationChunk,
  parseCompressedAnimationChunk,
  type W3dAnimation,
} from './W3dAnimationParser.js';
import { parseHlodChunk, type W3dHlod } from './W3dHlodParser.js';

export interface W3dBox {
  name: string;
  center: [number, number, number];
  extent: [number, number, number];
  color: number;
  attributes: number;
}

export interface W3dFile {
  meshes: W3dMesh[];
  hierarchies: W3dHierarchy[];
  animations: W3dAnimation[];
  hlods: W3dHlod[];
  boxes: W3dBox[];
}

export class W3dParser {
  /**
   * Parse an entire .w3d file from its raw bytes.
   * Returns all meshes, hierarchies, animations, and HLODs found in the file.
   */
  static parse(buffer: ArrayBuffer): W3dFile {
    const reader = new W3dChunkReader(buffer);
    const meshes: W3dMesh[] = [];
    const hierarchies: W3dHierarchy[] = [];
    const animations: W3dAnimation[] = [];
    const hlods: W3dHlod[] = [];
    const boxes: W3dBox[] = [];

    for (const chunk of reader.iterateChunks(0, reader.byteLength)) {
      switch (chunk.type) {
        case W3dChunkType.MESH: {
          meshes.push(parseMeshChunk(reader, chunk.dataOffset, chunk.size));
          break;
        }

        case W3dChunkType.HIERARCHY: {
          hierarchies.push(parseHierarchyChunk(reader, chunk.dataOffset, chunk.size));
          break;
        }

        case W3dChunkType.ANIMATION: {
          animations.push(parseAnimationChunk(reader, chunk.dataOffset, chunk.size));
          break;
        }

        case W3dChunkType.COMPRESSED_ANIMATION: {
          animations.push(parseCompressedAnimationChunk(reader, chunk.dataOffset, chunk.size));
          break;
        }

        case W3dChunkType.HLOD: {
          hlods.push(parseHlodChunk(reader, chunk.dataOffset, chunk.size));
          break;
        }

        case W3dChunkType.BOX: {
          boxes.push(W3dParser.parseBox(reader, chunk.dataOffset));
          break;
        }

        case W3dChunkType.NULL_OBJECT:
        case W3dChunkType.EMITTER:
          // Recognized but not parsed yet — skip silently.
          break;

        default:
          break;
      }
    }

    return { meshes, hierarchies, animations, hlods, boxes };
  }

  /**
   * Parse a BOX chunk (collision/bounding box).
   *
   * Layout:
   *   uint32 Version       (4)
   *   uint32 Attributes    (4)
   *   char   Name[32]      (32)
   *   uint32 Color         (4)
   *   float32 Center[3]    (12)
   *   float32 Extent[3]    (12)
   *   Total: 68 bytes
   */
  private static parseBox(reader: W3dChunkReader, dataOffset: number): W3dBox {
    const attributes = reader.readUint32(dataOffset + 4);
    const name = reader.readString(dataOffset + 8, 32);
    const color = reader.readUint32(dataOffset + 40);
    const cx = reader.readFloat32(dataOffset + 44);
    const cy = reader.readFloat32(dataOffset + 48);
    const cz = reader.readFloat32(dataOffset + 52);
    const ex = reader.readFloat32(dataOffset + 56);
    const ey = reader.readFloat32(dataOffset + 60);
    const ez = reader.readFloat32(dataOffset + 64);

    return { name, center: [cx, cy, cz], extent: [ex, ey, ez], color, attributes };
  }
}
