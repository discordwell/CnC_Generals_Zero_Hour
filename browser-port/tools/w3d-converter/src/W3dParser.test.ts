/**
 * Tests for the W3D parser using synthetically constructed W3D binary buffers.
 *
 * We build minimal valid W3D chunks in memory and verify that:
 *  - The chunk reader iterates and reads them correctly
 *  - The mesh parser extracts vertices, normals, UVs, and indices
 *  - The hierarchy parser builds the bone tree
 *  - The top-level parser ties everything together
 *  - The glTF builder produces a valid GLB header
 */

import { describe, it, expect } from 'vitest';
import { W3dChunkReader, CHUNK_HEADER_SIZE } from './W3dChunkReader.js';
import { W3dChunkType } from './W3dChunkTypes.js';
import { chunkTypeName } from './W3dChunkTypes.js';
import { parseMeshChunk } from './W3dMeshParser.js';
import { parseHierarchyChunk } from './W3dHierarchyParser.js';
import { W3dParser } from './W3dParser.js';
import { GltfBuilder } from './GltfBuilder.js';

/* ------------------------------------------------------------------ */
/*  Binary helpers                                                     */
/* ------------------------------------------------------------------ */

/** Growable binary buffer writer (little-endian). */
class BinaryWriter {
  private buf: ArrayBuffer;
  private view: DataView;
  private pos = 0;

  constructor(initialSize = 4096) {
    this.buf = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buf);
  }

  private ensure(bytes: number): void {
    while (this.pos + bytes > this.buf.byteLength) {
      const next = new ArrayBuffer(this.buf.byteLength * 2);
      new Uint8Array(next).set(new Uint8Array(this.buf));
      this.buf = next;
      this.view = new DataView(this.buf);
    }
  }

  get offset(): number {
    return this.pos;
  }

  writeUint32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }

  writeInt32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
  }

  writeUint16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }

  writeUint8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos, v);
    this.pos += 1;
  }

  writeFloat32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }

  /** Write a null-padded string. */
  writeString(s: string, len: number): void {
    this.ensure(len);
    const enc = new TextEncoder();
    const bytes = enc.encode(s);
    new Uint8Array(this.buf).set(bytes.subarray(0, len), this.pos);
    this.pos += len;
  }

  /** Write raw zeros. */
  writeZeros(n: number): void {
    this.ensure(n);
    // Buffer is already zero-filled on allocation, but we still advance pos.
    // Make sure they are actually zero (could be reused memory).
    const arr = new Uint8Array(this.buf);
    for (let i = 0; i < n; i++) arr[this.pos + i] = 0;
    this.pos += n;
  }

  /** Write an 8-byte chunk header. Returns the offset of the size field for later patching. */
  writeChunkHeader(type: number, hasSubChunks: boolean): number {
    this.writeUint32(type);
    const sizeOffset = this.pos;
    this.writeUint32(hasSubChunks ? 0x80000000 : 0); // placeholder; size to be patched
    return sizeOffset;
  }

  /** Patch the size field of a chunk header. */
  patchChunkSize(sizeOffset: number, hasSubChunks: boolean): void {
    const dataSize = this.pos - sizeOffset - 4; // bytes after the size field
    const value = hasSubChunks ? (dataSize | 0x80000000) : dataSize;
    this.view.setUint32(sizeOffset, value >>> 0, true);
  }

  toArrayBuffer(): ArrayBuffer {
    return this.buf.slice(0, this.pos);
  }
}

/* ------------------------------------------------------------------ */
/*  Build synthetic W3D data                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a minimal MESH chunk:
 *   MESH (container)
 *     MESH_HEADER3 – 1 triangle, 3 vertices
 *     VERTICES     – 3 vertices
 *     VERTEX_NORMALS – 3 normals
 *     TEXCOORDS    – 3 UVs
 *     TRIANGLES    – 1 triangle
 */
