/**
 * Parses W3D MESH chunks (type 0x00000000) into structured mesh data.
 *
 * A MESH chunk is a container (hasSubChunks = true) holding:
 *   MESH_HEADER3  – meta info (name, counts, AABB, etc.)
 *   VERTICES      – float32[3] × numVertices
 *   VERTEX_NORMALS– float32[3] × numVertices
 *   TEXCOORDS     – float32[2] × numVertices
 *   TRIANGLES     – per-tri record (see below)
 *   VERTEX_COLORS – uint8[4] × numVertices  (optional)
 *   VERTEX_INFLUENCES – bone indices          (optional)
 *   TEXTURES / TEXTURE / TEXTURE_NAME         (optional)
 *   MATERIAL_PASS / TEXTURE_STAGE / …         (optional)
 */

import { W3dChunkReader } from './W3dChunkReader.js';
import { W3dChunkType } from './W3dChunkTypes.js';

export interface W3dMesh {
  name: string;
  containerName: string;
  vertices: Float32Array;    // flat [x,y,z, x,y,z, …]
  normals: Float32Array;     // flat [x,y,z, …]
  uvs: Float32Array;         // flat [u,v, u,v, …]
  indices: Uint32Array;      // triangle vertex indices (flat)
  vertexColors?: Uint8Array; // RGBA × numVertices
  boneIndices?: Uint16Array; // one per vertex
  textureNames: string[];
  attributes: number;
}

/**
 * Size in bytes of one Triangle record:
 *   uint32 vindex[3]  = 12
 *   uint32 attributes =  4
 *   float32 normal[3] = 12
 *   float32 dist      =  4
 *   ----                 32
 */
const TRIANGLE_RECORD_SIZE = 32;

/*
 * MESH_HEADER3 structure is 116 bytes total:
 *   4 (Version) + 4 (Attributes) + 32 (MeshName) + 32 (ContainerName) +
 *   4 (NumTris) + 4 (NumVertices) + 4 (NumMaterials) + 4 (NumDamageStages) +
 *   4 (SortLevel) + 4 (PrelitVersion) + 4 (FutureCounts[1]) +
 *   4 (VertexChannels) + 4 (FaceChannels) +
 *   12 (MinCorner) + 12 (MaxCorner) + 12 (SphCenter) + 4 (SphRadius)
 */

