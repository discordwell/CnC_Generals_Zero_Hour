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

export interface W3dFile {
  meshes: W3dMesh[];
  hierarchies: W3dHierarchy[];
  animations: W3dAnimation[];
  hlods: W3dHlod[];
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

        default:
          // BOX, NULL_OBJECT, EMITTER, etc. — skip for now.
          break;
      }
    }

    return { meshes, hierarchies, animations, hlods };
  }
}