function buildMeshBuffer(): ArrayBuffer {
  const w = new BinaryWriter();

  // ---- MESH (container) ----
  const meshSizeOff = w.writeChunkHeader(W3dChunkType.MESH, true);

  // ---- MESH_HEADER3 ----
  const hdrSizeOff = w.writeChunkHeader(W3dChunkType.MESH_HEADER3, false);
  w.writeUint32(0x00040002); // Version
  w.writeUint32(0);          // Attributes
  w.writeString('TestMesh', 32);
  w.writeString('TestContainer', 32);
  w.writeUint32(1);          // NumTris
  w.writeUint32(3);          // NumVertices
  w.writeUint32(1);          // NumMaterials
  w.writeUint32(0);          // NumDamageStages
  w.writeInt32(0);           // SortLevel
  w.writeUint32(0);          // PrelitVersion
  w.writeUint32(0);          // FutureCounts[1]
  w.writeUint32(0);          // VertexChannels
  w.writeUint32(0);          // FaceChannels
  // MinCorner
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(0);
  // MaxCorner
  w.writeFloat32(1); w.writeFloat32(1); w.writeFloat32(0);
  // SphCenter
  w.writeFloat32(0.5); w.writeFloat32(0.5); w.writeFloat32(0);
  // SphRadius
  w.writeFloat32(0.707);
  w.patchChunkSize(hdrSizeOff, false);

  // ---- VERTICES ----
  const vertSizeOff = w.writeChunkHeader(W3dChunkType.VERTICES, false);
  // Triangle: (0,0,0) (1,0,0) (0,1,0)
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(0);
  w.writeFloat32(1); w.writeFloat32(0); w.writeFloat32(0);
  w.writeFloat32(0); w.writeFloat32(1); w.writeFloat32(0);
  w.patchChunkSize(vertSizeOff, false);

  // ---- VERTEX_NORMALS ----
  const normSizeOff = w.writeChunkHeader(W3dChunkType.VERTEX_NORMALS, false);
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(1);
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(1);
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(1);
  w.patchChunkSize(normSizeOff, false);

  // ---- TEXCOORDS ----
  const uvSizeOff = w.writeChunkHeader(W3dChunkType.TEXCOORDS, false);
  w.writeFloat32(0); w.writeFloat32(0);
  w.writeFloat32(1); w.writeFloat32(0);
  w.writeFloat32(0); w.writeFloat32(1);
  w.patchChunkSize(uvSizeOff, false);

  // ---- TRIANGLES ----
  const triSizeOff = w.writeChunkHeader(W3dChunkType.TRIANGLES, false);
  // vindex[3]
  w.writeUint32(0); w.writeUint32(1); w.writeUint32(2);
  // attributes
  w.writeUint32(0);
  // normal
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(1);
  // dist
  w.writeFloat32(0);
  w.patchChunkSize(triSizeOff, false);

  w.patchChunkSize(meshSizeOff, true);
  return w.toArrayBuffer();
}

/**
 * Build a minimal HIERARCHY chunk with 3 pivots:
 *   RootBone (no parent)
 *     ChildBone1
 *     ChildBone2
 */
function buildHierarchyBuffer(): ArrayBuffer {
  const w = new BinaryWriter();

  const hierSizeOff = w.writeChunkHeader(W3dChunkType.HIERARCHY, true);

  // HIERARCHY_HEADER
  const hdrSizeOff = w.writeChunkHeader(W3dChunkType.HIERARCHY_HEADER, false);
  w.writeUint32(0x00040001); // Version
  w.writeString('TestHierarchy', 32);
  w.writeUint32(3);          // NumPivots
  // Center
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(0);
  w.patchChunkSize(hdrSizeOff, false);

  // PIVOTS
  const pivSizeOff = w.writeChunkHeader(W3dChunkType.PIVOTS, false);

  // Pivot 0: RootBone (parent = 0xFFFFFFFF)
  writePivot(w, 'RootBone', 0xffffffff, [0, 0, 0], [0, 0, 0, 1]);
  // Pivot 1: ChildBone1 (parent = 0)
  writePivot(w, 'ChildBone1', 0, [1, 0, 0], [0, 0, 0, 1]);
  // Pivot 2: ChildBone2 (parent = 0)
  writePivot(w, 'ChildBone2', 0, [0, 1, 0], [0, 0, 0, 1]);

  w.patchChunkSize(pivSizeOff, false);
  w.patchChunkSize(hierSizeOff, true);

  return w.toArrayBuffer();
}

function writePivot(
  w: BinaryWriter,
  name: string,
  parent: number,
  translation: [number, number, number],
  rotation: [number, number, number, number],
): void {
  w.writeString(name, 32);
  w.writeUint32(parent);
  w.writeFloat32(translation[0]);
  w.writeFloat32(translation[1]);
  w.writeFloat32(translation[2]);
  // Euler angles (unused, write zeros).
  w.writeFloat32(0); w.writeFloat32(0); w.writeFloat32(0);
  // Quaternion XYZW.
  w.writeFloat32(rotation[0]);
  w.writeFloat32(rotation[1]);
  w.writeFloat32(rotation[2]);
  w.writeFloat32(rotation[3]);
}