export function parseMeshChunk(reader: W3dChunkReader, meshChunkDataOffset: number, meshChunkSize: number): W3dMesh {
  const endOffset = meshChunkDataOffset + meshChunkSize;

  // Defaults – will be overwritten when the corresponding sub-chunk is found.
  let name = '';
  let containerName = '';
  let attributes = 0;
  let numVertices = 0;
  let numTris = 0;
  let vertices = new Float32Array(0);
  let normals = new Float32Array(0);
  let uvs = new Float32Array(0);
  let indices = new Uint32Array(0);
  let vertexColors: Uint8Array | undefined;
  let boneIndices: Uint16Array | undefined;
  const textureNames: string[] = [];

  for (const sub of reader.iterateChunks(meshChunkDataOffset, endOffset)) {
    switch (sub.type) {
      case W3dChunkType.MESH_HEADER3: {
        // Skip Version (4) and read Attributes.
        attributes = reader.readUint32(sub.dataOffset + 4);
        name = reader.readString(sub.dataOffset + 8, 32);
        containerName = reader.readString(sub.dataOffset + 40, 32);
        numTris = reader.readUint32(sub.dataOffset + 72);
        numVertices = reader.readUint32(sub.dataOffset + 76);
        break;
      }

      case W3dChunkType.VERTICES: {
        vertices = reader.readFloat32Array(sub.dataOffset, numVertices * 3);
        break;
      }

      case W3dChunkType.VERTEX_NORMALS: {
        normals = reader.readFloat32Array(sub.dataOffset, numVertices * 3);
        break;
      }

      case W3dChunkType.TEXCOORDS: {
        uvs = reader.readFloat32Array(sub.dataOffset, numVertices * 2);
        break;
      }

      case W3dChunkType.TRIANGLES: {
        indices = new Uint32Array(numTris * 3);
        for (let i = 0; i < numTris; i++) {
          const base = sub.dataOffset + i * TRIANGLE_RECORD_SIZE;
          indices[i * 3] = reader.readUint32(base);
          indices[i * 3 + 1] = reader.readUint32(base + 4);
          indices[i * 3 + 2] = reader.readUint32(base + 8);
        }
        break;
      }

      case W3dChunkType.VERTEX_COLORS: {
        vertexColors = new Uint8Array(numVertices * 4);
        const raw = reader.readUint8Array(sub.dataOffset, numVertices * 4);
        vertexColors.set(raw);
        break;
      }

      case W3dChunkType.VERTEX_INFLUENCES: {
        // Each influence record = uint16 boneIdx + 6 bytes padding = 8 bytes.
        boneIndices = new Uint16Array(numVertices);
        for (let i = 0; i < numVertices; i++) {
          boneIndices[i] = reader.readUint16(sub.dataOffset + i * 8);
        }
        break;
      }

      case W3dChunkType.TEXTURES: {
        // Container for TEXTURE sub-chunks.
        parseTextureContainer(reader, sub.dataOffset, sub.dataOffset + sub.size, textureNames);
        break;
      }

      case W3dChunkType.MATERIAL_PASS: {
        // May contain TEXTURE_STAGE → TEXTURE_IDS and STAGE_TEXCOORDS.
        // We only care about extracting additional texture names (already handled via TEXTURES).
        // Also may contain DCG vertex colours — handle here as fallback.
        parseMaterialPass(reader, sub.dataOffset, sub.dataOffset + sub.size, numVertices, (colors) => {
          if (!vertexColors) vertexColors = colors;
        });
        break;
      }

      // Prelit chunks contain the same sub-chunk structure as MESH
      case W3dChunkType.PRELIT_UNLIT:
      case W3dChunkType.PRELIT_VERTEX:
      case W3dChunkType.PRELIT_LIGHTMAP_MULTI_PASS:
      case W3dChunkType.PRELIT_LIGHTMAP_MULTI_TEX: {
        // These contain nested material pass data; skip for now.
        break;
      }

      default:
        // Unknown / unhandled sub-chunk – skip silently.
        break;
    }
  }

  return {
    name,
    containerName,
    vertices,
    normals,
    uvs,
    indices,
    vertexColors,
    boneIndices,
    textureNames,
    attributes,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseTextureContainer(
  reader: W3dChunkReader,
  offset: number,
  endOffset: number,
  out: string[],
): void {
  for (const texChunk of reader.iterateChunks(offset, endOffset)) {
    if (texChunk.type === W3dChunkType.TEXTURE) {
      parseTexture(reader, texChunk.dataOffset, texChunk.dataOffset + texChunk.size, out);
    }
  }
}

function parseTexture(
  reader: W3dChunkReader,
  offset: number,
  endOffset: number,
  out: string[],
): void {
  for (const sub of reader.iterateChunks(offset, endOffset)) {
    if (sub.type === W3dChunkType.TEXTURE_NAME) {
      out.push(reader.readString(sub.dataOffset, sub.size));
    }
  }
}

function parseMaterialPass(
  reader: W3dChunkReader,
  offset: number,
  endOffset: number,
  numVertices: number,
  onDCG: (colors: Uint8Array) => void,
): void {
  for (const sub of reader.iterateChunks(offset, endOffset)) {
    if (sub.type === W3dChunkType.DCG) {
      const colors = new Uint8Array(numVertices * 4);
      const raw = reader.readUint8Array(sub.dataOffset, numVertices * 4);
      colors.set(raw);
      onDCG(colors);
    }
  }
}
