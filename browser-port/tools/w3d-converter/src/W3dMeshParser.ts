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
        // Guard malformed headers in retail content variants.
        if (sub.size < 80) {
          break;
        }
        // Skip Version (4) and read Attributes.
        attributes = reader.readUint32(sub.dataOffset + 4);
        name = reader.readString(sub.dataOffset + 8, 32);
        containerName = reader.readString(sub.dataOffset + 40, 32);
        numTris = reader.readUint32(sub.dataOffset + 72);
        numVertices = reader.readUint32(sub.dataOffset + 76);
        break;
      }

      case W3dChunkType.VERTICES: {
        const availableVertices = Math.floor(sub.size / 12);
        const inferredVertices = numVertices > 0 ? numVertices : availableVertices;
        const vertexCount = Math.min(inferredVertices, availableVertices);
        vertices = reader.readFloat32Array(sub.dataOffset, vertexCount * 3);
        numVertices = vertexCount;
        break;
      }

      case W3dChunkType.VERTEX_NORMALS: {
        const availableNormals = Math.floor(sub.size / 12);
        const inferredVertices = numVertices > 0 ? numVertices : availableNormals;
        const normalCount = Math.min(inferredVertices, availableNormals);
        normals = reader.readFloat32Array(sub.dataOffset, normalCount * 3);
        if (numVertices === 0) {
          numVertices = normalCount;
        }
        break;
      }

      case W3dChunkType.TEXCOORDS: {
        const availableUvs = Math.floor(sub.size / 8);
        const inferredVertices = numVertices > 0 ? numVertices : availableUvs;
        const uvCount = Math.min(inferredVertices, availableUvs);
        uvs = reader.readFloat32Array(sub.dataOffset, uvCount * 2);
        if (numVertices === 0) {
          numVertices = uvCount;
        }
        break;
      }

      case W3dChunkType.TRIANGLES: {
        const availableTris = Math.floor(sub.size / TRIANGLE_RECORD_SIZE);
        const inferredTris = numTris > 0 ? numTris : availableTris;
        const triCount = Math.min(inferredTris, availableTris);
        indices = new Uint32Array(triCount * 3);
        for (let i = 0; i < triCount; i++) {
          const base = sub.dataOffset + i * TRIANGLE_RECORD_SIZE;
          indices[i * 3] = reader.readUint32(base);
          indices[i * 3 + 1] = reader.readUint32(base + 4);
          indices[i * 3 + 2] = reader.readUint32(base + 8);
        }
        numTris = triCount;
        break;
      }

      case W3dChunkType.VERTEX_COLORS: {
        const availableColors = Math.floor(sub.size / 4);
        const inferredVertices = numVertices > 0 ? numVertices : availableColors;
        const colorCount = Math.min(inferredVertices, availableColors);
        vertexColors = new Uint8Array(colorCount * 4);
        const raw = reader.readUint8Array(sub.dataOffset, colorCount * 4);
        vertexColors.set(raw);
        if (numVertices === 0) {
          numVertices = colorCount;
        }
        break;
      }

      case W3dChunkType.VERTEX_INFLUENCES: {
        // Each influence record = uint16 boneIdx + 6 bytes padding = 8 bytes.
        const availableInfluences = Math.floor(sub.size / 8);
        const inferredVertices = numVertices > 0 ? numVertices : availableInfluences;
        const influenceCount = Math.min(inferredVertices, availableInfluences);
        boneIndices = new Uint16Array(influenceCount);
        for (let i = 0; i < influenceCount; i++) {
          boneIndices[i] = reader.readUint16(sub.dataOffset + i * 8);
        }
        if (numVertices === 0) {
          numVertices = influenceCount;
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
      const availableColors = Math.floor(sub.size / 4);
      const inferredVertices = numVertices > 0 ? numVertices : availableColors;
      const colorCount = Math.min(inferredVertices, availableColors);
      if (colorCount <= 0) {
        continue;
      }
      const colors = new Uint8Array(colorCount * 4);
      const raw = reader.readUint8Array(sub.dataOffset, colorCount * 4);
      colors.set(raw);
      onDCG(colors);
    }
  }
}