/** Concatenate two ArrayBuffers. */
function concatBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const result = new ArrayBuffer(a.byteLength + b.byteLength);
  const bytes = new Uint8Array(result);
  bytes.set(new Uint8Array(a), 0);
  bytes.set(new Uint8Array(b), a.byteLength);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('W3dChunkReader', () => {
  it('reads a chunk header correctly', () => {
    const buf = buildMeshBuffer();
    const reader = new W3dChunkReader(buf);
    const chunk = reader.readChunkAt(0);

    expect(chunk.type).toBe(W3dChunkType.MESH);
    expect(chunk.hasSubChunks).toBe(true);
    expect(chunk.dataOffset).toBe(CHUNK_HEADER_SIZE);
    expect(chunk.size).toBeGreaterThan(0);
  });

  it('iterates top-level chunks', () => {
    const meshBuf = buildMeshBuffer();
    const hierBuf = buildHierarchyBuffer();
    const combined = concatBuffers(meshBuf, hierBuf);

    const reader = new W3dChunkReader(combined);
    const chunks = [...reader.iterateChunks(0, combined.byteLength)];

    expect(chunks.length).toBe(2);
    expect(chunks[0]!.type).toBe(W3dChunkType.MESH);
    expect(chunks[1]!.type).toBe(W3dChunkType.HIERARCHY);
  });

  it('iterates sub-chunks inside a MESH', () => {
    const buf = buildMeshBuffer();
    const reader = new W3dChunkReader(buf);
    const meshChunk = reader.readChunkAt(0);
    const subChunks = [...reader.iterateChunks(meshChunk.dataOffset, meshChunk.dataOffset + meshChunk.size)];

    // We wrote: MESH_HEADER3, VERTICES, VERTEX_NORMALS, TEXCOORDS, TRIANGLES
    const types = subChunks.map((c) => c.type);
    expect(types).toContain(W3dChunkType.MESH_HEADER3);
    expect(types).toContain(W3dChunkType.VERTICES);
    expect(types).toContain(W3dChunkType.VERTEX_NORMALS);
    expect(types).toContain(W3dChunkType.TEXCOORDS);
    expect(types).toContain(W3dChunkType.TRIANGLES);
    expect(subChunks.length).toBe(5);
  });

  it('reads strings correctly', () => {
    const buf = buildMeshBuffer();
    const reader = new W3dChunkReader(buf);
    const meshChunk = reader.readChunkAt(0);
    const subChunks = [...reader.iterateChunks(meshChunk.dataOffset, meshChunk.dataOffset + meshChunk.size)];
    const headerChunk = subChunks.find((c) => c.type === W3dChunkType.MESH_HEADER3)!;

    // Mesh name is at offset +8 within the header chunk data.
    const meshName = reader.readString(headerChunk.dataOffset + 8, 32);
    expect(meshName).toBe('TestMesh');
  });
});

describe('chunkTypeName', () => {
  it('returns known chunk names', () => {
    expect(chunkTypeName(W3dChunkType.MESH)).toBe('MESH');
    expect(chunkTypeName(W3dChunkType.HIERARCHY)).toBe('HIERARCHY');
  });

  it('returns hex string for unknown chunks', () => {
    expect(chunkTypeName(0xdeadbeef)).toBe('UNKNOWN_0xdeadbeef');
  });
});

describe('W3dMeshParser', () => {
  it('parses vertices, normals, UVs, and indices', () => {
    const buf = buildMeshBuffer();
    const reader = new W3dChunkReader(buf);
    const meshChunk = reader.readChunkAt(0);
    const mesh = parseMeshChunk(reader, meshChunk.dataOffset, meshChunk.size);

    expect(mesh.name).toBe('TestMesh');
    expect(mesh.containerName).toBe('TestContainer');

    // 3 vertices × 3 components = 9 floats
    expect(mesh.vertices.length).toBe(9);
    expect(mesh.vertices[0]).toBeCloseTo(0);
    expect(mesh.vertices[3]).toBeCloseTo(1);
    expect(mesh.vertices[7]).toBeCloseTo(1);

    // 3 normals, all pointing +Z
    expect(mesh.normals.length).toBe(9);
    expect(mesh.normals[2]).toBeCloseTo(1);

    // 3 UVs × 2 components = 6
    expect(mesh.uvs.length).toBe(6);

    // 1 triangle × 3 = 3 indices
    expect(mesh.indices.length).toBe(3);
    expect(mesh.indices[0]).toBe(0);
    expect(mesh.indices[1]).toBe(1);
    expect(mesh.indices[2]).toBe(2);
  });
});

describe('W3dHierarchyParser', () => {
  it('parses pivots with parent relationships', () => {
    const buf = buildHierarchyBuffer();
    const reader = new W3dChunkReader(buf);
    const hierChunk = reader.readChunkAt(0);
    const hierarchy = parseHierarchyChunk(reader, hierChunk.dataOffset, hierChunk.size);

    expect(hierarchy.name).toBe('TestHierarchy');
    expect(hierarchy.pivots.length).toBe(3);

    const root = hierarchy.pivots[0]!;
    expect(root.name).toBe('RootBone');
    expect(root.parentIndex).toBe(-1);
    expect(root.translation).toEqual([0, 0, 0]);
    expect(root.rotation).toEqual([0, 0, 0, 1]);

    const child1 = hierarchy.pivots[1]!;
    expect(child1.name).toBe('ChildBone1');
    expect(child1.parentIndex).toBe(0);
    expect(child1.translation).toEqual([1, 0, 0]);

    const child2 = hierarchy.pivots[2]!;
    expect(child2.name).toBe('ChildBone2');
    expect(child2.parentIndex).toBe(0);
    expect(child2.translation).toEqual([0, 1, 0]);
  });
});

describe('W3dParser (top-level)', () => {
  it('parses a combined mesh + hierarchy buffer', () => {
    const combined = concatBuffers(buildMeshBuffer(), buildHierarchyBuffer());
    const result = W3dParser.parse(combined);

    expect(result.meshes.length).toBe(1);
    expect(result.hierarchies.length).toBe(1);
    expect(result.animations.length).toBe(0);
    expect(result.hlods.length).toBe(0);

    expect(result.meshes[0]!.name).toBe('TestMesh');
    expect(result.hierarchies[0]!.name).toBe('TestHierarchy');
  });
});

describe('GltfBuilder', () => {
  it('produces a valid GLB header', () => {
    const combined = concatBuffers(buildMeshBuffer(), buildHierarchyBuffer());
    const w3d = W3dParser.parse(combined);
    const glb = GltfBuilder.buildGlb(w3d);

    expect(glb.byteLength).toBeGreaterThan(12);

    const view = new DataView(glb);
    // GLB magic: "glTF" = 0x46546C67
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    // Version 2
    expect(view.getUint32(4, true)).toBe(2);
    // Total length matches buffer
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
  });

  it('contains a JSON chunk followed by a BIN chunk', () => {
    const w3d = W3dParser.parse(buildMeshBuffer());
    const glb = GltfBuilder.buildGlb(w3d);
    const view = new DataView(glb);

    // First chunk at offset 12.
    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    expect(jsonChunkType).toBe(0x4e4f534a); // "JSON"

    // BIN chunk follows.
    const binChunkOffset = 20 + jsonChunkLength;
    const binChunkType = view.getUint32(binChunkOffset + 4, true);
    expect(binChunkType).toBe(0x004e4942); // "BIN\0"
  });

  it('embeds valid JSON with mesh data', () => {
    const w3d = W3dParser.parse(buildMeshBuffer());
    const glb = GltfBuilder.buildGlb(w3d);
    const view = new DataView(glb);

    const jsonChunkLength = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(glb, 20, jsonChunkLength);
    const jsonStr = new TextDecoder().decode(jsonBytes).trim();
    const gltf = JSON.parse(jsonStr) as Record<string, unknown>;

    expect(gltf['asset']).toBeDefined();
    expect((gltf['asset'] as Record<string, string>)['version']).toBe('2.0');
    expect((gltf['meshes'] as unknown[]).length).toBe(1);
    expect((gltf['accessors'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('produces a GLB from a mesh-only W3D (no hierarchy)', () => {
    const w3d = W3dParser.parse(buildMeshBuffer());
    const glb = GltfBuilder.buildGlb(w3d);
    expect(glb.byteLength).toBeGreaterThan(0);
  });
});
